import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
  customerSubscriptionUsageShadowNormalizer,
} from './customer-subscription-usage-shadow.contract';

const canonicalInput = () => ({
  canonicalClientId: 'client-7',
  providerClientIdentityHash: 'provider-client-hash',
  subscriptionId: 'subscription-1',
  termIdentityHash: 'term-hash',
  offerCode: 'haircut.senior',
  planCode: 'haircut',
  tier: 'senior',
  catalogVersion: 'p4-05.legacy-fixed-catalog.v1',
  planSnapshotHash: 'plan-snapshot-hash',
  serviceScopeHash: 'service-scope-hash',
  visitsIncluded: 2,
  termStartsAt: '2026-08-01T00:00:00.000Z',
  termEndsAt: '2026-08-31T00:00:00.000Z',
  provider: 'yclients',
  providerVisitRecordRefHash: 'visit-record-hash',
  providerVisitIdentityHash: 'visit-identity-hash',
  providerObservationSnapshotHash: 'observation-hash',
  providerServiceIdentityHash: 'service-identity-hash',
  providerServiceScopeRef: 'yclients.service.mens-haircut',
  visitOccurredAt: '2026-08-20T10:00:00.000Z',
  visitAttendance: 'arrived',
  units: 1,
  usageIdentityHash: 'usage-identity-hash',
  usageContractVersion: CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
  remainingUnitsBefore: 2,
  remainingUnitsAfter: 1,
  policyProfile: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
  policySnapshotHash: 'policy-snapshot-hash',
  eligibilityDecision: 'eligible_exact_attended_visit',
  approvalRequirement: 'NONE',
  unknownApplicable: false,
  providerWritesRequired: false,
});

describe('P4-05 customer subscription usage Shadow contract', () => {
  it('normalizes one exact immutable attended-visit claim', () => {
    expect(customerSubscriptionUsageShadowNormalizer(canonicalInput())).toEqual(
      canonicalInput(),
    );
  });

  it('rejects forged service, quantity, allowance, authority, and side-effect facts', () => {
    for (const forged of [
      { planCode: 'complex' },
      { tier: 'top' },
      { providerServiceScopeRef: 'yclients.service.beard-modeling' },
      { visitAttendance: 'awaiting' },
      { units: 2 },
      { remainingUnitsBefore: 999 },
      { remainingUnitsAfter: 2 },
      { visitOccurredAt: '2026-09-20T10:00:00.000Z' },
      { approvalRequirement: 'OWNER' },
      { unknownApplicable: true },
      { providerWritesRequired: true },
      { entitled: true },
      { approved: true },
      { autonomy: 'L5' },
      { policyDecision: 'ALLOW' },
      { executor: 'subscription.direct' },
    ]) {
      expect(() =>
        customerSubscriptionUsageShadowNormalizer({
          ...canonicalInput(),
          ...forged,
        }),
      ).toThrow();
    }
  });

  it('registers a physically non-executable L2.5 usage capability', () => {
    const capability = new ActionCapabilityRegistry().get(
      'customer-subscriptions.usage-sync.shadow.v1',
    );

    expect(capability).toMatchObject({
      actionClass: 'sync_customer_subscription_usage',
      targetKind: 'customer_subscription_usage',
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
