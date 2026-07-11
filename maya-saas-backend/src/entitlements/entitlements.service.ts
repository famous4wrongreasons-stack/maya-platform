import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  MAYA_FEATURE_KEYS,
  MayaFeatureKey,
  expandFeatureKeys,
  featureKeysFromFlags,
  isMayaFeatureKey,
} from '../common/feature-catalog';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureRegistryService } from './feature-registry.service';

export interface EffectiveEntitlements {
  tenantId: string;
  planId: string | null;
  features: Record<string, boolean>;
  featureKeys: MayaFeatureKey[];
}

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeatureRegistryService,
  ) {}

  async getEffectiveEntitlements(
    tenantId: string,
  ): Promise<EffectiveEntitlements> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: {
          include: {
            entitlements: true,
          },
        },
        entitlements: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const normalizedPlanKeys = tenant.plan?.entitlements.length
      ? tenant.plan.entitlements
          .filter((entitlement) => entitlement.enabled)
          .map((entitlement) => entitlement.featureKey)
      : featureKeysFromFlags(tenant.plan?.featuresJson);
    const effective = new Map<MayaFeatureKey, boolean>();

    for (const featureKey of expandFeatureKeys(normalizedPlanKeys)) {
      effective.set(featureKey, true);
    }

    const now = Date.now();

    for (const override of tenant.entitlements) {
      if (
        !isMayaFeatureKey(override.featureKey) ||
        (override.expiresAt && override.expiresAt.getTime() <= now)
      ) {
        continue;
      }

      for (const featureKey of expandFeatureKeys([override.featureKey])) {
        effective.set(featureKey, override.enabled);
      }
    }

    this.disableFeaturesWithMissingDependencies(effective);

    const featureKeys = MAYA_FEATURE_KEYS.filter(
      (featureKey) => effective.get(featureKey) === true,
    );

    return {
      tenantId: tenant.id,
      planId: tenant.planId,
      features: Object.fromEntries(
        featureKeys.map((featureKey) => [featureKey, true]),
      ),
      featureKeys,
    };
  }

  async hasFeature(
    tenantId: string,
    featureKey: MayaFeatureKey,
  ): Promise<boolean> {
    const effective = await this.getEffectiveEntitlements(tenantId);
    return effective.features[featureKey] === true;
  }

  async assertFeature(
    tenantId: string,
    featureKey: MayaFeatureKey,
  ): Promise<void> {
    if (await this.hasFeature(tenantId, featureKey)) {
      return;
    }

    throw new ForbiddenException({
      message: `Feature ${featureKey} is not enabled for this tenant`,
      error: {
        code: 'feature_locked',
        feature: featureKey,
      },
    });
  }

  private disableFeaturesWithMissingDependencies(
    effective: Map<MayaFeatureKey, boolean>,
  ): void {
    let changed = true;

    while (changed) {
      changed = false;

      for (const featureKey of MAYA_FEATURE_KEYS) {
        if (effective.get(featureKey) !== true) {
          continue;
        }

        const dependencies = this.registry.dependencies(featureKey);

        if (
          dependencies.some((dependency) => effective.get(dependency) !== true)
        ) {
          effective.set(featureKey, false);
          changed = true;
        }
      }
    }
  }
}
