import { ActionContractError } from './action-engine.errors';

export const CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_CAPABILITY =
  'customer-subscriptions.expiry.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_INPUT_CONTRACT =
  'maya.expire_customer_subscription-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-expiry.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION =
  'p4-05.immutable-term-expiry.v1' as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionContractError('Action input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  source: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(source).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new ActionContractError(
      `Unexpected action input: ${unexpected.join(', ')}`,
    );
  }
}

function opaque(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new ActionContractError(`${key} must be an opaque reference`);
  }
  return value;
}

function isoInstant(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (
    typeof value !== 'string' ||
    !ISO_INSTANT_PATTERN.test(value) ||
    Number.isNaN(new Date(value).getTime())
  ) {
    throw new ActionContractError(`${key} must be an ISO instant`);
  }
  return new Date(value).toISOString();
}

export function customerSubscriptionExpiryShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'canonicalClientId',
    'providerClientIdentityHash',
    'subscriptionId',
    'termIdentityHash',
    'planSnapshotHash',
    'serviceScopeHash',
    'termStartsAt',
    'termEndsAt',
    'expiryEligibleAt',
    'currentLifecycleState',
    'serverTimeDecision',
    'expiryIdentityHash',
    'expiryContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'approvalRequirement',
    'intendedStatus',
    'intendedEndedAt',
    'unknownApplicable',
    'providerWritesRequired',
    'mutatesImmutableTerm',
    'createsRenewal',
    'pendingRenewalBlocksExpiry',
  ]);

  const exactValues: Readonly<Record<string, unknown>> = {
    currentLifecycleState: 'active',
    serverTimeDecision: 'strictly_after_immutable_term_end',
    expiryContractVersion: CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible_term_elapsed',
    approvalRequirement: 'NONE',
    intendedStatus: 'expired',
    unknownApplicable: false,
    providerWritesRequired: false,
    mutatesImmutableTerm: false,
    createsRenewal: false,
    pendingRenewalBlocksExpiry: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  const termStartsAt = isoInstant(source, 'termStartsAt');
  const termEndsAt = isoInstant(source, 'termEndsAt');
  const expiryEligibleAt = isoInstant(source, 'expiryEligibleAt');
  const intendedEndedAt = isoInstant(source, 'intendedEndedAt');
  const termStartMs = new Date(termStartsAt).getTime();
  const termEndMs = new Date(termEndsAt).getTime();
  if (termEndMs <= termStartMs) {
    throw new ActionContractError('subscription term is invalid');
  }
  if (
    expiryEligibleAt !== new Date(termEndMs + 1).toISOString() ||
    intendedEndedAt !== termEndsAt
  ) {
    throw new ActionContractError('expiry boundary is not server-derived');
  }

  return {
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    subscriptionId: opaque(source, 'subscriptionId'),
    termIdentityHash: opaque(source, 'termIdentityHash'),
    planSnapshotHash: opaque(source, 'planSnapshotHash'),
    serviceScopeHash: opaque(source, 'serviceScopeHash'),
    termStartsAt,
    termEndsAt,
    expiryEligibleAt,
    currentLifecycleState: 'active',
    serverTimeDecision: 'strictly_after_immutable_term_end',
    expiryIdentityHash: opaque(source, 'expiryIdentityHash'),
    expiryContractVersion: CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible_term_elapsed',
    approvalRequirement: 'NONE',
    intendedStatus: 'expired',
    intendedEndedAt,
    unknownApplicable: false,
    providerWritesRequired: false,
    mutatesImmutableTerm: false,
    createsRenewal: false,
    pendingRenewalBlocksExpiry: false,
  };
}
