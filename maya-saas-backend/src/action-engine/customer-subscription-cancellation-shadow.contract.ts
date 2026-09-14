import { ActionContractError } from './action-engine.errors';

export const CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_CAPABILITY =
  'customer-subscriptions.cancellation.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_INPUT_CONTRACT =
  'maya.cancel_customer_subscription-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-cancellation.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION =
  'p4-05.authorized-term-cancellation.v1' as const;

export const CUSTOMER_SUBSCRIPTION_CANCELLATION_CLIENT_ROLES = new Set([
  'client',
  'customer',
]);
export const CUSTOMER_SUBSCRIPTION_CANCELLATION_STAFF_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
]);

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

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

export function customerSubscriptionCancellationShadowNormalizer(
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
    'currentLifecycleState',
    'cancellationIntentIdentityHash',
    'requesterIdentityHash',
    'requesterRole',
    'requesterAuthority',
    'cancellationReason',
    'effectiveMode',
    'cancellationIdentityHash',
    'cancellationContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'approvalRequirement',
    'intendedStatus',
    'providerBoundary',
    'paymentRefundIncluded',
    'providerCancellationIncluded',
    'unknownApplicable',
    'mutatesImmutableTerm',
    'createsRenewal',
    'oneTimeTerminalClaim',
  ]);

  const requesterRole = opaque(source, 'requesterRole');
  const requesterAuthority = source.requesterAuthority;
  const cancellationReason = source.cancellationReason;
  const clientCancellation =
    requesterAuthority === 'subscription_client' &&
    CUSTOMER_SUBSCRIPTION_CANCELLATION_CLIENT_ROLES.has(requesterRole) &&
    cancellationReason === 'customer_requested';
  const staffCancellation =
    requesterAuthority === 'authorized_staff_role' &&
    CUSTOMER_SUBSCRIPTION_CANCELLATION_STAFF_ROLES.has(requesterRole) &&
    cancellationReason === 'staff_confirmed_customer_request';
  if (!clientCancellation && !staffCancellation) {
    throw new ActionContractError('cancellation authority is not canonical');
  }

  const exactValues: Readonly<Record<string, unknown>> = {
    currentLifecycleState: 'active',
    effectiveMode: 'immediate_on_canonical_commit',
    cancellationContractVersion:
      CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'authorized_active_term',
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    intendedStatus: 'canceled',
    providerBoundary: 'LOCAL_ONLY',
    paymentRefundIncluded: false,
    providerCancellationIncluded: false,
    unknownApplicable: false,
    mutatesImmutableTerm: false,
    createsRenewal: false,
    oneTimeTerminalClaim: true,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  return {
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    subscriptionId: opaque(source, 'subscriptionId'),
    termIdentityHash: opaque(source, 'termIdentityHash'),
    planSnapshotHash: opaque(source, 'planSnapshotHash'),
    serviceScopeHash: opaque(source, 'serviceScopeHash'),
    currentLifecycleState: 'active',
    cancellationIntentIdentityHash: opaque(
      source,
      'cancellationIntentIdentityHash',
    ),
    requesterIdentityHash: opaque(source, 'requesterIdentityHash'),
    requesterRole,
    requesterAuthority,
    cancellationReason,
    effectiveMode: 'immediate_on_canonical_commit',
    cancellationIdentityHash: opaque(source, 'cancellationIdentityHash'),
    cancellationContractVersion:
      CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'authorized_active_term',
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
    intendedStatus: 'canceled',
    providerBoundary: 'LOCAL_ONLY',
    paymentRefundIncluded: false,
    providerCancellationIncluded: false,
    unknownApplicable: false,
    mutatesImmutableTerm: false,
    createsRenewal: false,
    oneTimeTerminalClaim: true,
  };
}
