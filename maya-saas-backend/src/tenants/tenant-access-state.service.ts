import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateTenantAccessState,
  TenantAccessState,
} from './tenant-access-state';

@Injectable()
export class TenantAccessStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAndSync(
    tenantId: string,
    now = new Date(),
  ): Promise<TenantAccessState> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        trialEndsAt: true,
        trialFullAccess: true,
        currentPeriodEnd: true,
        pastDueAt: true,
        graceEndsAt: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // P4-08 ownership fence: access guards are projections only. The bounded
    // billing scheduler submits the canonical past-due action when a durable
    // lifecycle transition is required.
    return evaluateTenantAccessState(tenant, now);
  }
}
