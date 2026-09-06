import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { Package5Wave3CanonicalCutoverService } from '../package5-wave3/package5-wave3-canonical-cutover.service';
import { UpdateCustomerNotesDto } from './dto/update-customer-notes.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

const CUSTOMER_ROLES = [UserRole.CLIENT, UserRole.CUSTOMER] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly usersService: UsersService,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogService: AuditLogService,
    private readonly loyaltyService: LoyaltyService,
    private readonly canonicalWave3: Package5Wave3CanonicalCutoverService,
  ) {}

  async getOwnProfile(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.usersService.getTenantUserOrThrow(userId, scopedTenantId);
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId_tenantId: { userId, tenantId: scopedTenantId } },
    });
    return this.serializeOwnProfile(profile);
  }

  async updateOwnProfile(
    tenantId: string,
    userId: string,
    dto: UpdateCustomerProfileDto,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.usersService.getTenantUserOrThrow(userId, scopedTenantId);
    if (
      dto.preferredLocale === undefined &&
      dto.privacyConsent === undefined &&
      dto.marketingConsent === undefined
    ) {
      throw new BadRequestException(
        'At least one customer profile field must be provided',
      );
    }
    const client = await this.exactClientForUser(scopedTenantId, userId);
    const source = this.canonicalWave3.intentRef(idempotencyKey);
    const now = new Date();
    const currentProfile = await this.prisma.customerProfile.findFirst({
      where: {
        tenantId: scopedTenantId,
        OR: [{ clientId: client.id }, { userId }],
      },
    });
    if (
      dto.preferredLocale !== undefined &&
      (!currentProfile ||
        currentProfile.preferredLocale !== dto.preferredLocale)
    ) {
      await this.canonicalWave3.updateClientLocale(
        scopedTenantId,
        userId,
        client.id,
        dto.preferredLocale,
        source,
      );
    }
    if (dto.privacyConsent !== undefined) {
      await this.canonicalWave3.recordClientConsent(
        scopedTenantId,
        userId,
        client.id,
        'privacy',
        dto.privacyConsent,
        now,
        source,
      );
    }
    if (dto.marketingConsent !== undefined) {
      await this.canonicalWave3.recordClientConsent(
        scopedTenantId,
        userId,
        client.id,
        'marketing',
        dto.marketingConsent,
        now,
        source,
      );
    }
    const profile = await this.prisma.customerProfile.findFirstOrThrow({
      where: {
        tenantId: scopedTenantId,
        OR: [{ clientId: client.id }, { userId }],
      },
    });

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId,
      action: 'customer.profile_updated',
      entityType: 'customer_profile',
      entityId: profile.id,
      metadata: {
        preferred_locale_changed: dto.preferredLocale !== undefined,
        privacy_consent: dto.privacyConsent ?? 'unchanged',
        marketing_consent: dto.marketingConsent ?? 'unchanged',
      },
    });

    return this.serializeOwnProfile(profile);
  }

  async listCustomers(tenantId: string, limit = 50) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const users = await this.prisma.user.findMany({
      where: {
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
            role: { in: [...CUSTOMER_ROLES] },
          },
        },
      },
      include: {
        memberships: {
          where: {
            tenantId: scopedTenantId,
            status: 'active',
            role: { in: [...CUSTOMER_ROLES] },
          },
          include: { tenant: true, branch: true },
        },
        customerProfiles: {
          where: { tenantId: scopedTenantId },
          take: 1,
        },
        _count: {
          select: {
            appointments: { where: { tenantId: scopedTenantId } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return Promise.all(
      users.map(async (user) => {
        const profile = user.customerProfiles[0] ?? null;
        const loyalty = await this.loyaltyService
          .getStateForUser(scopedTenantId, user.id)
          .catch(() => null);

        return {
          ...this.usersService.serializeUser(user),
          appointments_count: user._count.appointments,
          loyalty_balance: loyalty?.balance ?? null,
          loyalty_source: loyalty?.source ?? null,
          loyalty_authority: loyalty?.authority ?? null,
          loyalty_authority_scope: loyalty?.authority_scope ?? null,
          loyalty_stale: loyalty?.stale ?? null,
          loyalty_sync_status: loyalty?.sync_status ?? null,
          loyalty_verification_required: loyalty?.verification_required ?? null,
          profile: this.serializeAdminProfile(profile),
        };
      }),
    );
  }

  async countCustomers(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const count = await this.prisma.user.count({
      where: {
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
            role: { in: [...CUSTOMER_ROLES] },
          },
        },
      },
    });
    return { customer_count: count };
  }

  async getCustomer(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const user = await this.usersService.getTenantUserOrThrow(
      userId,
      scopedTenantId,
    );
    if (
      !CUSTOMER_ROLES.includes(user.role as (typeof CUSTOMER_ROLES)[number])
    ) {
      throw new BadRequestException('User is not a customer');
    }
    const [profile, loyalty, appointmentsCount] = await Promise.all([
      this.prisma.customerProfile.findUnique({
        where: { userId_tenantId: { userId, tenantId: scopedTenantId } },
      }),
      // 🔴 Через каноническую границу, а не напрямую из таблицы: до P5 здесь
      // кэш выдавался за текущее значение — без владельца, свежести и
      // требования подтверждения.
      this.loyaltyService.getStateForUser(scopedTenantId, userId),
      this.prisma.appointment.count({
        where: { tenantId: scopedTenantId, clientId: userId },
      }),
    ]);

    return {
      ...this.usersService.serializeUser(user),
      appointments_count: appointmentsCount,
      loyalty_balance: loyalty?.balance ?? null,
      loyalty_source: loyalty?.source ?? null,
      loyalty_authority: loyalty?.authority ?? null,
      loyalty_sync_status: loyalty?.sync_status ?? null,
      loyalty_stale: loyalty?.stale ?? null,
      loyalty_verification_required: loyalty?.verification_required ?? null,
      loyalty_warnings: loyalty?.warnings ?? [],
      profile: this.serializeAdminProfile(profile),
    };
  }

  /**
   * Владелец баланса по сохранённому источнику снимка.
   *
   * 🔴 Домен не знает деталей транспорта: `legacy_maya` — это историческое имя
   * колонки, а роль называется `legacy_bot`.
   */

  async updateNotes(
    tenantId: string,
    actorUserId: string,
    userId: string,
    dto: UpdateCustomerNotesDto,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.getCustomer(scopedTenantId, userId);
    const client = await this.exactClientForUser(scopedTenantId, userId);
    const notes = dto.notes?.trim() || null;
    await this.canonicalWave3.updateClientNotes(
      scopedTenantId,
      actorUserId,
      client.id,
      notes,
      idempotencyKey,
    );
    const profile = await this.prisma.customerProfile.findFirstOrThrow({
      where: {
        tenantId: scopedTenantId,
        OR: [{ clientId: client.id }, { userId }],
      },
    });

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'customer.notes_updated',
      entityType: 'customer_profile',
      entityId: profile.id,
      metadata: { target_user_id: userId, notes_present: Boolean(notes) },
    });

    return this.getCustomer(scopedTenantId, userId);
  }

  private async exactClientForUser(tenantId: string, userId: string) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId, userId, mergedIntoClientId: null },
      take: 2,
      select: { id: true },
    });
    if (clients.length !== 1)
      throw new BadRequestException('Exact canonical Client is unresolved');
    return clients[0];
  }

  private serializeOwnProfile(
    profile: {
      id: string;
      preferredLocale: string | null;
      privacyConsentAt: Date | null;
      marketingConsentAt: Date | null;
      updatedAt: Date;
    } | null,
  ) {
    return {
      profile_id: profile?.id ?? null,
      preferred_locale: profile?.preferredLocale ?? null,
      privacy_consent_at: profile?.privacyConsentAt ?? null,
      marketing_consent_at: profile?.marketingConsentAt ?? null,
      updated_at: profile?.updatedAt ?? null,
    };
  }

  private serializeAdminProfile(
    profile: {
      id: string;
      preferredLocale: string | null;
      privacyConsentAt: Date | null;
      marketingConsentAt: Date | null;
      encryptedNotes: string | null;
      updatedAt: Date;
    } | null,
  ) {
    return {
      ...this.serializeOwnProfile(profile),
      notes: profile?.encryptedNotes
        ? this.encryptionService.decrypt(profile.encryptedNotes)
        : null,
    };
  }
}
