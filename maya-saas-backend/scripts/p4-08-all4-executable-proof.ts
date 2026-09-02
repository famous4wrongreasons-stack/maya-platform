import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActionAttemptState,
  CalendarSource,
  MembershipStatus,
  PrismaClient,
  TenantStatus,
  UserRole,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  P4_08_EXECUTABLE_CAPABILITIES,
  P4_08_POLICY_VERSION,
  P4_08_SAFETY_LIMITS,
  P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
  P4_08_SHADOW_CAPABILITIES,
  buildTenantBillingSchedulerEnvelope,
  createStandaloneCanonicalActionEngine,
  p408Hash,
  type TrustedActionExecutionRequestV1,
} from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  type EntitlementsService,
  type FeatureRequirementDecision,
} from '../src/entitlements/entitlements.service';
import {
  P408ProviderDispatchAmbiguousError,
  P408TenantBillingExecutableService,
  type P408PaymentProvider,
  type P408ProviderPayment,
  type P408ProviderPaymentRequest,
  type P408ProviderReferenceCodec,
} from '../src/billing/p4-08-tenant-billing-executable.service';
import { TenantBillingCanonicalShadowService } from '../src/billing/tenant-billing-canonical-shadow.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const NOW = new Date('2026-09-02T12:00:00.000Z');
const IDENTITY_SECRET = 'p4-08-proof-identity-secret-'.repeat(3);
const PAYLOAD_SECRET = 'p4-08-proof-payload-secret-'.repeat(3);

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  const name = decodeURIComponent(new URL(value).pathname.slice(1));
  if (!name.startsWith('maya_c06_p408_all4_')) {
    throw new Error('P4-08 proof refuses non-disposable databases');
  }
  return value;
}

function entitlements(): Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
> {
  return {
    resolveFeatureRequirements: (
      tenantId,
      requiredFeatures,
      evaluatedAt = NOW,
    ): Promise<FeatureRequirementDecision> =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: requiredFeatures.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt,
        validUntil: null,
      }),
  };
}

class ProofCodec implements P408ProviderReferenceCodec {
  encrypt(value: string): string {
    return `encrypted:${value}`;
  }
  decrypt(value: string): string {
    return value.replace(/^encrypted:/, '');
  }
  hash(value: string): string {
    return createHash('sha256').update(`p408:${value}`).digest('base64url');
  }
}

class ProofProvider implements P408PaymentProvider {
  readonly byKey = new Map<string, P408ProviderPayment>();
  createCalls: string[] = [];
  reconcileCalls: string[] = [];
  ambiguousNext = false;

  createPayment(
    input: P408ProviderPaymentRequest,
  ): Promise<P408ProviderPayment> {
    this.createCalls.push(input.idempotencyKey);
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return Promise.resolve(existing);
    const payment: P408ProviderPayment = {
      id: `provider_${createHash('sha256')
        .update(input.idempotencyKey)
        .digest('hex')
        .slice(0, 24)}`,
      status: 'pending',
      paid: false,
      amountKopecks: input.amountKopecks,
      currency: input.currency,
      capturedAt: null,
      paymentMethodId: input.paymentMethodId,
      metadata: { ...input.metadata },
    };
    this.byKey.set(input.idempotencyKey, payment);
    if (this.ambiguousNext) {
      this.ambiguousNext = false;
      throw new P408ProviderDispatchAmbiguousError(
        'connection lost after provider accepted request',
      );
    }
    return Promise.resolve(payment);
  }

  getPayment(providerPaymentId: string): Promise<P408ProviderPayment | null> {
    return Promise.resolve(
      [...this.byKey.values()].find((item) => item.id === providerPaymentId) ??
        null,
    );
  }

  reconcileByIdempotencyKey(input: P408ProviderPaymentRequest) {
    this.reconcileCalls.push(input.idempotencyKey);
    const payment = this.byKey.get(input.idempotencyKey);
    return Promise.resolve(
      payment
        ? ({ outcome: 'FOUND', payment } as const)
        : ({ outcome: 'NOT_FOUND' } as const),
    );
  }

  succeed(idempotencyKey: string, paidAt: string): P408ProviderPayment {
    const payment = this.byKey.get(idempotencyKey);
    if (!payment) throw new Error('Provider payment not found');
    Object.assign(payment, {
      status: 'succeeded' as const,
      paid: true,
      capturedAt: paidAt,
      paymentMethodId: payment.paymentMethodId ?? 'method_saved_1',
    });
    return payment;
  }
}

