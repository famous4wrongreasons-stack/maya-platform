import { createHash } from 'node:crypto';

import { ActionContractError } from './action-engine.errors';
import { stableActionJson } from './action-engine.identity';
import { REFERRAL_REWARD_POLICY_LIMITS } from './referral-reward-issue-shadow.contract';

export const REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT =
  'p4-04.referral-reward-scheduler-envelope.v1' as const;
export const REFERRAL_REWARD_SCHEDULER_ENVELOPE_SHADOW_CAPABILITY =
  'referrals.referral-reward-scheduler-envelope.shadow.v1' as const;
export const REFERRAL_REWARD_SCHEDULER_ENVELOPE_INPUT_CONTRACT =
  'maya.referral-reward-scheduler-envelope-input/1' as const;
export const REFERRAL_REWARD_SCHEDULER_POLICY_VERSION =
  'p4-04.referral-reward-scheduler-policy.v1' as const;

export interface ReferralRewardSchedulerCandidate {
  referralId: string;
  recipientClientIds: readonly string[];
  maximumLiabilityKopecks: number;
  currency: string;
}

export interface ReferralRewardSchedulerEnvelope {
  contract: typeof REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT;
  policyVersion: typeof REFERRAL_REWARD_SCHEDULER_POLICY_VERSION;
  tenantId: string;
  policyWindowRef: string;
  batchIdentityHash: string;
  audienceHash: string;
  referralCount: number;
  recipientCount: number;
  aggregateLiabilityKopecks: number;
  currency: string;
  approvalRequirement: 'OWNER_APPROVAL_REQUIRED';
  childExecutionIdentities: string[];
  fanOutMode: 'BOUNDED_PER_REFERRAL_EXECUTIONS';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableActionJson(value)).digest('hex');
}

function exactPolicyWindow(now: Date): string {
  const epoch = now.getTime();
  if (!Number.isFinite(epoch))
    throw new ActionContractError('scheduler time is invalid');
  const start =
    Math.floor(epoch / REFERRAL_REWARD_POLICY_LIMITS.approvalWindowMs) *
    REFERRAL_REWARD_POLICY_LIMITS.approvalWindowMs;
  return new Date(start).toISOString();
}

export function buildReferralRewardSchedulerEnvelope(input: {
  tenantId: string;
  candidates: readonly ReferralRewardSchedulerCandidate[];
  now: Date;
}): ReferralRewardSchedulerEnvelope {
  if (!/^[A-Za-z0-9._:/-]{1,240}$/.test(input.tenantId)) {
    throw new ActionContractError('tenantId must be canonical');
  }
  if (
    input.candidates.length < 1 ||
    input.candidates.length >
      REFERRAL_REWARD_POLICY_LIMITS.maxReferralsPerEnvelope
  ) {
    throw new ActionContractError('scheduler referral cap exceeded');
  }
  const candidates = input.candidates
    .map((candidate) => ({
      referralId: candidate.referralId,
      recipientClientIds: [...candidate.recipientClientIds].sort(),
      maximumLiabilityKopecks: candidate.maximumLiabilityKopecks,
      currency: candidate.currency,
    }))
    .sort((left, right) => left.referralId.localeCompare(right.referralId));
  if (
    new Set(candidates.map((candidate) => candidate.referralId)).size !==
      candidates.length ||
    candidates.some(
      (candidate) =>
        !/^[A-Za-z0-9._:/-]{1,240}$/.test(candidate.referralId) ||
        candidate.recipientClientIds.length < 1 ||
        candidate.recipientClientIds.length >
          REFERRAL_REWARD_POLICY_LIMITS.maxRecipients ||
        new Set(candidate.recipientClientIds).size !==
          candidate.recipientClientIds.length ||
        candidate.maximumLiabilityKopecks < 1 ||
        candidate.maximumLiabilityKopecks >
          REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks ||
        !/^[A-Z]{3}$/.test(candidate.currency),
    )
  ) {
    throw new ActionContractError('scheduler candidate is not canonical');
  }
  const currencies = new Set(candidates.map((candidate) => candidate.currency));
  const recipientCount = candidates.reduce(
    (sum, candidate) => sum + candidate.recipientClientIds.length,
    0,
  );
  const aggregateLiabilityKopecks = candidates.reduce(
    (sum, candidate) => sum + candidate.maximumLiabilityKopecks,
    0,
  );
  if (
    currencies.size !== 1 ||
    recipientCount > REFERRAL_REWARD_POLICY_LIMITS.maxRecipientsPerEnvelope ||
    aggregateLiabilityKopecks >
      REFERRAL_REWARD_POLICY_LIMITS.maxAggregateEnvelopeLiabilityKopecks
  ) {
    throw new ActionContractError(
      'scheduler aggregate cap/tenant currency boundary exceeded',
    );
  }
  const policyWindowRef = exactPolicyWindow(input.now);
  const childExecutionIdentities = candidates.map((candidate) =>
    sha256({
      contract: REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT,
      tenantId: input.tenantId,
      policyWindowRef,
      candidate,
    }),
  );
  const audienceHash = sha256({ tenantId: input.tenantId, candidates });
  const batchIdentityHash = sha256({
    contract: REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT,
    policyVersion: REFERRAL_REWARD_SCHEDULER_POLICY_VERSION,
    tenantId: input.tenantId,
    policyWindowRef,
    audienceHash,
    childExecutionIdentities,
  });
  return {
    contract: REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT,
    policyVersion: REFERRAL_REWARD_SCHEDULER_POLICY_VERSION,
    tenantId: input.tenantId,
    policyWindowRef,
    batchIdentityHash,
    audienceHash,
    referralCount: candidates.length,
    recipientCount,
    aggregateLiabilityKopecks,
    currency: candidates[0].currency,
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    childExecutionIdentities,
    fanOutMode: 'BOUNDED_PER_REFERRAL_EXECUTIONS',
  };
}

