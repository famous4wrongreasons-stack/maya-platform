import { ForbiddenException } from '@nestjs/common';

import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  it('keeps resolved tenant data across asynchronous work', async () => {
    const service = new TenantContextService();

    const result = await service.run('request-tenant-a', async () => {
      service.setResolvedTenant({
        tenantId: 'tenant-a',
        userId: 'user-a',
        membershipId: 'membership-a',
        role: 'tenant_admin',
        source: 'membership',
      });

      await Promise.resolve();
      return service.requireTenantId();
    });

    expect(result).toBe('tenant-a');
  });

  it('rejects an expected tenant that differs from context', () => {
    const service = new TenantContextService();

    expect(() =>
      service.run('request-tenant-a', () => {
        service.setResolvedTenant({
          tenantId: 'tenant-a',
          userId: 'user-a',
          membershipId: 'membership-a',
          role: 'tenant_admin',
          source: 'membership',
        });
        return service.assertTenantId('tenant-b');
      }),
    ).toThrow(ForbiddenException);
  });

  it('fails closed outside a request context', () => {
    const service = new TenantContextService();
    expect(() => service.requireTenantId()).toThrow(ForbiddenException);
  });
});
