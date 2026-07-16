import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { BrandingService } from '../branding/branding.service';
import {
  CrmProvider,
  TenantStatus,
  UserRole,
  UserStatus,
} from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
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
      name: 'Demo Salon',
      slug: 'demo-salon',
      status: TenantStatus.TRIAL,
      allow_self_registration: true,
    };
    const user: CreatedUser = {
      id: 'user-1',
      tenantId: tenant.id,
      email: 'owner@demo-salon.ru',
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
    const issueAccessTokenMock: jest.MockedFunction<
      (value: CreatedUser) => Promise<string>
    > = jest.fn().mockResolvedValue('jwt-token');
    const auditLogMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(undefined);

    const service = new OnboardingService(
      { get: configGetMock } as ConfigService,
      { createTenant: createTenantMock } as unknown as TenantsService,
      { upsertBranding: upsertBrandingMock } as unknown as BrandingService,
      {
        createOrUpdateIntegration: createOrUpdateIntegrationMock,
      } as unknown as CrmService,
      {
        createUser: createUserMock,
        serializeUser: serializeUserMock,
      } as unknown as UsersService,
      {
        issueAccessToken: issueAccessTokenMock,
      } as unknown as AuthService,
      { log: auditLogMock } as unknown as AuditLogService,
    );

    return {
      service,
      mocks: {
        createTenantMock,
        upsertBrandingMock,
        createOrUpdateIntegrationMock,
        createUserMock,
        serializeUserMock,
        issueAccessTokenMock,
        auditLogMock,
      },
    };
  };

  it('creates a self-serve trial tenant with mock CRM and owner session', async () => {
    const { service, mocks } = createService();

    const result = await service.createTrialSignup({
      name: 'Demo Salon',
      slug: 'demo-salon',
      ownerEmail: 'owner@demo-salon.ru',
      ownerName: 'Илья',
      ownerPhone: '+79990000000',
      branchAddress: 'Moscow, Tverskaya 1',
    });

    expect(mocks.createTenantMock).toHaveBeenCalledWith({
      name: 'Demo Salon',
      slug: 'demo-salon',
      status: TenantStatus.TRIAL,
      planId: undefined,
      branchName: 'Demo Salon',
      branchAddress: 'Moscow, Tverskaya 1',
      branchPhone: undefined,
      branchTimezone: undefined,
    });
    expect(mocks.upsertBrandingMock).toHaveBeenCalledWith('tenant-1', {
      appName: 'Demo Salon',
      themeJson: {
        booking: {
          mode: 'preview',
        },
      },
    });
    expect(mocks.createOrUpdateIntegrationMock).toHaveBeenCalledWith(
      'tenant-1',
      {
        provider: CrmProvider.MOCK,
      },
    );
    expect(mocks.createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        email: 'owner@demo-salon.ru',
        phone: '+79990000000',
        name: 'Илья',
        role: UserRole.TENANT_ADMIN,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(mocks.issueAccessTokenMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      access_token: 'jwt-token',
      booking_mode: 'preview',
      next_step: 'open_admin',
      tenant: {
        id: 'tenant-1',
        slug: 'demo-salon',
        status: TenantStatus.TRIAL,
        allow_self_registration: true,
      },
      user: {
        id: 'user-1',
        tenant_id: 'tenant-1',
      },
    });
    expect(typeof result.temporary_password).toBe('string');
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
