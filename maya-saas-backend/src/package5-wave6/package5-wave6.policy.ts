import { createHash } from 'node:crypto';

const DAY = 86_400_000;
export const WAVE6_POLICY_VERSION = 1;
export const WAVE6_DEFAULT_BATCH = 1_000;
export const WAVE6_HARD_CEILING = 10_000;
export const WAVE6_LEASE_MS = 60_000;

// Approved at checkpoint 178b39f2 + the explicit Policy V1 approval.
// Changing a duration or predicate requires a new reviewed policy version.
export const WAVE6_CLASSES = {
  purge_auth_sessions: {
    table: 'AuthSession',
    stamp: 'createdAt',
    terminal: 'revokedAt',
    expiry: 'expiresAt',
    retentionMs: 30 * DAY,
    policyKey: 'package5.a30.auth-retention',
  },
  purge_phone_auth_codes: {
    table: 'PhoneAuthCode',
    stamp: 'createdAt',
    terminal: 'consumedAt',
    expiry: 'expiresAt',
    retentionMs: DAY,
    policyKey: 'package5.a30.auth-retention',
  },
  purge_email_auth_codes: {
    table: 'EmailAuthCode',
    stamp: 'createdAt',
    terminal: 'consumedAt',
    expiry: 'expiresAt',
    retentionMs: DAY,
    policyKey: 'package5.a30.auth-retention',
  },
  purge_auth_flow_states: {
    table: 'AuthFlowState',
    stamp: 'createdAt',
    terminal: 'consumedAt',
    expiry: 'expiresAt',
    retentionMs: DAY,
    policyKey: 'package5.a30.auth-retention',
  },
  purge_auth_rate_limit_buckets: {
    table: 'AuthRateLimitBucket',
    stamp: 'createdAt',
    terminal: null,
    expiry: 'windowEndsAt',
    retentionMs: DAY,
    policyKey: 'package5.a30.auth-retention',
  },
  purge_ingestion_quarantine: {
    table: 'IngestionQuarantine',
    stamp: 'receivedAt',
    terminal: null,
    expiry: 'expiresAt',
    retentionMs: 0,
    policyKey: 'package5.a30.quarantine-expiry',
  },
} as const;
for (const rule of Object.values(WAVE6_CLASSES)) Object.freeze(rule);
Object.freeze(WAVE6_CLASSES);

export type Wave6Class = keyof typeof WAVE6_CLASSES;
export type Wave6Rule = (typeof WAVE6_CLASSES)[Wave6Class];
export type Wave6Request = { actionClass: Wave6Class; batchSize?: number };
export function wave6Hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function wave6Request(value: unknown): Required<Wave6Request> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('maintenance_request_invalid');
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['actionClass', 'batchSize'].includes(key),
    )
  ) {
    throw new Error('maintenance_initiator_authority_override_forbidden');
  }
  if (
    typeof input.actionClass !== 'string' ||
    !Object.prototype.hasOwnProperty.call(WAVE6_CLASSES, input.actionClass)
  ) {
    throw new Error('maintenance_class_not_allowlisted');
  }
  const batchSize = input.batchSize ?? WAVE6_DEFAULT_BATCH;
  if (
    typeof batchSize !== 'number' ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > WAVE6_DEFAULT_BATCH
  ) {
    throw new Error('maintenance_batch_may_only_reduce_central_default');
  }
  return { actionClass: input.actionClass as Wave6Class, batchSize };
}
