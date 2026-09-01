import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  buildReferralRewardSchedulerEnvelope,
  type ReferralRewardSchedulerCandidate,
  REFERRAL_REWARD_SCHEDULER_ENVELOPE_SHADOW_CAPABILITY,
} from '../action-engine';

/**
 * Internal scheduler boundary only. It persists the exact approved batch as a
 * Shadow ActionExecution; each returned child identity must later be planned
 * independently by issue_referral_rewards. It performs no referral/value write.
 */
@Injectable()
export class ReferralRewardSchedulerEnvelopeService {
  constructor(private readonly actionEngine: ActionEngineRuntimeService) {}

  async planEnvelope(input: {
    tenantId: string;
    candidates: readonly ReferralRewardSchedulerCandidate[];
    now: Date;
  }): Promise<{
    actionExecutionId: string;
    batchIdentityHash: string;
    childExecutionIdentities: string[];
    valueMutations: 0;
  }> {
    const envelope = buildReferralRewardSchedulerEnvelope(input);
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: REFERRAL_REWARD_SCHEDULER_ENVELOPE_SHADOW_CAPABILITY,
      source: {
        type: 'scheduler',
        occurrenceScope: `p4-04:referral-reward-envelope:${envelope.batchIdentityHash}`,
        sourceRef: 'p4-04:referral-reward-scheduler',
      },
      targetRef: `referral-reward-batch:${envelope.audienceHash}`,
      input: envelope,
      evidenceRefs: [
        `audience:${envelope.audienceHash}`,
        `policy-window:${envelope.policyWindowRef}`,
      ],
      callerIdempotency: {
        scope: 'p4-04.referral-reward-scheduler-envelope.shadow',
        key: envelope.batchIdentityHash,
      },
    });
    return {
      actionExecutionId: execution.id,
      batchIdentityHash: envelope.batchIdentityHash,
      childExecutionIdentities: envelope.childExecutionIdentities,
      valueMutations: 0,
    };
  }
}
