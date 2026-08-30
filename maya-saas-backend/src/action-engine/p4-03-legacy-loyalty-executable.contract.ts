import { createHash } from 'node:crypto';

import { ActionContractError } from './action-engine.errors';
import { stableActionJson } from './action-engine.identity';
import { legacyLoyaltyBackfillShadowNormalizer } from './legacy-loyalty-backfill-shadow.contract';
import { legacyLoyaltyEarnShadowNormalizer } from './legacy-loyalty-earn-shadow.contract';
import { legacyLoyaltyExpireShadowNormalizer } from './legacy-loyalty-expire-shadow.contract';
import { legacyLoyaltyGrantConsumeShadowNormalizer } from './legacy-loyalty-grant-consume-shadow.contract';
import { legacyLoyaltyGrantIssueShadowNormalizer } from './legacy-loyalty-grant-issue-shadow.contract';
import { legacyLoyaltyImportShadowNormalizer } from './legacy-loyalty-import-shadow.contract';
import { legacyLoyaltyRedeemShadowNormalizer } from './legacy-loyalty-redeem-shadow.contract';
import { legacyLoyaltyRefundShadowNormalizer } from './legacy-loyalty-refund-shadow.contract';

export const P4_03_EXECUTABLE_CAPABILITIES = {
  earn: 'loyalty.legacy-earn.execute.v1',
  expire: 'loyalty.legacy-expire.execute.v1',
  redeem: 'loyalty.legacy-redeem.execute.v1',
  refund: 'loyalty.legacy-refund.execute.v1',
  import: 'loyalty.legacy-import.execute.v1',
  backfill: 'loyalty.legacy-backfill.execute.v1',
  issueGrant: 'loyalty.redemption-grant.issue.execute.v1',
  consumeGrant: 'loyalty.redemption-grant.consume.execute.v1',
} as const;

export const P4_03_BULK_ENVELOPE_CAPABILITIES = {
  expire: 'loyalty.legacy-expire.batch.execute.v1',
  backfill: 'loyalty.legacy-backfill.batch.execute.v1',
  import: 'loyalty.legacy-import.batch.execute.v1',
} as const;

export type P403ExecutableActionClass =
  | 'earn_legacy_loyalty'
  | 'expire_legacy_loyalty'
  | 'redeem_legacy_loyalty'
  | 'refund_legacy_loyalty'
  | 'import_legacy_loyalty_balance'
  | 'backfill_legacy_loyalty'
  | 'issue_loyalty_redemption_grant'
  | 'consume_loyalty_redemption_grant';

export type P403BulkActionClass = Extract<
  P403ExecutableActionClass,
  | 'expire_legacy_loyalty'
  | 'import_legacy_loyalty_balance'
  | 'backfill_legacy_loyalty'
>;

export interface P403BulkPolicyProfileV1 {
  policyVersion: string;
  maxRecipients: number;
  maxPerClientAbsolutePoints: number;
  maxAggregateAbsolutePoints: number;
  approvalTtlMs: number;
}

export const P4_03_BULK_POLICY_PROFILES: Readonly<
  Record<P403BulkActionClass, P403BulkPolicyProfileV1>
> = {
  expire_legacy_loyalty: {
    policyVersion: 'legacy-loyalty-expiry.v1',
    maxRecipients: 25,
    maxPerClientAbsolutePoints: 5_000,
    maxAggregateAbsolutePoints: 25_000,
    approvalTtlMs: 15 * 60 * 1_000,
  },
  backfill_legacy_loyalty: {
    policyVersion: 'legacy-loyalty-backfill.v1',
    maxRecipients: 25,
    maxPerClientAbsolutePoints: 1_000,
    maxAggregateAbsolutePoints: 10_000,
    approvalTtlMs: 15 * 60 * 1_000,
  },
  import_legacy_loyalty_balance: {
    policyVersion: 'legacy-loyalty-import.v1',
    maxRecipients: 10,
    maxPerClientAbsolutePoints: 5_000,
    maxAggregateAbsolutePoints: 20_000,
    approvalTtlMs: 15 * 60 * 1_000,
  },
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ActionContractError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const accepted = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !accepted.has(key));
  if (unexpected.length > 0) {
    throw new ActionContractError(
      `${label} contains unexpected fields: ${unexpected.sort().join(', ')}`,
    );
  }
}