export function remainingReferralRewardSchedulerChildren(input: {
  envelope: ReferralRewardSchedulerEnvelope;
  completedChildExecutionIdentities: ReadonlySet<string>;
}): string[] {
  return input.envelope.childExecutionIdentities.filter(
    (identity) => !input.completedChildExecutionIdentities.has(identity),
  );
}

export function referralRewardSchedulerEnvelopeNormalizer(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('scheduler envelope must be an object');
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set([
    'contract',
    'policyVersion',
    'tenantId',
    'policyWindowRef',
    'batchIdentityHash',
    'audienceHash',
    'referralCount',
    'recipientCount',
    'aggregateLiabilityKopecks',
    'currency',
    'approvalRequirement',
    'childExecutionIdentities',
    'fanOutMode',
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new ActionContractError('scheduler envelope has unexpected fields');
  }
  const childExecutionIdentities = Array.isArray(
    source.childExecutionIdentities,
  )
    ? source.childExecutionIdentities.map(String)
    : [];
  const hashPattern = /^[a-f0-9]{64}$/;
  if (
    source.contract !== REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT ||
    source.policyVersion !== REFERRAL_REWARD_SCHEDULER_POLICY_VERSION ||
    source.approvalRequirement !== 'OWNER_APPROVAL_REQUIRED' ||
    source.fanOutMode !== 'BOUNDED_PER_REFERRAL_EXECUTIONS' ||
    typeof source.tenantId !== 'string' ||
    typeof source.policyWindowRef !== 'string' ||
    Number.isNaN(Date.parse(source.policyWindowRef)) ||
    typeof source.batchIdentityHash !== 'string' ||
    !hashPattern.test(source.batchIdentityHash) ||
    typeof source.audienceHash !== 'string' ||
    !hashPattern.test(source.audienceHash) ||
    !Number.isInteger(source.referralCount) ||
    Number(source.referralCount) < 1 ||
    Number(source.referralCount) >
      REFERRAL_REWARD_POLICY_LIMITS.maxReferralsPerEnvelope ||
    !Number.isInteger(source.recipientCount) ||
    Number(source.recipientCount) < 1 ||
    Number(source.recipientCount) >
      REFERRAL_REWARD_POLICY_LIMITS.maxRecipientsPerEnvelope ||
    !Number.isInteger(source.aggregateLiabilityKopecks) ||
    Number(source.aggregateLiabilityKopecks) < 1 ||
    Number(source.aggregateLiabilityKopecks) >
      REFERRAL_REWARD_POLICY_LIMITS.maxAggregateEnvelopeLiabilityKopecks ||
    typeof source.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(source.currency) ||
    childExecutionIdentities.length !== Number(source.referralCount) ||
    new Set(childExecutionIdentities).size !==
      childExecutionIdentities.length ||
    childExecutionIdentities.some((identity) => !hashPattern.test(identity))
  ) {
    throw new ActionContractError('scheduler envelope is not canonical');
  }
  const expectedBatchIdentity = sha256({
    contract: REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT,
    policyVersion: REFERRAL_REWARD_SCHEDULER_POLICY_VERSION,
    tenantId: source.tenantId,
    policyWindowRef: source.policyWindowRef,
    audienceHash: source.audienceHash,
    childExecutionIdentities,
  });
  if (expectedBatchIdentity !== source.batchIdentityHash) {
    throw new ActionContractError('scheduler batch identity is not canonical');
  }
  return {
    contract: REFERRAL_REWARD_SCHEDULER_ENVELOPE_CONTRACT,
    policyVersion: REFERRAL_REWARD_SCHEDULER_POLICY_VERSION,
    tenantId: source.tenantId,
    policyWindowRef: source.policyWindowRef,
    batchIdentityHash: source.batchIdentityHash,
    audienceHash: source.audienceHash,
    referralCount: source.referralCount,
    recipientCount: source.recipientCount,
    aggregateLiabilityKopecks: source.aggregateLiabilityKopecks,
    currency: source.currency,
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    childExecutionIdentities,
    fanOutMode: 'BOUNDED_PER_REFERRAL_EXECUTIONS',
  };
}
