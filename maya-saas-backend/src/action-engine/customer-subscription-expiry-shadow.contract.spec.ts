import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
  customerSubscriptionExpiryShadowNormalizer,
} from './customer-subscription-expiry-shadow.contract';

const canonicalInput = () => ({
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  subscriptionId: 'subscription-1',
  termIdentityHash: 'term-hash',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  termStartsAt: '2026-08-01T00:00:00.000Z',
  termEndsAt: '2026-08-31T00:00:00.000Z',
  expiryEligibleAt: '2026-08-31T00:00:00.001Z',
  currentLifecycleState: 'active',
  serverTimeDecision: 'strictly_after_immutable_term_end',
  expiryIdentityHash: 'expiry-identity-hash',
  expiryContractVersion: CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible_term_elapsed',
  approvalRequirement: 'NONE',
  intendedStatus: 'expired',
  intendedEndedAt: '2026-08-31T00:00:00.000Z',
  unknownApplicable: false,
  providerWritesRequired: false,
  mutatesImmutableTerm: false,
  createsRenewal: false,
  pendingRenewalBlocksExpiry: false,
});

describe('P4-05 customer subscription expiry Shadow contract', () => {
  it('normalizes one deterministic immutable-term terminal plan', () => {
    expect(
      customerSubscriptionExpiryShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
  });

  it('rejects forged time, term, lifecycle, renewal, authority, and side-effect facts', () => {
    for (const forged of [
      { termEndsAt: '2026-09-30T00:00:00.000Z' },
      { expiryEligibleAt: '2026-08-31T00:00:00.000Z' },
      { intendedEndedAt: '2026-09-01T00:00:00.000Z' },
      { currentLifecycleState: 'expired' },
      { serverTimeDecision: 'caller_says_expired' },
      { intendedStatus: 'revoked' },
      { approvalRequirement: 'OWNER' },
      { unknownApplicable: true },
      { providerWritesRequired: true },
      { mutatesImmutableTerm: true },
      { createsRenewal: true },
      { pendingRenewalBlocksExpiry: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'subscription.direct' },
    ]) {
      expect(() =>
        customerSubscriptionExpiryShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable L2.5 expiry capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.expiry.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'expire_customer_subscription',
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
