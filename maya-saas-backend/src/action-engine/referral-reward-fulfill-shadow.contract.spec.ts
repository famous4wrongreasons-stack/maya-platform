import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
  REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
  referralRewardFulfillShadowNormalizer,
} from './referral-reward-fulfill-shadow.contract';
import { REFERRAL_REWARD_CLAIM_CONTRACT } from './referral-reward-issue-shadow.contract';

const canonicalInput = () => ({
  provider: 'yclients',
  canonicalRewardId: 'reward-1',
  rewardIdentityHash: 'reward-hash',
  issuanceIdentityHash: 'issuance-hash',
  originatingReferralId: 'referral-1',
  recipientClientId: 'client-referred-8',
  recipientIdentityHash: 'recipient-hash',
  loyaltyAccountIdentityHash: 'account-hash',
  requesterIdentityHash: 'requester-hash',
  requesterRole: 'tenant_owner',
  requesterAuthority: 'administrative_role',
  fulfillmentIdentityHash: 'fulfillment-hash',
  claimBindingHash: 'claim-binding-hash',
  claimContract: REFERRAL_REWARD_CLAIM_CONTRACT,
  rewardSlot: 'invitee',
  rewardRepresentation: 'fixed_money_kopecks',
  rewardAmountKopecks: 1_500,
  currency: 'RUB',
  issuedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  fulfillmentDecision: 'fulfill',
  fulfillmentPolicy: REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
  approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
  providerBoundary: 'LOCAL_ONLY',
  reconciliationContract: REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
  existingFulfillmentDecision: 'none',
  legacyClaimedValueKopecks: 1_500,
  legacyClaimedFulfilledDecision: 'none',
  divergenceCodes: [],
});

describe('referralRewardFulfillShadowNormalizer', () => {
  it('normalizes one exact local-only fulfillment plan', () => {
    expect(referralRewardFulfillShadowNormalizer(canonicalInput())).toEqual(
      canonicalInput(),
    );
  });

  it('rejects caller authority, bearer material, and caller-selected reward facts', () => {
    for (const forged of [
      { tenantId: 'tenant-b' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'legacy.direct' },
      { approvalBindingHash: 'forged' },
      { reward_claim: 'RAW-BEARER-1234' },
      { codeHash: 'caller-selected-lookup' },
      { fulfillmentPolicy: 'caller-policy' },
    ]) {
      expect(() =>
        referralRewardFulfillShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow(ActionContractError);
    }
  });

  it('enforces the one-time, local-only, actor-authorized boundary', () => {
    for (const changed of [
      { existingFulfillmentDecision: 'already_fulfilled' },
      { providerBoundary: 'YCLIENTS_WRITE' },
      { approvalRequirement: 'CALLER_APPROVED' },
      { reconciliationContract: 'provider-retry' },
      { fulfillmentDecision: 'caller-selected' },
    ]) {
      expect(() =>
        referralRewardFulfillShadowNormalizer({
          ...canonicalInput(),
          ...changed,
        }),
      ).toThrow(ActionContractError);
    }
  });

  it('rejects malformed or over-cap value and inconsistent reward time', () => {
    for (const changed of [
      { rewardAmountKopecks: 0 },
      { rewardAmountKopecks: 50_001 },
      { currency: 'rubles' },
      { expiresAt: '2026-08-31T00:00:00.000Z' },
    ]) {
      expect(() =>
        referralRewardFulfillShadowNormalizer({
          ...canonicalInput(),
          ...changed,
        }),
      ).toThrow(ActionContractError);
    }
  });
});
