import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { BrandingService } from '../branding/branding.service';
import {
  CalendarSource,
  CrmProvider,
  TenantStatus,
  UserRole,
  UserStatus,
} from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { InternalCalendarService } from '../internal-calendar/internal-calendar.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { OnboardingService } from './onboarding.service';

type CreatedTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  allow_self_registration: boolean;
};

type CreatedUser = {
  id: string;
  tenantId: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
};

describe('OnboardingService', () => {
  const createService = (configMap?: Record<string, string>) => {
    const tenant: CreatedTenant = {
      id: 'tenant-1',
      name: 'Studio Vector',
      slug: 'studio-vector',
      status: TenantStatus.TRIAL,
      allow_self_registration: true,
    };
    const user: CreatedUser = {
      id: 'user-1',
      tenantId: tenant.id,
      email: 'owner@studio-vector.ru',
      phone: '+79990000000',
      role: UserRole.TENANT_ADMIN,
      status: UserStatus.ACTIVE,
    };

    const configGetMock: jest.MockedFunction<
      (key: string) => string | undefined
    > = jest.fn((key: string) => {
      const values: Record<string, string> = {
        NODE_ENV: 'test',
        ...(configMap ?? {}),
      };

      return values[key];
    });
    const createTenantMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<CreatedTenant>
    > = jest.fn().mockResolvedValue(tenant);
    const upsertBrandingMock: jest.MockedFunction<
      (tenantId: string, args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const createOrUpdateIntegrationMock: jest.MockedFunction<
      (tenantId: string, args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const ensureProviderForUserMock = jest.fn().mockResolvedValue({
      id: 'provider-1',
    });
    const getPlanByIdOrThrowMock = jest.fn().mockResolvedValue({
      id: 'plan-explicit',
    });
    const getPlanByNameOrThrowMock = jest.fn((name: string) =>
      Promise.resolve({ id: name === 'start' ? 'plan-start' : 'plan-pro' }),
    );
    const createUserMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<CreatedUser>
    > = jest.fn().mockResolvedValue(user);
    const serializeUserMock: jest.MockedFunction<
      (value: CreatedUser) => Record<string, unknown>
    > = jest.fn((value: CreatedUser) => ({
      id: value.id,
      tenant_id: value.tenantId,
      email: value.email,
      phone: value.phone,
      role: value.role,
      status: value.status,
    }));
    const issueSessionMock = jest.fn().mockResolvedValue({
      access_token: 'jwt-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_expires_at: new Date('2026-08-10T12:00:00.000Z'),
      session: { id: 'session-1' },
    });
    const auditLogMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);
    const rateLimitPreflightMock = jest.fn().mockResolvedValue(undefined);
    const tenantContext = new TenantContextService();
    const expectCreatedTenantContext = () => {
      expect(tenantContext.requireTenantId()).toBe(tenant.id);
    };
    upsertBrandingMock.mockImplementation(() => {
      expectCreatedTenantContext();
      return Promise.resolve();
    });
    createOrUpdateIntegrationMock.mockImplementation(() => {
      expectCreatedTenantContext();
      return Promise.resolve();
    });
    auditLogMock.mockImplementation(() => {
      expectCreatedTenantContext();
      return Promise.resolve();
    });

    const service = new OnboardingService(
      { get: configGetMock } as ConfigService,
      { createTenant: createTenantMock } as unknown as TenantsService,
      { upsertBranding: upsertBrandingMock } as unknown as BrandingService,
      {
        createOrUpdateIntegration: createOrUpdateIntegrationMock,
      } as unknown as CrmService,
      {
        ensureProviderForUser: ensureProviderForUserMock,
      } as unknown as InternalCalendarService,
      {
        getPlanByIdOrThrow: getPlanByIdOrThrowMock,
        getPlanByNameOrThrow: getPlanByNameOrThrowMock,
      } as unknown as SubscriptionsService,
      {
        createUser: createUserMock,
        serializeUser: serializeUserMock,
      } as unknown as UsersService,
      {
        issueSession: issueSessionMock,
      } as unknown as AuthService,
      {
        assertPreflight: rateLimitPreflightMock,
      } as unknown as AuthRateLimitService,
      { log: auditLogMock } as unknown as AuditLogService,
      tenantContext,
    );

    return {
      service,
      tenantContext,
      mocks: {
        createTenantMock,
        upsertBrandingMock,
        createOrUpdateIntegrationMock,
        ensureProviderForUserMock,
        getPlanByIdOrThrowMock,
        getPlanByNameOrThrowMock,
        createUserMock,
        serializeUserMock,
        issueSessionMock,
        rateLimitPreflightMock,
        auditLogMock,
      },
    };
  };

  it('creates a self-serve trial tenant with mock CRM and owner session', async () => {
    const { service, mocks } = createService();

    const result = await service.createTrialSignup({
      name: 'Studio Vector',
      slug: 'studio-vector',
      ownerEmail: 'owner@studio-vector.ru',
      ownerName: 'Илья',
      ownerPhone: '+79990000000',
      industryPresetId: 'education',
      calendarSource: CalendarSource.EXTERNAL,
      branchAddress: 'Moscow, Tverskaya 1',
    });

    expect(mocks.createTenantMock).toHaveBeenCalledWith({
      name: 'Studio Vector',
      slug: 'studio-vector',
      status: TenantStatus.TRIAL,
      planId: 'plan-pro',
      industryPresetId: 'education',
      calendarSource: CalendarSource.EXTERNAL,
      branchName: 'Studio Vector',
      branchAddress: 'Moscow, Tverskaya 1',
      branchPhone: undefined,
      branchTimezone: undefined,
    });
    expect(mocks.rateLimitPreflightMock).toHaveBeenCalledWith('trial_signup', {
      clientIp: undefined,
      identity: 'owner@studio-vector.ru',
    });
    expect(mocks.upsertBrandingMock).toHaveBeenCalledWith('tenant-1', {
      appName: 'Studio Vector',
      themeJson: {
        industryPresetId: 'education',
        calendarSource: CalendarSource.EXTERNAL,
        booking: {
          mode: 'preview',
        },
      },
    });
    expect(mocks.createOrUpdateIntegrationMock).toHaveBeenCalledWith(
      'tenant-1',
      {
        provider: CrmProvider.MOCK,
        settingsJson: {
          industryPresetId: 'education',
        },
      },
    );
    expect(mocks.createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        email: 'owner@studio-vector.ru',
        phone: '+79990000000',
        name: 'Илья',
        role: UserRole.TENANT_ADMIN,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(mocks.issueSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', tenantId: 'tenant-1' }),
      {},
    );
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      booking_mode: 'preview',
      next_step: 'open_admin',
      tenant: {
        id: 'tenant-1',
        slug: 'studio-vector',
        status: TenantStatus.TRIAL,
        allow_self_registration: true,
        industry_preset_id: 'education',
        industry_preset: {
          id: 'education',
        },
        calendar_source: CalendarSource.EXTERNAL,
        plan_id: 'plan-pro',
      },
      user: {
        id: 'user-1',
        tenant_id: 'tenant-1',
      },
    });
    expect(typeof result.temporary_password).toBe('string');
  });

  it('bootstraps a solo specialist without creating a mock CRM', async () => {
    const { service, mocks } = createService();

    const result = await service.createTrialSignup({
      name: 'Илья Консалтинг',
      slug: 'ilya-consulting',
      ownerEmail: 'owner@studio-vector.ru',
      ownerName: 'Илья',
      industryPresetId: 'solo_specialist',
    });

    expect(mocks.createTenantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        industryPresetId: 'solo_specialist',
        calendarSource: CalendarSource.INTERNAL,
        planId: 'plan-start',
      }),
    );
    expect(mocks.createOrUpdateIntegrationMock).not.toHaveBeenCalled();
    expect(mocks.ensureProviderForUserMock).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      { displayName: 'Илья' },
    );
    expect(result).toMatchObject({
      calendar_source: CalendarSource.INTERNAL,
      tenant: {
        calendar_source: CalendarSource.INTERNAL,
      },
    });
  });

  it('blocks self-serve trial signup in production until explicitly enabled', async () => {
    const { service } = createService({
      NODE_ENV: 'production',
    });

    await expect(
      service.createTrialSignup({
        name: 'Demo Salon',
        slug: 'demo-salon',
        ownerEmail: 'owner@demo-salon.ru',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
