import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION } from './customer-subscription-purchase-shadow.contract';
import {
  CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
  customerSubscriptionRenewalActivationShadowNormalizer,
} from './customer-subscription-renewal-activation-shadow.contract';

const canonicalInput = () => ({
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  predecessorSubscriptionId: 'subscription-1',
  predecessorTermIdentityHash: 'predecessor-term-hash',
  predecessorStatusAtCheckout: 'active',
  predecessorTermStartsAt: '2026-08-04T12:00:00.000Z',
  predecessorTermEndsAt: '2026-09-03T12:00:00.000Z',
  checkoutExecutionId: 'renewal-checkout-execution-1',
  checkoutIdentityHash: 'renewal-checkout-hash',
  renewalIntentIdentityHash: 'renewal-intent-hash',
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
  providerRequestIdentityHash: 'provider-request-hash',
  providerPaymentIdentityHash: 'provider-payment-hash',
  providerPaymentState: 'succeeded',
  providerPaidAt: '2026-09-01T10:15:30.000Z',
  activationIdentityHash: 'renewal-activation-hash',
  termIdentityHash: 'successor-term-hash',
  termStartsAt: '2026-09-03T12:00:00.000Z',
  termEndsAt: '2026-10-03T12:00:00.000Z',
  activationContractVersion:
    CUSTOMER_SUBSCRIPTION_RENEWAL_TERM_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_ACTIVATION_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible_for_one_time_renewal_activation',
  oneTimeActivationEligible: true,
  approvalRequirement: 'NONE',
  intendedStatus: 'active',
  unknownApplicable: false,
  providerWritesRequired: false,
  mutatesPredecessor: false,
});

describe('P4-05 customer subscription renewal activation Shadow contract', () => {
  it('normalizes one exact paid successor term and preserves its predecessor', () => {
    expect(
      customerSubscriptionRenewalActivationShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
  });

  it('rejects forged payment, plan, term, authority, and predecessor mutation facts', () => {
    for (const forged of [
      { providerPaymentState: 'pending' },
      { priceKopecks: 600_001 },
      { currency: 'USD' },
      { planCode: 'complex' },
      { tier: 'top' },
      { visitsIncluded: 999 },
      { predecessorStatusAtCheckout: 'revoked' },
      { termStartsAt: '2026-09-01T10:15:30.000Z' },
      { termEndsAt: '2026-10-04T12:00:00.000Z' },
      { oneTimeActivationEligible: false },
      { unknownApplicable: true },
      { providerWritesRequired: true },
      { mutatesPredecessor: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'subscription.direct' },
    ]) {
      expect(() =>
        customerSubscriptionRenewalActivationShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable L2.5 renewal activation capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.renewal-activation.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'activate_customer_subscription_renewal',
      targetKind: 'customer_subscription_term',
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
