import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { AuthClientMetadata } from '../auth/auth-client-metadata';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { BrandingService } from '../branding/branding.service';
import {
  CalendarSource,
  CrmProvider,
  TenantStatus,
  UserRole,
  UserStatus,
} from '../common/domain.enums';
import {
  DEFAULT_INDUSTRY_PRESET_ID,
  getIndustryPreset,
} from '../common/industry-presets';
import { CrmService } from '../crm/crm.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { CreateTrialSignupDto } from './dto/create-trial-signup.dto';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly brandingService: BrandingService,
    private readonly crmService: CrmService,
    private readonly internalCalendarService: InternalCalendarService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly rateLimitService: AuthRateLimitService,
    private readonly auditLogService: AuditLogService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async createTrialSignup(
    dto: CreateTrialSignupDto,
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    this.assertSelfServeTrialSignupEnabled();
    await this.rateLimitService.assertPreflight('trial_signup', {
      clientIp: metadata.clientIp,
      identity: dto.ownerEmail.trim().toLowerCase(),
    });

    const temporaryPassword = dto.password?.trim() || this.generatePassword();
    const industryPresetId = dto.industryPresetId ?? DEFAULT_INDUSTRY_PRESET_ID;
    const calendarSource =
      dto.calendarSource ??
      (industryPresetId === 'solo_specialist'
        ? CalendarSource.INTERNAL
        : CalendarSource.EXTERNAL);
    const plan = dto.planId
      ? await this.subscriptionsService.getPlanByIdOrThrow(dto.planId)
      : await this.subscriptionsService.getPlanByNameOrThrow(
          calendarSource === CalendarSource.INTERNAL ? 'start' : 'pro',
        );
    const tenant = await this.tenantsService.createTenant({
      name: dto.name,
      slug: dto.slug,
      status: TenantStatus.TRIAL,
      planId: plan.id,
      industryPresetId,
      calendarSource,
      branchName: dto.branchName ?? dto.name,
      branchAddress: dto.branchAddress,
      branchPhone: dto.branchPhone,
      branchTimezone: dto.branchTimezone,
    });

    return this.tenantContext.runAsSystemTenant(tenant.id, async () => {
      await this.brandingService.upsertBranding(tenant.id, {
        appName: dto.name,
        themeJson: {
          industryPresetId,
          calendarSource,
          booking: {
            mode: 'preview',
          },
        },
      });

      if (calendarSource === CalendarSource.EXTERNAL) {
        await this.crmService.createOrUpdateIntegration(tenant.id, {
          provider: CrmProvider.MOCK,
          settingsJson: {
            industryPresetId,
          },
        });
      }

      const user = await this.usersService.createUser({
        tenantId: tenant.id,
        email: dto.ownerEmail,
        phone: dto.ownerPhone ?? null,
        name: dto.ownerName ?? null,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        role: UserRole.TENANT_ADMIN,
        status: UserStatus.ACTIVE,
      });

      if (calendarSource === CalendarSource.INTERNAL) {
        await this.internalCalendarService.ensureProviderForUser(
          tenant.id,
          user.id,
          { displayName: dto.ownerName },
        );
      }

      await this.auditLogService.log({
        tenantId: tenant.id,
        action: 'tenant.self_serve_created',
        entityType: 'tenant',
        entityId: tenant.id,
        metadata: {
          slug: tenant.slug,
        },
      });
      await this.auditLogService.log({
        tenantId: tenant.id,
        userId: user.id,
        action: 'tenant.self_serve_owner_created',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          email: user.email,
          role: user.role,
        },
      });

      return {
        ...(await this.authService.issueSession(user, metadata)),
        user: this.usersService.serializeUser(user),
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          allow_self_registration: tenant.allow_self_registration,
          industry_preset_id: industryPresetId,
          industry_preset: getIndustryPreset(industryPresetId),
          calendar_source: calendarSource,
          plan_id: plan.id,
        },
        temporary_password: dto.password ? null : temporaryPassword,
        booking_mode: 'preview',
        calendar_source: calendarSource,
        next_step: 'open_admin',
      };
    });
  }

  private assertSelfServeTrialSignupEnabled() {
    if (this.configService.get<string>('SELF_SERVE_TRIAL_SIGNUP') === 'true') {
      return;
    }

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      return;
    }

    throw new ForbiddenException(
      'Self-serve trial signup is disabled in this environment',
    );
  }

  private generatePassword() {
    return randomBytes(12).toString('base64url');
  }
}
