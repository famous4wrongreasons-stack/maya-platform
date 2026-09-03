import type { ActionSourceType } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';

export const P4_10_ACTION_CLASSES = [
  'connect_commerce_payment_credentials',
  'replace_commerce_payment_credentials',
  'recheck_commerce_payment_credentials',
  'disconnect_commerce_payment_credentials',
] as const;

export type P410ActionClass = (typeof P4_10_ACTION_CLASSES)[number];
export type P410Operation = 'connect' | 'replace' | 'recheck' | 'disconnect';

export const P4_10_POLICY_VERSION =
  'p4-10.tenant-commerce-credential-authority.v1' as const;
export const P4_10_INPUT_CONTRACT =
  'maya.p4-10-commerce-payment-credential-input/1' as const;

export const P4_10_SAFETY_LIMITS = Object.freeze({
  oneTenantPerMutation: 1,
  oneProviderPerMutation: 1,
  bulkMutationAllowed: false,
  supportedProvider: 'yookassa',
});

export const P4_10_SHADOW_CAPABILITIES = Object.freeze({
  connect: 'commerce-credentials.connect.shadow.v1',
  replace: 'commerce-credentials.replace.shadow.v1',
  recheck: 'commerce-credentials.recheck.shadow.v1',
  disconnect: 'commerce-credentials.disconnect.shadow.v1',
});

export const P4_10_EXECUTABLE_CAPABILITIES = Object.freeze({
  connect: 'commerce-credentials.connect.execute.v1',
  replace: 'commerce-credentials.replace.execute.v1',
  recheck: 'commerce-credentials.recheck.execute.v1',
  disconnect: 'commerce-credentials.disconnect.execute.v1',
});

export interface P410Registration {
  operation: P410Operation;
  actionClass: P410ActionClass;
  shadowCapability: string;
  executableCapability: string;
  allowedSourceTypes: readonly ActionSourceType[];
  normalizeInput(value: unknown): Record<string, unknown>;
}

const OPAQUE = /^[A-Za-z0-9._:/-]{1,240}$/;
const OPERATIONS: Readonly<Record<P410Operation, P410ActionClass>> = {
  connect: 'connect_commerce_payment_credentials',
  replace: 'replace_commerce_payment_credentials',
  recheck: 'recheck_commerce_payment_credentials',
  disconnect: 'disconnect_commerce_payment_credentials',
};

const INPUT_KEYS = [
  'integrationId',
  'provider',
  'expectedStateHash',
  'currentCredentialSetFingerprint',
  'desiredCredentialSetFingerprint',
  'shopIdFingerprint',
  'actorMembershipId',
  'actorRole',
  'policyVersion',
  'policySnapshotHash',
  'approvalRequirement',
  'oneTenantCount',
  'oneProviderCount',
  'bulkMutation',
  'providerOperation',
  'intendedMutation',
  'credentialWritePerformed',
  'providerWrites',
] as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('P4-10 input must be an object');
  }
  return value as Record<string, unknown>;
}

function only(source: Record<string, unknown>): void {
  const allowed = new Set<string>(INPUT_KEYS);
  const extras = Object.keys(source).filter((key) => !allowed.has(key));
  if (extras.length) {
    throw new ActionContractError(
      `Unexpected P4-10 input: ${extras.sort().join(', ')}`,
    );
  }
}

function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function nullableOpaque(
  source: Record<string, unknown>,
  key: string,
): string | null {
  return source[key] === null ? null : opaque(source, key);
}

function normalizer(operation: P410Operation) {
  return (value: unknown): Record<string, unknown> => {
    const source = record(value);
    only(source);
    const current = nullableOpaque(source, 'currentCredentialSetFingerprint');
    const desired = nullableOpaque(source, 'desiredCredentialSetFingerprint');
    const shop = nullableOpaque(source, 'shopIdFingerprint');
    const requiresDesired = operation === 'connect' || operation === 'replace';
    const requiresCurrent = operation !== 'connect';
    if (
      (requiresDesired && (!desired || !shop)) ||
      (!requiresDesired && (desired !== null || shop !== null)) ||
      (requiresCurrent && !current) ||
      (!requiresCurrent && current !== null)
    ) {
      throw new ActionContractError(
        'Credential fingerprints do not match the canonical transition',
      );
    }
    const providerOperation =
      operation === 'disconnect' ? 'NONE' : 'READ_ONLY_CREDENTIAL_VERIFY';
    if (
      source.provider !== P4_10_SAFETY_LIMITS.supportedProvider ||
      source.policyVersion !== P4_10_POLICY_VERSION ||
      source.approvalRequirement !== 'AUTHORIZED_ACTOR' ||
      source.oneTenantCount !== P4_10_SAFETY_LIMITS.oneTenantPerMutation ||
      source.oneProviderCount !== P4_10_SAFETY_LIMITS.oneProviderPerMutation ||
      source.bulkMutation !== false ||
      source.providerOperation !== providerOperation ||
      source.intendedMutation !== `${operation}_commerce_credentials` ||
      source.credentialWritePerformed !== false ||
      source.providerWrites !== 0
    ) {
      throw new ActionContractError(
        'P4-10 authority, scope, or mutation boundary is invalid',
      );
    }
    return {
      integrationId: opaque(source, 'integrationId'),
      provider: P4_10_SAFETY_LIMITS.supportedProvider,
      expectedStateHash: opaque(source, 'expectedStateHash'),
      currentCredentialSetFingerprint: current,
      desiredCredentialSetFingerprint: desired,
      shopIdFingerprint: shop,
      actorMembershipId: opaque(source, 'actorMembershipId'),
      actorRole: opaque(source, 'actorRole'),
      policyVersion: P4_10_POLICY_VERSION,
      policySnapshotHash: opaque(source, 'policySnapshotHash'),
      approvalRequirement: 'AUTHORIZED_ACTOR',
      oneTenantCount: 1,
      oneProviderCount: 1,
      bulkMutation: false,
      providerOperation,
      intendedMutation: `${operation}_commerce_credentials`,
      credentialWritePerformed: false,
      providerWrites: 0,
    };
  };
}

export const P4_10_REGISTRATIONS: readonly P410Registration[] = (
  Object.keys(OPERATIONS) as P410Operation[]
).map((operation) => ({
  operation,
  actionClass: OPERATIONS[operation],
  shadowCapability: P4_10_SHADOW_CAPABILITIES[operation],
  executableCapability: P4_10_EXECUTABLE_CAPABILITIES[operation],
  allowedSourceTypes: ['authenticated_request', 'synthetic_shadow'],
  normalizeInput: normalizer(operation),
}));
