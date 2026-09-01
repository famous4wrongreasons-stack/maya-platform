import { ActionContractError } from './action-engine.errors';
import {
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  resolveCustomerSubscriptionPurchaseOffer,
} from './customer-subscription-purchase-shadow.contract';

export const CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_CAPABILITY =
  'customer-subscriptions.renewal-activation.shadow.v1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_INPUT_CONTRACT =
  'maya.activate_customer_subscription_renewal-input/1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE =
  'p4-05.customer-subscription-renewal-activation.shadow-policy.v1' as const;
export const CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION =
  'p4-05.renewal-term-activation.v1' as const;

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

export function customerSubscriptionRenewalActivationShadowNormalizer(
  value: unknown,
): Record<string, unknown> {
  const source = recordInput(value);
  assertOnlyKeys(source, [
    'canonicalClientId',
    'providerClientIdentityHash',
    'predecessorSubscriptionId',
    'predecessorTermIdentityHash',
    'predecessorStatusAtCheckout',
    'predecessorTermStartsAt',
    'predecessorTermEndsAt',
    'checkoutExecutionId',
    'checkoutIdentityHash',
    'renewalIntentIdentityHash',
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
    'mutatesPredecessor',
  ]);

  const offerCode = opaque(source, 'offerCode');
  const offer = resolveCustomerSubscriptionPurchaseOffer(offerCode);
  if (!offer) throw new ActionContractError('offerCode is not canonical');

  const exactValues: Readonly<Record<string, unknown>> = {
    predecessorStatusAtCheckout: 'active',
    planCode: offer.planCode,
    tier: offer.tier,
    catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
    currency: offer.currency,
    paymentProvider: 'yookassa',
    providerPaymentState: 'succeeded',
    activationContractVersion:
      CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
    policyProfile:
      CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
    eligibilityDecision: 'eligible_for_one_time_renewal_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedStatus: 'active',
    unknownApplicable: false,
    providerWritesRequired: false,
    mutatesPredecessor: false,
  };
  for (const [key, expected] of Object.entries(exactValues)) {
    if (source[key] !== expected) {
      throw new ActionContractError(`${key} is not canonical`);
    }
  }

  const predecessorTermStartsAt = isoInstant(source, 'predecessorTermStartsAt');
  const predecessorTermEndsAt = isoInstant(source, 'predecessorTermEndsAt');
  const providerPaidAt = isoInstant(source, 'providerPaidAt');
  const termStartsAt = isoInstant(source, 'termStartsAt');
  const termEndsAt = isoInstant(source, 'termEndsAt');
  const expectedStart = new Date(
    Math.max(
      new Date(predecessorTermEndsAt).getTime(),
      new Date(providerPaidAt).getTime(),
    ),
  ).toISOString();
  const expectedEnd = new Date(
    new Date(expectedStart).getTime() + offer.termDays * 86_400_000,
  ).toISOString();
  if (termStartsAt !== expectedStart || termEndsAt !== expectedEnd) {
    throw new ActionContractError(
      'renewal term boundary is not server-derived',
    );
  }

  return {
    canonicalClientId: opaque(source, 'canonicalClientId'),
    providerClientIdentityHash: opaque(source, 'providerClientIdentityHash'),
    predecessorSubscriptionId: opaque(source, 'predecessorSubscriptionId'),
    predecessorTermIdentityHash: opaque(source, 'predecessorTermIdentityHash'),
    predecessorStatusAtCheckout: 'active',
    predecessorTermStartsAt,
    predecessorTermEndsAt,
    checkoutExecutionId: opaque(source, 'checkoutExecutionId'),
    checkoutIdentityHash: opaque(source, 'checkoutIdentityHash'),
    renewalIntentIdentityHash: opaque(source, 'renewalIntentIdentityHash'),
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
      CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
    policyProfile:
      CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
    policySnapshotHash: opaque(source, 'policySnapshotHash'),
    eligibilityDecision: 'eligible_for_one_time_renewal_activation',
    oneTimeActivationEligible: true,
    approvalRequirement: 'NONE',
    intendedStatus: 'active',
    unknownApplicable: false,
    providerWritesRequired: false,
    mutatesPredecessor: false,
  };
}
