import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_REWARD_CLAIM_CONTRACT,
  REFERRAL_REWARD_POLICY_LIMITS,
} from './referral-reward-issue-shadow.contract';

export const REFERRAL_REWARD_FULFILL_SHADOW_CAPABILITY =
  'referrals.referral-reward-fulfill.shadow.v1' as const;
export const REFERRAL_REWARD_FULFILL_SHADOW_INPUT_CONTRACT =
  'maya.fulfill_referral_reward-input/1' as const;
export const REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE =
  'p4-04.referral-reward-fulfillment.shadow-policy.v1' as const;
export const REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT =
  'p4-04.local-fulfillment-account-reconciliation.v1' as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(source).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new ActionContractError(
      `Unexpected action input: ${unexpected.join(', ')}`,
    );
  }
}

function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ActionContractError(`${key} must be a safe integer`);
  }
  return value;
}

function isoTimestamp(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ActionContractError(`${key} must be an ISO timestamp`);
  }
  return value;
}

function divergenceCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ActionContractError('divergenceCodes must be an array');
  }
  const codes = value.map((entry) => {
    if (typeof entry !== 'string' || !OPAQUE_REF_PATTERN.test(entry)) {
      throw new ActionContractError('divergence code is not canonical');
    }
    return entry;
  });
  if (new Set(codes).size !== codes.length) {
    throw new ActionContractError('divergence codes must be unique');
  }
  return [...codes].sort();
}

export function referralRewardFulfillShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalRewardId',
    'rewardIdentityHash',
    'issuanceIdentityHash',
    'originatingReferralId',
    'recipientClientId',
    'recipientIdentityHash',
    'loyaltyAccountIdentityHash',
    'requesterIdentityHash',
    'requesterRole',
    'requesterAuthority',
    'fulfillmentIdentityHash',
    'claimBindingHash',
    'claimContract',
    'rewardSlot',
    'rewardRepresentation',
    'rewardAmountKopecks',
    'currency',
    'issuedAt',
    'expiresAt',
    'fulfillmentDecision',
    'fulfillmentPolicy',
    'approvalRequirement',
    'providerBoundary',
    'reconciliationContract',
    'existingFulfillmentDecision',
    'legacyClaimedValueKopecks',
    'legacyClaimedFulfilledDecision',
    'divergenceCodes',
  ]);

  if (source.claimContract !== REFERRAL_REWARD_CLAIM_CONTRACT) {
    throw new ActionContractError('claimContract is not canonical');
  }
  if (
    source.fulfillmentPolicy !== REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE
  ) {
    throw new ActionContractError('fulfillmentPolicy is not canonical');
  }
  if (
    source.reconciliationContract !==
    REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT
  ) {
    throw new ActionContractError('reconciliationContract is not canonical');
  }
  if (source.rewardSlot !== 'inviter' && source.rewardSlot !== 'invitee') {
    throw new ActionContractError('rewardSlot is not canonical');
  }
  if (source.rewardRepresentation !== 'fixed_money_kopecks') {
    throw new ActionContractError('rewardRepresentation is not canonical');
  }
  if (source.fulfillmentDecision !== 'fulfill') {
    throw new ActionContractError('fulfillmentDecision is not canonical');
  }
  if (source.approvalRequirement !== 'NONE_ACTOR_AUTHORIZED') {
    throw new ActionContractError('approvalRequirement is not canonical');
  }
  if (source.providerBoundary !== 'LOCAL_ONLY') {
    throw new ActionContractError('providerBoundary is not canonical');
  }
  if (source.existingFulfillmentDecision !== 'none') {
    throw new ActionContractError(
      'existingFulfillmentDecision is not canonical',
    );
  }
  if (
    source.requesterAuthority !== 'administrative_role' &&
    source.requesterAuthority !== 'server_cashier_allowlist' &&
    source.requesterAuthority !== 'reward_recipient'
  ) {
    throw new ActionContractError('requesterAuthority is not canonical');
  }
  if (
    typeof source.currency !== 'string' ||
    !CURRENCY_PATTERN.test(source.currency)
  ) {
    throw new ActionContractError('currency must be an ISO-style code');
  }
  const rewardAmountKopecks = integer(source, 'rewardAmountKopecks');
  if (
    rewardAmountKopecks < 1 ||
    rewardAmountKopecks > REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks
  ) {
    throw new ActionContractError('reward amount exceeds canonical cap');
  }
  const legacyClaimedValueKopecks = integer(
    source,
    'legacyClaimedValueKopecks',
  );
  if (legacyClaimedValueKopecks < 0) {
    throw new ActionContractError('legacy claimed value cannot be negative');
  }
  if (
    source.legacyClaimedFulfilledDecision !== 'none' &&
    source.legacyClaimedFulfilledDecision !== 'already_fulfilled'
  ) {
    throw new ActionContractError(
      'legacyClaimedFulfilledDecision is not canonical',
    );
  }
  const issuedAt = isoTimestamp(source, 'issuedAt');
  const expiresAt = isoTimestamp(source, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new ActionContractError('reward expiry must follow issuance');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalRewardId: opaque(source, 'canonicalRewardId'),
    rewardIdentityHash: opaque(source, 'rewardIdentityHash'),
    issuanceIdentityHash: opaque(source, 'issuanceIdentityHash'),
    originatingReferralId: opaque(source, 'originatingReferralId'),
    recipientClientId: opaque(source, 'recipientClientId'),
    recipientIdentityHash: opaque(source, 'recipientIdentityHash'),
    loyaltyAccountIdentityHash: opaque(source, 'loyaltyAccountIdentityHash'),
    requesterIdentityHash: opaque(source, 'requesterIdentityHash'),
    requesterRole: opaque(source, 'requesterRole'),
    requesterAuthority: source.requesterAuthority,
    fulfillmentIdentityHash: opaque(source, 'fulfillmentIdentityHash'),
    claimBindingHash: opaque(source, 'claimBindingHash'),
    claimContract: REFERRAL_REWARD_CLAIM_CONTRACT,
    rewardSlot: source.rewardSlot,
    rewardRepresentation: 'fixed_money_kopecks',
    rewardAmountKopecks,
    currency: source.currency,
    issuedAt,
    expiresAt,
    fulfillmentDecision: 'fulfill',
    fulfillmentPolicy: REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    providerBoundary: 'LOCAL_ONLY',
    reconciliationContract: REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
    existingFulfillmentDecision: 'none',
    legacyClaimedValueKopecks,
    legacyClaimedFulfilledDecision: source.legacyClaimedFulfilledDecision,
    divergenceCodes: divergenceCodes(source.divergenceCodes),
  };
}
