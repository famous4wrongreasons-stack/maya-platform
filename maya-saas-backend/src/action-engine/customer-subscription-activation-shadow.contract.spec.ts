import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
  customerSubscriptionActivationShadowNormalizer,
} from './customer-subscription-activation-shadow.contract';

const canonicalInput = () => ({
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  checkoutExecutionId: 'checkout-execution-1',
  checkoutIdentityHash: 'checkout-identity-hash',
  purchaseIntentIdentityHash: 'purchase-intent-hash',
  offerCode: 'haircut.senior',
  planCode: 'haircut',
  tier: 'senior',
  catalogVersion: 'p4-05.legacy-fixed-catalog.v1',
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
  activationIdentityHash: 'activation-identity-hash',
  termIdentityHash: 'term-identity-hash',
  termStartsAt: '2026-09-01T10:15:30.000Z',
  termEndsAt: '2026-10-01T10:15:30.000Z',
  activationContractVersion:
    CUSTOMER_SUBSCRIPTION_INITIAL_TERM_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_ACTIVATION_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible_for_one_time_activation',
  oneTimeActivationEligible: true,
  approvalRequirement: 'NONE',
  intendedStatus: 'active',
  unknownApplicable: false,
  providerWritesRequired: false,
});

describe('P4-05 customer subscription activation Shadow contract', () => {
  it('normalizes exact server-derived paid term facts', () => {
    expect(
      customerSubscriptionActivationShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
  });

  it('rejects pending, UNKNOWN, forged value, changed term, and caller authority', () => {
    for (const forged of [
      { providerPaymentState: 'pending' },
      { providerPaymentState: 'UNKNOWN' },
      { priceKopecks: 1 },
      { currency: 'USD' },
      { planCode: 'complex' },
      { termEndsAt: '2026-10-02T10:15:30.000Z' },
      { providerPaidAt: '2026-09-02T10:15:30.000Z' },
      { oneTimeActivationEligible: false },
      { unknownApplicable: true },
      { providerWritesRequired: true },
      { entitled: true },
      { approved: true },
      { executor: 'legacy.direct' },
    ]) {
      expect(() =>
        customerSubscriptionActivationShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a non-executable one-time activation capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.activation.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'activate_customer_subscription',
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
