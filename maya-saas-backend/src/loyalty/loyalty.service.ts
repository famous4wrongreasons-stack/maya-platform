import { Logger } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  type ActionFailureClassification,
  type ActionRuntimePhase,
} from '../action-engine';
import { CalendarSource } from '../common/domain.enums';
import {
  LOYALTY_WARNING,
  loyaltyVerificationRequired,
  snapshotAuthorityView,
} from '../domain';
import type {
  LoyaltyAuthority,
  LoyaltyAuthorityView,
  LoyaltyWarning,
} from '../domain';
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
    private readonly actionEngine: ActionEngineRuntimeService,
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

  /**
   * Состояние лояльности клиента для ЛЮБОЙ поверхности Maya.
   *
   * 🔴 Единственный вход. До P5 три места ходили мимо: список клиентов читал
   * кэш прямо из таблицы без пометок свежести, а AI-досье брало карту
   * провайдера напрямую — и один человек получал в кабинете и в досье два
   * разных необъяснённых числа.
   */
  async getStateForUser(tenantId: string, userId: string) {
    return this.getForUser(tenantId, userId);
  }

  /**
   * Canonical Client-owned read boundary for callers whose requester policy
   * has already been established by the ingress layer. A business Client may
   * own loyalty value without having a Maya User or Membership; this method
   * therefore never manufactures either and never creates an account.
   */
  async getStateForClient(tenantId: string, clientId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const account = await this.getEstablishedClientAccount(
      scopedTenantId,
      clientId,
    );
    const loyalty = this.serializeAccount(account, {
      authoritative: 'maya',
      syncStatus: 'current',
      stale: false,
    });
    return this.withSpendOptions(scopedTenantId, loyalty);
  }

  /**
   * Сравнить авторитетный баланс с уже прочитанной картой провайдера.
   *
   * 🔴 Победитель не выбирается молча: авторитет задан политикой домена
   * (`resolveAuthoritativeBalance`), а число провайдера сохраняется как
   * НАБЛЮДЁННОЕ и превращается в машинное предупреждение. Ни одна система
   * автоматически не исправляется.
   *
   * Пустой успешный ответ провайдера нулём НЕ считается: адаптер знает этот
   * сбой и уже переспрашивает, поэтому `null` здесь означает «не знаем».
   */
  compareWithExternalCard<
    T extends {
      balance: number;
      authority: LoyaltyAuthority;
      warnings: LoyaltyWarning[];
      verification_required: boolean;
      stale: boolean;
    },
  >(state: T, observedCrmBalance: number | null): T {
    if (observedCrmBalance === null || state.authority === 'crm') {
      return state;
    }
    if (observedCrmBalance === state.balance) {
      return state;
    }

    const warnings: LoyaltyWarning[] = [
      ...state.warnings,
      {
        code: LOYALTY_WARNING.authorityDisagreement,
        observed_balance: observedCrmBalance,
        observed_authority: 'crm',
      },
    ];

    return {
      ...state,
      warnings,
      verification_required: loyaltyVerificationRequired({
        authority: state.authority,
        stale: state.stale,
        hasDisagreement: true,
      }),
    };
  }

  /**
   * Какой владелец баланса настроен у арендатора.
   *
   * 🔴 Нужен там, где клиент известен только провайдеру и аккаунта Maya у него
   * нет — например, в досье клиента для AI. Такая поверхность физически может
   * прочитать только карту провайдера, и без этого метода она выдавала бы её
   * за баланс, хотя авторитетен другой источник.
   *
   * Деталей транспорта наружу не отдаёт: только роль.
   */
  async configuredAuthority(tenantId: string): Promise<LoyaltyAuthority> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (
      (await this.crmService.getCalendarSource(scopedTenantId)) ===
      CalendarSource.INTERNAL
    ) {
      return 'maya';
    }
    return (await this.legacyAuthorityEnabled(scopedTenantId))
      ? 'legacy_bot'
      : 'crm';
  }

  /**
   * Владелец для поверхностей, которые НЕ ходят к нему за каждой строкой:
   * список клиентов, досье, сводки.
   *
   * 🔴 Единственный законный способ говорить о владельце без разрешения под
   * человека. До P7.1 список считал его своей второй формулой из колонки кэша,
   * и одна и та же строка получала в списке `maya`, а в карточке `legacy_bot`.
   *
   * Один вызов на страницу, а не на строку: сетевых обращений здесь нет.
   */
  async authoritySnapshot(tenantId: string): Promise<LoyaltyAuthorityView> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    return snapshotAuthorityView(
      await this.configuredAuthority(scopedTenantId),
    );
  }

  /** Включён ли внешний журнал для этого арендатора. Транспорт скрыт. */
  private async legacyAuthorityEnabled(tenantId: string): Promise<boolean> {
    const token = String(process.env.MAYA_LEGACY_BRIDGE_TOKEN || '').trim();
    const allowedSlugs = new Set(
      String(process.env.MAYA_LEGACY_LOYALTY_TENANT_SLUGS || '')
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean),
    );
    if (token.length < 32 || allowedSlugs.size === 0) return false;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    return Boolean(tenant && allowedSlugs.has(tenant.slug.toLowerCase()));
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

  /** Client-owned history read; requester authorization remains external. */
  async listTransactionsForClient(
    tenantId: string,
    clientId: string,
    limit = 50,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const account = await this.getEstablishedClientAccount(
      scopedTenantId,
      clientId,
    );
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

  private async getEstablishedClientAccount(
    tenantId: string,
    clientId: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id_tenantId: { id: clientId, tenantId } },
      select: { id: true, mergedIntoClientId: true },
    });
    if (!client || client.mergedIntoClientId !== null) {
      throw new ConflictException({
        message: 'Canonical loyalty owner is unresolved.',
        error: { code: 'loyalty_client_owner_unresolved' },
      });
    }
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { tenantId_clientId: { tenantId, clientId: client.id } },
    });
    if (!account) {
      throw new ConflictException({
        message: 'Client-owned loyalty account is not established.',
        error: { code: 'loyalty_account_not_established' },
      });
    }
    return account;
  }

  async adjustInternalBalance(params: {
    tenantId: string;
    targetUserId: string;
    actorUserId: string;
    sourceRef: 'http.admin-loyalty.adjust' | 'ai-tool.loyalty.internal.adjust';
    dto: AdjustLoyaltyDto;
  }) {
    const tenantId = this.tenantContext.assertTenantId(params.tenantId);
    const receipt = await this.actionEngine.executeWithReceipt(
      {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId,
        capability: 'loyalty.internal-adjust.execute.v1',
        source: {
          type: 'authenticated_request',
          occurrenceScope: `loyalty.internal-adjust:${params.dto.idempotencyKey}`,
          sourceRef: params.sourceRef,
          actorUserId: params.actorUserId,
        },
        targetRef: params.targetUserId,
        input: {
          delta: params.dto.delta,
          reason: params.dto.reason,
        },
        evidenceRefs: [],
        callerIdempotency: {
          scope: 'loyalty.internal-adjust',
          key: params.dto.idempotencyKey,
        },
      },
      {
        prepare: async () => {
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
            this.usersService.getTenantUserOrThrow(
              params.targetUserId,
              tenantId,
            ),
            this.usersService.getTenantUserOrThrow(
              params.actorUserId,
              tenantId,
            ),
          ]);
          return {
            targetUserId: params.targetUserId,
            actorUserId: params.actorUserId,
          };
        },
        dispatch: async (normalizedInput, _transportKey, context) => {
          const input = this.loyaltyAdjustmentInput(normalizedInput);
          const result = await this.applyInternalAdjustment({
            tenantId: context.tenantId,
            executionId: context.executionId,
            targetUserId: params.targetUserId,
            actorUserId: params.actorUserId,
            idempotencyKey: params.dto.idempotencyKey,
            ...input,
          });
          const value = this.loyaltyAdjustmentValue(result);
          return {
            value,
            safeResult: this.loyaltyAdjustmentSafeResult(value),
          };
        },
        reconcile: async (normalizedInput, _previous, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' };
          const input = this.loyaltyAdjustmentInput(normalizedInput);
          const existing = await this.findAdjustment(
            context.tenantId,
            params.dto.idempotencyKey,
          );
          if (!existing || existing.actionExecutionId === null) {
            return { outcome: 'PROVEN_NOT_EXECUTED' };
          }
          if (
            existing.actionExecutionId !== context.executionId ||
            !this.isSameAdjustment(existing, {
              targetUserId: params.targetUserId,
              actorUserId: params.actorUserId,
              ...input,
            })
          ) {
            return { outcome: 'PROVEN_FAILED' };
          }
          const value = this.loyaltyAdjustmentValue({
            account: {
              ...existing.account,
              balance: existing.balanceAfter,
            },
            transaction: existing,
          });
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: this.loyaltyAdjustmentSafeResult(value),
          };
        },
        restore: (safeResult) => this.restoreLoyaltyAdjustmentValue(safeResult),
        classifyError: (error, phase) =>
          this.classifyLoyaltyAdjustmentError(error, phase),
      },
    );

    await this.auditLogService.log({
      tenantId,
      userId: params.actorUserId,
      action: 'loyalty.balance_adjusted',
      entityType: 'loyalty_account',
      entityId: receipt.value.account_id,
      metadata: {
        target_user_id: params.targetUserId,
        transaction_id: receipt.value.transaction_id,
        delta: params.dto.delta,
        balance_after: receipt.value.balance,
        action_execution_id: receipt.execution.executionId,
      },
    });

    return receipt.value;
  }

  private async applyInternalAdjustment(input: {
    tenantId: string;
    executionId: string;
    targetUserId: string;
    actorUserId: string;
    idempotencyKey: string;
    delta: number;
    reason: string;
  }) {
    return this.prisma
      .$transaction(
        async (tx) => {
          const existing = await tx.loyaltyTransaction.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: input.tenantId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: { account: true },
          });
          if (existing) {
            if (!this.isSameAdjustment(existing, input)) {
              throw new ConflictException(
                'Idempotency key is already used for another loyalty operation',
              );
            }
            if (
              existing.actionExecutionId !== null &&
              existing.actionExecutionId !== input.executionId
            ) {
              throw new ConflictException(
                'Loyalty operation is bound to another ActionExecution',
              );
            }
            const transaction =
              existing.actionExecutionId === input.executionId
                ? existing
                : await tx.loyaltyTransaction.update({
                    where: {
                      tenantId_idempotencyKey: {
                        tenantId: input.tenantId,
                        idempotencyKey: input.idempotencyKey,
                      },
                    },
                    data: { actionExecutionId: input.executionId },
                  });
            return {
              account: {
                ...existing.account,
                balance: existing.balanceAfter,
              },
              transaction,
            };
          }

          const account = await tx.loyaltyAccount.upsert({
            where: {
              userId_tenantId: {
                userId: input.targetUserId,
                tenantId: input.tenantId,
              },
            },
            update: {},
            create: {
              tenantId: input.tenantId,
              userId: input.targetUserId,
              source: CalendarSource.INTERNAL,
            },
          });
          const balanceAfter = account.balance + input.delta;
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
            where: {
              id_tenantId: { id: account.id, tenantId: input.tenantId },
            },
            data: { balance: balanceAfter, source: CalendarSource.INTERNAL },
          });
          const transaction = await tx.loyaltyTransaction.create({
            data: {
              tenantId: input.tenantId,
              actionExecutionId: input.executionId,
              accountId: account.id,
              actorUserId: input.actorUserId,
              actorTenantId: input.tenantId,
              kind: input.delta >= 0 ? 'credit' : 'debit',
              delta: input.delta,
              balanceAfter,
              encryptedReason: this.encryptionService.encrypt(input.reason),
              idempotencyKey: input.idempotencyKey,
            },
          });
          return { account: updatedAccount, transaction };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return this.bindConcurrentAdjustment(input, error);
        }
        throw error;
      });
  }

  private async bindConcurrentAdjustment(
    input: {
      tenantId: string;
      executionId: string;
      targetUserId: string;
      actorUserId: string;
      idempotencyKey: string;
      delta: number;
      reason: string;
    },
    originalError: Prisma.PrismaClientKnownRequestError,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.loyaltyTransaction.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: input.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { account: true },
        });
        if (!existing) {
          // A P2002 can also come from concurrent account creation under a
          // different logical adjustment. Preserve the database uncertainty
          // so canonical reconciliation can prove absence before retrying.
          throw originalError;
        }
        if (!this.isSameAdjustment(existing, input)) {
          throw new ConflictException(
            'Loyalty operation could not be replayed after a concurrent write',
          );
        }
        if (
          existing.actionExecutionId !== null &&
          existing.actionExecutionId !== input.executionId
        ) {
          throw new ConflictException(
            'Loyalty operation is bound to another ActionExecution',
          );
        }
        const transaction =
          existing.actionExecutionId === input.executionId
            ? existing
            : await tx.loyaltyTransaction.update({
                where: {
                  tenantId_idempotencyKey: {
                    tenantId: input.tenantId,
                    idempotencyKey: input.idempotencyKey,
                  },
                },
                data: { actionExecutionId: input.executionId },
              });
        return {
          account: { ...existing.account, balance: existing.balanceAfter },
          transaction,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private findAdjustment(tenantId: string, idempotencyKey: string) {
    return this.prisma.loyaltyTransaction.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: { account: true },
    });
  }

  private isSameAdjustment(
    existing: {
      account: { userId: string | null };
      actorUserId: string | null;
      delta: number;
      encryptedReason: string;
    },
    input: {
      targetUserId: string;
      actorUserId: string;
      delta: number;
      reason: string;
    },
  ): boolean {
    return (
      existing.account.userId === input.targetUserId &&
      existing.actorUserId === input.actorUserId &&
      existing.delta === input.delta &&
      this.encryptionService.decrypt(existing.encryptedReason) === input.reason
    );
  }

  private loyaltyAdjustmentInput(input: Record<string, unknown>): {
    delta: number;
    reason: string;
  } {
    if (!Number.isInteger(input.delta) || typeof input.reason !== 'string') {
      throw new BadRequestException('Invalid canonical loyalty adjustment');
    }
    return { delta: Number(input.delta), reason: input.reason };
  }

  private loyaltyAdjustmentValue(result: {
    account: {
      id: string;
      balance: number;
      source: string;
      syncedAt: Date | null;
    };
    transaction: { id: string };
  }) {
    return {
      ...this.serializeAccount(result.account, {
        authoritative: 'maya',
        syncStatus: 'current',
        stale: false,
      }),
      transaction_id: result.transaction.id,
    };
  }

  private loyaltyAdjustmentSafeResult(
    value: ReturnType<LoyaltyService['loyaltyAdjustmentValue']>,
  ): Record<string, unknown> {
    return {
      accountId: value.account_id,
      balance: value.balance,
      source: value.source,
      syncedAt:
        value.synced_at instanceof Date ? value.synced_at.toISOString() : null,
      transactionId: value.transaction_id,
    };
  }

  private restoreLoyaltyAdjustmentValue(safe: Record<string, unknown>) {
    if (
      typeof safe.accountId !== 'string' ||
      !Number.isInteger(safe.balance) ||
      typeof safe.source !== 'string' ||
      typeof safe.transactionId !== 'string' ||
      (safe.syncedAt !== null && typeof safe.syncedAt !== 'string')
    ) {
      throw new ConflictException('Loyalty action result is incomplete');
    }
    return {
      ...this.serializeAccount(
        {
          id: safe.accountId,
          balance: Number(safe.balance),
          source: safe.source,
          syncedAt: safe.syncedAt ? new Date(safe.syncedAt) : null,
        },
        { authoritative: 'maya', syncStatus: 'current', stale: false },
      ),
      transaction_id: safe.transactionId,
    };
  }

  private classifyLoyaltyAdjustmentError(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification {
    if (phase === 'prepare') {
      return {
        kind: 'definitive',
        outcomeCode:
          error instanceof HttpException
            ? 'loyalty_preparation_rejected'
            : 'loyalty_preparation_transient',
        errorClass:
          error instanceof Error ? error.constructor.name : 'UnknownError',
      };
    }
    if (error instanceof HttpException) {
      return {
        kind: 'definitive',
        outcomeCode: 'loyalty_adjustment_rejected',
        errorClass: error.constructor.name,
      };
    }
    return {
      kind: 'unknown',
      outcomeCode: 'loyalty_adjustment_outcome_unknown',
      errorClass:
        error instanceof Error ? error.constructor.name : 'UnknownError',
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
      const snapshot = await this.crmService.getClientLoyaltyEvidenceReadOnly(
        tenantId,
        phone,
      );
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

      return {
        ...this.serializeObservedBalance(
          {
            accountId: cached?.id ?? null,
            balance: snapshot.balance,
            source: snapshot.provider,
            observedAt: new Date(),
          },
          {
            authoritative: 'crm',
            syncStatus: 'current',
            stale: false,
          },
        ),
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
      // 🔴 Расхождение с картой провайдера здесь НЕ проверяется намеренно.
      // Мост отвечает первым и возвращает управление сразу; чтобы сравнить,
      // пришлось бы дергать провайдера на КАЖДОМ чтении баланса — это лишний
      // сетевой вызов на горячем пути и расширение объёма работ.
      //
      // Сравнение делается там, где карта провайдера уже прочитана по другой
      // причине (см. `compareWithExternalCard`): тогда оба числа в руках и
      // второго запроса не требуется. Победитель при этом не выбирается молча —
      // политика объявлена в `resolveAuthoritativeBalance`.
      const legacyWarnings: LoyaltyWarning[] = [];
      return this.serializeObservedBalance(
        {
          accountId: cached?.id ?? null,
          balance: normalizedBalance,
          source: 'legacy_maya',
          observedAt: new Date(),
        },
        {
          // 🔴 Это ЧУЖОЙ журнал, а не реестр Maya. Раньше здесь стояло 'maya',
          // и из-за этого подтверждение перед тратой не запрашивалось.
          authoritative: 'legacy_bot',
          syncStatus: 'current',
          stale: false,
          warnings: legacyWarnings,
        },
      );
    } catch {
      if (cached?.source === 'legacy_maya') {
        return this.serializeAccount(cached, {
          authoritative: 'legacy_bot',
          syncStatus: 'temporarily_unavailable',
          stale: true,
          warnings: [{ code: LOYALTY_WARNING.servedFromCache }],
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
      authority: 'crm' as const,
      authoritative: 'crm' as const,
      authority_scope: 'resolved' as const,
      // Пустой ответ — «не знаем», а не доказанный ноль: провайдер умеет
      // отдавать пустой список карт с кодом успеха.
      verification_required: true,
      warnings: [] as LoyaltyWarning[],
      sync_status: syncStatus,
      stale: false,
      synced_at: null,
    };
  }

  /**
   * Provider and legacy balances are observations, not Maya ledger facts.
   * A read may present the current external value, but only the canonical
   * P4-03 import executor may turn exact provider evidence into a bound ledger
   * claim and an atomic LoyaltyAccount balance change.
   */
  private serializeObservedBalance(
    observation: {
      accountId: string | null;
      balance: number;
      source: string;
      observedAt: Date;
    },
    status: {
      authoritative: LoyaltyAuthority;
      syncStatus: string;
      stale: boolean;
      warnings?: LoyaltyWarning[];
    },
  ) {
    const warnings = status.warnings ?? [];
    return {
      account_id: observation.accountId,
      balance: observation.balance,
      currency: 'RUB',
      source: observation.source,
      authority: status.authoritative,
      authoritative: status.authoritative,
      authority_scope: 'resolved' as const,
      sync_status: status.syncStatus,
      stale: status.stale,
      verification_required: loyaltyVerificationRequired({
        authority: status.authoritative,
        stale: status.stale,
        hasDisagreement: warnings.some(
          (warning) => warning.code === LOYALTY_WARNING.authorityDisagreement,
        ),
      }),
      warnings,
      synced_at: observation.observedAt,
    };
  }

  private async withSpendOptions<
    T extends {
      balance: number;
      currency: string;
      authoritative: LoyaltyAuthority;
      stale: boolean;
      verification_required?: boolean;
    },
  >(tenantId: string, loyalty: T) {
    const balance = Math.max(0, Number(loyalty.balance) || 0);
    const base = {
      basis: 'price_estimate',
      points_to_currency_rate: 1,
      // Решение принято в сериализаторе по канону; витрина его повторяет.
      verification_required:
        loyalty.verification_required ??
        loyaltyVerificationRequired({
          authority: loyalty.authoritative,
          stale: loyalty.stale,
        }),
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
      authoritative: LoyaltyAuthority;
      syncStatus: string;
      stale: boolean;
      warnings?: LoyaltyWarning[];
    },
  ) {
    const warnings = status.warnings ?? [];
    return {
      account_id: account.id,
      balance: account.balance,
      currency: 'RUB',
      source: account.source,
      /** 🔴 Канонический владелец. Три значения, не два. */
      authority: status.authoritative,
      /** Наследие провода: старое имя того же поля. Снимается вместе с фронтом. */
      authoritative: status.authoritative,
      /**
       * 🔴 К владельцу действительно ходили за ЭТИМ человеком. Снимок списка и
       * досье говорят `configured`, отказ границы — `unknown`. Раньше разницы в
       * словаре не было, и поверхности выглядели противоречащими друг другу.
       */
      authority_scope: 'resolved' as const,
      sync_status: status.syncStatus,
      stale: status.stale,
      // Обещать списание без проверки можно только по собственному свежему
      // реестру. Правило живёт в домене, а не в каждом потребителе.
      verification_required: loyaltyVerificationRequired({
        authority: status.authoritative,
        stale: status.stale,
        hasDisagreement: warnings.some(
          (warning) => warning.code === LOYALTY_WARNING.authorityDisagreement,
        ),
      }),
      warnings,
      synced_at: account.syncedAt,
    };
  }
}
