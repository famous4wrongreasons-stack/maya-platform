import { ActionContractError } from './action-engine.errors';

export const REFERRAL_REWARD_ISSUE_SHADOW_CAPABILITY =
  'referrals.referral-reward-issue.shadow.v1' as const;
export const REFERRAL_REWARD_ISSUE_SHADOW_INPUT_CONTRACT =
  'maya.issue_referral_rewards-input/1' as const;
export const REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE =
  'p4-04.referral-reward-issuance.shadow-policy.v1' as const;
export const REFERRAL_REWARD_VALUE_CONTRACT =
  'p4-04.discount-entitlement.v1' as const;
export const REFERRAL_REWARD_PRESENTATION_CONTRACT =
  'referral-reward-presentation.v1' as const;
export const REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT =
  'referralRewardClaimLookup.v1' as const;
// Kept as an export alias for the already published P4-04 callers.
export const REFERRAL_REWARD_CLAIM_CONTRACT =
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT;

export const REFERRAL_REWARD_POLICY_LIMITS = Object.freeze({
  maxRecipients: 2,
  maxRewardLiabilityKopecks: 50_000,
  maxIssuanceLiabilityKopecks: 100_000,
  ttlDays: 30,
  approvalThresholdKopecks: 1,
  maxReferralsPerEnvelope: 25,
  maxRecipientsPerEnvelope: 50,
  maxAggregateEnvelopeLiabilityKopecks: 2_500_000,
  approvalWindowMs: 15 * 60 * 1_000,
});

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{16,240}$/;
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

