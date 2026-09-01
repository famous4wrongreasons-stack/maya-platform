import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  referralRewardPresentation,
  referralRewardPresentationConfig,
} from './referral-reward-claim.contract';

export type ReferralRewardPresentationOutcome =
  | {
      outcome: 'presented';
      bearer: string;
      presentationReference: string;
      writesPerformed: false;
    }
  | {
      outcome: 'presentation_unavailable' | 'reward_unresolved';
      bearer: null;
      presentationReference: null;
      writesPerformed: false;
    };

/** Trusted internal output boundary; HTTP/AI callers cannot select reward facts. */
@Injectable()
export class ReferralRewardPresentationService {
  constructor(private readonly prisma: PrismaService) {}

  async present(input: {
    tenantId: string;
    rewardId: string;
    recipientClientId: string;
  }): Promise<ReferralRewardPresentationOutcome> {
    const config = referralRewardPresentationConfig();
    if (!config) return this.unavailable('presentation_unavailable');
    const reward = await this.prisma.referralReward.findUnique({
      where: {
        id_tenantId: { id: input.rewardId, tenantId: input.tenantId },
      },
      select: {
        id: true,
        tenantId: true,
        issuanceId: true,
        recipientClientId: true,
        rewardSlot: true,
        expiresAt: true,
        codeHash: true,
        presentationKeyVersion: true,
      },
    });
    if (
      !reward ||
      reward.tenantId !== input.tenantId ||
      reward.recipientClientId !== input.recipientClientId ||
      (reward.rewardSlot !== 'inviter' && reward.rewardSlot !== 'invitee') ||
      !reward.presentationKeyVersion
    ) {
      return this.unavailable('reward_unresolved');
    }
    const presentationKey = config.presentationKeys.get(
      reward.presentationKeyVersion,
    );
    if (!presentationKey) return this.unavailable('presentation_unavailable');
    const material = referralRewardPresentation(
      {
        tenantId: reward.tenantId,
        issuanceId: reward.issuanceId,
        rewardId: reward.id,
        recipientClientId: reward.recipientClientId,
        rewardSlot: reward.rewardSlot,
        expiresAt: reward.expiresAt.toISOString(),
      },
      {
        presentationKey,
        presentationKeyVersion: reward.presentationKeyVersion,
        lookupKey: config.lookupKey,
      },
    );
    if (material.codeHash !== reward.codeHash) {
      return this.unavailable('reward_unresolved');
    }
    return {
      outcome: 'presented',
      bearer: material.bearer,
      presentationReference: material.presentationReference,
      writesPerformed: false,
    };
  }

  private unavailable(
    outcome: 'presentation_unavailable' | 'reward_unresolved',
  ): ReferralRewardPresentationOutcome {
    return {
      outcome,
      bearer: null,
      presentationReference: null,
      writesPerformed: false,
    };
  }
}