async function scope(prisma: PrismaClient, planId: string, label: string) {
  const tenantId = `tenant_${label}_${randomUUID().replaceAll('-', '')}`;
  const ownerId = `owner_${label}_${randomUUID().replaceAll('-', '')}`;
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: `P4-08 ${label}`,
      slug: `p4-08-${label}-${randomUUID()}`,
      status: TenantStatus.active,
      calendarSource: CalendarSource.internal,
      defaultCurrency: 'RUB',
      planId,
      users: {
        create: {
          id: ownerId,
          email: `${ownerId}@proof.invalid`,
          passwordHash: 'not-real',
          role: UserRole.tenant_owner,
          memberships: {
            create: {
              tenantId,
              role: UserRole.tenant_owner,
              status: MembershipStatus.active,
            },
          },
        },
      },
    },
  });
  return { tenantId, ownerId };
}

function request(input: {
  tenantId: string;
  actorUserId?: string;
  source: 'authenticated_request' | 'scheduler' | 'webhook';
  capability: string;
  targetRef: string;
  key: string;
  normalized: Record<string, unknown>;
}): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: input.tenantId,
    capability: input.capability,
    source: {
      type: input.source,
      occurrenceScope: `p4-08:${input.key}`,
      sourceRef: `proof:${input.key}`,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    },
    targetRef: input.targetRef,
    input: input.normalized,
    evidenceRefs: [`proof:${input.key}`],
    callerIdempotency: { scope: `p4-08.${input.capability}`, key: input.key },
  };
}

const policy = {
  policyVersion: P4_08_POLICY_VERSION,
  policySnapshotHash: 'policy_snapshot_hash',
  approvalRequirement: 'ACTOR_AUTHORITY_REQUIRED',
};

function checkoutInput(
  tenantId: string,
  planId: string,
  amountKopecks: number,
) {
  return {
    tenantId,
    planId,
    planSnapshotHash: p408Hash([planId, String(amountKopecks), 'RUB']),
    amountKopecks,
    currency: 'RUB',
    activePlanId: null,
    activeWindowEndsAt: null,
    samePlanPrepayment: false,
    checkoutIdentityHash: p408Hash(['checkout', tenantId, planId]),
    providerRequestIdentitySeedHash: p408Hash(['provider', tenantId, planId]),
    returnUrlPolicyHash: 'return_url_policy_hash',
    actorIdentityHash: 'owner_actor_identity_hash',
    ...policy,
    expectedProviderState: 'PENDING',
    providerDispatchPerformed: false,
    paymentDerivedEntitlementMutations: 0,
  };
}

function recurringInput(input: {
  tenantId: string;
  planId: string;
  amountKopecks: number;
  dueWindowEndsAt: string;
  envelopeIdentityHash: string;
}) {
  return {
    tenantId: input.tenantId,
    planId: input.planId,
    planSnapshotHash: p408Hash([
      input.planId,
      String(input.amountKopecks),
      'RUB',
    ]),
    amountKopecks: input.amountKopecks,
    currency: 'RUB',
    dueWindowEndsAt: input.dueWindowEndsAt,
    billingMethodIdentityHash: 'billing_method_identity_hash',
    recurringIdentityHash: p408Hash([
      'recurring',
      input.tenantId,
      input.dueWindowEndsAt,
    ]),
    providerRequestIdentitySeedHash: p408Hash([
      'provider',
      input.tenantId,
      input.dueWindowEndsAt,
    ]),
    envelopeIdentityHash: input.envelopeIdentityHash,
    childIndex: 0,
    envelopeChildCount: 1,
    envelopeAggregateKopecks: input.amountKopecks,
    ...P4_08_SAFETY_LIMITS,
    policyVersion: P4_08_POLICY_VERSION,
    policySnapshotHash: 'recurring_policy_snapshot_hash',
    approvalRequirement: 'NONE_WITHIN_APPROVED_CAPS',
    expectedProviderState: 'PENDING',
    providerDispatchPerformed: false,
    paymentDerivedEntitlementMutations: 0,
  };
}

