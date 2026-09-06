import { ClientProfileReadService } from '../crm/client-profile-read.service';
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
    private readonly profiles?: ClientProfileReadService,
  ) {}

  private profileReader() {
    if (!this.profiles)
      throw new Error('Verified Client profile reader required');
    return this.profiles;
  }

  async getOwnProfile(tenantId: string, userId: string) {
    return (await this.profileReader().forAccount(tenantId, userId)).profile;
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
    const resolved = await this.profileReader().forAccount(
      scopedTenantId,
      userId,
    );
    const client = { id: resolved.clientId };
    const source = this.canonicalWave3.intentRef(idempotencyKey);
    const now = new Date();
    const currentProfile = resolved.profile;
    if (
      dto.preferredLocale !== undefined &&
      (!currentProfile ||
        currentProfile.preferred_locale !== dto.preferredLocale)
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
    const profile = await this.getOwnProfile(scopedTenantId, userId);
    if (!profile.profile_id)
      throw new BadRequestException('Client profile is unavailable');

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId,
      action: 'customer.profile_updated',
      entityType: 'customer_profile',
      entityId: profile.profile_id,
      metadata: {
        preferred_locale_changed: dto.preferredLocale !== undefined,
        privacy_consent: dto.privacyConsent ?? 'unchanged',
        marketing_consent: dto.marketingConsent ?? 'unchanged',
      },
    });

    return profile;
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
        const profile = await this.profileReader()
          .forStaffAccount(scopedTenantId, user.id)
          .then((result) => result.profile)
          .catch(() => null);
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
          profile,
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
      this.profileReader()
        .forStaffAccount(scopedTenantId, userId)
        .then((result) => result.profile),
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
      profile,
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
    const resolved = await this.profileReader().forStaffAccount(
      scopedTenantId,
      userId,
    );
    const client = { id: resolved.clientId };
    const notes = dto.notes?.trim() || null;
    await this.canonicalWave3.updateClientNotes(
      scopedTenantId,
      actorUserId,
      client.id,
      notes,
      idempotencyKey,
    );
    const profile = (
      await this.profileReader().forStaffAccount(scopedTenantId, userId)
    ).profile;
    if (!profile.profile_id)
      throw new BadRequestException('Client profile is unavailable');

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'customer.notes_updated',
      entityType: 'customer_profile',
      entityId: profile.profile_id,
      metadata: { target_user_id: userId, notes_present: Boolean(notes) },
    });

    return this.getCustomer(scopedTenantId, userId);
  }
}
