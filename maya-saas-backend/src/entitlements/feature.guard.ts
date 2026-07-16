import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { MayaFeatureKey } from '../common/feature-catalog';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EntitlementsService } from './entitlements.service';
import { REQUIRED_FEATURES_KEY } from './requires-feature.decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<MayaFeatureKey[]>(
      REQUIRED_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures?.length) {
      return true;
    }

    const tenantId = this.tenantContext.requireTenantId();

    for (const featureKey of requiredFeatures) {
      await this.entitlements.assertFeature(tenantId, featureKey);
    }

    return true;
  }
}
