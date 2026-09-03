import { ActionContractError } from './action-engine.errors';

export const PACKAGE5_WAVE4_INPUT_CONTRACT =
  'maya.package5-wave4-catalog-calendar-command-input/1' as const;

export const PACKAGE5_WAVE4_POLICY_VERSION =
  'package5.wave4.catalog-calendar-policy.v1' as const;

export type Package5Wave4Operation =
  | 'create_inventory_item'
  | 'update_inventory_item'
  | 'archive_inventory_item'
  | 'create_internal_service'
  | 'update_internal_service'
  | 'archive_internal_service'
  | 'create_internal_provider'
  | 'update_internal_provider'
  | 'replace_weekly_availability'
  | 'create_time_off'
  | 'delete_time_off'
  | 'upload_provider_avatar';

export type Package5Wave4ActionClass = Package5Wave4Operation;

export interface Package5Wave4Registration {
  operation: Package5Wave4Operation;
  actionClass: Package5Wave4ActionClass;
  family: 'A27' | 'A28';
  authorityClass: 'AC1' | 'AC2';
  targetKind:
    | 'inventory_item'
    | 'internal_service'
    | 'internal_provider'
    | 'internal_weekly_availability'
    | 'internal_time_off'
    | 'internal_provider_avatar';
  shadowCapability: string;
  executableCapability: string;
}

function define(
  operation: Package5Wave4Operation,
  family: Package5Wave4Registration['family'],
  authorityClass: Package5Wave4Registration['authorityClass'],
  targetKind: Package5Wave4Registration['targetKind'],
): Package5Wave4Registration {
  const slug = operation.replaceAll('_', '-');
  return {
    operation,
    actionClass: operation,
    family,
    authorityClass,
    targetKind,
    shadowCapability: `package5.wave4.${slug}.shadow.v1`,
    executableCapability: `package5.wave4.${slug}.execute.v1`,
  };
}

export const PACKAGE5_WAVE4_REGISTRATIONS = Object.freeze([
  define('create_inventory_item', 'A27', 'AC1', 'inventory_item'),
  define('update_inventory_item', 'A27', 'AC1', 'inventory_item'),
  define('archive_inventory_item', 'A27', 'AC1', 'inventory_item'),
  define('create_internal_service', 'A28', 'AC1', 'internal_service'),
  define('update_internal_service', 'A28', 'AC1', 'internal_service'),
  define('archive_internal_service', 'A28', 'AC1', 'internal_service'),
  define('create_internal_provider', 'A28', 'AC1', 'internal_provider'),
  define('update_internal_provider', 'A28', 'AC1', 'internal_provider'),
  define(
    'replace_weekly_availability',
    'A28',
    'AC1',
    'internal_weekly_availability',
  ),
  define('create_time_off', 'A28', 'AC1', 'internal_time_off'),
  define('delete_time_off', 'A28', 'AC1', 'internal_time_off'),
  define('upload_provider_avatar', 'A28', 'AC2', 'internal_provider_avatar'),
] satisfies readonly Package5Wave4Registration[]);

const HASH = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
]);
const KEYS = new Set([
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

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Wave 4 input must be an object');
  }
  return value as Record<string, unknown>;
}

function text(input: Record<string, unknown>, key: string, nullable = false) {
  const value = input[key];
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 240) {
    throw new ActionContractError(`${key} must be bounded text`);
  }
  return value.trim();
}

function opaque(input: Record<string, unknown>, key: string, nullable = false) {
  const value = text(input, key, nullable);
  if (value !== null && !OPAQUE.test(value)) {
    throw new ActionContractError(`${key} must be opaque`);
  }
  return value;
}

function hash(input: Record<string, unknown>, key: string, nullable = false) {
  const value = input[key];
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw new ActionContractError(`${key} must be a SHA-256 digest`);
  }
  return value;
}

export function normalizePackage5Wave4Input(
  operation: Package5Wave4Operation,
  value: unknown,
): Record<string, unknown> {
  const input = record(value);
  const extras = Object.keys(input).filter((key) => !KEYS.has(key));
  if (extras.length) {
    throw new ActionContractError(
      `Unexpected Wave 4 input: ${extras.sort().join(', ')}`,
    );
  }
  const registration = PACKAGE5_WAVE4_REGISTRATIONS.find(
    (candidate) => candidate.operation === operation,
  );
  if (!registration || input.operation !== operation) {
    throw new ActionContractError('Wave 4 operation is not canonical');
  }
  if (
    input.targetKind !== registration.targetKind ||
    input.policyVersion !== PACKAGE5_WAVE4_POLICY_VERSION ||
    input.approvalRequirement !== 'SERVER_DERIVED_AUTHORITY' ||
    input.oneTargetCount !== 1 ||
    input.bulkMutation !== false ||
    input.mutationPerformed !== false
  ) {
    throw new ActionContractError('Wave 4 authority boundary is invalid');
  }
  const generation = input.targetGeneration;
  if (!Number.isSafeInteger(generation) || Number(generation) < 0) {
    throw new ActionContractError('targetGeneration must be non-negative');
  }
  const role = opaque(input, 'actorRole');
  if (!role || !ROLES.has(role)) {
    throw new ActionContractError('actorRole is not allowlisted');
  }
  const changedFields = input.changedFields;
  if (
    !Array.isArray(changedFields) ||
    changedFields.length < 1 ||
    changedFields.length > 16 ||
    changedFields.some(
      (field) => typeof field !== 'string' || !OPAQUE.test(field),
    )
  ) {
    throw new ActionContractError('changedFields is invalid or unbounded');
  }
  const external = registration.authorityClass === 'AC2';
  const providerOperation = opaque(input, 'providerOperation', true);
  const providerRequestIdentityHash = hash(
    input,
    'providerRequestIdentityHash',
    true,
  );
  const providerObjectContentHash = hash(
    input,
    'providerObjectContentHash',
    true,
  );
  if (
    (external &&
      (!providerOperation ||
        !providerRequestIdentityHash ||
        !providerObjectContentHash)) ||
    (!external &&
      (providerOperation !== null ||
        providerRequestIdentityHash !== null ||
        providerObjectContentHash !== null))
  ) {
    throw new ActionContractError('Wave 4 provider boundary is invalid');
  }
  return {
    operation,
    targetKind: registration.targetKind,
    targetRef: opaque(input, 'targetRef'),
    mutationKey: opaque(input, 'mutationKey'),
    targetGeneration: Number(generation),
    beforeStateHash: hash(input, 'beforeStateHash', true),
    afterStateHash: hash(input, 'afterStateHash'),
    desiredStateHash: hash(input, 'desiredStateHash'),
    requestMaterialHash: hash(input, 'requestMaterialHash'),
    actorMembershipId: opaque(input, 'actorMembershipId'),
    actorRole: role,
    actorIdentityHash: hash(input, 'actorIdentityHash'),
    policyVersion: PACKAGE5_WAVE4_POLICY_VERSION,
    policySnapshotHash: hash(input, 'policySnapshotHash'),
    approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
    oneTargetCount: 1,
    bulkMutation: false,
    changedFields: [...new Set(changedFields)].sort(),
    intendedMutation: text(input, 'intendedMutation'),
    mutationPerformed: false,
    providerOperation,
    providerRequestIdentityHash,
    providerObjectContentHash,
  };
}