function opaque(value: unknown, label: string): string {
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
  return value;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new ActionContractError(`${label} must be a SHA-256 hash`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ActionContractError(
      `${label} must be an integer between ${min} and ${max}`,
    );
  }
  return Number(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableActionJson(value)).digest('hex');
}

export function p403BulkChildMutationHash(
  actionClass: P403BulkActionClass,
  normalizedPlan: Record<string, unknown>,
): string {
  return sha256({ actionClass, normalizedPlan });
}

export function p403BulkAudienceHash(input: {
  actionClass: P403BulkActionClass;
  policyVersion: string;
  policyWindowRef: string;
  childMutationHashes: readonly string[];
}): string {
  return sha256({
    actionClass: input.actionClass,
    policyVersion: input.policyVersion,
    policyWindowRef: input.policyWindowRef,
    childMutationHashes: [...input.childMutationHashes].sort(),
  });
}

export function p403BulkEnvelopeNormalizer(
  actionClass: P403BulkActionClass,
  value: unknown,
): Record<string, unknown> {
  const source = record(value, 'bulk envelope');
  onlyKeys(
    source,
    [
      'policyVersion',
      'policyWindowRef',
      'recipientCount',
      'aggregateAbsolutePoints',
      'childMutationHashes',
      'audienceHash',
    ],
    'bulk envelope',
  );
  const profile = P4_03_BULK_POLICY_PROFILES[actionClass];
  if (source.policyVersion !== profile.policyVersion) {
    throw new ActionContractError('bulk policy version is not canonical');
  }
  const policyWindowRef = opaque(source.policyWindowRef, 'policyWindowRef');
  const recipientCount = integer(
    source.recipientCount,
    'recipientCount',
    1,
    profile.maxRecipients,
  );
  const aggregateAbsolutePoints = integer(
    source.aggregateAbsolutePoints,
    'aggregateAbsolutePoints',
    1,
    profile.maxAggregateAbsolutePoints,
  );
  if (!Array.isArray(source.childMutationHashes)) {
    throw new ActionContractError('childMutationHashes must be an array');
  }
  const childMutationHashes = source.childMutationHashes
    .map((item) => hash(item, 'childMutationHash'))
    .sort();
  if (
    childMutationHashes.length !== recipientCount ||
    new Set(childMutationHashes).size !== childMutationHashes.length
  ) {
    throw new ActionContractError(
      'bulk recipients must match unique child mutation hashes',
    );
  }
  const audienceHash = hash(source.audienceHash, 'audienceHash');
  const expectedAudienceHash = p403BulkAudienceHash({
    actionClass,
    policyVersion: profile.policyVersion,
    policyWindowRef,
    childMutationHashes,
  });
  if (audienceHash !== expectedAudienceHash) {
    throw new ActionContractError('bulk audience hash is not canonical');
  }
  return {
    actionClass,
    policyVersion: profile.policyVersion,
    policyWindowRef,
    recipientCount,
    aggregateAbsolutePoints,
    childMutationHashes,
    audienceHash,
    approvalScope: 'exact_batch_envelope',
    fanOutMode: 'bounded_per_client_executions',
  };
}

