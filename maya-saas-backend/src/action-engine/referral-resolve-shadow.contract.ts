import { ActionContractError } from './action-engine.errors';

export const REFERRAL_RESOLVE_SHADOW_CAPABILITY =
  'referrals.customer-referral-resolve.shadow.v1' as const;
export const REFERRAL_RESOLVE_SHADOW_INPUT_CONTRACT =
  'maya.resolve_customer_referral-input/1' as const;
export const REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE =
  'p4-04.referral-resolve.shadow-policy.v1' as const;

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function optionalOpaque(
  source: Record<string, unknown>,
  key: string,
): string | null {
  if (source[key] === null) return null;
  return opaque(source, key);
}

export function referralResolveShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'customerReferralId',
    'canonicalReferrerClientId',
    'canonicalReferredClientId',
    'referrerProviderIdentityHash',
    'referredProviderIdentityHash',
    'relationshipIdentityHash',
    'resolutionIdentityHash',
    'terminalOutcome',
    'joinedAt',
    'evaluationWindow',
    'providerVisitIdentityHash',
    'evidenceDecision',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'legacyClaimedOutcome',
    'shadowDivergence',
  ]);

  if (source.policyProfile !== REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE) {
    throw new ActionContractError('policyProfile is not canonical');
  }
  if (
    source.terminalOutcome !== 'qualified' &&
    source.terminalOutcome !== 'expired' &&
    source.terminalOutcome !== 'self_blocked'
  ) {
    throw new ActionContractError('terminalOutcome is not canonical');
  }
  if (
    source.eligibilityDecision !== 'eligible_for_resolution' &&
    source.eligibilityDecision !== 'ineligible_self_referral'
  ) {
    throw new ActionContractError('eligibilityDecision is not canonical');
  }
  if (
    source.evidenceDecision !== 'exact_attended_visit' &&
    source.evidenceDecision !== 'pending_ttl_elapsed' &&
    source.evidenceDecision !== 'canonical_self_referral'
  ) {
    throw new ActionContractError('evidenceDecision is not canonical');
  }
  if (
    typeof source.evaluationWindow !== 'string' ||
    !ISO_DATE_PATTERN.test(source.evaluationWindow)
  ) {
    throw new ActionContractError('evaluationWindow must be an ISO date');
  }
  if (
    typeof source.joinedAt !== 'string' ||
    Number.isNaN(Date.parse(source.joinedAt))
  ) {
    throw new ActionContractError('joinedAt must be an ISO timestamp');
  }
  if (typeof source.shadowDivergence !== 'boolean') {
    throw new ActionContractError('shadowDivergence must be boolean');
  }

  const terminalOutcome = source.terminalOutcome;
  const providerVisitIdentityHash = optionalOpaque(
    source,
    'providerVisitIdentityHash',
  );
  if (terminalOutcome === 'qualified' && providerVisitIdentityHash === null) {
    throw new ActionContractError(
      'qualified outcome requires exact provider visit identity',
    );
  }
  if (terminalOutcome !== 'qualified' && providerVisitIdentityHash !== null) {
    throw new ActionContractError(
      'non-qualified outcome cannot claim provider visit identity',
    );
  }

  return {
    provider: opaque(source, 'provider'),
    customerReferralId: opaque(source, 'customerReferralId'),
    canonicalReferrerClientId: opaque(source, 'canonicalReferrerClientId'),
    canonicalReferredClientId: opaque(source, 'canonicalReferredClientId'),
    referrerProviderIdentityHash: opaque(
      source,
      'referrerProviderIdentityHash',
    ),
    referredProviderIdentityHash: opaque(
      source,
      'referredProviderIdentityHash',
    ),
    relationshipIdentityHash: opaque(source, 'relationshipIdentityHash'),
    resolutionIdentityHash: opaque(source, 'resolutionIdentityHash'),
    terminalOutcome,
    joinedAt: source.joinedAt,
    evaluationWindow: source.evaluationWindow,
    providerVisitIdentityHash,
    evidenceDecision: source.evidenceDecision,
    policyProfile: REFERRAL_RESOLVE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: source.eligibilityDecision,
    legacyClaimedOutcome: source.legacyClaimedOutcome,
    shadowDivergence: source.shadowDivergence,
  };
}
