import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
  REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
  referralRewardFulfillShadowNormalizer,
} from './referral-reward-fulfill-shadow.contract';
import {
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_VALUE_CONTRACT,
} from './referral-reward-issue-shadow.contract';

const canonicalInput = () => ({
  provider: 'yclients',
  canonicalRewardId: 'reward-1',
  rewardIdentityHash: 'reward-hash',
  issuanceIdentityHash: 'issuance-hash',
  originatingReferralId: 'referral-1',
  recipientClientId: 'client-referred-8',
  recipientIdentityHash: 'recipient-hash',
  requesterIdentityHash: 'requester-hash',
  requesterRole: 'tenant_owner',
  requesterAuthority: 'administrative_role',
  fulfillmentIdentityHash: 'fulfillment-hash',
  claimBindingHash: 'claim-binding-hash',
  claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  rewardSlot: 'invitee',
  valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
  denomination: 'FIXED_MONEY_DISCOUNT',
  amountKopecks: 1_500,
  percentBasisPoints: null,
  liabilityCapKopecks: 1_500,
  currency: 'RUB',
  issuedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  targetContract: REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
  targetAppointmentId: 'appointment-42',
  targetIdentityHash: 'target-identity-hash',
  providerRecordIdentity: 'record-42',
  providerVisitIdentity: 'visit-42',
  serviceIds: ['service-1', 'service-2'],
  eligibleAmountKopecks: 5_000,
  appliedAmountKopecks: 1_500,
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
      { amountKopecks: 0 },
      { amountKopecks: 50_001, liabilityCapKopecks: 50_001 },
      { currency: 'rubles' },
      { expiresAt: '2026-08-31T00:00:00.000Z' },
      { appliedAmountKopecks: 1_499 },
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
