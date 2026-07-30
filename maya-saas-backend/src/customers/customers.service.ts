import { BadRequestException, Injectable } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
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
    const now = new Date();
    const profile = await this.prisma.customerProfile.upsert({
      where: { userId_tenantId: { userId, tenantId: scopedTenantId } },
      update: {
        preferredLocale: dto.preferredLocale,
        privacyConsentAt:
          dto.privacyConsent === undefined
            ? undefined
            : dto.privacyConsent
              ? now
              : null,
        marketingConsentAt:
          dto.marketingConsent === undefined
            ? undefined
            : dto.marketingConsent
              ? now
              : null,
      },
      create: {
        tenantId: scopedTenantId,
        userId,
        preferredLocale: dto.preferredLocale,
        privacyConsentAt: dto.privacyConsent ? now : null,
        marketingConsentAt: dto.marketingConsent ? now : null,
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
        loyaltyAccounts: {
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

    return users.map((user) => {
      const profile = user.customerProfiles[0] ?? null;
      const loyaltyAccount = user.loyaltyAccounts[0] ?? null;

      return {
        ...this.usersService.serializeUser(user),
        appointments_count: user._count.appointments,
        loyalty_balance: loyaltyAccount?.balance ?? null,
        loyalty_source: loyaltyAccount?.source ?? null,
        profile: this.serializeAdminProfile(profile),
      };
    });
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
      this.prisma.loyaltyAccount.findUnique({
        where: { userId_tenantId: { userId, tenantId: scopedTenantId } },
      }),
      this.prisma.appointment.count({
        where: { tenantId: scopedTenantId, clientId: userId },
      }),
    ]);

    return {
      ...this.usersService.serializeUser(user),
      appointments_count: appointmentsCount,
      loyalty_balance: loyalty?.balance ?? null,
      loyalty_source: loyalty?.source ?? null,
      profile: this.serializeAdminProfile(profile),
    };
  }

  async updateNotes(
    tenantId: string,
    actorUserId: string,
    userId: string,
    dto: UpdateCustomerNotesDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.getCustomer(scopedTenantId, userId);
    const notes = dto.notes?.trim() || null;
    const profile = await this.prisma.customerProfile.upsert({
      where: { userId_tenantId: { userId, tenantId: scopedTenantId } },
      update: {
        encryptedNotes: notes ? this.encryptionService.encrypt(notes) : null,
      },
      create: {
        tenantId: scopedTenantId,
        userId,
        encryptedNotes: notes ? this.encryptionService.encrypt(notes) : null,
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
