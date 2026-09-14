import { ActionContractError } from './action-engine.errors';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  resolveCustomerSubscriptionPurchaseOffer,
} from './customer-subscription-purchase-shadow.contract';

export const CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_CAPABILITY =
  'customer-subscriptions.renewal-purchase.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_INPUT_CONTRACT =
  'maya.initiate_customer_subscription_renewal-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-renewal.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION =
  'p4-05.renewal-checkout.v1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY =
  'p4-05.renewal-window.last-3-days.v1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS = 3 as const;

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

function isoTimestamp(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ActionContractError(`${key} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
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

function boundedPrice(source: Record<string, unknown>): number {
  const value = source.priceKopecks;
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 600_000
  ) {
    throw new ActionContractError(
      'priceKopecks is outside the canonical membership cap',
    );
  }
  return Number(value);
}

export function customerSubscriptionRenewalShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'providerClientSource',
    'canonicalClientId',
    'providerClientIdentityHash',
    'checkoutMode',
    'predecessorSubscriptionId',
    'predecessorTermIdentityHash',
    'predecessorStatus',
    'predecessorTermStartsAt',
    'predecessorTermEndsAt',
    'renewalWindowPolicy',
    'renewalWindowOpensAt',
    'renewalIntentIdentityHash',
    'checkoutIdentityHash',
    'canonicalOfferId',
    'offerValueVersionId',
    'offerValueSnapshotHash',
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
    'nextTermStartRule',
    'minimumNextTermStartsAt',
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
    'mutatesPredecessor',
  ]);

  const offerCode = opaque(source, 'offerCode');
  const offer = resolveCustomerSubscriptionPurchaseOffer(offerCode);
  if (!offer) throw new ActionContractError('offerCode is not canonical');

  const predecessorTermStartsAt = isoTimestamp(
    source,
    'predecessorTermStartsAt',
  );
  const predecessorTermEndsAt = isoTimestamp(source, 'predecessorTermEndsAt');
  const renewalWindowOpensAt = isoTimestamp(source, 'renewalWindowOpensAt');
  const minimumNextTermStartsAt = isoTimestamp(
    source,
    'minimumNextTermStartsAt',
  );
  if (minimumNextTermStartsAt !== predecessorTermEndsAt) {
    throw new ActionContractError(
      'minimumNextTermStartsAt must equal predecessorTermEndsAt',
    );
  }
  const expectedWindowOpen = new Date(
    Date.parse(predecessorTermEndsAt) -
      CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  if (renewalWindowOpensAt !== expectedWindowOpen) {
    throw new ActionContractError('renewalWindowOpensAt is not server-derived');
  }

  const exactValues: Readonly<Record<string, unknown>> = {
    checkoutMode: 'renewal',
    predecessorStatus: 'active',
    renewalWindowPolicy: CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    currency: offer.currency,
    nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
    paymentProvider: 'yookassa',
    checkoutContractVersion:
      CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    activatesSubscription: false,
    mutatesPredecessor: false,
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
    checkoutMode: 'renewal',
    predecessorSubscriptionId: opaque(source, 'predecessorSubscriptionId'),
    predecessorTermIdentityHash: opaque(source, 'predecessorTermIdentityHash'),
    predecessorStatus: 'active',
    predecessorTermStartsAt,
    predecessorTermEndsAt,
    renewalWindowPolicy: CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
    renewalWindowOpensAt,
    renewalIntentIdentityHash: opaque(source, 'renewalIntentIdentityHash'),
    checkoutIdentityHash: opaque(source, 'checkoutIdentityHash'),
    canonicalOfferId: opaque(source, 'canonicalOfferId'),
    offerValueVersionId: opaque(source, 'offerValueVersionId'),
    offerValueSnapshotHash: opaque(source, 'offerValueSnapshotHash'),
    offerCode: offer.offerCode,
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    planSnapshotHash: opaque(source, 'planSnapshotHash'),
    serviceScopeHash: opaque(source, 'serviceScopeHash'),
    priceKopecks: boundedPrice(source),
    currency: offer.currency,
    visitsIncluded: exactNumber(source, 'visitsIncluded', offer.visitsIncluded),
    termDays: exactNumber(source, 'termDays', offer.termDays),
    nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
    minimumNextTermStartsAt,
    paymentProvider: 'yookassa',
    providerRequestIdentitySeedHash: opaque(
      source,
      'providerRequestIdentitySeedHash',
    ),
    checkoutContractVersion:
      CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible',
    approvalRequirement: 'NONE',
    expectedProviderState: 'PENDING',
    unknownApplicable: false,
    intendedProviderOperation: 'provider_checkout_create',
    activatesSubscription: false,
    mutatesPredecessor: false,
  };
}
