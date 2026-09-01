import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
import {
  CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
  customerSubscriptionRevocationShadowNormalizer,
} from './customer-subscription-revocation-shadow.contract';

const canonicalInput = () => ({
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  subscriptionId: 'subscription-1',
  termIdentityHash: 'term-hash',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  currentLifecycleState: 'active',
  revocationDecisionIdentityHash: 'revocation-decision-hash',
  revocationEvidenceIdentityHash: 'revocation-evidence-hash',
  requesterIdentityHash: 'requester-identity-hash',
  requesterRole: 'tenant_owner',
  requesterAuthority: 'tenant_owner_or_admin',
  revocationReason: 'approved_policy_revocation',
  effectiveMode: 'immediate_on_canonical_commit',
  approvalScopeHash: 'approval-scope-hash',
  approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
  revocationIdentityHash: 'revocation-identity-hash',
  revocationContractVersion: CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
  policyProfile: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'authorized_active_term_with_exact_evidence',
  approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
  intendedStatus: 'revoked',
  providerBoundary: 'LOCAL_ONLY',
  paymentRefundIncluded: false,
  providerCancellationIncluded: false,
  unknownApplicable: false,
  mutatesImmutableTerm: false,
  createsRenewal: false,
  oneTimeTerminalClaim: true,
});

describe('P4-05 customer subscription revocation Shadow contract', () => {
  it('normalizes one owner/admin-initiated approval-bound revocation plan', () => {
    expect(
      customerSubscriptionRevocationShadowNormalizer(canonicalInput()),
    ).toEqual(canonicalInput());
    expect(
      customerSubscriptionRevocationShadowNormalizer({
        ...canonicalInput(),
        requesterRole: 'administrator',
      }),
    ).toMatchObject({
      requesterRole: 'administrator',
      requesterAuthority: 'tenant_owner_or_admin',
      approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
    });
  });

  it('rejects forged actor, reason, approval, effective date, lifecycle, and side effects', () => {
    for (const forged of [
      { requesterRole: 'manager' },
      { requesterAuthority: 'caller_asserted_owner' },
      { revocationReason: 'payment_failed' },
      { effectiveMode: 'caller_supplied_date' },
      { approvalBindingMode: 'CALLER_APPROVED' },
      { approvalRequirement: 'NONE' },
      { currentLifecycleState: 'canceled' },
      { intendedStatus: 'canceled' },
      { providerBoundary: 'YOKASSA_CANCEL' },
      { paymentRefundIncluded: true },
      { providerCancellationIncluded: true },
      { unknownApplicable: true },
      { mutatesImmutableTerm: true },
      { createsRenewal: true },
      { oneTimeTerminalClaim: false },
      { effectiveAt: '2026-09-01T00:00:00.000Z' },
      { approved: true },
      { autonomy: 'L5' },
      { executor: 'subscription.direct' },
    ]) {
      expect(() =>
        customerSubscriptionRevocationShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable owner-approval-required capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.revocation.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'revoke_customer_subscription',
      targetKind: 'customer_subscription_term',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'REQUIRED',
      executorKey: 'shadow.none',
    });
    expect(capability.approvalTtlMs).toBe(30 * 60 * 1_000);
    expect(capability.retry.maxExecutionAttempts).toBe(1);
    expect(capability.retry.retryablePreDispatchErrors).toEqual(new Set());
    expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(false);
    expect(
      canonicalProductionPolicyDefinitions().find(
        (policy) => policy.capability === capability.capability,
      ),
    ).toMatchObject({
      approverPolicyKey: 'tenant-owner',
    });
  });
});
