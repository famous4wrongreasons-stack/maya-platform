import { ActionContractError } from './action-engine.errors';

export const REFERRAL_CREATE_SHADOW_CAPABILITY =
  'referrals.customer-referral-create.shadow.v1' as const;
export const REFERRAL_CREATE_SHADOW_INPUT_CONTRACT =
  'maya.create_customer_referral-input/1' as const;
export const REFERRAL_CREATE_SHADOW_POLICY_PROFILE =
  'p4-04.referral-create.shadow-policy.v1' as const;

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

export function referralCreateShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'provider',
    'canonicalReferrerClientId',
    'canonicalReferredClientId',
    'referrerProviderIdentityHash',
    'referredProviderIdentityHash',
    'relationshipIdentityHash',
    'referredSubjectHash',
    'referralCodeBindingHash',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'intendedStatus',
  ]);

  if (source.policyProfile !== REFERRAL_CREATE_SHADOW_POLICY_PROFILE) {
    throw new ActionContractError('policyProfile is not canonical');
  }
  if (source.eligibilityDecision !== 'eligible') {
    throw new ActionContractError('eligibilityDecision is not canonical');
  }
  if (source.intendedStatus !== 'pending') {
    throw new ActionContractError('intendedStatus is not canonical');
  }

  const canonicalReferrerClientId = opaque(source, 'canonicalReferrerClientId');
  const canonicalReferredClientId = opaque(source, 'canonicalReferredClientId');
  if (canonicalReferrerClientId === canonicalReferredClientId) {
    throw new ActionContractError('self referral is forbidden');
  }

  return {
    provider: opaque(source, 'provider'),
    canonicalReferrerClientId,
    canonicalReferredClientId,
    referrerProviderIdentityHash: opaque(
      source,
      'referrerProviderIdentityHash',
    ),
    referredProviderIdentityHash: opaque(
      source,
      'referredProviderIdentityHash',
    ),
    relationshipIdentityHash: opaque(source, 'relationshipIdentityHash'),
    referredSubjectHash: opaque(source, 'referredSubjectHash'),
    referralCodeBindingHash: opaque(source, 'referralCodeBindingHash'),
    policyProfile: REFERRAL_CREATE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible',
    intendedStatus: 'pending',
  };
}
