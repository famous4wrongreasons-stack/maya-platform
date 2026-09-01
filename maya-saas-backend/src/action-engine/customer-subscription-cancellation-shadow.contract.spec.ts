import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
  customerSubscriptionCancellationShadowNormalizer,
} from './customer-subscription-cancellation-shadow.contract';

const canonicalInput = () => ({
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  subscriptionId: 'subscription-1',
  termIdentityHash: 'term-hash',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  currentLifecycleState: 'active',
  cancellationIntentIdentityHash: 'cancellation-intent-hash',
  requesterIdentityHash: 'requester-identity-hash',
  requesterRole: 'client',
  requesterAuthority: 'subscription_client',
  cancellationReason: 'customer_requested',
  effectiveMode: 'immediate_on_canonical_commit',
  cancellationIdentityHash: 'cancellation-identity-hash',
  cancellationContractVersion:
    CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'authorized_active_term',
  approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
  intendedStatus: 'canceled',
  providerBoundary: 'LOCAL_ONLY',
  paymentRefundIncluded: false,
  providerCancellationIncluded: false,
  unknownApplicable: false,
  mutatesImmutableTerm: false,
  createsRenewal: false,
  oneTimeTerminalClaim: true,
});

describe('P4-05 customer subscription cancellation Shadow contract', () => {
  it('normalizes one actor-authorized local cancellation plan', () => {
    expect(
      customerSubscriptionCancellationShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
    expect(
      customerSubscriptionCancellationShadowNormalizer({
        ...canonicalInput(),
        requesterRole: 'manager',
        requesterAuthority: 'authorized_staff_role',
        cancellationReason: 'staff_confirmed_customer_request',
      }),
    ).toMatchObject({
      requesterRole: 'manager',
      requesterAuthority: 'authorized_staff_role',
      cancellationReason: 'staff_confirmed_customer_request',
    });
  });

  it('rejects forged actor, reason, effective date, lifecycle, authority, and side effects', () => {
    for (const forged of [
      { requesterRole: 'employee' },
      { requesterAuthority: 'caller_asserted_owner' },
      { cancellationReason: 'refund_requested' },
      { effectiveMode: 'caller_supplied_date' },
      { currentLifecycleState: 'expired' },
      { intendedStatus: 'revoked' },
      { approvalRequirement: 'CALLER_APPROVED' },
      { providerBoundary: 'YOKASSA_CANCEL' },
      { paymentRefundIncluded: true },
      { providerCancellationIncluded: true },
      { unknownApplicable: true },
      { mutatesImmutableTerm: true },
      { createsRenewal: true },
      { oneTimeTerminalClaim: false },
      { effectiveAt: '2026-09-01T00:00:00.000Z' },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'subscription.direct' },
    ]) {
      expect(() =>
        customerSubscriptionCancellationShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable L2.5 cancellation capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.cancellation.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'cancel_customer_subscription',
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
