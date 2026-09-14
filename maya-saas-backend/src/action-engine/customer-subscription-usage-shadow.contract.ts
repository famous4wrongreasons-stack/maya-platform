import { ActionContractError } from './action-engine.errors';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  resolveCustomerSubscriptionPurchaseOffer,
} from './customer-subscription-purchase-shadow.contract';

export const CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_CAPABILITY =
  'customer-subscriptions.usage-sync.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_INPUT_CONTRACT =
  'maya.sync_customer_subscription_usage-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-usage.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION =
  'p4-05.exact-attended-visit-usage.v1' as const;

export const CUSTOMER_SUBSCRIPTION_SERVICE_SCOPE_BY_EXACT_PROVIDER_NAME =
  Object.freeze({
    'мужская стрижка': 'yclients.service.mens-haircut',
    'моделирование бороды': 'yclients.service.beard-modeling',
  } as const);

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

function exactInteger(
  source: Record<string, unknown>,
  key: string,
  expected: number,
): number {
  const value = source[key];
  if (!Number.isSafeInteger(value) || value !== expected) {
    throw new ActionContractError(`${key} is not server-derived`);
  }
  return expected;
}

export function customerSubscriptionUsageShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'canonicalClientId',
    'providerClientIdentityHash',
    'subscriptionId',
    'termIdentityHash',
    'offerCode',
    'planCode',
    'tier',
    'catalogVersion',
    'planSnapshotHash',
    'serviceScopeHash',
    'visitsIncluded',
    'termStartsAt',
    'termEndsAt',
    'provider',
    'providerVisitRecordRefHash',
    'providerVisitIdentityHash',
    'providerObservationSnapshotHash',
    'providerServiceIdentityHash',
    'providerServiceScopeRef',
    'visitOccurredAt',
    'visitAttendance',
    'units',
    'usageIdentityHash',
    'usageContractVersion',
    'remainingUnitsBefore',
    'remainingUnitsAfter',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'approvalRequirement',
    'unknownApplicable',
    'providerWritesRequired',
  ]);

  const offerCode = opaque(source, 'offerCode');
  const offer = resolveCustomerSubscriptionPurchaseOffer(offerCode);
  if (!offer) throw new ActionContractError('offerCode is not canonical');

  const exactValues: Readonly<Record<string, unknown>> = {
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    visitAttendance: 'arrived',
    usageContractVersion: CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible_exact_attended_visit',
    approvalRequirement: 'NONE',
    unknownApplicable: false,
    providerWritesRequired: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  const units = exactInteger(source, 'units', 1);
  const visitsIncluded = exactInteger(
    source,
    'visitsIncluded',
    offer.visitsIncluded,
  );
  const remainingUnitsBefore = source.remainingUnitsBefore;
  const remainingUnitsAfter = source.remainingUnitsAfter;
  if (
    !Number.isSafeInteger(remainingUnitsBefore) ||
    !Number.isSafeInteger(remainingUnitsAfter) ||
    (remainingUnitsBefore as number) < units ||
    remainingUnitsAfter !== (remainingUnitsBefore as number) - units ||
    (remainingUnitsBefore as number) > visitsIncluded
  ) {
    throw new ActionContractError('remaining entitlement is not canonical');
  }

  const termStartsAt = isoInstant(source, 'termStartsAt');
  const termEndsAt = isoInstant(source, 'termEndsAt');
  const visitOccurredAt = isoInstant(source, 'visitOccurredAt');
  if (
    new Date(visitOccurredAt).getTime() < new Date(termStartsAt).getTime() ||
    new Date(visitOccurredAt).getTime() > new Date(termEndsAt).getTime()
  ) {
    throw new ActionContractError('visit is outside the immutable term');
  }

  const providerServiceScopeRef = opaque(source, 'providerServiceScopeRef');
  if (!offer.serviceScopeRefs.includes(providerServiceScopeRef)) {
    throw new ActionContractError('service is outside the frozen scope');
  }

  return {
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    subscriptionId: opaque(source, 'subscriptionId'),
    termIdentityHash: opaque(source, 'termIdentityHash'),
    offerCode: offer.offerCode,
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash: opaque(source, 'planSnapshotHash'),
    serviceScopeHash: opaque(source, 'serviceScopeHash'),
    visitsIncluded,
    termStartsAt,
    termEndsAt,
    provider: opaque(source, 'provider'),
    providerVisitRecordRefHash: opaque(source, 'providerVisitRecordRefHash'),
    providerVisitIdentityHash: opaque(source, 'providerVisitIdentityHash'),
    providerObservationSnapshotHash: opaque(
      source,
      'providerObservationSnapshotHash',
    ),
    providerServiceIdentityHash: opaque(source, 'providerServiceIdentityHash'),
    providerServiceScopeRef,
    visitOccurredAt,
    visitAttendance: 'arrived',
    units,
    usageIdentityHash: opaque(source, 'usageIdentityHash'),
    usageContractVersion: CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
    remainingUnitsBefore,
    remainingUnitsAfter,
    policyProfile: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible_exact_attended_visit',
    approvalRequirement: 'NONE',
    unknownApplicable: false,
    providerWritesRequired: false,
  };
}
