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

export const FEATURE_REQUIREMENT_DECISION_CONTRACT =
  'maya.feature-requirement-decision/1' as const;

export interface FeatureRequirementDecision {
  contract: typeof FEATURE_REQUIREMENT_DECISION_CONTRACT;
  tenantId: string;
  planId: string | null;
  requiredFeatures: Array<{
    featureKey: MayaFeatureKey;
    enabled: boolean;
  }>;
  allowed: boolean;
  evaluatedAt: Date;
  validUntil: Date | null;
}

interface EffectiveEntitlementResolution extends EffectiveEntitlements {
  validUntil: Date | null;
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
    const effective = await this.resolveEffectiveEntitlements(
      tenantId,
      new Date(),
    );
    return {
      tenantId: effective.tenantId,
      planId: effective.planId,
      features: effective.features,
      featureKeys: effective.featureKeys,
    };
  }

  async resolveFeatureRequirements(
    tenantId: string,
    requiredFeatures: readonly MayaFeatureKey[],
    evaluatedAt = new Date(),
  ): Promise<FeatureRequirementDecision> {
    const uniqueRequiredFeatures = MAYA_FEATURE_KEYS.filter((featureKey) =>
      new Set(requiredFeatures).has(featureKey),
    );
    if (uniqueRequiredFeatures.length !== new Set(requiredFeatures).size) {
      throw new NotFoundException('Unknown feature requirement');
    }

    const effective = await this.resolveEffectiveEntitlements(
      tenantId,
      evaluatedAt,
    );
    const decisions = uniqueRequiredFeatures.map((featureKey) => ({
      featureKey,
      enabled: effective.features[featureKey] === true,
    }));

    return {
      contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
      tenantId: effective.tenantId,
      planId: effective.planId,
      requiredFeatures: decisions,
      allowed: decisions.every((decision) => decision.enabled),
      evaluatedAt,
      validUntil: effective.validUntil,
    };
  }

  private async resolveEffectiveEntitlements(
    tenantId: string,
    evaluatedAt: Date,
  ): Promise<EffectiveEntitlementResolution> {
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

    const now = evaluatedAt.getTime();
    const validityCandidates: Date[] = [];

    if (
      tenant.status === 'trial' &&
      tenant.trialFullAccess === true &&
      tenant.trialEndsAt !== null &&
      tenant.trialEndsAt.getTime() > now
    ) {
      validityCandidates.push(tenant.trialEndsAt);
      for (const featureKey of MAYA_FEATURE_KEYS) {
        if (this.registry.platformAvailable(featureKey)) {
          effective.set(featureKey, true);
        }
      }
    }

    for (const override of tenant.entitlements) {
      if (
        !isMayaFeatureKey(override.featureKey) ||
        (override.expiresAt && override.expiresAt.getTime() <= now)
      ) {
        continue;
      }

      if (override.expiresAt) {
        validityCandidates.push(override.expiresAt);
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
      validUntil:
        validityCandidates.sort(
          (left, right) => left.getTime() - right.getTime(),
        )[0] ?? null,
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
