import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_REWARD_CLAIM_CONTRACT,
  REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_POLICY_LIMITS,
  referralRewardIssueShadowNormalizer,
} from './referral-reward-issue-shadow.contract';

const canonicalInput = () => ({
  provider: 'yclients',
  customerReferralId: 'referral-1',
  resolutionExecutionId: 'resolution-1',
  resolutionEvidenceHash: 'resolution-evidence-hash',
  canonicalReferrerClientId: 'client-referrer',
  canonicalReferredClientId: 'client-referred',
  issuanceIdentityHash: 'issuance-hash',
  rewardPolicyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-hash',
  rewardRepresentation: 'fixed_money_kopecks',
  currency: 'RUB',
  issuedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  maxRecipients: REFERRAL_REWARD_POLICY_LIMITS.maxRecipients,
  perRewardCapKopecks: REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks,
  perIssuanceCapKopecks: REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceKopecks,
  approvalThresholdKopecks:
    REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks,
  executableApprovalRequirement: 'REQUIRED',
  claimContract: REFERRAL_REWARD_CLAIM_CONTRACT,
  rewards: [
    {
      slot: 'inviter',
      recipientClientId: 'client-referrer',
      rewardIdentityHash: 'reward-inviter-hash',
      amountKopecks: 1_500,
    },
    {
      slot: 'invitee',
      recipientClientId: 'client-referred',
      rewardIdentityHash: 'reward-invitee-hash',
      amountKopecks: 1_500,
    },
  ],
  aggregateAmountKopecks: 3_000,
  capDecision: 'within_cap',
  legacyClaimedInviterRewardKopecks: 1_500,
  legacyClaimedInviteeRewardKopecks: 1_500,
  shadowDivergence: false,
});

describe('referralRewardIssueShadowNormalizer', () => {
  it('normalizes the exact two-slot reward plan', () => {
    expect(referralRewardIssueShadowNormalizer(canonicalInput())).toEqual(
      canonicalInput(),
    );
  });

  it('rejects caller authority and caller-selected policy fields', () => {
    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'legacy.direct' },
      { approvalBindingHash: 'forged' },
      { rewardPolicyProfile: 'caller-policy' },
    ]) {
      expect(() =>
        referralRewardIssueShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow(ActionContractError);
    }
  });

  it('rejects duplicate slots and duplicate recipients', () => {
    expect(() =>
      referralRewardIssueShadowNormalizer({
        ...canonicalInput(),
        rewards: [
          canonicalInput().rewards[0],
          { ...canonicalInput().rewards[1], slot: 'inviter' },
        ],
      }),
    ).toThrow('reward slots must be unique');

    expect(() =>
      referralRewardIssueShadowNormalizer({
        ...canonicalInput(),
        rewards: [
          canonicalInput().rewards[0],
          {
            ...canonicalInput().rewards[1],
            recipientClientId: 'client-referrer',
          },
        ],
      }),
    ).toThrow('reward recipients must be unique');
  });

  it('rejects reward or aggregate values outside canonical caps', () => {
    expect(() =>
      referralRewardIssueShadowNormalizer({
        ...canonicalInput(),
        rewards: [
          {
            ...canonicalInput().rewards[0],
            amountKopecks: REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks + 1,
          },
        ],
        aggregateAmountKopecks:
          REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks + 1,
      }),
    ).toThrow('reward amount exceeds canonical cap');

    expect(() =>
      referralRewardIssueShadowNormalizer({
        ...canonicalInput(),
        aggregateAmountKopecks: 2_999,
      }),
    ).toThrow('aggregate reward amount is inconsistent');
  });

  it('requires the exact TTL, claim contract, and future approval boundary', () => {
    for (const changed of [
      { expiresAt: '2026-10-02T00:00:00.000Z' },
      { claimContract: 'legacy-plaintext-code' },
      { executableApprovalRequirement: 'NONE' },
    ]) {
      expect(() =>
        referralRewardIssueShadowNormalizer({
          ...canonicalInput(),
          ...changed,
        }),
      ).toThrow(ActionContractError);
    }
  });
});
