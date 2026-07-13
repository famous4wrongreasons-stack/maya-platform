import {
  ConflictException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

import type { AuthClientMetadata } from '../auth/auth-client-metadata';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';

export const TRIAL_PERIOD_DAYS = 10;
const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TrialActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: AuthRateLimitService,
  ) {}

  async createActivation(
    source = 'maya_os',
    metadata: Partial<AuthClientMetadata> = {},
  ) {
    await this.rateLimitService.assertPreflight('trial_activation', {
      clientIp: metadata.clientIp,
    });
    const activationToken = randomBytes(32).toString('base64url');
    const activation = await this.prisma.trialActivation.create({
      data: {
        activationTokenHash: this.hashToken(activationToken),
        source,
        expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
      },
    });

    return {
      activation_id: activation.id,
      activation_token: activationToken,
      status: activation.status,
      source: activation.source,
      expires_at: activation.expiresAt,
      trial_days: TRIAL_PERIOD_DAYS,
      trial_starts_when: 'registration_completed',
      counted_as_connected_business: false,
    };
  }

  async authorizePendingToken(token: string) {
    const activation = await this.prisma.trialActivation.findUnique({
      where: { activationTokenHash: this.hashToken(token) },
      include: { draft: { select: { id: true } } },
    });
    if (!activation) {
      throw new UnauthorizedException({
        message: 'Invalid trial activation token',
        error: { code: 'invalid_trial_activation_token' },
      });
    }
    if (activation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        message: 'Trial activation has expired',
        error: { code: 'trial_activation_expired' },
      });
    }
    if (activation.status !== 'pending') {
      throw new ConflictException({
        message: 'Trial activation has already been used',
        error: {
          code: 'trial_activation_not_pending',
          status: activation.status,
        },
      });
    }

    return activation;
  }

  async claim(token: string, expectedActivationId?: string | null) {
    const activation = await this.authorizePendingToken(token);
    if (activation.draft && !expectedActivationId) {
      throw new ConflictException({
        message: 'Trial activation belongs to an AI onboarding draft',
        error: { code: 'trial_activation_bound_to_draft' },
      });
    }
    if (expectedActivationId && activation.id !== expectedActivationId) {
      throw new UnauthorizedException({
        message: 'Trial activation does not belong to this onboarding draft',
        error: { code: 'trial_activation_draft_mismatch' },
      });
    }

    const claimed = await this.prisma.trialActivation.updateMany({
      where: {
        id: activation.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      data: { status: 'completing' },
    });
    if (claimed.count !== 1) {
      throw new ConflictException({
        message: 'Trial activation is already being completed',
        error: { code: 'trial_activation_in_progress' },
      });
    }

    return activation;
  }

  async complete(activationId: string, tenantId: string) {
    const completedAt = new Date();
    const completed = await this.prisma.trialActivation.updateMany({
      where: {
        id: activationId,
        status: 'completing',
        tenantId: null,
      },
      data: {
        status: 'completed',
        completedAt,
        tenantId,
      },
    });
    if (completed.count !== 1) {
      throw new ConflictException({
        message: 'Trial activation could not be completed',
        error: { code: 'trial_activation_completion_conflict' },
      });
    }

    return { activationId, completedAt, tenantId };
  }

  async release(activationId: string) {
    const activation = await this.prisma.trialActivation.findUnique({
      where: { id: activationId },
      select: { expiresAt: true },
    });
    if (!activation) return;

    await this.prisma.trialActivation.updateMany({
      where: { id: activationId, status: 'completing' },
      data: {
        status:
          activation.expiresAt.getTime() > Date.now() ? 'pending' : 'expired',
      },
    });
  }

  async releaseCompletedTenant(tenantId: string) {
    const activation = await this.prisma.trialActivation.findUnique({
      where: { tenantId },
      select: { id: true, expiresAt: true },
    });
    if (!activation) return;

    await this.prisma.trialActivation.update({
      where: { id: activation.id },
      data: {
        status:
          activation.expiresAt.getTime() > Date.now() ? 'pending' : 'expired',
        completedAt: null,
        tenantId: null,
      },
    });
  }

  async getGodModeAnalytics(now = new Date()) {
    const [
      totalSwipes,
      connectedBusinesses,
      pendingRegistrations,
      abandonedRegistrations,
      activeTrials,
      expiredTrials,
      paidConversions,
    ] = await Promise.all([
      this.prisma.trialActivation.count(),
      this.prisma.trialActivation.count({
        where: { status: 'completed', tenantId: { not: null } },
      }),
      this.prisma.trialActivation.count({
        where: {
          status: { in: ['pending', 'completing'] },
          expiresAt: { gt: now },
        },
      }),
      this.prisma.trialActivation.count({
        where: {
          OR: [
            { status: 'expired' },
            {
              status: { in: ['pending', 'completing'] },
              expiresAt: { lte: now },
            },
          ],
        },
      }),
      this.prisma.trialActivation.count({
        where: {
          status: 'completed',
          tenant: {
            is: {
              status: TenantStatus.TRIAL,
              trialEndsAt: { gt: now },
            },
          },
        },
      }),
      this.prisma.trialActivation.count({
        where: {
          status: 'completed',
          tenant: {
            is: {
              trialEndsAt: { lte: now },
              currentPeriodEnd: null,
            },
          },
        },
      }),
      this.prisma.trialActivation.count({
        where: {
          status: 'completed',
          tenant: {
            is: {
              status: TenantStatus.ACTIVE,
              currentPeriodEnd: { gt: now },
            },
          },
        },
      }),
    ]);

    return {
      generated_at: now,
      metric_definition: {
        connected_businesses:
          'A trial activation is counted only after tenant registration completed successfully.',
        abandoned_registrations:
          'A swipe whose activation expired before tenant registration completed.',
      },
      totals: {
        trial_swipes: totalSwipes,
        connected_businesses: connectedBusinesses,
        pending_registrations: pendingRegistrations,
        abandoned_registrations: abandonedRegistrations,
        active_trials: activeTrials,
        expired_trials: expiredTrials,
        paid_conversions: paidConversions,
      },
      rates: {
        registration_completion:
          totalSwipes > 0 ? connectedBusinesses / totalSwipes : 0,
        trial_to_paid:
          connectedBusinesses > 0 ? paidConversions / connectedBusinesses : 0,
      },
    };
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
