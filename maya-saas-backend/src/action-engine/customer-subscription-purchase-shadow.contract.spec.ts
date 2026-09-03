import { ActionPolicyDecision } from '@prisma/client';

import {
  CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
  customerSubscriptionPurchaseShadowNormalizer,
  resolveCustomerSubscriptionPurchaseOffer,
} from './customer-subscription-purchase-shadow.contract';
import { ActionCapabilityRegistry } from './action-engine.registry';

const canonicalInput = () => ({
  providerClientSource: 'yclients',
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  checkoutMode: 'initial_purchase',
  purchaseIntentIdentityHash: 'purchase-intent-hash',
  checkoutIdentityHash: 'checkout-identity-hash',
  canonicalOfferId: 'membership-offer-id',
  offerValueVersionId: 'membership-version-id',
  offerValueSnapshotHash: 'membership-value-snapshot-hash',
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
  paymentProvider: 'yookassa',
  providerRequestIdentitySeedHash: 'provider-request-seed-hash',
  checkoutContractVersion: CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible',
  approvalRequirement: 'NONE',
  expectedProviderState: 'PENDING',
  unknownApplicable: false,
  intendedProviderOperation: 'provider_checkout_create',
  activatesSubscription: false,
});

describe('P4-05 customer subscription purchase Shadow contract', () => {
  it('keeps the fixed legacy offers server-owned and kopeck-exact', () => {
    expect(resolveCustomerSubscriptionPurchaseOffer('haircut.senior')).toEqual(
      expect.objectContaining({
        planCode: 'haircut',
        tier: 'senior',
        priceKopecks: 330_000,
        currency: 'RUB',
        visitsIncluded: 2,
        termDays: 30,
      }),
    );
    expect(resolveCustomerSubscriptionPurchaseOffer('unknown')).toBeUndefined();
  });

  it('normalizes only exact server-derived checkout facts', () => {
    expect(
      customerSubscriptionPurchaseShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
  });

  it('rejects caller authority and forged price, currency, plan, or outcome facts', () => {
    for (const forged of [
      { priceKopecks: 600_001 },
      { currency: 'USD' },
      { planCode: 'complex' },
      { tier: 'top' },
      { visitsIncluded: 999 },
      { expectedProviderState: 'SUCCEEDED' },
      { unknownApplicable: true },
      { activatesSubscription: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'yookassa.direct' },
    ]) {
      expect(() =>
        customerSubscriptionPurchaseShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable L2.5 capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.purchase.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'initiate_customer_subscription_purchase',
      targetKind: 'customer_subscription_checkout',
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