function hash(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be a canonical hash`);
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
  if (source[key] === null) return null;
  return integer(source, key);
}

function isoTimestamp(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ActionContractError(`${key} must be an ISO timestamp`);
  }
  return value;
}

export type CanonicalReferralReward = {
  slot: 'inviter' | 'invitee';
  recipientClientId: string;
  rewardId: string;
  rewardIdentityHash: string;
  denomination: 'FIXED_MONEY_DISCOUNT' | 'PERCENT_DISCOUNT';
  amountKopecks: number | null;
  percentBasisPoints: number | null;
  liabilityCapKopecks: number;
  liabilityCurrency: string;
  presentationKeyVersion: string;
  presentationReference: string;
  codeHash: string;
};

function normalizeRewards(
  value: unknown,
  source: Record<string, unknown>,
): CanonicalReferralReward[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new ActionContractError('rewards must contain one or two slots');
  }
  const rewards = value.map((entry) => {
    const reward = recordInput(entry);
    assertOnlyKeys(reward, [
      'slot',
      'recipientClientId',
      'rewardId',
      'rewardIdentityHash',
      'denomination',
      'amountKopecks',
      'percentBasisPoints',
      'liabilityCapKopecks',
      'liabilityCurrency',
      'presentationKeyVersion',
      'presentationReference',
      'codeHash',
    ]);
    if (reward.slot !== 'inviter' && reward.slot !== 'invitee') {
      throw new ActionContractError('reward slot is not canonical');
    }
    const amountKopecks = nullableInteger(reward, 'amountKopecks');
    const percentBasisPoints = nullableInteger(reward, 'percentBasisPoints');
    const liabilityCapKopecks = integer(reward, 'liabilityCapKopecks');
    const denomination = reward.denomination;
    if (
      (denomination === 'FIXED_MONEY_DISCOUNT' &&
        (amountKopecks === null ||
          amountKopecks < 1 ||
          percentBasisPoints !== null ||
          liabilityCapKopecks !== amountKopecks)) ||
      (denomination === 'PERCENT_DISCOUNT' &&
        (amountKopecks !== null ||
          percentBasisPoints === null ||
          percentBasisPoints < 1 ||
          percentBasisPoints > 10_000 ||
          liabilityCapKopecks < 1)) ||
      (denomination !== 'FIXED_MONEY_DISCOUNT' &&
        denomination !== 'PERCENT_DISCOUNT')
    ) {
      throw new ActionContractError(
        'reward denomination/value contract is invalid',
      );
    }
    if (
      liabilityCapKopecks >
      REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks
    ) {
      throw new ActionContractError('reward liability exceeds canonical cap');
    }
    const liabilityCurrency = reward.liabilityCurrency;
    if (
      typeof liabilityCurrency !== 'string' ||
      !CURRENCY_PATTERN.test(liabilityCurrency)
    ) {
      throw new ActionContractError('reward liability currency is invalid');
    }
    return {
      slot: reward.slot,
      recipientClientId: opaque(reward, 'recipientClientId'),
      rewardId: opaque(reward, 'rewardId'),
      rewardIdentityHash: hash(reward, 'rewardIdentityHash'),
      denomination,
      amountKopecks,
      percentBasisPoints,
      liabilityCapKopecks,
      liabilityCurrency,
      presentationKeyVersion: opaque(reward, 'presentationKeyVersion'),
      presentationReference: opaque(reward, 'presentationReference'),
      codeHash: hash(reward, 'codeHash'),
    } satisfies CanonicalReferralReward;
  });
  if (new Set(rewards.map((reward) => reward.slot)).size !== rewards.length) {
    throw new ActionContractError('reward slots must be unique');
  }
  if (
    new Set(rewards.map((reward) => reward.recipientClientId)).size !==
    rewards.length
  ) {
    throw new ActionContractError('reward recipients must be unique');
  }
  if (
    new Set(rewards.map((reward) => reward.codeHash)).size !== rewards.length
  ) {
    throw new ActionContractError('reward claim lookup must be unique');
  }
  for (const reward of rewards) {
    const expectedRecipient =
      reward.slot === 'inviter'
        ? opaque(source, 'canonicalReferrerClientId')
        : opaque(source, 'canonicalReferredClientId');
    if (reward.recipientClientId !== expectedRecipient) {
      throw new ActionContractError(
        'reward recipient does not match canonical slot',
      );
    }
  }
  return rewards;
}

export function referralRewardIssueShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'customerReferralId',
    'resolutionExecutionId',
    'resolutionEvidenceHash',
    'canonicalReferrerClientId',
    'canonicalReferredClientId',
    'issuanceIdentityHash',
    'issuanceId',
    'rewardPolicyProfile',
    'policySnapshotHash',
    'valueContract',
    'currency',
    'issuedAt',
    'expiresAt',
    'maxRecipients',
    'perRewardLiabilityCapKopecks',
    'perIssuanceLiabilityCapKopecks',
    'approvalThresholdKopecks',
    'executableApprovalRequirement',
    'presentationContract',
    'claimLookupContract',
    'rewards',
    'aggregateLiabilityKopecks',
    'capDecision',
    'legacyClaimedInviterRewardKopecks',
    'legacyClaimedInviteeRewardKopecks',
    'shadowDivergence',
  ]);
  if (
    source.rewardPolicyProfile !==
      REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE ||
    source.valueContract !== REFERRAL_REWARD_VALUE_CONTRACT ||
    source.presentationContract !== REFERRAL_REWARD_PRESENTATION_CONTRACT ||
    source.claimLookupContract !== REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT
  ) {
    throw new ActionContractError('reward contract is not canonical');
  }
  if (opaque(source, 'issuanceId') !== opaque(source, 'issuanceIdentityHash')) {
    throw new ActionContractError(
      'issuance id must equal its deterministic identity',
    );
  }
  if (
    source.executableApprovalRequirement !== 'REQUIRED' ||
    source.capDecision !== 'within_cap'
  ) {
    throw new ActionContractError(
      'reward approval/cap decision is not canonical',
    );
  }
  if (
    typeof source.currency !== 'string' ||
    !CURRENCY_PATTERN.test(source.currency)
  ) {
    throw new ActionContractError('currency must be an ISO-style code');
  }
  if (
    integer(source, 'maxRecipients') !==
      REFERRAL_REWARD_POLICY_LIMITS.maxRecipients ||
    integer(source, 'perRewardLiabilityCapKopecks') !==
      REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks ||
    integer(source, 'perIssuanceLiabilityCapKopecks') !==
      REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks ||
    integer(source, 'approvalThresholdKopecks') !==
      REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks
  ) {
    throw new ActionContractError('reward policy limits are not canonical');
  }
  if (typeof source.shadowDivergence !== 'boolean') {
    throw new ActionContractError('shadowDivergence must be boolean');
  }
  const issuedAt = isoTimestamp(source, 'issuedAt');
  const expiresAt = isoTimestamp(source, 'expiresAt');
  const expectedExpiresAt = new Date(issuedAt);
  expectedExpiresAt.setUTCDate(
    expectedExpiresAt.getUTCDate() + REFERRAL_REWARD_POLICY_LIMITS.ttlDays,
  );
  if (expectedExpiresAt.toISOString() !== expiresAt) {
    throw new ActionContractError('reward expiry does not match canonical TTL');
  }
  const rewards = normalizeRewards(source.rewards, source);
  const aggregateLiabilityKopecks = integer(
    source,
    'aggregateLiabilityKopecks',
  );
  if (
    rewards.reduce((sum, reward) => sum + reward.liabilityCapKopecks, 0) !==
    aggregateLiabilityKopecks
  ) {
    throw new ActionContractError('aggregate reward liability is inconsistent');
  }
  if (
    aggregateLiabilityKopecks >
    REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks
  ) {
    throw new ActionContractError('aggregate reward liability exceeds cap');
  }
  return {
    provider: opaque(source, 'provider'),
    customerReferralId: opaque(source, 'customerReferralId'),
    resolutionExecutionId: opaque(source, 'resolutionExecutionId'),
    resolutionEvidenceHash: opaque(source, 'resolutionEvidenceHash'),
    canonicalReferrerClientId: opaque(source, 'canonicalReferrerClientId'),
    canonicalReferredClientId: opaque(source, 'canonicalReferredClientId'),
    issuanceIdentityHash: opaque(source, 'issuanceIdentityHash'),
    issuanceId: opaque(source, 'issuanceId'),
    rewardPolicyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
    currency: source.currency,
    issuedAt,
    expiresAt,
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
    rewards,
    aggregateLiabilityKopecks,
    capDecision: 'within_cap',
    legacyClaimedInviterRewardKopecks: nullableInteger(
      source,
      'legacyClaimedInviterRewardKopecks',
    ),
    legacyClaimedInviteeRewardKopecks: nullableInteger(
      source,
      'legacyClaimedInviteeRewardKopecks',
    ),
    shadowDivergence: source.shadowDivergence,
  };
}
