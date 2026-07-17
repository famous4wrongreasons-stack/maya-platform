import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { TenantStatus } from '../common/domain.enums';
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
    return this.getAndSyncAttempt(tenantId, now, 0);
  }

  private async getAndSyncAttempt(
    tenantId: string,
    now: Date,
    attempt: number,
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
        updatedAt: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const state = evaluateTenantAccessState(tenant, now);
    const shouldPersistWindow =
      state.tenantStatus === String(TenantStatus.PAST_DUE) &&
      Boolean(state.pastDueAt && state.graceEndsAt) &&
      (!tenant.pastDueAt || !tenant.graceEndsAt);
    if (
      state.shouldMarkPastDue ||
      shouldPersistWindow ||
      (state.subscriptionRequired && tenant.trialFullAccess)
    ) {
      const updated = await this.prisma.tenant.updateMany({
        where: {
          id: tenant.id,
          status: tenant.status,
          updatedAt: tenant.updatedAt,
        },
        data: {
          status: TenantStatus.PAST_DUE,
          trialFullAccess: false,
          pastDueAt: state.pastDueAt,
          graceEndsAt: state.graceEndsAt,
        },
      });

      if (updated.count === 0) {
        if (attempt >= 2) {
          throw new ServiceUnavailableException(
            'Tenant access state changed during synchronization.',
          );
        }
        return this.getAndSyncAttempt(tenantId, now, attempt + 1);
      }
    }

    return state;
  }
}
