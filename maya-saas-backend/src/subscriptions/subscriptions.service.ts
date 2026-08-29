import { Injectable, NotFoundException } from '@nestjs/common';

import { normalizeFeatureFlags } from '../common/feature-catalog';
import { PrismaService } from '../prisma/prisma.service';
import { CANONICAL_PLAN_NAMES, canonicalPlanName } from './plan-catalog';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlanByIdOrThrow(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    return plan;
  }

  async getPlanByNameOrThrow(name: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { name: canonicalPlanName(name) },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    return plan;
  }

  async listPlans() {
    return this.listPlansByNames();
  }

  /**
   * Customer-facing billing must never advertise internal/test plans.
   * Historical tenants may remain bound to one, so the rows are preserved and
   * the administrative inventory still returns them through `listPlans()`.
   */
  async listPublicPlans() {
    return this.listPlansByNames([...CANONICAL_PLAN_NAMES]);
  }

  private async listPlansByNames(names?: string[]) {
    const plans = await this.prisma.subscriptionPlan.findMany({
      ...(names ? { where: { name: { in: names } } } : {}),
      orderBy: [{ priceMonthly: 'asc' }, { createdAt: 'asc' }],
      include: {
        entitlements: {
          where: { enabled: true },
          orderBy: { featureKey: 'asc' },
        },
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price_monthly: plan.priceMonthly,
      max_branches: plan.maxBranches,
      max_staff: plan.maxStaff,
      features_json: normalizeFeatureFlags(plan.featuresJson),
      entitlements: plan.entitlements.map((entitlement) => ({
        feature_key: entitlement.featureKey,
        enabled: entitlement.enabled,
        config_json: entitlement.configJson ?? {},
      })),
      is_white_label_enabled: plan.isWhiteLabelEnabled,
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    }));
  }
}
