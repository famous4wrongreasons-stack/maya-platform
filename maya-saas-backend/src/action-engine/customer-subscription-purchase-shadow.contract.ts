import { ActionContractError } from './action-engine.errors';

export const CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_CAPABILITY =
  'customer-subscriptions.purchase.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_INPUT_CONTRACT =
  'maya.initiate_customer_subscription_purchase-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-purchase.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION =
  'p4-05.legacy-fixed-catalog.v1' as const;
export const CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION =
  'p4-05.initial-checkout.v1' as const;

export interface CustomerSubscriptionPurchaseOffer {
  offerCode: string;
  planCode: 'haircut' | 'complex' | 'beard';
  tier: 'senior' | 'top';
  priceKopecks: number;
  currency: 'RUB';
  visitsIncluded: 2;
  termDays: 30;
  serviceScopeRefs: readonly string[];
}

export const CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS: Readonly<
  Record<string, CustomerSubscriptionPurchaseOffer>
> = Object.freeze({
  'haircut.senior': Object.freeze({
    offerCode: 'haircut.senior',
    planCode: 'haircut',
    tier: 'senior',
    priceKopecks: 330_000,
    currency: 'RUB',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: Object.freeze(['yclients.service.mens-haircut']),
  }),
  'haircut.top': Object.freeze({
    offerCode: 'haircut.top',
    planCode: 'haircut',
    tier: 'top',
    priceKopecks: 370_000,
    currency: 'RUB',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: Object.freeze(['yclients.service.mens-haircut']),
  }),
  'complex.senior': Object.freeze({
    offerCode: 'complex.senior',
    planCode: 'complex',
    tier: 'senior',
    priceKopecks: 520_000,
    currency: 'RUB',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: Object.freeze([
      'yclients.service.mens-haircut',
      'yclients.service.beard-modeling',
    ]),
  }),
  'complex.top': Object.freeze({
    offerCode: 'complex.top',
    planCode: 'complex',
    tier: 'top',
    priceKopecks: 600_000,
    currency: 'RUB',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: Object.freeze([
      'yclients.service.mens-haircut',
      'yclients.service.beard-modeling',
    ]),
  }),
  'beard.senior': Object.freeze({
    offerCode: 'beard.senior',
    planCode: 'beard',
    tier: 'senior',
    priceKopecks: 170_000,
    currency: 'RUB',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: Object.freeze(['yclients.service.beard-modeling']),
  }),
  'beard.top': Object.freeze({
    offerCode: 'beard.top',
    planCode: 'beard',
    tier: 'top',
    priceKopecks: 210_000,
    currency: 'RUB',
    visitsIncluded: 2,
    termDays: 30,
    serviceScopeRefs: Object.freeze(['yclients.service.beard-modeling']),
  }),
});

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

export function resolveCustomerSubscriptionPurchaseOffer(
  offerCode: string,
): CustomerSubscriptionPurchaseOffer | undefined {
  return CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS[offerCode.trim().toLowerCase()];
}

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

function exactNumber(
  source: Record<string, unknown>,
  key: string,
  expected: number,
): number {
  const value = source[key];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value !== expected
  ) {
    throw new ActionContractError(`${key} is not server-derived`);
  }
  return expected;
}

export function customerSubscriptionPurchaseShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'providerClientSource',
    'canonicalClientId',
    'providerClientIdentityHash',
    'checkoutMode',
    'purchaseIntentIdentityHash',
    'checkoutIdentityHash',
    'offerCode',
    'planCode',
    'tier',
    'catalogVersion',
    'planSnapshotHash',
    'serviceScopeHash',
    'priceKopecks',
    'currency',
    'visitsIncluded',
    'termDays',
    'paymentProvider',
    'providerRequestIdentitySeedHash',
    'checkoutContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'approvalRequirement',
    'expectedProviderState',
    'unknownApplicable',
    'intendedProviderOperation',
    'activatesSubscription',
  ]);

  const offerCode = opaque(source, 'offerCode');
  const offer = resolveCustomerSubscriptionPurchaseOffer(offerCode);
  if (!offer) throw new ActionContractError('offerCode is not canonical');

  const exactValues: Readonly<Record<string, unknown>> = {
    checkoutMode: 'initial_purchase',
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    currency: offer.currency,
    paymentProvider: 'yookassa',
    checkoutContractVersion: CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    activatesSubscription: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  return {
    providerClientSource: opaque(source, 'providerClientSource'),
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    checkoutMode: 'initial_purchase',
    purchaseIntentIdentityHash: opaque(source, 'purchaseIntentIdentityHash'),
    checkoutIdentityHash: opaque(source, 'checkoutIdentityHash'),
    offerCode: offer.offerCode,
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash: opaque(source, 'planSnapshotHash'),
    serviceScopeHash: opaque(source, 'serviceScopeHash'),
    priceKopecks: exactNumber(source, 'priceKopecks', offer.priceKopecks),
    currency: offer.currency,
    visitsIncluded: exactNumber(source, 'visitsIncluded', offer.visitsIncluded),
    termDays: exactNumber(source, 'termDays', offer.termDays),
    paymentProvider: 'yookassa',
    providerRequestIdentitySeedHash: opaque(
      source,
      'providerRequestIdentitySeedHash',
    ),
    checkoutContractVersion: CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    activatesSubscription: false,
  };
}
