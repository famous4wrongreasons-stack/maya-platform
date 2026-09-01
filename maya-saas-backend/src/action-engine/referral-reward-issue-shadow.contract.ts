import { ActionContractError } from './action-engine.errors';

export const REFERRAL_REWARD_ISSUE_SHADOW_CAPABILITY =
  'referrals.referral-reward-issue.shadow.v1' as const;
export const REFERRAL_REWARD_ISSUE_SHADOW_INPUT_CONTRACT =
  'maya.issue_referral_rewards-input/1' as const;
export const REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE =
  'p4-04.referral-reward-issuance.shadow-policy.v1' as const;
export const REFERRAL_REWARD_CLAIM_CONTRACT =
  'p4-04.referral-reward-claim.v1' as const;

export const REFERRAL_REWARD_POLICY_LIMITS = Object.freeze({
  maxRecipients: 2,
  maxRewardKopecks: 50_000,
  maxIssuanceKopecks: 100_000,
  ttlDays: 30,
  approvalThresholdKopecks: 1,
});

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

function optionalInteger(
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

type CanonicalReward = {
  slot: 'inviter' | 'invitee';
  recipientClientId: string;
  rewardIdentityHash: string;
  amountKopecks: number;
};

function normalizeRewards(
  value: unknown,
  source: Record<string, unknown>,
): CanonicalReward[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new ActionContractError('rewards must contain one or two slots');
  }
  const rewards = value.map((entry) => {
    const reward = recordInput(entry);
    assertOnlyKeys(reward, [
      'slot',
      'recipientClientId',
      'rewardIdentityHash',
      'amountKopecks',
    ]);
    if (reward.slot !== 'inviter' && reward.slot !== 'invitee') {
      throw new ActionContractError('reward slot is not canonical');
    }
    const amountKopecks = integer(reward, 'amountKopecks');
    if (
      amountKopecks < 1 ||
      amountKopecks > REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks
    ) {
      throw new ActionContractError('reward amount exceeds canonical cap');
    }
    return {
      slot: reward.slot,
      recipientClientId: opaque(reward, 'recipientClientId'),
      rewardIdentityHash: opaque(reward, 'rewardIdentityHash'),
      amountKopecks,
    } satisfies CanonicalReward;
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
    'rewardPolicyProfile',
    'policySnapshotHash',
    'rewardRepresentation',
    'currency',
    'issuedAt',
    'expiresAt',
    'maxRecipients',
    'perRewardCapKopecks',
    'perIssuanceCapKopecks',
    'approvalThresholdKopecks',
    'executableApprovalRequirement',
    'claimContract',
    'rewards',
    'aggregateAmountKopecks',
    'capDecision',
    'legacyClaimedInviterRewardKopecks',
    'legacyClaimedInviteeRewardKopecks',
    'shadowDivergence',
  ]);

  if (
    source.rewardPolicyProfile !== REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE
  ) {
    throw new ActionContractError('rewardPolicyProfile is not canonical');
  }
  if (source.rewardRepresentation !== 'fixed_money_kopecks') {
    throw new ActionContractError('rewardRepresentation is not canonical');
  }
  if (source.claimContract !== REFERRAL_REWARD_CLAIM_CONTRACT) {
    throw new ActionContractError('claimContract is not canonical');
  }
  if (source.executableApprovalRequirement !== 'REQUIRED') {
    throw new ActionContractError('executable approval must remain required');
  }
  if (source.capDecision !== 'within_cap') {
    throw new ActionContractError('capDecision is not canonical');
  }
  if (
    typeof source.currency !== 'string' ||
    !CURRENCY_PATTERN.test(source.currency)
  ) {
    throw new ActionContractError('currency must be an ISO-style code');
  }
  if (
    integer(source, 'maxRecipients') !==
    REFERRAL_REWARD_POLICY_LIMITS.maxRecipients
  ) {
    throw new ActionContractError('maxRecipients is not canonical');
  }
  if (
    integer(source, 'perRewardCapKopecks') !==
    REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks
  ) {
    throw new ActionContractError('perRewardCapKopecks is not canonical');
  }
  if (
    integer(source, 'perIssuanceCapKopecks') !==
    REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceKopecks
  ) {
    throw new ActionContractError('perIssuanceCapKopecks is not canonical');
  }
  if (
    integer(source, 'approvalThresholdKopecks') !==
    REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks
  ) {
    throw new ActionContractError('approvalThresholdKopecks is not canonical');
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
  const aggregateAmountKopecks = integer(source, 'aggregateAmountKopecks');
  if (
    rewards.reduce((sum, reward) => sum + reward.amountKopecks, 0) !==
    aggregateAmountKopecks
  ) {
    throw new ActionContractError('aggregate reward amount is inconsistent');
  }
  if (
    aggregateAmountKopecks > REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceKopecks
  ) {
    throw new ActionContractError('aggregate reward amount exceeds cap');
  }

  return {
    provider: opaque(source, 'provider'),
    customerReferralId: opaque(source, 'customerReferralId'),
    resolutionExecutionId: opaque(source, 'resolutionExecutionId'),
    resolutionEvidenceHash: opaque(source, 'resolutionEvidenceHash'),
    canonicalReferrerClientId: opaque(source, 'canonicalReferrerClientId'),
    canonicalReferredClientId: opaque(source, 'canonicalReferredClientId'),
    issuanceIdentityHash: opaque(source, 'issuanceIdentityHash'),
    rewardPolicyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    rewardRepresentation: 'fixed_money_kopecks',
    currency: source.currency,
    issuedAt,
    expiresAt,
    maxRecipients: REFERRAL_REWARD_POLICY_LIMITS.maxRecipients,
    perRewardCapKopecks: REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks,
    perIssuanceCapKopecks: REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceKopecks,
    approvalThresholdKopecks:
      REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks,
    executableApprovalRequirement: 'REQUIRED',
    claimContract: REFERRAL_REWARD_CLAIM_CONTRACT,
    rewards,
    aggregateAmountKopecks,
    capDecision: 'within_cap',
    legacyClaimedInviterRewardKopecks: optionalInteger(
      source,
      'legacyClaimedInviterRewardKopecks',
    ),
    legacyClaimedInviteeRewardKopecks: optionalInteger(
      source,
      'legacyClaimedInviteeRewardKopecks',
    ),
    shadowDivergence: source.shadowDivergence,
  };
}
