import type { ActionSourceType } from './action-engine.contract';
import { referralCreateShadowNormalizer } from './referral-create-shadow.contract';
import { referralResolveShadowNormalizer } from './referral-resolve-shadow.contract';
import { referralRewardFulfillShadowNormalizer } from './referral-reward-fulfill-shadow.contract';
import { referralRewardIssueShadowNormalizer } from './referral-reward-issue-shadow.contract';
import { referralRewardSchedulerEnvelopeNormalizer } from './referral-reward-scheduler-envelope.contract';

export const P4_04_EXECUTABLE_CAPABILITIES = {
  createReferral: 'referrals.customer-referral-create.execute.v1',
  resolveReferral: 'referrals.customer-referral-resolve.execute.v1',
  issueRewards: 'referrals.referral-reward-issue.execute.v1',
  fulfillReward: 'referrals.referral-reward-fulfill.execute.v1',
} as const;

export const P4_04_SCHEDULER_ENVELOPE_CAPABILITY =
  'referrals.referral-reward-scheduler-envelope.execute.v1' as const;

export type P404ExecutableActionClass =
  | 'create_customer_referral'
  | 'resolve_customer_referral'
  | 'issue_referral_rewards'
  | 'fulfill_referral_reward';

export interface P404ExecutableRegistration {
  capability: string;
  actionClass: P404ExecutableActionClass;
  targetKind: string;
  executorKey: string;
  allowedSourceTypes: readonly ActionSourceType[];
  approvalRequired: boolean;
  riskFacets: readonly string[];
  normalizeInput(value: unknown): Record<string, unknown>;
}

/**
 * Executable contracts deliberately reuse the already approved Shadow
 * normalizers. The initiator still cannot submit raw eligibility, authority,
 * reward value, target, or bearer facts: the server-side P4-04 planners must
 * derive this exact canonical shape before execution.
 */
export const P4_04_EXECUTABLE_REGISTRATIONS: readonly P404ExecutableRegistration[] =
  [
    {
      capability: P4_04_EXECUTABLE_CAPABILITIES.createReferral,
      actionClass: 'create_customer_referral',
      targetKind: 'customer_referral',
      executorKey: 'referrals.customer-referral',
      allowedSourceTypes: ['legacy_bridge', 'authenticated_request'],
      approvalRequired: false,
      riskFacets: ['customer_identity', 'referral_relationship'],
      normalizeInput: referralCreateShadowNormalizer,
    },
    {
      capability: P4_04_EXECUTABLE_CAPABILITIES.resolveReferral,
      actionClass: 'resolve_customer_referral',
      targetKind: 'customer_referral',
      executorKey: 'referrals.customer-referral',
      allowedSourceTypes: ['scheduler', 'legacy_bridge'],
      approvalRequired: false,
      riskFacets: ['customer_identity', 'provider_evidence'],
      normalizeInput: referralResolveShadowNormalizer,
    },
    {
      capability: P4_04_EXECUTABLE_CAPABILITIES.issueRewards,
      actionClass: 'issue_referral_rewards',
      targetKind: 'referral_reward_issuance',
      executorKey: 'referrals.reward-issuance',
      allowedSourceTypes: [
        'scheduler',
        'legacy_bridge',
        'authenticated_request',
      ],
      approvalRequired: true,
      riskFacets: [
        'financial_equivalent',
        'customer_value',
        'approval_bound',
        'frozen_discount_entitlement',
      ],
      normalizeInput: referralRewardIssueShadowNormalizer,
    },
    {
      capability: P4_04_EXECUTABLE_CAPABILITIES.fulfillReward,
      actionClass: 'fulfill_referral_reward',
      targetKind: 'referral_reward',
      executorKey: 'referrals.reward-fulfillment',
      allowedSourceTypes: ['legacy_bridge', 'authenticated_request'],
      approvalRequired: false,
      riskFacets: [
        'financial_equivalent',
        'customer_value',
        'one_time_claim',
        'actor_authorized',
        'exact_target',
        'local_only',
      ],
      normalizeInput: referralRewardFulfillShadowNormalizer,
    },
  ];

export const p404SchedulerEnvelopeExecutableNormalizer =
  referralRewardSchedulerEnvelopeNormalizer;
