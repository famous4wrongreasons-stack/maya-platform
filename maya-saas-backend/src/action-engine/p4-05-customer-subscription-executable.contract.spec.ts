import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import {
  P4_05_EXECUTABLE_CAPABILITIES,
  P4_05_EXECUTABLE_REGISTRATIONS,
  P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
  P4_05_SCHEDULER_LIMITS,
  buildCustomerSubscriptionSchedulerEnvelope,
  remainingCustomerSubscriptionSchedulerChildren,
} from './p4-05-customer-subscription-executable.contract';

describe('P4-05 customer subscription executable contract', () => {
  it('registers exactly eight approved executable action classes', () => {
    expect(
      P4_05_EXECUTABLE_REGISTRATIONS.map((entry) => entry.actionClass),
    ).toEqual([
      'initiate_customer_subscription_purchase',
      'activate_customer_subscription',
      'initiate_customer_subscription_renewal',
      'activate_customer_subscription_renewal',
      'sync_customer_subscription_usage',
      'expire_customer_subscription',
      'cancel_customer_subscription',
      'revoke_customer_subscription',
    ]);
  });

  it('keeps provider dispatch limited to checkout initiation', () => {
    expect(
      P4_05_EXECUTABLE_REGISTRATIONS.filter(
        (entry) => entry.providerDispatch,
      ).map((entry) => entry.actionClass),
    ).toEqual([
      'initiate_customer_subscription_purchase',
      'initiate_customer_subscription_renewal',
    ]);
  });

  it('requires approval only for revocation', () => {
    expect(
      P4_05_EXECUTABLE_REGISTRATIONS.filter(
        (entry) => entry.approvalRequired,
      ).map((entry) => entry.actionClass),
    ).toEqual(['revoke_customer_subscription']);
  });

  it('publishes executable owners through the canonical registry', () => {
    const registry = new ActionCapabilityRegistry();
    expect(
      Object.values(P4_05_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).policyDecision,
      ),
    ).toEqual(Array(8).fill(ActionPolicyDecision.ALLOW));
    expect(
      Object.values(P4_05_EXECUTABLE_CAPABILITIES).map(
        (capability) => registry.get(capability).executorKey,
      ),
    ).toEqual([
      'customer-subscriptions.checkout',
      'customer-subscriptions.term',
      'customer-subscriptions.checkout',
      'customer-subscriptions.term',
      'customer-subscriptions.usage',
      'customer-subscriptions.terminal',
      'customer-subscriptions.terminal',
      'customer-subscriptions.terminal',
    ]);
  });

  it('builds a deterministic bounded per-term scheduler envelope', () => {
    const left = buildCustomerSubscriptionSchedulerEnvelope({
      tenantId: 'tenant-proof',
      now: new Date('2026-09-02T10:10:00.000Z'),
      candidates: [
        {
          actionClass: 'expire_customer_subscription',
          subscriptionId: 'sub-b',
          termIdentityHash: 'term-b',
          plannedUsageUnits: 0,
        },
        {
          actionClass: 'sync_customer_subscription_usage',
          subscriptionId: 'sub-a',
          termIdentityHash: 'term-a',
          plannedUsageUnits: 1,
        },
      ],
    });
    const right = buildCustomerSubscriptionSchedulerEnvelope({
      tenantId: 'tenant-proof',
      now: new Date('2026-09-02T10:59:59.000Z'),
      candidates: [
        {
          actionClass: 'sync_customer_subscription_usage',
          subscriptionId: 'sub-a',
          termIdentityHash: 'term-a',
          plannedUsageUnits: 1,
        },
        {
          actionClass: 'expire_customer_subscription',
          subscriptionId: 'sub-b',
          termIdentityHash: 'term-b',
          plannedUsageUnits: 0,
        },
      ],
    });
    expect(left.batchIdentityHash).toBe(right.batchIdentityHash);
    expect(left.candidateCount).toBe(2);
    expect(left.aggregateUsageUnits).toBe(1);
    expect(left.fanOutMode).toBe('BOUNDED_PER_TERM_EXECUTIONS');
    expect(left.providerPaymentExecutionOwner).toBe(false);
  });

  it('supports partial restart without changing child identities', () => {
    const envelope = buildCustomerSubscriptionSchedulerEnvelope({
      tenantId: 'tenant-proof',
      now: new Date('2026-09-02T11:00:00.000Z'),
      candidates: [
        {
          actionClass: 'sync_customer_subscription_usage',
          subscriptionId: 'sub-a',
          termIdentityHash: 'term-a',
          plannedUsageUnits: 1,
        },
        {
          actionClass: 'expire_customer_subscription',
          subscriptionId: 'sub-b',
          termIdentityHash: 'term-b',
          plannedUsageUnits: 0,
        },
      ],
    });
    expect(
      remainingCustomerSubscriptionSchedulerChildren({
        envelope,
        completedChildExecutionIdentities: new Set([
          envelope.childExecutionIdentities[0],
        ]),
      }),
    ).toEqual([envelope.childExecutionIdentities[1]]);
  });

  it('rejects envelopes above recipient or aggregate caps', () => {
    expect(() =>
      buildCustomerSubscriptionSchedulerEnvelope({
        tenantId: 'tenant-proof',
        now: new Date('2026-09-02T11:00:00.000Z'),
        candidates: Array.from(
          { length: P4_05_SCHEDULER_LIMITS.maxTermsPerEnvelope + 1 },
          (_, index) => ({
            actionClass: 'expire_customer_subscription' as const,
            subscriptionId: `sub-${index}`,
            termIdentityHash: `term-${index}`,
            plannedUsageUnits: 0,
          }),
        ),
      }),
    ).toThrow('scheduler fan-out is outside the cap');
    expect(() =>
      buildCustomerSubscriptionSchedulerEnvelope({
        tenantId: 'tenant-proof',
        now: new Date('2026-09-02T11:00:00.000Z'),
        candidates: [
          {
            actionClass: 'sync_customer_subscription_usage',
            subscriptionId: 'sub-a',
            termIdentityHash: 'term-a',
            plannedUsageUnits:
              P4_05_SCHEDULER_LIMITS.maxAggregateUsageUnits + 1,
          },
        ],
      }),
    ).toThrow('scheduler aggregate usage exceeds the cap');
  });

  it('keeps the scheduler envelope non-payment and approval-free within caps', () => {
    const registry = new ActionCapabilityRegistry();
    const capability = registry.get(P4_05_SCHEDULER_ENVELOPE_CAPABILITY);
    expect(capability.executorKey).toBe(
      'customer-subscriptions.scheduler-envelope',
    );
    expect(capability.approvalRequirement).toBe('NONE');
    expect(capability.riskFacets).toContain('non_value_envelope');
  });
});
