import { ConflictException, ForbiddenException } from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { QuotaResource } from './quota-resource';
import { QuotaService } from './quota.service';

type StaffCountArgs = {
  where: { tenantId: string; status: string; role: { in: UserRole[] } };
};

describe('QuotaService', () => {
  const createService = (overrides: Record<string, unknown> = {}) => {
    const tenantFindUnique = jest.fn().mockResolvedValue({
      id: 'tenant-a',
      status: 'active',
      trialFullAccess: false,
      trialEndsAt: null,
      plan: {
        name: 'solo',
        maxBranches: 1,
        maxStaff: 5,
        isWhiteLabelEnabled: false,
      },
      ...overrides,
    });
    const branchCount = jest.fn().mockResolvedValue(1);
    const membershipCount: jest.MockedFunction<
      (args: StaffCountArgs) => Promise<number>
    > = jest.fn().mockResolvedValue(4);
    const providerCount = jest.fn().mockResolvedValue(1);
    const crmStaffCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      tenant: { findUnique: tenantFindUnique },
      branch: { count: branchCount },
      membership: { count: membershipCount },
      internalProvider: { count: providerCount },
      crmStaffAccess: { count: crmStaffCount },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();

    return {
      service: new QuotaService(prisma, tenantContext),
      tenantContext,
      mocks: {
        tenantFindUnique,
        branchCount,
        membershipCount,
        providerCount,
        crmStaffCount,
      },
    };
  };

  it('counts active membership staff and login-free providers once', async () => {
    const { service, tenantContext, mocks } = createService();

    const usage = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.getUsage('tenant-a'),
    );

    expect(usage).toMatchObject({
      plan: 'solo',
      branches: { current: 1, limit: 1 },
      staff: { current: 5, limit: 5 },
      isWhiteLabelEnabled: false,
    });
    const membershipArgs = mocks.membershipCount.mock.calls[0]?.[0];
    expect(membershipArgs.where).toMatchObject({
      tenantId: 'tenant-a',
      status: 'active',
    });
    expect(membershipArgs.where.role.in).toEqual(
      expect.arrayContaining([
        UserRole.TENANT_ADMIN,
        UserRole.STAFF,
        UserRole.PROVIDER,
      ]),
    );
    expect(mocks.providerCount).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', active: true, userId: null },
    });
    expect(mocks.crmStaffCount).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        status: 'pending_contact',
        userId: null,
      },
    });
  });

  it.each([QuotaResource.BRANCHES, QuotaResource.STAFF])(
    'soft-blocks new %s without deleting existing records',
    async (resource) => {
      const { service, tenantContext } = createService();

      let thrown: unknown;
      try {
        await tenantContext.runAsSystemTenant('tenant-a', () =>
          service.assertCanCreate('tenant-a', resource),
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ConflictException);
      expect((thrown as ConflictException).getResponse()).toMatchObject({
        error: {
          code: 'quota_exceeded',
          resource,
          current: resource === QuotaResource.BRANCHES ? 1 : 5,
          upgrade_required: true,
        },
      });
    },
  );

  it('allows creation while the effective count remains below the limit', async () => {
    const { service, tenantContext, mocks } = createService({
      plan: {
        name: 'business',
        maxBranches: 3,
        maxStaff: 25,
        isWhiteLabelEnabled: false,
      },
    });
    mocks.branchCount.mockResolvedValue(2);

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.assertCanCreate('tenant-a', QuotaResource.BRANCHES),
      ),
    ).resolves.toBeUndefined();
  });

  it('allows only basic name/logo branding outside business_plus', async () => {
    const { service, tenantContext } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.assertCustomBrandingAllowed('tenant-a', ['appName', 'logoUrl']),
      ),
    ).resolves.toBeUndefined();
    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.assertCustomBrandingAllowed('tenant-a', ['primaryColor']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('unlocks custom branding for an active full-access trial', async () => {
    const { service, tenantContext } = createService({
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(Date.now() + 60_000),
    });

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.assertCustomBrandingAllowed('tenant-a', ['primaryColor']),
      ),
    ).resolves.toBeUndefined();
  });

  it('fails closed on a foreign tenant before counting resources', async () => {
    const { service, tenantContext, mocks } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.getUsage('tenant-b'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.tenantFindUnique).not.toHaveBeenCalled();
  });
});
