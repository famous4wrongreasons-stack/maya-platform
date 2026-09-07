import type {
  ActionApprovalDecision,
  ActionAttempt,
  ActionExecution,
  ActionPolicyDecision,
} from '@prisma/client';

import type { ActionIntentV1 } from '../opportunities';
import type {
  ClientBookingIntentContext,
  ClientBookingSnapshot,
} from './client-booking-intent.contract';

export const ACTION_EXECUTION_REQUEST_CONTRACT =
  'maya.action-execution-request/1' as const;
export const ACTION_EXECUTION_RESULT_CONTRACT =
  'maya.action-execution-result/1' as const;
export const ACTION_EXECUTION_PREVIEW_CONTRACT =
  'maya.action-execution-preview/1' as const;

export type ActionSourceType =
  | 'agent_task'
  | 'authenticated_request'
  | 'scheduler'
  | 'webhook'
  | 'legacy_bridge'
  | 'synthetic_shadow';

export interface TrustedActionSourceV1 {
  type: ActionSourceType;
  /** Stable opaque occurrence scope. Discovery time must never be used here. */
  occurrenceScope: string;
  sourceRef?: string;
  agentTaskId?: string;
  actorUserId?: string;
}

export interface CallerIdempotencyV1 {
  scope: string;
  key: string;
}

export interface TrustedActionExecutionRequestV1 {
  contract: typeof ACTION_EXECUTION_REQUEST_CONTRACT;
  /** Comes from authenticated server context, never from model/client payload. */
  tenantId: string;
  /** Trusted registry key selected by deterministic server routing. */
  capability: string;
  source: TrustedActionSourceV1;
  /** Opaque tenant-scoped reference, not a display name or contact detail. */
  targetRef: string;
  input: unknown;
  evidenceRefs: string[];
  intentExpiresAt?: Date;
  callerIdempotency?: CallerIdempotencyV1;
  bookingIntent?: ClientBookingIntentContext;
  /** Server-owned B36 immutable report/slot binding; never HTTP/model authority. */
  ownerReportSlot?: { runId: string; slotKey: string };
}

export interface Chapter5IntentContextV1 {
  tenantId: string;
  intent: ActionIntentV1;
  /** The adapter is callable only for a trusted Chapter 5 projection. */
  trustedProjection: true;
}

export interface ExecutionClaimV1 {
  execution: ActionExecution;
  attempt: ActionAttempt;
  /** Returned to the worker once. Only its HMAC is durable. */
  leaseToken: string;
}

export interface ExecutionResultV1 {
  contract: typeof ACTION_EXECUTION_RESULT_CONTRACT;
  executionId: string;
  state: ActionExecution['state'];
  outcomeCode?: string;
  safeResult?: Record<string, unknown>;
}

/**
 * Safe, read-only projection of the exact request normalization used by the
 * durable kernel. It intentionally excludes normalized input and CRM payloads.
 */
export interface ActionExecutionPreviewV1 {
  contract: typeof ACTION_EXECUTION_PREVIEW_CONTRACT;
  tenantId: string;
  sourceType: ActionSourceType;
  capability: string;
  capabilityVersion: number;
  actionClass: string;
  targetKind: string;
  targetRef: string;
  normalizedInputHash: string;
  identityFingerprint: string;
  idempotencyScope?: string;
  requestIdempotencyKeyHash?: string;
  policyKey: string;
  policyVersion: number;
  policyDecision: ActionPolicyDecision;
  autonomyLevel: string;
  approvalRequirement: 'NONE' | 'REQUIRED';
  executorKey: string;
  executorVersion: number;
  externalSideEffects: 0;
}

export type ApprovalResolution = Extract<
  ActionApprovalDecision,
  'APPROVED' | 'REJECTED'
>;

export type ReconciliationOutcome =
  | 'PROVEN_SUCCEEDED'
  | 'PROVEN_FAILED'
  | 'PROVEN_NOT_EXECUTED'
  | 'STILL_UNKNOWN';

export interface FinalizeExecutionInputV1 {
  tenantId: string;
  executionId: string;
  attemptId: string;
  leaseToken: string;
  outcomeCode: string;
  safeResult?: Record<string, unknown>;
}

export interface FinalizeFailureInputV1 extends Omit<
  FinalizeExecutionInputV1,
  'safeResult'
> {
  errorClass: string;
  safeResult?: Record<string, unknown>;
}

export interface FinalizeReconciliationInputV1 {
  tenantId: string;
  executionId: string;
  attemptId: string;
  leaseToken: string;
  outcome: ReconciliationOutcome;
  safeResult?: Record<string, unknown>;
}

export interface CapabilityRetryPolicyV1 {
  key: string;
  version: number;
  maxExecutionAttempts: number;
  retryablePreDispatchErrors: ReadonlySet<string>;
  backoffMs: readonly number[];
}

export interface CapabilityReconciliationPolicyV1 {
  key: string;
  version: number;
  maxInconclusiveAttempts: number;
  retryAfterProvenNonExecution: boolean;
}

export interface RegisteredActionCapabilityV1 {
  capability: string;
  capabilityVersion: number;
  actionClass: string;
  normalizedInputContract: string;
  targetKind: string;
  allowedSourceTypes: readonly ActionSourceType[];
  identityVersion: number;
  riskProfileVersion: number;
  riskFacets: readonly string[];
  policyKey: string;
  policyVersion: number;
  policyDecision: ActionPolicyDecision;
  autonomyLevel: string;
  approvalRequirement: 'NONE' | 'REQUIRED';
  approvalTtlMs?: number;
  retry: CapabilityRetryPolicyV1;
  reconciliation: CapabilityReconciliationPolicyV1;
  transportIdentityVersion: number;
  executorKey: string;
  executorVersion: number;
  payloadRetentionMs: number;
  auditRetentionMs: number;
  normalizeInput(input: unknown): Record<string, unknown>;
}

export interface NormalizedActionExecutionV1 {
  ownerReportSlot?: { runId: string; slotKey: string };
  bookingIntent?: {
    snapshot: ClientBookingSnapshot;
    hash: string;
    encrypted: string;
  };
  capability: RegisteredActionCapabilityV1;
  targetRef: string;
  normalizedInput: Record<string, unknown>;
  normalizedInputCanonical: string;
  normalizedInputHash: string;
  identityFingerprint: string;
  idempotencyScope?: string;
  requestIdempotencyKeyHash?: string;
}

export interface ActionExecutionAuditV1 {
  execution: ActionExecution;
  attempts: ActionAttempt[];
}

export interface ActionKernelMetricsV1 {
  total: number;
  active: number;
  unknown: number;
  succeeded: number;
  failed: number;
  notExecuted: number;
  attempts: number;
  externalSideEffects: 0;
}

export interface InitialDecisionV1 {
  policyDecision: ActionPolicyDecision;
  approvalDecision: ActionApprovalDecision;
  state: ActionExecution['state'];
  notExecutedReasonCode?: string;
}
