import { ActionContractError } from './action-engine.errors';

export const PACKAGE5_WAVE2_INPUT_CONTRACT =
  'maya.package5-wave2-authority-command-input/1' as const;

export const PACKAGE5_WAVE2_POLICY_VERSION =
  'package5.wave2.authority-command-policy.v1' as const;

export type Package5Wave2Operation =
  | 'configure_staff_access'
  | 'claim_team_owner'
  | 'revoke_other_session'
  | 'revoke_all_sessions'
  | 'link_social_identity'
  | 'update_tenant_configuration'
  | 'update_tenant_branding'
  | 'upload_tenant_logo'
  | 'create_tenant_user'
  | 'create_provider_user'
  | 'suspend_tenant'
  | 'reactivate_tenant'
  | 'create_tenant_branch';

export type Package5Wave2ActionClass =
  | 'configure_crm_staff_access'
  | 'claim_crm_team_owner'
  | 'revoke_other_auth_session'
  | 'revoke_all_auth_sessions'
  | 'link_social_auth_identity'
  | 'update_tenant_configuration'
  | 'update_tenant_branding'
  | 'upload_tenant_logo'
  | 'create_tenant_user'
  | 'create_internal_provider_user'
  | 'suspend_tenant'
  | 'reactivate_tenant'
  | 'create_tenant_branch';

export interface Package5Wave2Registration {
  operation: Package5Wave2Operation;
  actionClass: Package5Wave2ActionClass;
  family: 'A16' | 'A25' | 'A26';
  authorityClass: 'AC1' | 'AC2';
  targetKind:
    | 'staff_access'
    | 'auth_session'
    | 'auth_subject_sessions'
    | 'auth_identity'
    | 'tenant'
    | 'tenant_branding'
    | 'tenant_user'
    | 'internal_provider_user'
    | 'branch';
  shadowCapability: string;
  executableCapability: string;
}

function registration(
  operation: Package5Wave2Operation,
  actionClass: Package5Wave2ActionClass,
  family: Package5Wave2Registration['family'],
  authorityClass: Package5Wave2Registration['authorityClass'],
  targetKind: Package5Wave2Registration['targetKind'],
): Package5Wave2Registration {
  const capability = operation.replaceAll('_', '-');
  return {
    operation,
    actionClass,
    family,
    authorityClass,
    targetKind,
    shadowCapability: `package5.wave2.${capability}.shadow.v1`,
    executableCapability: `package5.wave2.${capability}.execute.v1`,
  };
}

export const PACKAGE5_WAVE2_REGISTRATIONS = Object.freeze([
  registration(
    'configure_staff_access',
    'configure_crm_staff_access',
    'A16',
    'AC1',
    'staff_access',
  ),
  registration(
    'claim_team_owner',
    'claim_crm_team_owner',
    'A16',
    'AC1',
    'staff_access',
  ),
  registration(
    'revoke_other_session',
    'revoke_other_auth_session',
    'A25',
    'AC1',
    'auth_session',
  ),
  registration(
    'revoke_all_sessions',
    'revoke_all_auth_sessions',
    'A25',
    'AC1',
    'auth_subject_sessions',
  ),
  registration(
    'link_social_identity',
    'link_social_auth_identity',
    'A25',
    'AC1',
    'auth_identity',
  ),
  registration(
    'update_tenant_configuration',
    'update_tenant_configuration',
    'A26',
    'AC1',
    'tenant',
  ),
  registration(
    'update_tenant_branding',
    'update_tenant_branding',
    'A26',
    'AC1',
    'tenant_branding',
  ),
  registration(
    'upload_tenant_logo',
    'upload_tenant_logo',
    'A26',
    'AC2',
    'tenant_branding',
  ),
  registration(
    'create_tenant_user',
    'create_tenant_user',
    'A26',
    'AC1',
    'tenant_user',
  ),
  registration(
    'create_provider_user',
    'create_internal_provider_user',
    'A26',
    'AC1',
    'internal_provider_user',
  ),
  registration('suspend_tenant', 'suspend_tenant', 'A26', 'AC1', 'tenant'),
  registration(
    'reactivate_tenant',
    'reactivate_tenant',
    'A26',
    'AC1',
    'tenant',
  ),
  registration(
    'create_tenant_branch',
    'create_tenant_branch',
    'A26',
    'AC1',
    'branch',
  ),
] satisfies readonly Package5Wave2Registration[]);

const HASH = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const ROLES = new Set([
  'platform_owner',
  'platform_admin',
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
  'provider',
  'employee',
  'staff',
  'client',
  'customer',
]);

