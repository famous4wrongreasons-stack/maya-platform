import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';
import { TenantResolverService } from './tenant-resolver.service';

describe('TenantResolverService', () => {
  const createResolver = () => {
    const tenantFindFirst = jest.fn(
      (args: { where: Record<string, unknown> }) => {
        if (args.where.slug === 'demo') {
          return Promise.resolve({ id: 'tenant-demo' });
        }

        if (args.where.customDomain === 'other.example.com') {
          return Promise.resolve({ id: 'tenant-other' });
        }

        return Promise.resolve(null);
      },
    );
    const prisma = {
      tenant: {
        findFirst: tenantFindFirst,
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn(() => 'example.com'),
    } as unknown as ConfigService;
    const context = new TenantContextService();

    return {
      context,
      resolver: new TenantResolverService(prisma, config, context),
    };
  };

  it('resolves an allowlisted public config slug', async () => {
    const { resolver } = createResolver();

    await expect(
      resolver.resolvePublicRequest({
        hostname: 'localhost',
        originalUrl: '/api/mobile/config/demo',
        url: '/api/mobile/config/demo',
      }),
    ).resolves.toEqual({
      tenantId: 'tenant-demo',
      source: 'route_slug',
    });
  });

  it('never takes the tenant slug out of the query string', async () => {
    // Раньше регулярка искала подстроку во всём originalUrl, поэтому
    // `?next=/mobile/config/чужой` подсовывал чужого арендатора в контекст
    // обычного запроса. Слаг берётся только из пути и только целиком.
    const { resolver } = createResolver();

    await expect(
      resolver.resolvePublicRequest({
        hostname: 'localhost',
        originalUrl: '/api/customers?next=/mobile/config/demo',
        url: '/api/customers?next=/mobile/config/demo',
      }),
    ).resolves.toBeNull();
  });

  it('does not match a config path that only starts the URL', async () => {
    const { resolver } = createResolver();

    await expect(
      resolver.resolvePublicRequest({
        hostname: 'localhost',
        originalUrl: '/api/mobile/config/demo/extra',
        url: '/api/mobile/config/demo/extra',
      }),
    ).resolves.toBeNull();
  });

  it('rejects conflicting trusted route and domain signals', async () => {
    const { resolver } = createResolver();

    await expect(
      resolver.resolvePublicRequest({
        hostname: 'other.example.com',
        originalUrl: '/api/mobile/config/demo',
        url: '/api/mobile/config/demo',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not let a tenant member select another tenant', () => {
    const { context, resolver } = createResolver();

    expect(() =>
      context.run('request-a', () =>
        resolver.bindAuthenticatedUser(
          {
            userId: 'user-a',
            tenantId: 'tenant-a',
            role: 'tenant_admin',
            email: 'a@example.com',
            branchId: null,
            membershipId: 'membership-a',
            membershipStatus: 'active',
          },
          'tenant-b',
        ),
      ),
    ).toThrow(ForbiddenException);
  });
});
