import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { ALLOW_SUBSCRIPTION_REQUIRED_KEY } from '../decorators/allow-subscription-required.decorator';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantAccessStateService } from '../tenants/tenant-access-state.service';

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    private readonly accessStateService: TenantAccessStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;
    const tenantId = this.tenantContext.get()?.tenantId;
    if (!user || !tenantId || user.role === UserRole.PLATFORM_OWNER) {
      return true;
    }

    const access = await this.accessStateService.getAndSync(tenantId);
    if (!access.subscriptionRequired) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SUBSCRIPTION_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }

    throw new HttpException(
      {
        message: 'The MAYA OS trial has ended. A subscription is required.',
        error: {
          code: 'subscription_required',
          trial_ended_at: access.trialEndsAt,
          past_due_at: access.pastDueAt,
          grace_ended_at: access.graceEndsAt,
          plans_path: '/api/billing/plans',
          checkout_path: `/api/admin/tenants/${tenantId}/billing/checkout`,
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
