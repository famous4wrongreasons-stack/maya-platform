import { ActionContractError } from './action-engine.errors';

export const CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_CAPABILITY =
  'customer-subscriptions.revocation.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_INPUT_CONTRACT =
  'maya.revoke_customer_subscription-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-revocation.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION =
  'p4-05.owner-approved-term-revocation.v1' as const;

export const CUSTOMER_SUBSCRIPTION_REVOCATION_REQUESTER_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
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

export function customerSubscriptionRevocationShadowNormalizer(
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
    'revocationDecisionIdentityHash',
    'revocationEvidenceIdentityHash',
    'requesterIdentityHash',
    'requesterRole',
    'requesterAuthority',
    'revocationReason',
    'effectiveMode',
    'approvalScopeHash',
    'approvalBindingMode',
    'revocationIdentityHash',
    'revocationContractVersion',
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
  if (!CUSTOMER_SUBSCRIPTION_REVOCATION_REQUESTER_ROLES.has(requesterRole)) {
    throw new ActionContractError('revocation requester role is not canonical');
  }

  const exactValues: Readonly<Record<string, unknown>> = {
    currentLifecycleState: 'active',
    requesterAuthority: 'tenant_owner_or_admin',
    revocationReason: 'approved_policy_revocation',
    effectiveMode: 'immediate_on_canonical_commit',
    approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
    revocationContractVersion:
      CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'authorized_active_term_with_exact_evidence',
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    intendedStatus: 'revoked',
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
    revocationDecisionIdentityHash: opaque(
      source,
      'revocationDecisionIdentityHash',
    ),
    revocationEvidenceIdentityHash: opaque(
      source,
      'revocationEvidenceIdentityHash',
    ),
    requesterIdentityHash: opaque(source, 'requesterIdentityHash'),
    requesterRole,
    requesterAuthority: 'tenant_owner_or_admin',
    revocationReason: 'approved_policy_revocation',
    effectiveMode: 'immediate_on_canonical_commit',
    approvalScopeHash: opaque(source, 'approvalScopeHash'),
    approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
    revocationIdentityHash: opaque(source, 'revocationIdentityHash'),
    revocationContractVersion:
      CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'authorized_active_term_with_exact_evidence',
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    intendedStatus: 'revoked',
    providerBoundary: 'LOCAL_ONLY',
    paymentRefundIncluded: false,
    providerCancellationIncluded: false,
    unknownApplicable: false,
    mutatesImmutableTerm: false,
    createsRenewal: false,
    oneTimeTerminalClaim: true,
  };
}
