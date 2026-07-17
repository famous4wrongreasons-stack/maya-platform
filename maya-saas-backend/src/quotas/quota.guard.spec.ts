import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { QuotaGuard } from './quota.guard';
import { QuotaResource } from './quota-resource';
import { QuotaService } from './quota.service';

describe('QuotaGuard', () => {
  it('checks decorated writes against the tenant resolved by auth', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        resource: QuotaResource.STAFF,
        amount: 1,
      }),
    } as unknown as Reflector;
    const tenantContext = new TenantContextService();
    const assertCanCreate = jest.fn().mockResolvedValue(undefined);
    const guard = new QuotaGuard(reflector, tenantContext, {
      assertCanCreate,
    } as unknown as QuotaService);

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        guard.canActivate({
          getHandler: () => 'handler',
          getClass: () => 'class',
        } as unknown as ExecutionContext),
      ),
    ).resolves.toBe(true);
    expect(assertCanCreate).toHaveBeenCalledWith(
      'tenant-a',
      QuotaResource.STAFF,
      1,
    );
  });

  it('fails closed when a decorated write has no tenant context', async () => {
    const guard = new QuotaGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue({
          resource: QuotaResource.BRANCHES,
          amount: 1,
        }),
      } as unknown as Reflector,
      new TenantContextService(),
      {} as QuotaService,
    );

    await expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
      } as unknown as ExecutionContext),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
