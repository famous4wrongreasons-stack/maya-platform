import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { QuotaResource } from './quota-resource';
import { QuotaService } from './quota.service';
import { REQUIRED_QUOTA_KEY } from './requires-quota.decorator';

interface RequiredQuota {
  resource: QuotaResource;
  amount: number;
}

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    private readonly quotas: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredQuota>(
      REQUIRED_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    await this.quotas.assertCanCreate(
      this.tenantContext.requireTenantId(),
      required.resource,
      required.amount,
    );
    return true;
  }
}
