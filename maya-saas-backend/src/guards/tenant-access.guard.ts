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

@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.getAllAndOverride<TenantScopeOptions>(
      TENANT_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!scope) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string | undefined>;
    }>();

    const user = request.user;

    if (!user) {
      return true;
    }

    if (scope.requireTenant && !user.tenantId) {
      throw new ForbiddenException(
        'This endpoint requires a tenant-scoped user',
      );
    }

    if (
      scope.paramKey &&
      user.role !== UserRole.PLATFORM_OWNER &&
      request.params[scope.paramKey] &&
      request.params[scope.paramKey] !== user.tenantId
    ) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }

    return true;
  }
}