const INPUT_KEYS = new Set([
  'operation',
  'targetKind',
  'targetRef',
  'mutationKey',
  'targetGeneration',
  'beforeStateHash',
  'afterStateHash',
  'desiredStateHash',
  'requestMaterialHash',
  'actorMembershipId',
  'actorRole',
  'actorIdentityHash',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'oneTargetCount',
  'bulkMutation',
  'changedFields',
  'intendedMutation',
  'mutationPerformed',
  'providerOperation',
  'providerRequestIdentityHash',
  'providerObjectContentHash',
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Package 5 Wave 2 input must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>) {
  const extras = Object.keys(value).filter((key) => !INPUT_KEYS.has(key));
  if (extras.length) {
    throw new ActionContractError(
      `Unexpected Package 5 Wave 2 input: ${extras.sort().join(', ')}`,
    );
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ActionContractError(`${label} must be a string`);
  }
  return value.trim();
}

function opaque(value: unknown, label: string): string {
  const normalized = text(value, label);
  if (!OPAQUE.test(normalized)) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
  return normalized;
}

function hash(value: unknown, label: string, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new ActionContractError(`${label} must be a SHA-256 digest`);
  }
  return value;
}

export function normalizePackage5Wave2Input(
  operation: Package5Wave2Operation,
  value: unknown,
): Record<string, unknown> {
  const input = object(value);
  exactKeys(input);
  const registration = PACKAGE5_WAVE2_REGISTRATIONS.find(
    (candidate) => candidate.operation === operation,
  );
  if (!registration) throw new ActionContractError('Wave 2 operation unknown');
  if (input.operation !== operation) {
    throw new ActionContractError('Wave 2 operation mismatch');
  }
  if (input.targetKind !== registration.targetKind) {
    throw new ActionContractError('Wave 2 target kind mismatch');
  }
  const targetGeneration = input.targetGeneration;
  if (!Number.isSafeInteger(targetGeneration) || Number(targetGeneration) < 0) {
    throw new ActionContractError('targetGeneration must be non-negative');
  }
  if (input.actorMembershipId !== null) {
    opaque(input.actorMembershipId, 'actorMembershipId');
  }
  if (!ROLES.has(text(input.actorRole, 'actorRole'))) {
    throw new ActionContractError('actorRole is not allowlisted');
  }
  const changedFields = input.changedFields;
  if (
    !Array.isArray(changedFields) ||
    changedFields.length < 1 ||
    changedFields.length > 24 ||
    changedFields.some(
      (field) =>
        typeof field !== 'string' || !/^[a-z][a-zA-Z0-9_]{0,63}$/.test(field),
    )
  ) {
    throw new ActionContractError('changedFields is invalid');
  }
  const providerOperation = input.providerOperation;
  const providerIdentity = input.providerRequestIdentityHash;
  const providerObjectContentHash = input.providerObjectContentHash;
  if (registration.authorityClass === 'AC2') {
    if (providerOperation !== 'object_store_put') {
      throw new ActionContractError('AC2 provider operation is invalid');
    }
    hash(providerIdentity, 'providerRequestIdentityHash');
    hash(providerObjectContentHash, 'providerObjectContentHash');
  } else if (
    providerOperation !== null ||
    providerIdentity !== null ||
    providerObjectContentHash !== null
  ) {
    throw new ActionContractError('Local Wave 2 action cannot dispatch');
  }
  if (
    input.policyVersion !== PACKAGE5_WAVE2_POLICY_VERSION ||
    input.approvalRequirement !== 'SERVER_DERIVED_AUTHORITY' ||
    input.oneTargetCount !== 1 ||
    input.bulkMutation !== false ||
    input.mutationPerformed !== false ||
    input.intendedMutation !== operation
  ) {
    throw new ActionContractError('Wave 2 authority contract is invalid');
  }
  return {
    operation,
    targetKind: registration.targetKind,
    targetRef: opaque(input.targetRef, 'targetRef'),
    mutationKey: opaque(input.mutationKey, 'mutationKey'),
    targetGeneration,
    beforeStateHash: hash(input.beforeStateHash, 'beforeStateHash', true),
    afterStateHash: hash(input.afterStateHash, 'afterStateHash'),
    desiredStateHash: hash(input.desiredStateHash, 'desiredStateHash'),
    requestMaterialHash: hash(input.requestMaterialHash, 'requestMaterialHash'),
    actorMembershipId:
      input.actorMembershipId === null
        ? null
        : opaque(input.actorMembershipId, 'actorMembershipId'),
    actorRole: text(input.actorRole, 'actorRole'),
    actorIdentityHash: hash(input.actorIdentityHash, 'actorIdentityHash'),
    policyVersion: PACKAGE5_WAVE2_POLICY_VERSION,
    policySnapshotHash: hash(input.policySnapshotHash, 'policySnapshotHash'),
    approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    changedFields: [...new Set(changedFields as string[])].sort(),
    intendedMutation: operation,
    mutationPerformed: false,
    providerOperation,
    providerRequestIdentityHash: providerIdentity,
    providerObjectContentHash,
  };
}
