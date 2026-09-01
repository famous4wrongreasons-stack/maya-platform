import { ActionContractError } from './action-engine.errors';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  resolveCustomerSubscriptionPurchaseOffer,
} from './customer-subscription-purchase-shadow.contract';

export const CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_CAPABILITY =
  'customer-subscriptions.activation.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_INPUT_CONTRACT =
  'maya.activate_customer_subscription-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-activation.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION =
  'p4-05.initial-term-activation.v1' as const;

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

export function customerSubscriptionActivationShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'canonicalClientId',
    'providerClientIdentityHash',
    'checkoutExecutionId',
    'checkoutIdentityHash',
    'purchaseIntentIdentityHash',
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
    'providerRequestIdentityHash',
    'providerPaymentIdentityHash',
    'providerPaymentState',
    'providerPaidAt',
    'activationIdentityHash',
    'termIdentityHash',
    'termStartsAt',
    'termEndsAt',
    'activationContractVersion',
    'policyProfile',
    'policySnapshotHash',
    'eligibilityDecision',
    'oneTimeActivationEligible',
    'approvalRequirement',
    'intendedStatus',
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
    currency: offer.currency,
    paymentProvider: 'yookassa',
    providerPaymentState: 'succeeded',
    activationContractVersion:
      CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible_for_one_time_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedStatus: 'active',
    unknownApplicable: false,
    providerWritesRequired: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  const termStartsAt = isoInstant(source, 'termStartsAt');
  const termEndsAt = isoInstant(source, 'termEndsAt');
  const providerPaidAt = isoInstant(source, 'providerPaidAt');
  const expectedEnd = new Date(
    new Date(termStartsAt).getTime() + offer.termDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  if (providerPaidAt !== termStartsAt || termEndsAt !== expectedEnd) {
    throw new ActionContractError('term boundary is not server-derived');
  }

  return {
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    checkoutExecutionId: opaque(source, 'checkoutExecutionId'),
    checkoutIdentityHash: opaque(source, 'checkoutIdentityHash'),
    purchaseIntentIdentityHash: opaque(source, 'purchaseIntentIdentityHash'),
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
    providerRequestIdentityHash: opaque(source, 'providerRequestIdentityHash'),
    providerPaymentIdentityHash: opaque(source, 'providerPaymentIdentityHash'),
    providerPaymentState: 'succeeded',
    providerPaidAt,
    activationIdentityHash: opaque(source, 'activationIdentityHash'),
    termIdentityHash: opaque(source, 'termIdentityHash'),
    termStartsAt,
    termEndsAt,
    activationContractVersion:
      CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
    policyProfile: CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible_for_one_time_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedStatus: 'active',
    unknownApplicable: false,
    providerWritesRequired: false,
  };
}
