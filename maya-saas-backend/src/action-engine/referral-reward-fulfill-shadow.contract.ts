import { ActionContractError } from './action-engine.errors';
import {
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_POLICY_LIMITS,
  REFERRAL_REWARD_VALUE_CONTRACT,
} from './referral-reward-issue-shadow.contract';

export const REFERRAL_REWARD_FULFILL_SHADOW_CAPABILITY =
  'referrals.referral-reward-fulfill.shadow.v1' as const;
export const REFERRAL_REWARD_FULFILL_SHADOW_INPUT_CONTRACT =
  'maya.fulfill_referral_reward-input/1' as const;
export const REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE =
  'p4-04.referral-reward-fulfillment.shadow-policy.v1' as const;
export const REFERRAL_REWARD_FULFILL_TARGET_CONTRACT =
  'appointment_visit_payment.v1' as const;
export const REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT =
  'p4-04.local-discount-entitlement-reconciliation.v1' as const;

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const CURRENCY = /^[A-Z]{3}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}
function only(
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const extra = Object.keys(source).filter((key) => !allowed.includes(key));
  if (extra.length)
    throw new ActionContractError(
      `Unexpected action input: ${extra.join(', ')}`,
    );
}
function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE.test(value)) {
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
function nullableInteger(
  source: Record<string, unknown>,
  key: string,
): number | null {
  return source[key] === null ? null : integer(source, key);
}
function timestamp(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ActionContractError(`${key} must be an ISO timestamp`);
  }
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value))
    throw new ActionContractError('serviceIds must be an array');
  const normalized = value.map((item) => {
    if (typeof item !== 'string' || !OPAQUE.test(item)) {
      throw new ActionContractError('service identity is not canonical');
    }
    return item;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new ActionContractError('service identities must be unique');
  }
  return [...normalized].sort();
}

