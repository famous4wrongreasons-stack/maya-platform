import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateTenantAccessState } from './tenant-access-state';

@Injectable()
export class TenantAccessStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAndSync(tenantId: string, now = new Date()) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        trialEndsAt: true,
        trialFullAccess: true,
        currentPeriodEnd: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const state = evaluateTenantAccessState(tenant, now);
    if (
      state.shouldMarkPastDue ||
      (state.subscriptionRequired && tenant.trialFullAccess)
    ) {
      await this.prisma.tenant.updateMany({
        where: {
          id: tenant.id,
          trialEndsAt: { lte: now },
        },
        data: {
          status: TenantStatus.PAST_DUE,
          trialFullAccess: false,
        },
      });
    }

    return state;
  }
}
