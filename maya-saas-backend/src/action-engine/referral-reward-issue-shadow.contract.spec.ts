import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_POLICY_LIMITS,
  REFERRAL_REWARD_PRESENTATION_CONTRACT,
  REFERRAL_REWARD_VALUE_CONTRACT,
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
  issuanceId: 'issuance-hash',
  rewardPolicyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-hash',
  valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
  currency: 'RUB',
  issuedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  maxRecipients: REFERRAL_REWARD_POLICY_LIMITS.maxRecipients,
  perRewardLiabilityCapKopecks:
    REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks,
  perIssuanceLiabilityCapKopecks:
    REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks,
  approvalThresholdKopecks:
    REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks,
  executableApprovalRequirement: 'REQUIRED',
  presentationContract: REFERRAL_REWARD_PRESENTATION_CONTRACT,
  claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  rewards: [
    {
      slot: 'inviter',
      recipientClientId: 'client-referrer',
      rewardId: 'reward-inviter',
      rewardIdentityHash: 'reward-inviter-hash',
      denomination: 'FIXED_MONEY_DISCOUNT',
      amountKopecks: 1_500,
      percentBasisPoints: null,
      liabilityCapKopecks: 1_500,
      liabilityCurrency: 'RUB',
      presentationKeyVersion: 'test-v1',
      presentationReference: 'presentation-inviter-ref',
      codeHash:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    {
      slot: 'invitee',
      recipientClientId: 'client-referred',
      rewardId: 'reward-invitee',
      rewardIdentityHash: 'reward-invitee-hash',
      denomination: 'FIXED_MONEY_DISCOUNT',
      amountKopecks: 1_500,
      percentBasisPoints: null,
      liabilityCapKopecks: 1_500,
      liabilityCurrency: 'RUB',
      presentationKeyVersion: 'test-v1',
      presentationReference: 'presentation-invitee-ref',
      codeHash:
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    },
  ],
  aggregateLiabilityKopecks: 3_000,
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
            amountKopecks:
              REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks + 1,
            liabilityCapKopecks:
              REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks + 1,
          },
        ],
        aggregateLiabilityKopecks:
          REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks + 1,
      }),
    ).toThrow('reward liability exceeds canonical cap');

    expect(() =>
      referralRewardIssueShadowNormalizer({
        ...canonicalInput(),
        aggregateLiabilityKopecks: 2_999,
      }),
    ).toThrow('aggregate reward liability is inconsistent');
  });

  it('requires the exact TTL, claim contract, and future approval boundary', () => {
    for (const changed of [
      { expiresAt: '2026-10-02T00:00:00.000Z' },
      { claimLookupContract: 'legacy-plaintext-code' },
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