export function referralRewardFulfillShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value);
  only(source, [
    'provider',
    'canonicalRewardId',
    'rewardIdentityHash',
    'issuanceIdentityHash',
    'originatingReferralId',
    'recipientClientId',
    'recipientIdentityHash',
    'requesterIdentityHash',
    'requesterRole',
    'requesterAuthority',
    'fulfillmentIdentityHash',
    'claimBindingHash',
    'claimLookupContract',
    'rewardSlot',
    'valueContract',
    'denomination',
    'amountKopecks',
    'percentBasisPoints',
    'liabilityCapKopecks',
    'currency',
    'issuedAt',
    'expiresAt',
    'targetContract',
    'targetAppointmentId',
    'targetIdentityHash',
    'providerRecordIdentity',
    'providerVisitIdentity',
    'serviceIds',
    'eligibleAmountKopecks',
    'appliedAmountKopecks',
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
  if (
    source.claimLookupContract !== REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT ||
    source.valueContract !== REFERRAL_REWARD_VALUE_CONTRACT ||
    source.targetContract !== REFERRAL_REWARD_FULFILL_TARGET_CONTRACT ||
    source.fulfillmentPolicy !==
      REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE ||
    source.reconciliationContract !==
      REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT
  ) {
    throw new ActionContractError('fulfillment contract is not canonical');
  }
  if (source.rewardSlot !== 'inviter' && source.rewardSlot !== 'invitee') {
    throw new ActionContractError('rewardSlot is not canonical');
  }
  const amountKopecks = nullableInteger(source, 'amountKopecks');
  const percentBasisPoints = nullableInteger(source, 'percentBasisPoints');
  const liabilityCapKopecks = integer(source, 'liabilityCapKopecks');
  if (
    (source.denomination === 'FIXED_MONEY_DISCOUNT' &&
      (amountKopecks === null ||
        percentBasisPoints !== null ||
        amountKopecks !== liabilityCapKopecks)) ||
    (source.denomination === 'PERCENT_DISCOUNT' &&
      (amountKopecks !== null ||
        percentBasisPoints === null ||
        percentBasisPoints < 1 ||
        percentBasisPoints > 10_000)) ||
    (source.denomination !== 'FIXED_MONEY_DISCOUNT' &&
      source.denomination !== 'PERCENT_DISCOUNT') ||
    liabilityCapKopecks < 1 ||
    liabilityCapKopecks >
      REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks
  ) {
    throw new ActionContractError('frozen reward value is invalid');
  }
  const eligibleAmountKopecks = integer(source, 'eligibleAmountKopecks');
  const appliedAmountKopecks = integer(source, 'appliedAmountKopecks');
  const expectedApplied =
    source.denomination === 'FIXED_MONEY_DISCOUNT'
      ? Math.min(eligibleAmountKopecks, amountKopecks as number)
      : Math.min(
          liabilityCapKopecks,
          Math.floor(
            (eligibleAmountKopecks * (percentBasisPoints as number)) / 10_000,
          ),
        );
  if (
    eligibleAmountKopecks < 1 ||
    appliedAmountKopecks < 1 ||
    appliedAmountKopecks !== expectedApplied
  ) {
    throw new ActionContractError(
      'applied discount does not follow frozen reward contract',
    );
  }
  if (typeof source.currency !== 'string' || !CURRENCY.test(source.currency)) {
    throw new ActionContractError('currency must be canonical');
  }
  if (
    source.fulfillmentDecision !== 'fulfill' ||
    source.approvalRequirement !== 'NONE_ACTOR_AUTHORIZED' ||
    source.providerBoundary !== 'LOCAL_ONLY' ||
    source.existingFulfillmentDecision !== 'none'
  ) {
    throw new ActionContractError('fulfillment boundary is not canonical');
  }
  if (
    ![
      'administrative_role',
      'server_cashier_allowlist',
      'reward_recipient',
    ].includes(String(source.requesterAuthority))
  ) {
    throw new ActionContractError('requesterAuthority is not canonical');
  }
  const issuedAt = timestamp(source, 'issuedAt');
  const expiresAt = timestamp(source, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new ActionContractError('reward expiry must follow issuance');
  }
  const divergenceCodes = strings(source.divergenceCodes);
  return {
    provider: opaque(source, 'provider'),
    canonicalRewardId: opaque(source, 'canonicalRewardId'),
    rewardIdentityHash: opaque(source, 'rewardIdentityHash'),
    issuanceIdentityHash: opaque(source, 'issuanceIdentityHash'),
    originatingReferralId: opaque(source, 'originatingReferralId'),
    recipientClientId: opaque(source, 'recipientClientId'),
    recipientIdentityHash: opaque(source, 'recipientIdentityHash'),
    requesterIdentityHash: opaque(source, 'requesterIdentityHash'),
    requesterRole: opaque(source, 'requesterRole'),
    requesterAuthority: source.requesterAuthority,
    fulfillmentIdentityHash: opaque(source, 'fulfillmentIdentityHash'),
    claimBindingHash: opaque(source, 'claimBindingHash'),
    claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
    rewardSlot: source.rewardSlot,
    valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
    denomination: source.denomination,
    amountKopecks,
    percentBasisPoints,
    liabilityCapKopecks,
    currency: source.currency,
    issuedAt,
    expiresAt,
    targetContract: REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
    targetAppointmentId: opaque(source, 'targetAppointmentId'),
    targetIdentityHash: opaque(source, 'targetIdentityHash'),
    providerRecordIdentity: opaque(source, 'providerRecordIdentity'),
    providerVisitIdentity:
      source.providerVisitIdentity === null
        ? null
        : opaque(source, 'providerVisitIdentity'),
    serviceIds: strings(source.serviceIds),
    eligibleAmountKopecks,
    appliedAmountKopecks,
    fulfillmentDecision: 'fulfill',
    fulfillmentPolicy: REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    providerBoundary: 'LOCAL_ONLY',
    reconciliationContract: REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
    existingFulfillmentDecision: 'none',
    legacyClaimedValueKopecks: integer(source, 'legacyClaimedValueKopecks'),
    legacyClaimedFulfilledDecision: source.legacyClaimedFulfilledDecision,
    divergenceCodes,
  };
}
