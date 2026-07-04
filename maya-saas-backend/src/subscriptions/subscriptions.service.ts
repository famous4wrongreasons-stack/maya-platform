import { Injectable, NotFoundException } from '@nestjs/common';

import { normalizeFeatureFlags } from '../common/feature-catalog';
import { PrismaService } from '../prisma/prisma.service';

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

  async listPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: [{ priceMonthly: 'asc' }, { createdAt: 'asc' }],
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      price_monthly: plan.priceMonthly,
      max_branches: plan.maxBranches,
      max_staff: plan.maxStaff,
      features_json: normalizeFeatureFlags(plan.featuresJson),
      is_white_label_enabled: plan.isWhiteLabelEnabled,
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    }));
  }
}