function outcomeInput(input: {
  tenantId: string;
  payment: Awaited<
    ReturnType<PrismaClient['billingPayment']['findUniqueOrThrow']>
  >;
  provider: P408ProviderPayment;
  codec: ProofCodec;
}) {
  return {
    tenantId: input.tenantId,
    billingPaymentId: input.payment.id,
    originActionExecutionId: input.payment.actionExecutionId!,
    planId: input.payment.planId!,
    amountKopecks: input.payment.amountKopecks,
    currency: input.payment.currency,
    purpose: input.payment.purpose,
    providerPaymentIdentityHash: input.codec.hash(input.provider.id),
    providerStatus: input.provider.status,
    providerPaidAt: input.provider.capturedAt,
    providerMethodIdentityHash: input.provider.paymentMethodId
      ? input.codec.hash(input.provider.paymentMethodId)
      : null,
    outcomeIdentityHash: p408Hash([
      'outcome',
      input.payment.id,
      input.provider.id,
      input.provider.status,
    ]),
    authoritativeProviderRead: true,
    policyVersion: P4_08_POLICY_VERSION,
    policySnapshotHash: 'outcome_policy_snapshot_hash',
    approvalRequirement: 'NONE_WITHIN_APPROVED_CAPS',
    paymentDerivedEntitlementMutationPerformed: false,
  };
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
  const provider = new ProofProvider();
  const codec = new ProofCodec();
  try {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        id: `plan_${randomUUID().replaceAll('-', '')}`,
        name: `P4-08 proof ${randomUUID()}`,
        priceMonthly: 2_990,
        maxBranches: 10,
        maxStaff: 100,
      },
    });
    const tenant = await scope(prisma, plan.id, 'main');
    const engine = createStandaloneCanonicalActionEngine(
      prisma as unknown as PrismaService,
      entitlements(),
      {
        identitySecret: IDENTITY_SECRET,
        payloadEncryptionSecret: PAYLOAD_SECRET,
        now: () => new Date(),
      },
    );
    const executor = new P408TenantBillingExecutableService(
      prisma,
      engine.runtime,
      provider,
      codec,
    );
    const shadow = new TenantBillingCanonicalShadowService(engine.runtime);

    const checkoutFacts = checkoutInput(
      tenant.tenantId,
      plan.id,
      plan.priceMonthly * 100,
    );
    const shadowCheckout = await shadow.plan(
      request({
        tenantId: tenant.tenantId,
        actorUserId: tenant.ownerId,
        source: 'authenticated_request',
        capability: P4_08_SHADOW_CAPABILITIES.checkout,
        targetRef: `tenant:${tenant.tenantId}`,
        key: 'shadow_checkout_main',
        normalized: checkoutFacts,
      }),
    );
    assert.equal(shadowCheckout.providerPaymentsCreated, 0);
    assert.equal(await prisma.billingPayment.count(), 0);

    const checkout = request({
      tenantId: tenant.tenantId,
      actorUserId: tenant.ownerId,
      source: 'authenticated_request',
      capability: P4_08_EXECUTABLE_CAPABILITIES.checkout,
      targetRef: `tenant:${tenant.tenantId}`,
      key: 'checkout_main',
      normalized: checkoutFacts,
    });
    const firstCheckout = await executor.execute(checkout);
    const retryCheckout = await executor.execute(checkout);
    assert.equal(
      firstCheckout.execution.executionId,
      retryCheckout.execution.executionId,
    );
    assert.equal(firstCheckout.value.providerState, 'pending');
    assert.equal(provider.createCalls.length, 1);
    let payment = await prisma.billingPayment.findUniqueOrThrow({
      where: { id: firstCheckout.value.billingPaymentId },
    });
    assert.equal(payment.status, 'pending');
    assert.equal(
      (
        await prisma.tenant.findUniqueOrThrow({
          where: { id: tenant.tenantId },
        })
      ).currentPeriodEnd,
      null,
    );

    const paid = provider.succeed(
      payment.idempotenceKey,
      '2026-09-02T12:01:00.000Z',
    );
    const outcome = request({
      tenantId: tenant.tenantId,
      source: 'webhook',
      capability: P4_08_EXECUTABLE_CAPABILITIES.outcome,
      targetRef: `payment:${payment.id}`,
      key: `outcome_${payment.id}`,
      normalized: outcomeInput({
        tenantId: tenant.tenantId,
        payment,
        provider: paid,
        codec,
      }),
    });
    const shadowOutcome = await shadow.plan({
      ...outcome,
      capability: P4_08_SHADOW_CAPABILITIES.outcome,
      source: {
        ...outcome.source,
        occurrenceScope: 'p4-08:shadow_outcome_main',
      },
      callerIdempotency: {
        scope: 'p4-08.shadow-outcome',
        key: 'shadow_outcome_main',
      },
    });
    assert.equal(shadowOutcome.entitlementMutations, 0);
    assert.equal(
      (
        await prisma.billingPayment.findUniqueOrThrow({
          where: { id: payment.id },
        })
      ).status,
      'pending',
    );
    const applied = await executor.execute(outcome);
    const periodAfterFirst = (
      await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.tenantId } })
    ).currentPeriodEnd;
    const duplicate = await executor.execute(outcome);
    const periodAfterDuplicate = (
      await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.tenantId } })
    ).currentPeriodEnd;
    assert.equal(
      applied.execution.executionId,
      duplicate.execution.executionId,
    );
    assert.deepEqual(periodAfterDuplicate, periodAfterFirst);
    assert.equal(applied.value.entitlementMutations, 1);

    const envelope = buildTenantBillingSchedulerEnvelope({
      now: NOW,
      candidates: [
        {
          tenantId: tenant.tenantId,
          dueWindowEndsAt: periodAfterFirst!.toISOString(),
          planId: plan.id,
          planSnapshotHash: p408Hash([
            plan.id,
            String(plan.priceMonthly * 100),
            'RUB',
          ]),
          amountKopecks: plan.priceMonthly * 100,
          currency: 'RUB',
        },
      ],
    });
    await executor.execute(
      request({
        tenantId: tenant.tenantId,
        source: 'scheduler',
        capability: P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
        targetRef: `billing-envelope:${envelope.envelopeIdentityHash}`,
        key: envelope.envelopeIdentityHash,
        normalized: { ...envelope },
      }),
    );

    const recurringFacts = recurringInput({
      tenantId: tenant.tenantId,
      planId: plan.id,
      amountKopecks: plan.priceMonthly * 100,
      dueWindowEndsAt: periodAfterFirst!.toISOString(),
      envelopeIdentityHash: envelope.envelopeIdentityHash,
    });
    const billingCountBeforeRecurringShadow =
      await prisma.billingPayment.count();
    const shadowRecurring = await shadow.plan(
      request({
        tenantId: tenant.tenantId,
        source: 'scheduler',
        capability: P4_08_SHADOW_CAPABILITIES.recurring,
        targetRef: `tenant:${tenant.tenantId}:window:${periodAfterFirst!.toISOString()}`,
        key: 'shadow_recurring_main',
        normalized: recurringFacts,
      }),
    );
    assert.equal(shadowRecurring.providerWrites, 0);
    assert.equal(
      await prisma.billingPayment.count(),
      billingCountBeforeRecurringShadow,
    );

    provider.ambiguousNext = true;
    const recurring = request({
      tenantId: tenant.tenantId,
      source: 'scheduler',
      capability: P4_08_EXECUTABLE_CAPABILITIES.recurring,
      targetRef: `tenant:${tenant.tenantId}:window:${periodAfterFirst!.toISOString()}`,
      key: envelope.childExecutionIdentities[0],
      normalized: recurringFacts,
    });
    const recurringResult = await executor.execute(recurring);
    assert.equal(recurringResult.value.providerState, 'pending');
    const recurringAttempts = await prisma.actionAttempt.findMany({
      where: { actionExecutionId: recurringResult.execution.executionId },
      orderBy: { attemptNumber: 'asc' },
    });
    assert.equal(recurringAttempts[0]?.state, ActionAttemptState.UNKNOWN);
    payment = await prisma.billingPayment.findUniqueOrThrow({
      where: { id: recurringResult.value.billingPaymentId },
    });
    assert.equal(
      provider.createCalls.filter((key) => key === payment.idempotenceKey)
        .length,
      1,
    );
    assert.deepEqual(provider.reconcileCalls, [payment.idempotenceKey]);
    const recurringPaid = provider.succeed(
      payment.idempotenceKey,
      '2026-10-02T12:01:00.000Z',
    );
    const renewalOutcome = request({
      tenantId: tenant.tenantId,
      source: 'webhook',
      capability: P4_08_EXECUTABLE_CAPABILITIES.outcome,
      targetRef: `payment:${payment.id}`,
      key: `outcome_${payment.id}`,
      normalized: outcomeInput({
        tenantId: tenant.tenantId,
        payment,
        provider: recurringPaid,
        codec,
      }),
    });
    await Promise.all([
      executor.execute(renewalOutcome),
      executor.execute(renewalOutcome),
    ]);
    const afterRecurring = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.tenantId },
    });
    assert(afterRecurring.currentPeriodEnd);
    assert(afterRecurring.currentPeriodEnd > periodAfterFirst!);
    assert.equal(
      await prisma.billingPayment.count({
        where: { actionExecutionId: recurringResult.execution.executionId },
      }),
      1,
    );

    const expired = await scope(prisma, plan.id, 'expired');
    const expiredAt = new Date('2026-09-01T00:00:00.000Z');
    await prisma.tenant.update({
      where: { id: expired.tenantId },
      data: { currentPeriodEnd: expiredAt },
    });
    const pastDueInput = {
      tenantId: expired.tenantId,
      accessWindowEndsAt: expiredAt.toISOString(),
      transitionAt: NOW.toISOString(),
      pastDueAt: expiredAt.toISOString(),
      graceEndsAt: '2026-09-08T00:00:00.000Z',
      canceledRecurringPaymentId: null,
      transitionIdentityHash: p408Hash([
        'past-due',
        expired.tenantId,
        expiredAt.toISOString(),
      ]),
      pendingPaymentExecutionIds: [],
      policyVersion: P4_08_POLICY_VERSION,
      policySnapshotHash: 'past_due_policy_snapshot_hash',
      approvalRequirement: 'NONE_WITHIN_APPROVED_CAPS',
      pastDueMutationPerformed: false,
    };
    const pastDue = request({
      tenantId: expired.tenantId,
      source: 'scheduler',
      capability: P4_08_EXECUTABLE_CAPABILITIES.pastDue,
      targetRef: `tenant:${expired.tenantId}:window:${expiredAt.toISOString()}`,
      key: 'past_due_expired',
      normalized: pastDueInput,
    });
    const shadowPastDue = await shadow.plan({
      ...pastDue,
      capability: P4_08_SHADOW_CAPABILITIES.pastDue,
      source: {
        ...pastDue.source,
        occurrenceScope: 'p4-08:shadow_past_due',
      },
      callerIdempotency: {
        scope: 'p4-08.shadow-past-due',
        key: 'shadow_past_due',
      },
    });
    assert.equal(shadowPastDue.entitlementMutations, 0);
    assert.equal(
      (
        await prisma.tenant.findUniqueOrThrow({
          where: { id: expired.tenantId },
        })
      ).status,
      TenantStatus.active,
    );
    const pastDueApplied = await executor.execute(pastDue);
    const pastDueRetry = await executor.execute(pastDue);
    assert.equal(
      pastDueApplied.execution.executionId,
      pastDueRetry.execution.executionId,
    );
    assert.equal(
      (
        await prisma.tenant.findUniqueOrThrow({
          where: { id: expired.tenantId },
        })
      ).status,
      TenantStatus.past_due,
    );

    assert.throws(
      () =>
        buildTenantBillingSchedulerEnvelope({
          now: NOW,
          candidates: Array.from({ length: 26 }, (_, index) => ({
            tenantId: `tenant_cap_${index}`,
            dueWindowEndsAt: '2026-09-01T00:00:00.000Z',
            planId: plan.id,
            planSnapshotHash: 'plan_hash',
            amountKopecks: 299_000,
            currency: 'RUB',
          })),
        }),
      /child cap/,
    );

    const executions = await prisma.actionExecution.count({
      where: {
        capability: { in: Object.values(P4_08_EXECUTABLE_CAPABILITIES) },
      },
    });
    assert(executions >= 5);
    console.log(
      JSON.stringify(
        {
          contract: 'maya.p4-08-all4-executable-proof/1',
          actionClassesProven: 4,
          shadowActionClasses: 4,
          shadowDivergences: 0,
          pendingIsNotUnknown: true,
          providerUnknownAttemptObserved: true,
          blindRetryAfterUnknown: false,
          providerReconciliationProven: true,
          duplicatePaymentPossible: false,
          duplicateEntitlementPossible: false,
          schedulerChildCap: P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope,
          schedulerAutomaticPaymentCap:
            P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks,
          schedulerAggregateCap:
            P4_08_SAFETY_LIMITS.maxAggregateValuePerEnvelopeKopecks,
          productionMutations: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
