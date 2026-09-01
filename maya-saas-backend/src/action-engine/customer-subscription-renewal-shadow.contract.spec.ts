import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION } from './customer-subscription-purchase-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
  customerSubscriptionRenewalShadowNormalizer,
} from './customer-subscription-renewal-shadow.contract';

const canonicalInput = () => ({
  providerClientSource: 'yclients',
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  checkoutMode: 'renewal',
  predecessorSubscriptionId: 'subscription-1',
  predecessorTermIdentityHash: 'term-identity-hash',
  predecessorStatus: 'active',
  predecessorTermStartsAt: '2026-08-04T12:00:00.000Z',
  predecessorTermEndsAt: '2026-09-03T12:00:00.000Z',
  renewalWindowPolicy: CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
  renewalWindowOpensAt: '2026-08-31T12:00:00.000Z',
  renewalIntentIdentityHash: 'renewal-intent-hash',
  checkoutIdentityHash: 'renewal-checkout-hash',
  offerCode: 'haircut.senior',
  planCode: 'haircut',
  tier: 'senior',
  catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  priceKopecks: 330_000,
  currency: 'RUB',
  visitsIncluded: 2,
  termDays: 30,
  nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
  minimumNextTermStartsAt: '2026-09-03T12:00:00.000Z',
  paymentProvider: 'yookassa',
  providerRequestIdentitySeedHash: 'provider-request-seed-hash',
  checkoutContractVersion:
    CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible',
  approvalRequirement: 'NONE',
  expectedProviderState: 'PENDING',
  unknownApplicable: false,
  intendedProviderOperation: 'provider_checkout_create',
  activatesSubscription: false,
  mutatesPredecessor: false,
});

describe('P4-05 customer subscription renewal Shadow contract', () => {
  it('normalizes one exact successor checkout without activating or rewriting a term', () => {
    expect(
      customerSubscriptionRenewalShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
  });

  it('rejects forged plan, value, dates, authority, and executable outcome facts', () => {
    for (const forged of [
      { priceKopecks: 1 },
      { currency: 'USD' },
      { planCode: 'complex' },
      { tier: 'top' },
      { visitsIncluded: 999 },
      { predecessorStatus: 'canceled' },
      { renewalWindowOpensAt: '2026-09-01T12:00:00.000Z' },
      { minimumNextTermStartsAt: '2026-09-04T12:00:00.000Z' },
      { nextTermStartRule: 'caller_supplied' },
      { expectedProviderState: 'UNKNOWN' },
      { unknownApplicable: true },
      { activatesSubscription: true },
      { mutatesPredecessor: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'yookassa.direct' },
    ]) {
      expect(() =>
        customerSubscriptionRenewalShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable L2.5 renewal capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.renewal-purchase.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'initiate_customer_subscription_renewal',
      targetKind: 'customer_subscription_renewal_checkout',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
    });
    expect(capability.retry.maxExecutionAttempts).toBe(1);
    expect(capability.retry.retryablePreDispatchErrors).toEqual(new Set());
    expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(false);
  });
});
