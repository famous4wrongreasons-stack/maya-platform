import {
  P4_08_POLICY_VERSION,
  P4_08_SAFETY_LIMITS,
  buildTenantBillingSchedulerEnvelope,
  tenantBillingCheckoutNormalizer,
  tenantBillingOutcomeNormalizer,
  tenantBillingPastDueNormalizer,
  tenantBillingRecurringNormalizer,
} from './p4-08-tenant-billing-executable.contract';

const policy = {
  policyVersion: P4_08_POLICY_VERSION,
  policySnapshotHash: 'policy_hash',
  approvalRequirement: 'NONE_WITHIN_APPROVED_CAPS',
};

function recurring(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_1',
    planId: 'plan_1',
    planSnapshotHash: 'plan_hash',
    amountKopecks: 299_000,
    currency: 'RUB',
    dueWindowEndsAt: '2026-09-01T00:00:00.000Z',
    billingMethodIdentityHash: 'method_hash',
    recurringIdentityHash: 'recurring_hash',
    providerRequestIdentitySeedHash: 'request_hash',
    envelopeIdentityHash: 'envelope_hash',
    childIndex: 0,
    envelopeChildCount: 1,
    envelopeAggregateKopecks: 299_000,
    ...P4_08_SAFETY_LIMITS,
    ...policy,
    expectedProviderState: 'PENDING',
    providerDispatchPerformed: false,
    paymentDerivedEntitlementMutations: 0,
    ...overrides,
  };
}

describe('P4-08 tenant billing contracts', () => {
  it('enforces same-plan-only active-window prepayment', () => {
    const base = {
      tenantId: 'tenant_1',
      planId: 'plan_1',
      planSnapshotHash: 'plan_hash',
      amountKopecks: 299_000,
      currency: 'RUB',
      activePlanId: 'plan_1',
      activeWindowEndsAt: '2026-10-01T00:00:00.000Z',
      samePlanPrepayment: true,
      checkoutIdentityHash: 'checkout_hash',
      providerRequestIdentitySeedHash: 'request_hash',
      returnUrlPolicyHash: 'return_hash',
      actorIdentityHash: 'actor_hash',
      ...policy,
      expectedProviderState: 'PENDING',
      providerDispatchPerformed: false,
      paymentDerivedEntitlementMutations: 0,
    };
    expect(tenantBillingCheckoutNormalizer(base)).toMatchObject({
      samePlanPrepayment: true,
      paymentDerivedEntitlementMutations: 0,
    });
    expect(() =>
      tenantBillingCheckoutNormalizer({ ...base, planId: 'plan_2' }),
    ).toThrow('same-plan-only');
  });

  it('enforces recurring per-payment and aggregate caps', () => {
    expect(tenantBillingRecurringNormalizer(recurring())).toMatchObject({
      amountKopecks: 299_000,
      maxChildrenPerEnvelope: 25,
    });
    expect(() =>
      tenantBillingRecurringNormalizer(recurring({ amountKopecks: 300_001 })),
    ).toThrow('approved range');
    expect(() =>
      tenantBillingRecurringNormalizer(
        recurring({ envelopeAggregateKopecks: 7_500_001 }),
      ),
    ).toThrow('approved range');
  });

  it('accepts only authoritative terminal outcomes, never pending/unknown', () => {
    const base = {
      tenantId: 'tenant_1',
      billingPaymentId: 'payment_1',
      originActionExecutionId: 'execution_1',
      planId: 'plan_1',
      amountKopecks: 299_000,
      currency: 'RUB',
      purpose: 'recurring',
      providerPaymentIdentityHash: 'provider_hash',
      providerStatus: 'succeeded',
      providerPaidAt: '2026-09-02T10:00:00.000Z',
      providerMethodIdentityHash: 'method_hash',
      outcomeIdentityHash: 'outcome_hash',
      authoritativeProviderRead: true,
      ...policy,
      paymentDerivedEntitlementMutationPerformed: false,
    };
    expect(tenantBillingOutcomeNormalizer(base)).toMatchObject({
      providerStatus: 'succeeded',
      authoritativeProviderRead: true,
    });
    for (const providerStatus of ['pending', 'unknown']) {
      expect(() =>
        tenantBillingOutcomeNormalizer({ ...base, providerStatus }),
      ).toThrow('not authoritative');
    }
  });

  it('fails past-due planning closed while a payment remains unresolved', () => {
    const base = {
      tenantId: 'tenant_1',
      accessWindowEndsAt: '2026-09-01T00:00:00.000Z',
      transitionAt: '2026-09-02T00:00:00.000Z',
      pastDueAt: '2026-09-01T00:00:00.000Z',
      graceEndsAt: '2026-09-08T00:00:00.000Z',
      canceledRecurringPaymentId: null,
      transitionIdentityHash: 'transition_hash',
      pendingPaymentExecutionIds: [],
      ...policy,
      pastDueMutationPerformed: false,
    };
    expect(tenantBillingPastDueNormalizer(base)).toMatchObject({
      pendingPaymentExecutionIds: [],
    });
    expect(() =>
      tenantBillingPastDueNormalizer({
        ...base,
        pendingPaymentExecutionIds: ['unknown_execution'],
      }),
    ).toThrow('zero unresolved');
  });

  it('builds deterministic, order-independent bounded scheduler envelopes', () => {
    const candidate = (tenantId: string, amountKopecks = 299_000) => ({
      tenantId,
      dueWindowEndsAt: '2026-09-01T00:00:00.000Z',
      planId: 'plan_1',
      planSnapshotHash: 'plan_hash',
      amountKopecks,
      currency: 'RUB',
    });
    const now = new Date('2026-09-02T10:17:00.000Z');
    const first = buildTenantBillingSchedulerEnvelope({
      now,
      candidates: [candidate('tenant_b'), candidate('tenant_a')],
    });
    const second = buildTenantBillingSchedulerEnvelope({
      now,
      candidates: [candidate('tenant_a'), candidate('tenant_b')],
    });
    expect(first).toEqual(second);
    expect(first.childCount).toBe(2);
    expect(first.aggregateKopecks).toBe(598_000);
    expect(() =>
      buildTenantBillingSchedulerEnvelope({
        now,
        candidates: Array.from({ length: 26 }, (_, index) =>
          candidate(`tenant_${index}`),
        ),
      }),
    ).toThrow('child cap');
  });
});
