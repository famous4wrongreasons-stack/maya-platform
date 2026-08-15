import { Logger } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { AdjustLoyaltyDto } from './dto/adjust-loyalty.dto';

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly usersService: UsersService,
    private readonly crmService: CrmService,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Почему у гостя нет баллов — вопрос поддержки, а не загадка. Раньше и
   * отказ CRM, и отсутствие карты уходили в тишину: наружу шёл ноль, а в
   * логах не оставалось ничего. Разбор одного такого случая занял вечер.
   */
  private readonly logger = new Logger(LoyaltyService.name);

  async getForUser(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const user = await this.usersService.getTenantUserOrThrow(
      userId,
      scopedTenantId,
    );
    const calendarSource =
      await this.crmService.getCalendarSource(scopedTenantId);

    const loyalty =
      calendarSource === CalendarSource.EXTERNAL
        ? await this.getExternalAccount(scopedTenantId, user.id, user.phone)
        : this.serializeAccount(
            await this.prisma.loyaltyAccount.upsert({
              where: {
                userId_tenantId: { userId, tenantId: scopedTenantId },
              },
              update: {},
              create: {
                tenantId: scopedTenantId,
                userId,
                source: CalendarSource.INTERNAL,
              },
            }),
            {
              authoritative: 'maya',
              syncStatus: 'current',
              stale: false,
            },
          );

    return this.withSpendOptions(scopedTenantId, loyalty);
  }

  async listTransactions(tenantId: string, userId: string, limit = 50) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.usersService.getTenantUserOrThrow(userId, scopedTenantId);
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { userId_tenantId: { userId, tenantId: scopedTenantId } },
    });
    if (!account) {
      return [];
    }

    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { tenantId: scopedTenantId, accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return transactions.map((transaction) => ({
      id: transaction.id,
      kind: transaction.kind,
      delta: transaction.delta,
      balance_after: transaction.balanceAfter,
      reason: this.encryptionService.decrypt(transaction.encryptedReason),
      created_at: transaction.createdAt,
    }));
  }

  async adjustInternalBalance(params: {
    tenantId: string;
    targetUserId: string;
    actorUserId: string;
    dto: AdjustLoyaltyDto;
  }) {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    if (
      (await this.crmService.getCalendarSource(tenantId)) !==
      CalendarSource.INTERNAL
    ) {
      throw new ConflictException({
        message: 'External CRM is the source of truth for this balance.',
        error: {
          code: 'external_loyalty_read_only',
          message: 'Change loyalty balance in the connected CRM.',
        },
      });
    }

    await Promise.all([
      this.usersService.getTenantUserOrThrow(params.targetUserId, tenantId),
      this.usersService.getTenantUserOrThrow(params.actorUserId, tenantId),
    ]);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.loyaltyTransaction.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId,
              idempotencyKey: params.dto.idempotencyKey,
            },
          },
          include: { account: true },
        });
        if (existing) {
          const sameOperation =
            existing.account.userId === params.targetUserId &&
            existing.actorUserId === params.actorUserId &&
            existing.delta === params.dto.delta &&
            this.encryptionService.decrypt(existing.encryptedReason) ===
              params.dto.reason.trim();
          if (!sameOperation) {
            throw new ConflictException(
              'Idempotency key is already used for another loyalty operation',
            );
          }
          return { account: existing.account, transaction: existing };
        }

        const account = await tx.loyaltyAccount.upsert({
          where: {
            userId_tenantId: {
              userId: params.targetUserId,
              tenantId,
            },
          },
          update: {},
          create: {
            tenantId,
            userId: params.targetUserId,
            source: CalendarSource.INTERNAL,
          },
        });
        const balanceAfter = account.balance + params.dto.delta;
        if (balanceAfter < 0) {
          throw new BadRequestException({
            message: 'Loyalty balance cannot become negative.',
            error: {
              code: 'insufficient_loyalty_balance',
              message: 'Loyalty balance cannot become negative.',
              current_balance: account.balance,
            },
          });
        }

        const updatedAccount = await tx.loyaltyAccount.update({
          where: { id_tenantId: { id: account.id, tenantId } },
          data: { balance: balanceAfter, source: CalendarSource.INTERNAL },
        });
        const transaction = await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            accountId: account.id,
            actorUserId: params.actorUserId,
            actorTenantId: tenantId,
            kind: params.dto.delta >= 0 ? 'credit' : 'debit',
            delta: params.dto.delta,
            balanceAfter,
            encryptedReason: this.encryptionService.encrypt(
              params.dto.reason.trim(),
            ),
            idempotencyKey: params.dto.idempotencyKey,
          },
        });
        return { account: updatedAccount, transaction };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.auditLogService.log({
      tenantId,
      userId: params.actorUserId,
      action: 'loyalty.balance_adjusted',
      entityType: 'loyalty_account',
      entityId: result.account.id,
      metadata: {
        target_user_id: params.targetUserId,
        transaction_id: result.transaction.id,
        delta: result.transaction.delta,
        balance_after: result.transaction.balanceAfter,
      },
    });

    return {
      ...this.serializeAccount(result.account, {
        authoritative: 'maya',
        syncStatus: 'current',
        stale: false,
      }),
      transaction_id: result.transaction.id,
    };
  }

  private async getExternalAccount(
    tenantId: string,
    userId: string,
    phone: string | null,
  ) {
    const cached = await this.prisma.loyaltyAccount.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    const legacyAccount = await this.getLegacyMayaAccount(
      tenantId,
      userId,
      cached,
    );
    if (legacyAccount) {
      return legacyAccount;
    }
    if (!phone) {
      return cached
        ? this.serializeAccount(cached, {
            authoritative: 'crm',
            syncStatus: 'phone_required',
            stale: true,
          })
        : this.emptyExternalAccount('phone_required');
    }

    try {
      const snapshot = await this.crmService.getClientLoyalty(tenantId, phone);
      if (!snapshot) {
        // Карты в CRM нет. Не ошибка, но и не пустяк: именно это владелец
        // видит как «баллы не начисляются».
        this.logger.warn(
          `loyalty card not found in CRM tenant=${tenantId} user=${userId}`,
        );
        return cached
          ? this.serializeAccount(cached, {
              authoritative: 'crm',
              syncStatus: 'card_not_found',
              stale: true,
            })
          : this.emptyExternalAccount('card_not_found');
      }

      const changed =
        !cached ||
        cached.balance !== snapshot.balance ||
        cached.source !== snapshot.provider ||
        cached.externalReference !== snapshot.external_card_id;
      const account = await this.prisma.loyaltyAccount.upsert({
        where: { userId_tenantId: { userId, tenantId } },
        update: {
          source: snapshot.provider,
          balance: snapshot.balance,
          externalReference: snapshot.external_card_id,
          syncedAt: new Date(),
        },
        create: {
          tenantId,
          userId,
          source: snapshot.provider,
          balance: snapshot.balance,
          externalReference: snapshot.external_card_id,
          syncedAt: new Date(),
        },
      });

      if (changed) {
        await this.auditLogService.log({
          tenantId,
          userId,
          action: 'loyalty.crm_balance_synced',
          entityType: 'loyalty_account',
          entityId: account.id,
          metadata: {
            provider: snapshot.provider,
            balance: snapshot.balance,
            external_card_id: snapshot.external_card_id,
          },
        });
      }

      return {
        ...this.serializeAccount(account, {
          authoritative: 'crm',
          syncStatus: 'current',
          stale: false,
        }),
        sold_amount: snapshot.sold_amount,
      };
    } catch (error) {
      // Причину отказа CRM пишем целиком: без неё «баллы не пришли»
      // неотличимо от «карты нет», и разбор упирается в догадки.
      this.logger.warn(
        `loyalty sync failed tenant=${tenantId} user=${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      if (cached) {
        return this.serializeAccount(cached, {
          authoritative: 'crm',
          syncStatus: 'temporarily_unavailable',
          stale: true,
        });
      }

      throw new ServiceUnavailableException({
        message: 'Could not load loyalty balance from the connected CRM.',
        error: {
          code: 'loyalty_sync_unavailable',
          message: 'Could not load loyalty balance from the connected CRM.',
        },
        cause: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private async getLegacyMayaAccount(
    tenantId: string,
    userId: string,
    cached: {
      id: string;
      balance: number;
      source: string;
      syncedAt: Date | null;
      externalReference?: string | null;
    } | null,
  ) {
    const token = String(process.env.MAYA_LEGACY_BRIDGE_TOKEN || '').trim();
    const allowedSlugs = new Set(
      String(process.env.MAYA_LEGACY_LOYALTY_TENANT_SLUGS || '')
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean),
    );
    if (token.length < 32 || allowedSlugs.size === 0) {
      return null;
    }

    const configuredUrl = String(
      process.env.MAYA_LEGACY_BRIDGE_URL ||
        'http://127.0.0.1:8080/api/internal/loyalty-snapshot',
    ).trim();
    let bridgeUrl: URL;
    try {
      bridgeUrl = new URL(configuredUrl);
    } catch {
      return null;
    }
    if (
      bridgeUrl.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(bridgeUrl.hostname)
    ) {
      return null;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant || !allowedSlugs.has(tenant.slug.toLowerCase())) {
      return null;
    }

    const identity = await this.prisma.authIdentity.findFirst({
      where: { tenantId, userId, provider: 'telegram' },
      select: { providerUserId: true },
    });
    if (!identity?.providerUserId) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_500);
    try {
      const response = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Maya-Legacy-Bridge': token,
        },
        body: JSON.stringify({ telegram_user_id: identity.providerUserId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Legacy loyalty bridge returned ${response.status}`);
      }
      const payload = (await response.json()) as {
        found?: boolean;
        balance?: unknown;
      };
      const balance = Number(payload.balance);
      if (!payload.found || !Number.isFinite(balance) || balance < 0) {
        return null;
      }

      const normalizedBalance = Math.round(balance);
      const changed =
        !cached ||
        cached.balance !== normalizedBalance ||
        cached.source !== 'legacy_maya';
      const account = await this.prisma.loyaltyAccount.upsert({
        where: { userId_tenantId: { userId, tenantId } },
        update: {
          source: 'legacy_maya',
          balance: normalizedBalance,
          externalReference: null,
          syncedAt: new Date(),
        },
        create: {
          tenantId,
          userId,
          source: 'legacy_maya',
          balance: normalizedBalance,
          syncedAt: new Date(),
        },
      });

      if (changed) {
        await this.auditLogService.log({
          tenantId,
          userId,
          action: 'loyalty.legacy_balance_synced',
          entityType: 'loyalty_account',
          entityId: account.id,
          metadata: {
            provider: 'legacy_maya',
            balance: normalizedBalance,
          },
        });
      }

      return this.serializeAccount(account, {
        authoritative: 'maya',
        syncStatus: 'current',
        stale: false,
      });
    } catch {
      if (cached?.source === 'legacy_maya') {
        return this.serializeAccount(cached, {
          authoritative: 'maya',
          syncStatus: 'temporarily_unavailable',
          stale: true,
        });
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private emptyExternalAccount(syncStatus: string) {
    return {
      account_id: null,
      balance: 0,
      currency: 'RUB',
      source: 'external_crm',
      authoritative: 'crm' as const,
      sync_status: syncStatus,
      stale: false,
      synced_at: null,
    };
  }

  private async withSpendOptions<
    T extends {
      balance: number;
      currency: string;
      authoritative: 'crm' | 'maya';
      stale: boolean;
    },
  >(tenantId: string, loyalty: T) {
    const balance = Math.max(0, Number(loyalty.balance) || 0);
    const base = {
      basis: 'price_estimate',
      points_to_currency_rate: 1,
      verification_required: loyalty.authoritative === 'crm',
      items: [] as Array<{
        id: string;
        name: string;
        price: number;
        points_required: number;
        currency: string;
        category: string | null;
      }>,
      best_service: null as null | {
        id: string;
        name: string;
        price: number;
        points_required: number;
        currency: string;
        category: string | null;
      },
      next_service: null as null | {
        id: string;
        name: string;
        price: number;
        points_required: number;
        points_needed: number;
        currency: string;
        category: string | null;
      },
    };
    if (loyalty.stale) {
      return {
        ...loyalty,
        spend_options: { ...base, status: 'balance_unverified' },
      };
    }
    if (balance <= 0) {
      return { ...loyalty, spend_options: { ...base, status: 'empty' } };
    }

    try {
      const priced = (await this.crmService.getServices(tenantId))
        .filter(
          (service) => Number.isFinite(service.price) && service.price > 0,
        )
        .map((service) => ({
          id: service.id,
          name: service.name,
          price: service.price,
          points_required: Math.ceil(service.price),
          currency: service.currency || loyalty.currency,
          category: service.category ?? null,
        }));
      const items = priced
        .filter((service) => service.points_required <= balance)
        .sort((left, right) => right.points_required - left.points_required)
        .slice(0, 6);
      const next = priced
        .filter((service) => service.points_required > balance)
        .sort((left, right) => left.points_required - right.points_required)[0];
      return {
        ...loyalty,
        spend_options: {
          ...base,
          status: items.length > 0 ? 'available' : 'keep_earning',
          items,
          best_service: items[0] ?? null,
          next_service: next
            ? {
                ...next,
                points_needed: next.points_required - balance,
              }
            : null,
        },
      };
    } catch {
      return {
        ...loyalty,
        spend_options: { ...base, status: 'catalog_unavailable' },
      };
    }
  }

  private serializeAccount(
    account: {
      id: string;
      balance: number;
      source: string;
      syncedAt: Date | null;
    },
    status: {
      authoritative: 'crm' | 'maya';
      syncStatus: string;
      stale: boolean;
    },
  ) {
    return {
      account_id: account.id,
      balance: account.balance,
      currency: 'RUB',
      source: account.source,
      authoritative: status.authoritative,
      sync_status: status.syncStatus,
      stale: status.stale,
      synced_at: account.syncedAt,
    };
  }
}
