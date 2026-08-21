import { ActionPolicyDecision } from '@prisma/client';

import { ActionContractError } from './action-engine.errors';
import type { RegisteredActionCapabilityV1 } from './action-engine.contract';

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

export function normalizeOpaqueRef(value: unknown, label: string): string {
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
  return value;
}

function optionalOpaqueField(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return normalizeOpaqueRef(value, key);
}

function oneRefNormalizer(key: string) {
  return (value: unknown): Record<string, unknown> => {
    const source = recordInput(value);
    const normalized = optionalOpaqueField(source, key);
    return normalized ? { [key]: normalized } : {};
  };
}

function syntheticNormalizer(value: unknown): Record<string, unknown> {
  const source = recordInput(value);
  return {
    valueRef: normalizeOpaqueRef(source.valueRef, 'valueRef'),
  };
}

const DAY = 24 * 60 * 60 * 1_000;

function shadowCapability(input: {
  capability: string;
  actionClass: string;
  targetKind: string;
  inputKey: string;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: `maya.${input.actionClass}-input/1`,
    targetKind: input.targetKind,
    allowedSourceTypes: ['agent_task'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'reversible'],
    policyKey: 'chapter5.l2_5-shadow',
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.SHADOW_ONLY,
    autonomyLevel: 'L2_5_SHADOW',
    approvalRequirement: 'NONE',
    retry: {
      key: 'shadow.no-execution',
      version: 1,
      maxExecutionAttempts: 1,
      retryablePreDispatchErrors: new Set<string>(),
      backoffMs: [],
    },
    reconciliation: {
      key: 'shadow.not-required',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey: 'shadow.none',
    executorVersion: 1,
    payloadRetentionMs: 7 * DAY,
    auditRetentionMs: 90 * DAY,
    normalizeInput: oneRefNormalizer(input.inputKey),
  };
}

function syntheticCapability(input: {
  capability: string;
  actionClass: string;
  policyDecision?: ActionPolicyDecision;
  approvalRequired?: boolean;
  maxExecutionAttempts: number;
  retryablePreDispatchErrors?: readonly string[];
  retryAfterProvenNonExecution: boolean;
  maxInconclusiveAttempts?: number;
}): RegisteredActionCapabilityV1 {
  return {
    capability: input.capability,
    capabilityVersion: 1,
    actionClass: input.actionClass,
    normalizedInputContract: 'maya.kernel-synthetic-input/1',
    targetKind: 'synthetic_target',
    allowedSourceTypes: ['synthetic_shadow'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets: ['local', 'reversible'],
    policyKey: `kernel.synthetic.${input.actionClass}`,
    policyVersion: 1,
    policyDecision: input.policyDecision ?? ActionPolicyDecision.ALLOW,
    autonomyLevel: 'KERNEL_TEST_ONLY',
    approvalRequirement: input.approvalRequired ? 'REQUIRED' : 'NONE',
    approvalTtlMs: input.approvalRequired ? 15 * 60 * 1_000 : undefined,
    retry: {
      key: `kernel.${input.actionClass}.retry`,
      version: 1,
      maxExecutionAttempts: input.maxExecutionAttempts,
      retryablePreDispatchErrors: new Set(
        input.retryablePreDispatchErrors ?? [],
      ),
      backoffMs: [0],
    },
    reconciliation: {
      key: `kernel.${input.actionClass}.reconcile`,
      version: 1,
      maxInconclusiveAttempts: input.maxInconclusiveAttempts ?? 2,
      retryAfterProvenNonExecution: input.retryAfterProvenNonExecution,
    },
    transportIdentityVersion: 1,
    executorKey: `synthetic.${input.actionClass}`,
    executorVersion: 1,
    payloadRetentionMs: DAY,
    auditRetentionMs: 30 * DAY,
    normalizeInput: syntheticNormalizer,
  };
}

const CAPABILITIES: readonly RegisteredActionCapabilityV1[] = [
  shadowCapability({
    capability: 'client-lifecycle.reactivation-review.prepare',
    actionClass: 'prepare_reactivation_review',
    targetKind: 'client',
    inputKey: 'clientRef',
  }),
  shadowCapability({
    capability: 'occupancy.recovery-options.prepare',
    actionClass: 'prepare_recovery_options',
    targetKind: 'appointment',
    inputKey: 'intervalRef',
  }),
  shadowCapability({
    capability: 'admin.response-draft.prepare',
    actionClass: 'prepare_response_draft',
    targetKind: 'request',
    inputKey: 'requestRef',
  }),
  syntheticCapability({
    capability: 'kernel.test.safe-retry',
    actionClass: 'kernel_safe_retry',
    maxExecutionAttempts: 2,
    retryablePreDispatchErrors: ['synthetic_transient_predispatch'],
    retryAfterProvenNonExecution: true,
  }),
  syntheticCapability({
    capability: 'kernel.test.no-retry',
    actionClass: 'kernel_no_retry',
    maxExecutionAttempts: 1,
    retryAfterProvenNonExecution: false,
  }),
  syntheticCapability({
    capability: 'kernel.test.reconcile-before-retry',
    actionClass: 'kernel_reconcile_before_retry',
    maxExecutionAttempts: 2,
    retryAfterProvenNonExecution: true,
  }),
  syntheticCapability({
    capability: 'kernel.test.approval',
    actionClass: 'kernel_approval',
    approvalRequired: true,
    maxExecutionAttempts: 1,
    retryAfterProvenNonExecution: false,
  }),
  syntheticCapability({
    capability: 'kernel.test.denied',
    actionClass: 'kernel_denied',
    policyDecision: ActionPolicyDecision.DENY,
    maxExecutionAttempts: 1,
    retryAfterProvenNonExecution: false,
  }),
];

export class ActionCapabilityRegistry {
  private readonly capabilities = new Map(
    CAPABILITIES.map((capability) => [capability.capability, capability]),
  );

  get(capabilityKey: string): RegisteredActionCapabilityV1 {
    const capability = this.capabilities.get(capabilityKey);
    if (!capability) {
      throw new ActionContractError(
        `Capability is not registered for the Phase B1 kernel: ${capabilityKey}`,
      );
    }
    return capability;
  }

  assertActionClass(capabilityKey: string, actionClass: string): void {
    const capability = this.get(capabilityKey);
    if (capability.actionClass !== actionClass) {
      throw new ActionContractError(
        'Action class does not match the trusted capability registry',
      );
    }
  }

  list(): readonly RegisteredActionCapabilityV1[] {
    return [...this.capabilities.values()];
  }
}
