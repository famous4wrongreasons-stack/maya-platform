import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import {
  TENANT_SCOPE_KEY,
  TenantScopeOptions,
} from '../decorators/tenant-scoped.decorator';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantResolverService } from '../tenancy/tenant-resolver.service';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantResolver: TenantResolverService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<TenantScopeOptions>(
      TENANT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string | undefined>;
    }>();

    const user = request.user;

    if (!user) {
      if (scope?.requireTenant && !this.tenantContext.get()?.tenantId) {
        throw new ForbiddenException('Tenant context is required');
      }

      return true;
    }

    const requestedTenantId = scope?.paramKey
      ? request.params[scope.paramKey]
      : undefined;

    if (user.role === UserRole.PLATFORM_OWNER) {
      if (requestedTenantId) {
        await this.tenantResolver.bindPlatformTenant(user, requestedTenantId);
      } else if (scope?.requireTenant) {
        throw new ForbiddenException(
          'This endpoint requires an explicit tenant for platform access',
        );
      }

      return true;
    }

    this.tenantResolver.bindAuthenticatedUser(user, requestedTenantId);

    return true;
  }
}
