import { ForbiddenException } from '@nestjs/common';

import { TenantStatus, UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandingService } from '../branding/branding.service';
import { CrmService } from '../crm/crm.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
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

  const createService = () => {
    const updateTenantMock = jest.fn().mockResolvedValue({ id: 'tenant-1' });
    const auditLogMock = jest.fn().mockResolvedValue(undefined);
    const service = new AdminService(
      { updateTenant: updateTenantMock } as unknown as TenantsService,
      {} as BrandingService,
      {} as CrmService,
      {} as UsersService,
      {} as SubscriptionsService,
      { log: auditLogMock } as unknown as AuditLogService,
      {} as TenantContextService,
    );

    return { service, updateTenantMock, auditLogMock };
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
});
