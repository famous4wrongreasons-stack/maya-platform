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

  it('runs trusted bootstrap work in an isolated system tenant context', async () => {
    const service = new TenantContextService();

    await service.run('request-onboarding', async () => {
      const result = await service.runAsSystemTenant(
        'tenant-created',
        async () => {
          await Promise.resolve();
          return service.get();
        },
      );

      expect(result).toMatchObject({
        requestId: 'request-onboarding',
        tenantId: 'tenant-created',
        userId: null,
        membershipId: null,
        source: 'system',
      });
      expect(service.get()).toMatchObject({
        requestId: 'request-onboarding',
        tenantId: null,
        source: null,
      });
    });
  });

  it('runs server-resolved public auth inside its tenant and restores context', async () => {
    const service = new TenantContextService();

    await service.run('request-public-auth', async () => {
      const context = await service.runAsPublicTenant('tenant-a', async () => {
        await Promise.resolve();
        return service.get();
      });

      expect(context).toMatchObject({
        requestId: 'request-public-auth',
        tenantId: 'tenant-a',
        source: 'public_auth',
      });
      expect(service.get()).toMatchObject({
        requestId: 'request-public-auth',
        tenantId: null,
      });
    });
  });

  it('rejects public auth when a trusted domain resolved another tenant', () => {
    const service = new TenantContextService();

    expect(() =>
      service.run('request-domain', () => {
        service.setResolvedTenant({
          tenantId: 'tenant-domain',
          userId: null,
          membershipId: null,
          role: null,
          source: 'custom_domain',
        });

        return service.runAsPublicTenant('tenant-body', () => true);
      }),
    ).toThrow(ForbiddenException);
  });
});
