import { ConflictException, ForbiddenException } from '@nestjs/common';

import { CrmProvider, TenantStatus, UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandingService } from '../branding/branding.service';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { Package5Wave2CanonicalCutoverService } from '../package5-wave2/package5-wave2-canonical-cutover.service';
import { Package5Wave3CanonicalCutoverService } from '../package5-wave3/package5-wave3-canonical-cutover.service';
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
    const createStaffUserForInternalProviderMock = jest.fn().mockResolvedValue({
      id: 'staff-user-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      email: 'barber@example.test',
      phone: '+79990000000',
      encryptedName: null,
      passwordHash: 'hash',
      role: UserRole.STAFF,
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
    const canonicalExecuteMock = jest.fn().mockResolvedValue({});
    const deterministicTargetIdMock = jest.fn((operation: string) =>
      operation === 'create_provider_user' ? 'staff-user-1' : 'tenant-owner-1',
    );
    const service = new AdminService(
      {
        updateTenant: updateTenantMock,
        getTenantByIdOrThrow: getTenantByIdOrThrowMock,
        serializeTenant: (tenant: unknown) => tenant,
      } as unknown as TenantsService,
      {
        upsertBranding: upsertBrandingMock,
        getTenantBrandingOrThrow: jest.fn().mockResolvedValue({
          id: 'branding-1',
          tenantId: 'tenant-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        assertValidTenantLogoFile: jest.fn(),
      } as unknown as BrandingService,
      { connectAndActivateIntegration: upsertCrmMock } as unknown as CrmService,
      {
        ensureEmailIsAvailable: jest.fn().mockResolvedValue(undefined),
        ensurePhoneIsAvailable: jest.fn().mockResolvedValue(undefined),
        createUser: createUserMock,
        createStaffUserForInternalProvider:
          createStaffUserForInternalProviderMock,
        getTenantUserOrThrow: jest.fn((userId: string) =>
          Promise.resolve(
            userId === 'staff-user-1'
              ? {
                  id: 'staff-user-1',
                  tenantId: 'tenant-1',
                  branchId: 'branch-1',
                  email: 'barber@example.test',
                  phone: '+79990000000',
                  role: UserRole.STAFF,
                }
              : {
                  id: 'tenant-owner-1',
                  tenantId: 'tenant-1',
                  branchId: null,
                  email: 'owner@tenant.example',
                  phone: null,
                  role: UserRole.TENANT_OWNER,
                },
          ),
        ),
        serializeUser: serializeUserMock,
      } as unknown as UsersService,
      {} as SubscriptionsService,
      { log: auditLogMock } as unknown as AuditLogService,
      {} as TenantContextService,
      {
        assertCanCreate: assertCanCreateMock,
        assertCustomBrandingAllowed: assertCustomBrandingAllowedMock,
      } as unknown as QuotaService,
      {
        intentRef: jest.fn().mockReturnValue('request-admin-cutover'),
        deterministicTargetId: deterministicTargetIdMock,
        execute: canonicalExecuteMock,
      } as unknown as Package5Wave2CanonicalCutoverService,
      {
        encrypt: jest.fn((value: string) => `enc:${value}`),
        opaqueReference: jest.fn(
          (purpose: string, value: string) => `opaque:${purpose}:${value}`,
        ),
      } as unknown as EncryptionService,
      {
        intentRef: jest.fn().mockReturnValue('request-admin-cutover'),
        installCrmCredentials: upsertCrmMock,
        activateCrmIntegration: jest.fn().mockResolvedValue({
          connection: { id: 'crm-1', provider: CrmProvider.YCLIENTS },
        }),
      } as unknown as Package5Wave3CanonicalCutoverService,
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
      createStaffUserForInternalProviderMock,
      canonicalExecuteMock,
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
    const { service, updateTenantMock, auditLogMock, canonicalExecuteMock } =
      createService();

    await service.updateTenant(
      'tenant-1',
      { bookingMode: 'preview' },
      tenantAdmin,
    );

    expect(canonicalExecuteMock).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'admin-1' },
      {
        operation: 'update_tenant_configuration',
        changes: { bookingMode: 'preview' },
      },
    );
    expect(updateTenantMock).not.toHaveBeenCalled();
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

    expect(upsertCrmMock).toHaveBeenCalledWith(
      'tenant-1',
      tenantAdmin,
      dto,
      'request-admin-cutover:install',
    );
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
    const { service, createUserMock, canonicalExecuteMock } = createService();

    const result = await service.createTenantUser(
      'tenant-1',
      {
        email: 'owner@tenant.example',
        password: 'StrongPass123',
        role: UserRole.TENANT_OWNER,
      },
      platformOwner,
    );

    expect(canonicalExecuteMock).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'platform-owner-1' },
      expect.objectContaining({
        operation: 'create_tenant_user',
        email: 'owner@tenant.example',
        role: UserRole.TENANT_OWNER,
      }),
      'request-admin-cutover',
    );
    expect(createUserMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      user: { id: 'tenant-owner-1', role: UserRole.TENANT_OWNER },
      temporary_password: null,
    });
  });

  it('links a staff login to an existing provider without consuming quota twice', async () => {
    const {
      service,
      assertCanCreateMock,
      createStaffUserForInternalProviderMock,
      auditLogMock,
      canonicalExecuteMock,
    } = createService();

    const result = await service.createProviderUser(
      'tenant-1',
      'provider-2',
      {
        email: 'barber@example.test',
        phone: '+79990000000',
        password: 'StrongPass123',
      },
      tenantAdmin,
    );

    expect(assertCanCreateMock).not.toHaveBeenCalled();
    expect(canonicalExecuteMock).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'admin-1' },
      expect.objectContaining({
        operation: 'create_provider_user',
        providerId: 'provider-2',
        email: 'barber@example.test',
        phone: '+79990000000',
      }),
      'request-admin-cutover',
    );
    expect(createStaffUserForInternalProviderMock).not.toHaveBeenCalled();
    expect(auditLogMock).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'admin-1',
      action: 'tenant.provider_user_created',
      entityType: 'user',
      entityId: 'staff-user-1',
      metadata: {
        role: UserRole.STAFF,
        email: 'barber@example.test',
        branch_id: 'branch-1',
        provider_id: 'provider-2',
      },
    });
    expect(result).toMatchObject({
      user: { id: 'staff-user-1', role: UserRole.STAFF },
      temporary_password: null,
      provider_id: 'provider-2',
    });
  });

  it('checks plan-level white-label access before persisting custom branding', async () => {
    const {
      service,
      assertCustomBrandingAllowedMock,
      upsertBrandingMock,
      canonicalExecuteMock,
    } = createService();
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
    expect(canonicalExecuteMock).not.toHaveBeenCalled();
  });
});
