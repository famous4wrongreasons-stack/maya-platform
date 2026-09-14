import { ActionContractError } from './action-engine.errors';

export const PACKAGE5_WAVE5_INPUT_CONTRACT =
  'maya.package5-wave5-recovery-attribution-correction-input/1' as const;

export const PACKAGE5_WAVE5_POLICY_VERSION =
  'package5.wave5.recovery-attribution-correction-policy.v1' as const;

export type Package5Wave5ActionClass = 'correct_recovery_attribution';

export interface Package5Wave5Registration {
  operation: Package5Wave5ActionClass;
  actionClass: Package5Wave5ActionClass;
  family: 'A29';
  authorityClass: 'AC1';
  targetKind: 'recovery_attribution';
  shadowCapability: string;
  executableCapability: string;
}

export const PACKAGE5_WAVE5_REGISTRATIONS = Object.freeze([
  {
    operation: 'correct_recovery_attribution',
    actionClass: 'correct_recovery_attribution',
    family: 'A29',
    authorityClass: 'AC1',
    targetKind: 'recovery_attribution',
    shadowCapability:
      'package5.wave5.recovery-attribution-correction.shadow.v1',
    executableCapability:
      'package5.wave5.recovery-attribution-correction.execute.v1',
  },
] satisfies readonly Package5Wave5Registration[]);

const HASH = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
]);
const CORRECTION_REASONS = new Set([
  'authoritative_source_correction',
  'operator_evidence_correction',
]);
const KEYS = new Set([
  'operation',
  'targetKind',
  'targetRef',
  'mutationKey',
  'targetGeneration',
  'beforeStateHash',
  'afterStateHash',
  'requestMaterialHash',
  'sourceEvidenceEventId',
  'sourceEvidenceHash',
  'reasonCode',
  'actorMembershipId',
  'actorRole',
  'actorIdentityHash',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'oneTargetCount',
  'bulkMutation',
  'immutableSourceFacts',
  'mutationPerformed',
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Wave 5 input must be an object');
  }
  return value as Record<string, unknown>;
}

function opaque(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !OPAQUE.test(value)) {
    throw new ActionContractError(`${key} must be opaque`);
  }
  return value;
}

function hash(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new ActionContractError(`${key} must be a SHA-256 digest`);
  }
  return value;
}

export function normalizePackage5Wave5Input(
  value: unknown,
): Record<string, unknown> {
  const input = record(value);
  const extras = Object.keys(input).filter((key) => !KEYS.has(key));
  if (extras.length > 0) {
    throw new ActionContractError(
      `Unexpected Wave 5 input: ${extras.sort().join(', ')}`,
    );
  }
  if (
    input.operation !== 'correct_recovery_attribution' ||
    input.targetKind !== 'recovery_attribution' ||
    input.policyVersion !== PACKAGE5_WAVE5_POLICY_VERSION ||
    input.approvalRequirement !== 'OWNER_APPROVAL_REQUIRED' ||
    input.oneTargetCount !== 1 ||
    input.bulkMutation !== false ||
    input.immutableSourceFacts !== true ||
    input.mutationPerformed !== false
  ) {
    throw new ActionContractError('Wave 5 authority boundary is invalid');
  }
  const generation = input.targetGeneration;
  if (!Number.isSafeInteger(generation) || Number(generation) < 0) {
    throw new ActionContractError('targetGeneration must be non-negative');
  }
  const role = opaque(input, 'actorRole');
  if (!ROLES.has(role)) {
    throw new ActionContractError('actorRole is not allowlisted');
  }
  const reasonCode = opaque(input, 'reasonCode');
  if (!CORRECTION_REASONS.has(reasonCode)) {
    throw new ActionContractError('reasonCode is not allowlisted');
  }
  return {
    operation: 'correct_recovery_attribution',
    targetKind: 'recovery_attribution',
    targetRef: opaque(input, 'targetRef'),
    mutationKey: opaque(input, 'mutationKey'),
    targetGeneration: Number(generation),
    beforeStateHash: hash(input, 'beforeStateHash'),
    afterStateHash: hash(input, 'afterStateHash'),
    requestMaterialHash: hash(input, 'requestMaterialHash'),
    sourceEvidenceEventId: opaque(input, 'sourceEvidenceEventId'),
    sourceEvidenceHash: hash(input, 'sourceEvidenceHash'),
    reasonCode,
    actorMembershipId: opaque(input, 'actorMembershipId'),
    actorRole: role,
    actorIdentityHash: hash(input, 'actorIdentityHash'),
    policyVersion: PACKAGE5_WAVE5_POLICY_VERSION,
    policySnapshotHash: hash(input, 'policySnapshotHash'),
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    oneTargetCount: 1,
    bulkMutation: false,
    immutableSourceFacts: true,
    mutationPerformed: false,
  };
}
