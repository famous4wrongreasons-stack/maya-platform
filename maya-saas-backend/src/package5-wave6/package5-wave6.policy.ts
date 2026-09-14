import { C9_RETENTION_CLASSES } from './chapter9-orchestration-retention';
import { C8_RETENTION_CLASSES } from './chapter8-valuation-retention';
import {
  C7_MEASUREMENT_RETENTION_CLASS,
  C7_MEASUREMENT_RETENTION_RULE,
} from './chapter7-measurement-retention';
import { RC_PAYLOAD_CLASSES } from './package5-wave-rc-payloads';
import { createHash } from 'node:crypto';

const DAY = 86_400_000;
export const WAVE6_POLICY_VERSION = 1;
export const WAVE6_DEFAULT_BATCH = 1_000;
export const WAVE6_HARD_CEILING = 10_000;
export const WAVE6_LEASE_MS = 60_000;

// Approved at checkpoint 178b39f2 + the explicit Policy V1 approval.
// Changing a duration or predicate requires a new reviewed policy version.
const RC_RULES = Object.fromEntries(
  Object.entries(RC_PAYLOAD_CLASSES).map(([key, rule]) => [
    key,
    {
      ...rule,
      stamp: 'createdAt',
      expiry: 'createdAt',
      terminal: null,
      retentionMs: 0,
    },
  ]),
) as {
  [K in keyof typeof RC_PAYLOAD_CLASSES]: {
    table: (typeof RC_PAYLOAD_CLASSES)[K]['table'];
    policyKey: (typeof RC_PAYLOAD_CLASSES)[K]['policyKey'];
    stamp: 'createdAt';
    expiry: 'createdAt';
    terminal: null;
    retentionMs: 0;
  };
};
export const WAVE6_CLASSES = {
  ...C8_RETENTION_CLASSES,
  ...C9_RETENTION_CLASSES,
  [C7_MEASUREMENT_RETENTION_CLASS]: C7_MEASUREMENT_RETENTION_RULE,
  ...RC_RULES,
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
