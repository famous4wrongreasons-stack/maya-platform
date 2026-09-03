import { ActionContractError } from './action-engine.errors';

export const PACKAGE5_WAVE3_INPUT_CONTRACT =
  'maya.package5-wave3-authority-command-input/1' as const;
export const PACKAGE5_WAVE3_POLICY_VERSION =
  'package5.wave3.authority-command-policy.v1' as const;

export type Package5Wave3Operation =
  | 'update_staff_schedule_day'
  | 'install_crm_credentials'
  | 'activate_crm_integration'
  | 'confirm_crm_import'
  | 'disconnect_crm_integration'
  | 'update_client_profile'
  | 'record_client_consent'
  | 'update_client_notes';

export type Package5Wave3ActionClass =
  | 'update_external_staff_schedule_day'
  | 'install_or_replace_crm_credentials'
  | 'activate_crm_integration'
  | 'confirm_crm_import'
  | 'disconnect_crm_integration'
  | 'update_client_profile'
  | 'record_client_consent'
  | 'update_client_notes';

export interface Package5Wave3Registration {
  operation: Package5Wave3Operation;
  actionClass: Package5Wave3ActionClass;
  family: 'A15' | 'A17' | 'A18';
  authorityClass: 'AC1' | 'AC2';
  targetKind:
    | 'staff_schedule_day'
    | 'crm_integration'
    | 'client_profile'
    | 'client_consent'
    | 'client_notes';
  shadowCapability: string;
  executableCapability: string;
}

function define(
  operation: Package5Wave3Operation,
  actionClass: Package5Wave3ActionClass,
  family: Package5Wave3Registration['family'],
  authorityClass: Package5Wave3Registration['authorityClass'],
  targetKind: Package5Wave3Registration['targetKind'],
): Package5Wave3Registration {
  const slug = operation.replaceAll('_', '-');
  return {
    operation,
    actionClass,
    family,
    authorityClass,
    targetKind,
    shadowCapability: `package5.wave3.${slug}.shadow.v1`,
    executableCapability: `package5.wave3.${slug}.execute.v1`,
  };
}

export const PACKAGE5_WAVE3_REGISTRATIONS = Object.freeze([
  define(
    'update_staff_schedule_day',
    'update_external_staff_schedule_day',
    'A15',
    'AC2',
    'staff_schedule_day',
  ),
  define(
    'install_crm_credentials',
    'install_or_replace_crm_credentials',
    'A17',
    'AC1',
    'crm_integration',
  ),
  define(
    'activate_crm_integration',
    'activate_crm_integration',
    'A17',
    'AC1',
    'crm_integration',
  ),
  define(
    'confirm_crm_import',
    'confirm_crm_import',
    'A17',
    'AC1',
    'crm_integration',
  ),
  define(
    'disconnect_crm_integration',
    'disconnect_crm_integration',
    'A17',
    'AC1',
    'crm_integration',
  ),
  define(
    'update_client_profile',
    'update_client_profile',
    'A18',
    'AC1',
    'client_profile',
  ),
  define(
    'record_client_consent',
    'record_client_consent',
    'A18',
    'AC1',
    'client_consent',
  ),
  define(
    'update_client_notes',
    'update_client_notes',
    'A18',
    'AC1',
    'client_notes',
  ),
] satisfies readonly Package5Wave3Registration[]);

const HASH = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const ROLES = new Set([
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
  'expectedProviderRevision',
  'credentialFingerprint',
  'providerSnapshotHash',
  'notesFingerprint',
  'clientId',
  'consentKind',
  'consentDecision',
  'consentOccurredAt',
  'consentEffectiveAt',
  'sourceIdentityHash',
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ActionContractError('Wave 3 input must be an object');
  return value as Record<string, unknown>;
}
function text(input: Record<string, unknown>, key: string, nullable = false) {
  const raw = input[key];
  if (nullable && raw === null) return null;
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 240)
    throw new ActionContractError(`${key} must be bounded text`);
  return raw.trim();
}
function opaque(input: Record<string, unknown>, key: string, nullable = false) {
  const value = text(input, key, nullable);
  if (value !== null && !OPAQUE.test(value))
    throw new ActionContractError(`${key} must be opaque`);
  return value;
}
function hash(input: Record<string, unknown>, key: string, nullable = false) {
  const value = input[key];
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !HASH.test(value))
    throw new ActionContractError(`${key} must be a SHA-256 digest`);
  return value;
}

function instant(
  input: Record<string, unknown>,
  key: string,
  nullable = false,
) {
  const value = input[key];
  if (nullable && value == null) return null;
  if (typeof value !== 'string')
    throw new ActionContractError(`${key} must be an ISO instant`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value)
    throw new ActionContractError(`${key} must be an ISO instant`);
  return value;
}

