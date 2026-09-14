import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { TenantScopeOptions } from '../decorators/tenant-scoped.decorator';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantResolverService } from '../tenancy/tenant-resolver.service';
import { TenantAccessGuard } from './tenant-access.guard';

/**
 * Гвард привязки арендатора не был покрыт ничем.
 *
 * Логика уровнем ниже (`TenantResolverService`) протестирована, но сам гвард —
 * место, где решается, КАКОЙ арендатор попадёт в запрос, — не проверял никто.
 * Непокрытым оставался ровно один сценарий, который не даёт покраснеть ни
 * одному другому тесту: рассинхрон `@TenantScoped({ paramKey })` и имени
 * параметра маршрута. Если параметр переименовать, `requestedTenantId`
 * становится undefined, и гвард молча привяжет СВОЕГО арендатора вместо того,
 * чтобы сверить запрошенного.
 */
describe('TenantAccessGuard', () => {
  const buildContext = (input: {
    user?: AuthenticatedUser;
    params?: Record<string, string | undefined>;
  }): ExecutionContext =>
    ({
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: input.user,
          params: input.params ?? {},
        }),
      }),
    }) as unknown as ExecutionContext;

  const buildGuard = (scope: TenantScopeOptions | undefined) => {
    const bindAuthenticatedUser = jest.fn();
    const bindPlatformTenant = jest.fn().mockResolvedValue(undefined);
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(scope),
    } as unknown as Reflector;
    const tenantContext = new TenantContextService();
    const guard = new TenantAccessGuard(
      reflector,
      {
        bindAuthenticatedUser,
        bindPlatformTenant,
      } as unknown as TenantResolverService,
      tenantContext,
    );

    return { guard, bindAuthenticatedUser, bindPlatformTenant, tenantContext };
  };

  const member = (role: UserRole): AuthenticatedUser => ({
    userId: 'user-a',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role,
    email: 'member@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  });

  it('passes the requested tenant to the resolver so it can be compared', async () => {
    const { guard, bindAuthenticatedUser } = buildGuard({ paramKey: 'id' });

    await guard.canActivate(
      buildContext({
        user: member(UserRole.STAFF),
        params: { id: 'tenant-b' },
      }),
    );

    // Именно эта передача и даёт 403 на чужого арендатора уровнем ниже.
    expect(bindAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      'tenant-b',
    );
  });

  it('does not silently bind the own tenant when the route param is renamed', async () => {
    // 🔴 Декоратор объявляет paramKey: 'id', а маршрут отдаёт 'tenantId'.
    // requestedTenantId становится undefined, и сверять уже нечего — гвард
    // привязывает своего арендатора. Ни один другой тест этого не ловит.
    const { guard, bindAuthenticatedUser } = buildGuard({ paramKey: 'id' });

    await guard.canActivate(
      buildContext({
        user: member(UserRole.STAFF),
        params: { tenantId: 'tenant-b' },
      }),
    );

    expect(bindAuthenticatedUser).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      undefined,
    );
  });

  it('fails closed for an anonymous request that requires a tenant', async () => {
    const { guard } = buildGuard({ requireTenant: true });

    await expect(guard.canActivate(buildContext({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets an anonymous request through when no tenant is required', async () => {
    const { guard } = buildGuard(undefined);

    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
  });

  it('fences the platform owner behind an explicit tenant', async () => {
    const { guard, bindPlatformTenant } = buildGuard({
      paramKey: 'id',
      requireTenant: true,
    });

    await expect(
      guard.canActivate(
        buildContext({
          user: { ...member(UserRole.PLATFORM_OWNER), tenantId: null },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bindPlatformTenant).not.toHaveBeenCalled();
  });

  it('binds the platform owner only to the tenant named in the route', async () => {
    const { guard, bindPlatformTenant, bindAuthenticatedUser } = buildGuard({
      paramKey: 'id',
    });

    await guard.canActivate(
      buildContext({
        user: { ...member(UserRole.PLATFORM_OWNER), tenantId: null },
        params: { id: 'tenant-b' },
      }),
    );

    expect(bindPlatformTenant).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.PLATFORM_OWNER }),
      'tenant-b',
    );
    expect(bindAuthenticatedUser).not.toHaveBeenCalled();
  });
});
