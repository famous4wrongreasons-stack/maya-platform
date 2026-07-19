import { ConflictException, ForbiddenException } from '@nestjs/common';

import { CrmProvider, TenantStatus, UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandingService } from '../branding/branding.service';
import { CrmService } from '../crm/crm.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { QuotaService } from '../quotas/quota.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';

describe('AdminService tenant update boundaries', () => {
  const tenantAdmin: AuthenticatedUser = {
    userId: 'admin-1',
    sessionId: 'session-1',
    tenantId: 'tenant-1',
    role: UserRole.TENANT_ADMIN,
    email: 'admin@example.test',
    branchId: null,
    membershipId: 'membership-1',
    membershipStatus: 'active',
  };
  const platformOwner: AuthenticatedUser = {
    userId: 'platform-owner-1',
    sessionId: 'session-platform-1',
    tenantId: null,
    role: UserRole.PLATFORM_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: null,
    membershipStatus: null,
  };

  const createService = () => {
    const updateTenantMock = jest.fn().mockResolvedValue({ id: 'tenant-1' });
    const getTenantByIdOrThrowMock = jest
      .fn()
      .mockResolvedValue({ id: 'tenant-1' });
    const upsertCrmMock = jest.fn().mockResolvedValue({ id: 'crm-1' });
    const upsertBrandingMock = jest.fn().mockResolvedValue({
      id: 'branding-1',
      tenantId: 'tenant-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const auditLogMock = jest.fn().mockResolvedValue(undefined);
    const assertCanCreateMock = jest.fn().mockResolvedValue(undefined);
    const assertCustomBrandingAllowedMock = jest
      .fn()
      .mockResolvedValue(undefined);
    const createUserMock = jest.fn().mockResolvedValue({
      id: 'tenant-owner-1',
      tenantId: 'tenant-1',
      branchId: null,
      email: 'owner@tenant.example',
      phone: null,
      encryptedName: null,
      passwordHash: 'hash',
      role: UserRole.TENANT_OWNER,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const serializeUserMock = jest.fn(
      (user: { id: string; role: UserRole }) => ({
        id: user.id,
        role: user.role,
      }),
    );
    const service = new AdminService(
      {
        updateTenant: updateTenantMock,
        getTenantByIdOrThrow: getTenantByIdOrThrowMock,
      } as unknown as TenantsService,
      { upsertBranding: upsertBrandingMock } as unknown as BrandingService,
      { connectAndActivateIntegration: upsertCrmMock } as unknown as CrmService,
      {
        ensureEmailIsAvailable: jest.fn().mockResolvedValue(undefined),
        ensurePhoneIsAvailable: jest.fn().mockResolvedValue(undefined),
        createUser: createUserMock,
        serializeUser: serializeUserMock,
      } as unknown as UsersService,
      {} as SubscriptionsService,
      { log: auditLogMock } as unknown as AuditLogService,
      {} as TenantContextService,
      {
        assertCanCreate: assertCanCreateMock,
        assertCustomBrandingAllowed: assertCustomBrandingAllowedMock,
      } as unknown as QuotaService,
    );

    return {
      service,
      updateTenantMock,
      upsertCrmMock,
      upsertBrandingMock,
      auditLogMock,
      assertCanCreateMock,
      assertCustomBrandingAllowedMock,
      createUserMock,
    };
  };

  it('prevents a tenant admin from activating their own trial', async () => {
    const { service, updateTenantMock } = createService();

    await expect(
      service.updateTenant(
        'tenant-1',
        { status: TenantStatus.ACTIVE },
        tenantAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateTenantMock).not.toHaveBeenCalled();
  });

  it('allows a tenant admin to request preview/live UI mode', async () => {
    const { service, updateTenantMock, auditLogMock } = createService();

    await service.updateTenant(
      'tenant-1',
      { bookingMode: 'preview' },
      tenantAdmin,
    );

    expect(updateTenantMock).toHaveBeenCalledWith('tenant-1', {
      bookingMode: 'preview',
    });
    expect(auditLogMock).toHaveBeenCalled();
  });

  it('prevents a tenant admin from overriding the CRM base URL', async () => {
    const { service, upsertCrmMock } = createService();

    await expect(
      service.upsertCrm(
        'tenant-1',
        {
          provider: CrmProvider.YCLIENTS,
          apiToken: 'tenant-token',
          baseUrl: 'http://127.0.0.1:8080',
          settingsJson: { companyId: 42 },
        },
        tenantAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsertCrmMock).not.toHaveBeenCalled();
  });

  it('allows a tenant admin to configure a CRM without a base URL override', async () => {
    const { service, upsertCrmMock } = createService();
    const dto = {
      provider: CrmProvider.YCLIENTS,
      apiToken: 'tenant-token',
      settingsJson: { companyId: 42 },
    };

    await service.upsertCrm('tenant-1', dto, tenantAdmin);

    expect(upsertCrmMock).toHaveBeenCalledWith('tenant-1', dto);
  });

  it('checks staff quota before any tenant-user creation work', async () => {
    const { service, assertCanCreateMock } = createService();
    assertCanCreateMock.mockRejectedValue(
      new ConflictException({ error: { code: 'quota_exceeded' } }),
    );

    await expect(
      service.createTenantUser(
        'tenant-1',
        { email: 'staff@example.test', role: UserRole.STAFF },
        tenantAdmin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(assertCanCreateMock).toHaveBeenCalledWith('tenant-1', 'staff');
  });

  it('prevents a tenant admin from assigning a tenant owner', async () => {
    const { service, assertCanCreateMock, createUserMock } = createService();

    await expect(
      service.createTenantUser(
        'tenant-1',
        { email: 'owner@tenant.example', role: UserRole.TENANT_OWNER },
        tenantAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(assertCanCreateMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('allows only the platform owner to create a tenant owner', async () => {
    const { service, createUserMock } = createService();

    const result = await service.createTenantUser(
      'tenant-1',
      {
        email: 'owner@tenant.example',
        password: 'StrongPass123',
        role: UserRole.TENANT_OWNER,
      },
      platformOwner,
    );

    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        email: 'owner@tenant.example',
        role: UserRole.TENANT_OWNER,
      }),
    );
    expect(result).toMatchObject({
      user: { id: 'tenant-owner-1', role: UserRole.TENANT_OWNER },
      temporary_password: null,
    });
  });

  it('checks plan-level white-label access before persisting custom branding', async () => {
    const { service, assertCustomBrandingAllowedMock, upsertBrandingMock } =
      createService();
    assertCustomBrandingAllowedMock.mockRejectedValue(
      new ForbiddenException({ error: { code: 'white_label_locked' } }),
    );

    await expect(
      service.updateBranding(
        'tenant-1',
        { primaryColor: '#000000' },
        tenantAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertCustomBrandingAllowedMock).toHaveBeenCalledWith('tenant-1', [
      'primaryColor',
    ]);
    expect(upsertBrandingMock).not.toHaveBeenCalled();
  });
});