export function normalizePackage5Wave3Input(
  operation: Package5Wave3Operation,
  value: unknown,
): Record<string, unknown> {
  const input = object(value);
  const extras = Object.keys(input).filter((key) => !KEYS.has(key));
  if (extras.length)
    throw new ActionContractError(
      `Unexpected Wave 3 input: ${extras.sort().join(', ')}`,
    );
  const registration = PACKAGE5_WAVE3_REGISTRATIONS.find(
    (row) => row.operation === operation,
  );
  if (!registration || input.operation !== operation)
    throw new ActionContractError('Wave 3 operation mismatch');
  const approval =
    registration.family === 'A17'
      ? 'SERVER_DERIVED_OWNER_AUTHORITY'
      : 'SERVER_DERIVED_AUTHORITY';
  if (
    input.targetKind !== registration.targetKind ||
    input.policyVersion !== PACKAGE5_WAVE3_POLICY_VERSION ||
    input.approvalRequirement !== approval ||
    input.oneTargetCount !== 1 ||
    input.bulkMutation !== false ||
    input.mutationPerformed !== false
  )
    throw new ActionContractError('Wave 3 authority/mutation boundary invalid');
  if (
    !Number.isSafeInteger(input.targetGeneration) ||
    Number(input.targetGeneration) < 0
  )
    throw new ActionContractError('targetGeneration invalid');
  const fields = input.changedFields;
  if (
    !Array.isArray(fields) ||
    fields.length < 1 ||
    fields.length > 16 ||
    fields.some((field) => typeof field !== 'string' || !OPAQUE.test(field))
  )
    throw new ActionContractError('changedFields invalid');
  const role = text(input, 'actorRole');
  if (!ROLES.has(role!)) throw new ActionContractError('actorRole invalid');
  const normalized: Record<string, unknown> = {
    operation,
    targetKind: registration.targetKind,
    targetRef: opaque(input, 'targetRef'),
    mutationKey: opaque(input, 'mutationKey'),
    targetGeneration: input.targetGeneration,
    beforeStateHash: hash(input, 'beforeStateHash', true),
    afterStateHash: hash(input, 'afterStateHash'),
    desiredStateHash: hash(input, 'desiredStateHash'),
    requestMaterialHash: hash(input, 'requestMaterialHash'),
    actorMembershipId: opaque(input, 'actorMembershipId'),
    actorRole: role,
    actorIdentityHash: hash(input, 'actorIdentityHash'),
    policyVersion: PACKAGE5_WAVE3_POLICY_VERSION,
    policySnapshotHash: hash(input, 'policySnapshotHash'),
    approvalRequirement: approval,
    oneTargetCount: 1,
    bulkMutation: false,
    changedFields: [...new Set(fields as string[])].sort(),
    intendedMutation: operation,
    mutationPerformed: false,
    providerOperation: text(input, 'providerOperation', true),
    providerRequestIdentityHash: hash(
      input,
      'providerRequestIdentityHash',
      true,
    ),
    expectedProviderRevision: hash(input, 'expectedProviderRevision', true),
    credentialFingerprint: hash(input, 'credentialFingerprint', true),
    providerSnapshotHash: hash(input, 'providerSnapshotHash', true),
    notesFingerprint: hash(input, 'notesFingerprint', true),
    clientId: opaque(input, 'clientId', true),
    consentKind: opaque(input, 'consentKind', true),
    consentDecision: opaque(input, 'consentDecision', true),
    consentOccurredAt: instant(input, 'consentOccurredAt', true),
    consentEffectiveAt: instant(input, 'consentEffectiveAt', true),
    sourceIdentityHash: hash(input, 'sourceIdentityHash', true),
  };
  if (registration.authorityClass === 'AC2') {
    if (
      normalized.providerOperation !== 'replace_staff_day' ||
      !normalized.providerRequestIdentityHash ||
      !normalized.expectedProviderRevision
    )
      throw new ActionContractError('A15 provider identity incomplete');
  } else if (
    normalized.providerOperation !== null ||
    normalized.providerRequestIdentityHash !== null ||
    normalized.expectedProviderRevision !== null
  ) {
    throw new ActionContractError(
      'Local action cannot claim provider dispatch',
    );
  }
  if (
    operation === 'install_crm_credentials' &&
    !normalized.credentialFingerprint
  )
    throw new ActionContractError('Credential fingerprint required');
  if (operation === 'confirm_crm_import' && !normalized.providerSnapshotHash)
    throw new ActionContractError('Import snapshot identity required');
  if (registration.family === 'A18' && !normalized.clientId)
    throw new ActionContractError('Exact Client required');
  if (operation === 'update_client_notes' && !normalized.notesFingerprint)
    throw new ActionContractError('Notes fingerprint required');
  if (
    operation === 'record_client_consent' &&
    (!normalized.consentKind ||
      !normalized.consentDecision ||
      !normalized.consentOccurredAt ||
      !normalized.consentEffectiveAt ||
      !normalized.sourceIdentityHash)
  )
    throw new ActionContractError('Consent identity incomplete');
  return normalized;
}