function bulkChildNormalizer(
  actionClass: P403BulkActionClass,
  value: unknown,
  normalizePlan: (plan: unknown) => Record<string, unknown>,
): Record<string, unknown> {
  const source = record(value, 'bulk child');
  onlyKeys(source, ['plan', 'batch'], 'bulk child');
  const plan = normalizePlan(source.plan);
  const batch = record(source.batch, 'batch binding');
  onlyKeys(
    batch,
    [
      'batchExecutionId',
      'audienceHash',
      'childMutationHash',
      'policyWindowRef',
      'policyVersion',
    ],
    'batch binding',
  );
  const profile = P4_03_BULK_POLICY_PROFILES[actionClass];
  if (batch.policyVersion !== profile.policyVersion) {
    throw new ActionContractError('child bulk policy is not canonical');
  }
  const childMutationHash = hash(batch.childMutationHash, 'childMutationHash');
  if (childMutationHash !== p403BulkChildMutationHash(actionClass, plan)) {
    throw new ActionContractError('child mutation hash is not canonical');
  }
  const delta = Number(plan.intendedDeltaPoints);
  if (
    !Number.isInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > profile.maxPerClientAbsolutePoints
  ) {
    throw new ActionContractError('bulk child exceeds the per-client cap');
  }
  return {
    plan,
    batch: {
      batchExecutionId: opaque(batch.batchExecutionId, 'batchExecutionId'),
      audienceHash: hash(batch.audienceHash, 'audienceHash'),
      childMutationHash,
      policyWindowRef: opaque(batch.policyWindowRef, 'policyWindowRef'),
      policyVersion: profile.policyVersion,
    },
  };
}

export function p403EarnExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  const plan = legacyLoyaltyEarnShadowNormalizer(value);
  if (Number(plan.intendedDeltaPoints) <= 0) {
    throw new ActionContractError('earn action must have a positive delta');
  }
  return plan;
}

export function p403ExpireExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  return bulkChildNormalizer(
    'expire_legacy_loyalty',
    value,
    legacyLoyaltyExpireShadowNormalizer,
  );
}

export function p403RedeemExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  const plan = legacyLoyaltyRedeemShadowNormalizer(value);
  if (
    plan.eligibilityDecision !== 'redeem' ||
    Number(plan.intendedDeltaPoints) >= 0
  ) {
    throw new ActionContractError('redeem action is not executable');
  }
  return plan;
}

export function p403RefundExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  const plan = legacyLoyaltyRefundShadowNormalizer(value);
  if (
    plan.refundDecision !== 'refund' ||
    Number(plan.intendedDeltaPoints) <= 0
  ) {
    throw new ActionContractError('refund action is not executable');
  }
  return plan;
}

export function p403ImportExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  return bulkChildNormalizer(
    'import_legacy_loyalty_balance',
    value,
    legacyLoyaltyImportShadowNormalizer,
  );
}

export function p403BackfillExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  return bulkChildNormalizer(
    'backfill_legacy_loyalty',
    value,
    legacyLoyaltyBackfillShadowNormalizer,
  );
}

export function p403GrantIssueExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value, 'grant issue input');
  if (source.authorizationEvidence !== 'server_resolved_eligible_requester') {
    throw new ActionContractError(
      'grant issue authority is not server-derived',
    );
  }
  const plan = legacyLoyaltyGrantIssueShadowNormalizer({
    ...source,
    authorizationEvidence: 'trusted_shadow_candidate_only',
  });
  if (plan.grantDecision !== 'issue') {
    throw new ActionContractError('grant issue action is not executable');
  }
  return {
    ...plan,
    authorizationEvidence: 'server_resolved_eligible_requester',
    codeMaterial: 'server_generated_not_persisted',
  };
}

export function p403GrantConsumeExecutableNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = record(value, 'grant consume input');
  if (source.providerProjectionDecision !== 'local_only_no_provider_write') {
    throw new ActionContractError('grant consume must remain local-only');
  }
  const plan = legacyLoyaltyGrantConsumeShadowNormalizer({
    ...source,
    providerProjectionDecision: 'not_evaluated_in_shadow',
  });
  if (plan.consumeDecision !== 'consume') {
    throw new ActionContractError('grant consume action is not executable');
  }
  return {
    ...plan,
    providerProjectionDecision: 'local_only_no_provider_write',
    providerWritesPermitted: false,
  };
}
