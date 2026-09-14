import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionExecutionState,
  type ActionExecution,
  type BillingPayment,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  P4_08_EXECUTABLE_CAPABILITIES,
  P4_08_POLICY_VERSION,
  P4_08_SAFETY_LIMITS,
  P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
  buildTenantBillingSchedulerEnvelope,
  p408Hash,
  type ActionSourceType,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PAST_DUE_GRACE_DAYS } from '../tenants/tenant-access-state';
import type { CreateBillingCheckoutDto } from './dto/create-billing-checkout.dto';
import {
  type P408ExecutionValue,
  P408ContractError,
  P408TenantBillingExecutableService,
} from './p4-08-tenant-billing-executable.service';
import {
  P408ActionProviderReferenceCodec,
  P408YooKassaPaymentProvider,
} from './p4-08-yookassa-payment-provider';
import { BillingSystemGateway } from './billing-system.gateway';

type CanonicalPayment = BillingPayment & {
  actionExecution?: Pick<
    ActionExecution,
    | 'id'
    | 'state'
    | 'capability'
    | 'sourceType'
    | 'sourceRef'
    | 'actorUserId'
    | 'targetRef'
  > | null;
};

type Initiator = 'authenticated_request' | 'scheduler' | 'webhook';

@Injectable()
export class P408TenantBillingCanonicalCutoverService {
  private readonly logger = new Logger(
    P408TenantBillingCanonicalCutoverService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly gateway: BillingSystemGateway,
    private readonly executor: P408TenantBillingExecutableService,
    private readonly provider: P408YooKassaPaymentProvider,
    private readonly providerCodec: P408ActionProviderReferenceCodec,
    private readonly kernel: ActionEngineKernel,
    private readonly config: ConfigService,
  ) {}

  async createCheckout(
    tenantId: string,
    actorUserId: string,
    dto: CreateBillingCheckoutDto,
  ) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    this.provider.checkoutReturnUrl(dto.returnUrl);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scoped },
      include: { plan: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const planId = dto.planId ?? tenant.planId;
    if (!planId) throw new BadRequestException('billing_plan_required');
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    const amountKopecks = this.amountKopecks(plan.priceMonthly);
    const currency = tenant.defaultCurrency.toUpperCase();
    if (currency !== 'RUB') {
      throw new BadRequestException('billing_currency_not_supported');
    }

    const pending = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId: scoped,
        purpose: 'initial_checkout',
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      include: { actionExecution: true },
    });
    if (pending) {
      if (pending.planId !== plan.id) {
        throw new ConflictException('billing_payment_pending');
      }
      await this.resumeCanonicalOrigin(pending);
      return this.checkoutResult(scoped, pending.id);
    }

    const previous = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId: scoped,
        purpose: 'initial_checkout',
        status: { in: ['succeeded', 'canceled', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const active = Boolean(
      tenant.currentPeriodEnd && tenant.currentPeriodEnd > new Date(),
    );
    if (active && tenant.planId !== plan.id) {
      throw new ConflictException('billing_plan_change_contract_required');
    }
    const planSnapshotHash = this.planSnapshotHash(
      plan.id,
      amountKopecks,
      currency,
    );
    const checkoutIdentityHash = p408Hash([
      'p4-08.checkout.v1',
      scoped,
      previous?.id ?? 'initial',
      planSnapshotHash,
      String(amountKopecks),
      currency,
    ]);
    const input = {
      tenantId: scoped,
      planId: plan.id,
      planSnapshotHash,
      amountKopecks,
      currency,
      activePlanId: active ? tenant.planId : null,
      activeWindowEndsAt: active
        ? tenant.currentPeriodEnd?.toISOString()
        : null,
      samePlanPrepayment: active,
      checkoutIdentityHash,
      providerRequestIdentitySeedHash: p408Hash([
        'p4-08.yookassa-request.v1',
        scoped,
        checkoutIdentityHash,
      ]),
      returnUrlPolicyHash: p408Hash([
        'p4-08.return-url-policy.v1',
        this.provider.checkoutReturnUrl(),
      ]),
      actorIdentityHash: p408Hash(['p4-08.actor.v1', scoped, actorUserId]),
      policyVersion: P4_08_POLICY_VERSION,
      policySnapshotHash: p408Hash([
        P4_08_POLICY_VERSION,
        scoped,
        planSnapshotHash,
        actorUserId,
        active ? 'same-plan-prepayment' : 'new-window',
      ]),
      approvalRequirement: 'ACTOR_AUTHORITY_REQUIRED',
      expectedProviderState: 'PENDING',
      providerDispatchPerformed: false,
      paymentDerivedEntitlementMutations: 0,
    };
    const receipt = await this.executor.execute(
      this.request({
        tenantId: scoped,
        capability: P4_08_EXECUTABLE_CAPABILITIES.checkout,
        source: 'authenticated_request',
        sourceRef: 'billing:http:checkout',
        actorUserId,
        targetRef: `tenant-billing:${scoped}`,
        identity: checkoutIdentityHash,
        input,
      }),
    );
    await this.applyImmediateTerminal(scoped, receipt.value, 'webhook');
    return this.checkoutResult(scoped, this.paymentId(receipt.value));
  }

  async chargeTenant(tenantId: string, actorUserId?: string) {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const existing = await this.prisma.billingPayment.findFirst({
      where: { tenantId: scoped, purpose: 'recurring', status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { actionExecution: true },
    });
    if (existing) {
      await this.resumeCanonicalOrigin(existing);
      return this.chargeResult(scoped, existing.id);
    }
    const candidate = await this.gateway.getBillingCandidate(scoped);
    if (!candidate?.planId || !candidate.plan || !candidate.billingMethodId) {
      throw new BadRequestException('billing_method_or_plan_required');
    }
    const dueWindow = candidate.currentPeriodEnd ?? candidate.trialEndsAt;
    if (!dueWindow || dueWindow > new Date()) {
      throw new BadRequestException('billing_window_not_due');
    }
    const amountKopecks = this.amountKopecks(candidate.plan.priceMonthly);
    const envelope = buildTenantBillingSchedulerEnvelope({
      now: new Date(),
      candidates: [
        {
          tenantId: scoped,
          dueWindowEndsAt: dueWindow.toISOString(),
          planId: candidate.plan.id,
          planSnapshotHash: this.planSnapshotHash(
            candidate.plan.id,
            amountKopecks,
            candidate.defaultCurrency,
          ),
          amountKopecks,
          currency: candidate.defaultCurrency,
        },
      ],
    });
    const value = await this.executeRecurringCandidate({
      candidate,
      dueWindow,
      envelope,
      childIndex: 0,
      source: actorUserId ? 'authenticated_request' : 'scheduler',
      actorUserId,
    });
    await this.applyImmediateTerminal(scoped, value, 'scheduler');
    return this.chargeResult(scoped, this.paymentId(value));
  }

  async handleYooKassaWebhook(payload: Record<string, unknown>) {
    const event = typeof payload.event === 'string' ? payload.event : null;
    const object = this.record(payload.object);
    const providerPaymentId =
      typeof object?.id === 'string' ? object.id.trim() : '';
    if (payload.type !== 'notification' || !event || !providerPaymentId) {
      throw new BadRequestException('billing_webhook_invalid');
    }
    if (!event.startsWith('payment.'))
      return { ok: true, ignored: true, event };
    const payment =
      await this.gateway.findPaymentByProviderPaymentId(providerPaymentId);
    if (!payment?.actionExecutionId) {
      return {
        ok: true,
        ignored: true,
        event,
        reason: 'canonical_payment_binding_absent',
      };
    }
    return this.tenantContext.runAsSystemTenant(payment.tenantId, async () => {
      const value = await this.applyProviderOutcome(payment, 'webhook');
      const current = await this.payment(payment.tenantId, payment.id);
      return {
        ok: true,
        event,
        payment: this.serializePayment(current),
        tenant: value?.tenantStatus
          ? {
              id: payment.tenantId,
              status: value.tenantStatus,
              current_period_start: value.periodStart ?? null,
              current_period_end: value.periodEnd ?? null,
            }
          : null,
      };
    });
  }

  async reconcilePendingPayments(now = new Date()) {
    const olderThan = new Date(now.getTime() - 5 * 60 * 1000);
    const pending = await this.gateway.listPendingPayments(olderThan);
    const result = { checked: pending.length, applied: 0, failed: 0 };
    for (const item of pending) {
      if (!item.actionExecutionId) {
        result.failed += 1;
        continue;
      }
      try {
        await this.tenantContext.runAsSystemTenant(item.tenantId, async () => {
          await this.resumeCanonicalOrigin(item);
          const payment = await this.payment(item.tenantId, item.id);
          const value = await this.applyProviderOutcome(payment, 'scheduler');
          if (value) result.applied += 1;
        });
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          `Canonical billing reconciliation failed: ${this.errorName(error)}`,
        );
      }
    }
    return result;
  }

  async runDueBilling(now = new Date()) {
    const candidates = await this.gateway.listBillingCandidates(
      now,
      P4_08_SAFETY_LIMITS.maxChildrenPerEnvelope,
    );
    const result = {
      checked: candidates.length,
      charged: 0,
      marked_past_due: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ tenant_id: string; message: string }>,
    };
    const recurring = candidates.filter(
      (candidate) =>
        candidate.billingMethodId && candidate.planId && candidate.plan,
    );
    const validRecurring = recurring.filter((candidate) => {
      const amount = this.amountKopecks(candidate.plan!.priceMonthly);
      return amount <= P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks;
    });
    const envelope = validRecurring.length
      ? buildTenantBillingSchedulerEnvelope({
          now,
          candidates: validRecurring.map((candidate) => {
            const due = candidate.currentPeriodEnd ?? candidate.trialEndsAt!;
            const amountKopecks = this.amountKopecks(
              candidate.plan!.priceMonthly,
            );
            return {
              tenantId: candidate.id,
              dueWindowEndsAt: due.toISOString(),
              planId: candidate.plan!.id,
              planSnapshotHash: this.planSnapshotHash(
                candidate.plan!.id,
                amountKopecks,
                candidate.defaultCurrency,
              ),
              amountKopecks,
              currency: candidate.defaultCurrency,
            };
          }),
        })
      : null;
    const childIndex = new Map(
      (envelope?.childExecutionIdentities ?? []).map((identity, index) => [
        identity,
        index,
      ]),
    );

    for (const candidate of candidates) {
      await this.tenantContext.runAsSystemTenant(candidate.id, async () => {
        try {
          const due = candidate.currentPeriodEnd ?? candidate.trialEndsAt;
          if (!due || due > now) {
            result.skipped += 1;
            return;
          }
          if (
            candidate.billingMethodId &&
            candidate.planId &&
            candidate.plan &&
            this.recurringEnabled()
          ) {
            const amount = this.amountKopecks(candidate.plan.priceMonthly);
            if (
              amount > P4_08_SAFETY_LIMITS.maxAutomaticPaymentKopecks ||
              !envelope
            ) {
              throw new P408ContractError(
                'Automatic billing safety cap exceeded',
              );
            }
            const identity = this.recurringIdentity(
              candidate.id,
              due,
              candidate.plan.id,
              amount,
              candidate.defaultCurrency,
            );
            const index = childIndex.get(identity);
            if (index === undefined) {
              throw new P408ContractError(
                'Recurring candidate is outside the canonical envelope',
              );
            }
            await this.executeEnvelope(candidate.id, envelope);
            const value = await this.executeRecurringCandidate({
              candidate,
              dueWindow: due,
              envelope,
              childIndex: index,
              source: 'scheduler',
            });
            await this.applyImmediateTerminal(candidate.id, value, 'scheduler');
            result.charged += 1;
            return;
          }
          await this.transitionPastDue(candidate.id, now);
          result.marked_past_due += 1;
        } catch (error) {
          result.failed += 1;
          result.errors.push({
            tenant_id: candidate.id,
            message: this.errorName(error),
          });
        }
      });
    }
    return result;
  }

  private async executeRecurringCandidate(input: {
    candidate: Awaited<
      ReturnType<BillingSystemGateway['getBillingCandidate']>
    > extends infer T
      ? NonNullable<T>
      : never;
    dueWindow: Date;
    envelope: ReturnType<typeof buildTenantBillingSchedulerEnvelope>;
    childIndex: number;
    source: Exclude<Initiator, 'webhook'>;
    actorUserId?: string;
  }): Promise<P408ExecutionValue> {
    const candidate = input.candidate;
    if (!candidate.plan || !candidate.billingMethodId) {
      throw new P408ContractError('Recurring billing facts are incomplete');
    }
    const amountKopecks = this.amountKopecks(candidate.plan.priceMonthly);
    const planSnapshotHash = this.planSnapshotHash(
      candidate.plan.id,
      amountKopecks,
      candidate.defaultCurrency,
    );
    const recurringIdentityHash = this.recurringIdentity(
      candidate.id,
      input.dueWindow,
      candidate.plan.id,
      amountKopecks,
      candidate.defaultCurrency,
    );
    const request = this.request({
      tenantId: candidate.id,
      capability: P4_08_EXECUTABLE_CAPABILITIES.recurring,
      source: input.source,
      sourceRef:
        input.source === 'scheduler'
          ? 'billing:scheduler:recurring'
          : 'billing:http:manual-recurring',
      actorUserId: input.actorUserId,
      targetRef: `tenant-billing:${candidate.id}:window:${input.dueWindow.toISOString()}`,
      identity: recurringIdentityHash,
      input: {
        tenantId: candidate.id,
        planId: candidate.plan.id,
        planSnapshotHash,
        amountKopecks,
        currency: candidate.defaultCurrency,
        dueWindowEndsAt: input.dueWindow.toISOString(),
        billingMethodIdentityHash: this.providerCodec.hash(
          candidate.billingMethodId,
        ),
        recurringIdentityHash,
        providerRequestIdentitySeedHash: p408Hash([
          'p4-08.yookassa-recurring.v1',
          candidate.id,
          recurringIdentityHash,
        ]),
        envelopeIdentityHash: input.envelope.envelopeIdentityHash,
        childIndex: input.childIndex,
        envelopeChildCount: input.envelope.childCount,
        envelopeAggregateKopecks: input.envelope.aggregateKopecks,
        ...P4_08_SAFETY_LIMITS,
        policyVersion: P4_08_POLICY_VERSION,
        policySnapshotHash: p408Hash([
          P4_08_POLICY_VERSION,
          candidate.id,
          recurringIdentityHash,
          input.envelope.envelopeIdentityHash,
        ]),
        approvalRequirement: input.actorUserId
          ? 'ACTOR_AUTHORITY_REQUIRED'
          : 'NONE_WITHIN_APPROVED_CAPS',
        expectedProviderState: 'PENDING',
        providerDispatchPerformed: false,
        paymentDerivedEntitlementMutations: 0,
      },
    });
    return (await this.executor.execute(request)).value;
  }

  private async executeEnvelope(
    tenantId: string,
    envelope: ReturnType<typeof buildTenantBillingSchedulerEnvelope>,
  ): Promise<void> {
    await this.executor.execute(
      this.request({
        tenantId,
        capability: P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
        source: 'scheduler',
        sourceRef: 'billing:scheduler:bounded-envelope',
        targetRef: `billing-envelope:${envelope.envelopeIdentityHash}`,
        identity: envelope.envelopeIdentityHash,
        input: { ...envelope },
      }),
    );
  }

  private async transitionPastDue(
    tenantId: string,
    observedAt: Date,
    canceledRecurringPaymentId: string | null = null,
  ): Promise<P408ExecutionValue> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const boundary = tenant.currentPeriodEnd ?? tenant.trialEndsAt;
    if (!boundary || boundary > observedAt) {
      throw new P408ContractError('Billing access window is not expired');
    }
    const pending = await this.prisma.billingPayment.findMany({
      where: { tenantId, status: 'pending' },
      select: { actionExecutionId: true },
    });
    if (pending.length) {
      throw new P408ContractError('billing_payment_pending_or_unknown');
    }
    const transitionIdentityHash = p408Hash([
      'p4-08.past-due.v1',
      tenantId,
      boundary.toISOString(),
      canceledRecurringPaymentId ?? '',
    ]);
    const grace = new Date(
      boundary.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    const request = this.request({
      tenantId,
      capability: P4_08_EXECUTABLE_CAPABILITIES.pastDue,
      source: 'scheduler',
      sourceRef: 'billing:scheduler:past-due',
      targetRef: `tenant-billing:${tenantId}:window:${boundary.toISOString()}`,
      identity: transitionIdentityHash,
      input: {
        tenantId,
        accessWindowEndsAt: boundary.toISOString(),
        transitionAt: boundary.toISOString(),
        pastDueAt: boundary.toISOString(),
        graceEndsAt: grace.toISOString(),
        canceledRecurringPaymentId,
        transitionIdentityHash,
        pendingPaymentExecutionIds: [],
        policyVersion: P4_08_POLICY_VERSION,
        policySnapshotHash: p408Hash([
          P4_08_POLICY_VERSION,
          tenantId,
          boundary.toISOString(),
          'past-due',
        ]),
        approvalRequirement: 'NONE_WITHIN_APPROVED_CAPS',
        pastDueMutationPerformed: false,
      },
    });
    return (await this.executor.execute(request)).value;
  }

  private async applyImmediateTerminal(
    tenantId: string,
    value: P408ExecutionValue,
    source: 'webhook' | 'scheduler',
  ): Promise<P408ExecutionValue | null> {
    if (
      value.providerState !== 'succeeded' &&
      value.providerState !== 'canceled'
    ) {
      return null;
    }
    return this.applyProviderOutcome(
      await this.paymentByExecution(tenantId, value.actionExecutionId),
      source,
    );
  }

  private async applyProviderOutcome(
    payment: CanonicalPayment,
    source: 'webhook' | 'scheduler',
  ): Promise<P408ExecutionValue | null> {
    if (!payment.actionExecutionId || !payment.providerPaymentId) return null;
    const provider = await this.provider.getPayment(payment.providerPaymentId);
    if (
      !provider ||
      provider.status === 'pending' ||
      provider.status === 'unknown'
    ) {
      return null;
    }
    if (!payment.planId) {
      throw new P408ContractError('BillingPayment plan binding is absent');
    }
    const outcomeIdentityHash = p408Hash([
      'p4-08.payment-outcome.v1',
      payment.tenantId,
      payment.id,
      this.providerCodec.hash(provider.id),
      provider.status,
    ]);
    const request = this.request({
      tenantId: payment.tenantId,
      capability: P4_08_EXECUTABLE_CAPABILITIES.outcome,
      source,
      sourceRef:
        source === 'webhook'
          ? `billing:webhook:${this.providerCodec.hash(provider.id)}`
          : `billing:reconciliation:${this.providerCodec.hash(provider.id)}`,
      targetRef: `billing-payment:${payment.id}`,
      identity: outcomeIdentityHash,
      input: {
        tenantId: payment.tenantId,
        billingPaymentId: payment.id,
        originActionExecutionId: payment.actionExecutionId,
        planId: payment.planId,
        amountKopecks: payment.amountKopecks,
        currency: payment.currency,
        purpose: payment.purpose,
        providerPaymentIdentityHash: this.providerCodec.hash(provider.id),
        providerStatus: provider.status,
        providerPaidAt: provider.capturedAt,
        providerMethodIdentityHash: provider.paymentMethodId
          ? this.providerCodec.hash(provider.paymentMethodId)
          : null,
        outcomeIdentityHash,
        authoritativeProviderRead: true,
        policyVersion: P4_08_POLICY_VERSION,
        policySnapshotHash: p408Hash([
          P4_08_POLICY_VERSION,
          payment.tenantId,
          payment.id,
          provider.status,
        ]),
        approvalRequirement: 'NONE_WITHIN_APPROVED_CAPS',
        paymentDerivedEntitlementMutationPerformed: false,
      },
    });
    const value = (await this.executor.execute(request)).value;
    if (provider.status === 'canceled' && payment.purpose === 'recurring') {
      await this.transitionPastDue(payment.tenantId, new Date(), payment.id);
    }
    return value;
  }

  private async resumeCanonicalOrigin(
    payment: CanonicalPayment,
  ): Promise<void> {
    if (!payment.actionExecutionId || !payment.actionExecution) {
      throw new ConflictException(
        'Legacy pending billing payment requires manual reconciliation',
      );
    }
    if (payment.actionExecution.state === ActionExecutionState.SUCCEEDED)
      return;
    if (
      payment.actionExecution.capability !==
        P4_08_EXECUTABLE_CAPABILITIES.checkout &&
      payment.actionExecution.capability !==
        P4_08_EXECUTABLE_CAPABILITIES.recurring
    ) {
      throw new P408ContractError('Payment origin capability is not canonical');
    }
    const normalized = await this.kernel.readTrustedNormalizedInput(
      payment.tenantId,
      payment.actionExecution.id,
    );
    const identity = this.text(
      payment.actionExecution.capability ===
        P4_08_EXECUTABLE_CAPABILITIES.checkout
        ? normalized.checkoutIdentityHash
        : normalized.recurringIdentityHash,
    );
    await this.executor.execute(
      this.request({
        tenantId: payment.tenantId,
        capability: payment.actionExecution.capability,
        source: payment.actionExecution.sourceType as ActionSourceType,
        sourceRef:
          payment.actionExecution.sourceRef ?? 'billing:canonical-resume',
        actorUserId: payment.actionExecution.actorUserId ?? undefined,
        targetRef: payment.actionExecution.targetRef,
        identity,
        input: normalized,
      }),
    );
  }

  private request(input: {
    tenantId: string;
    capability: string;
    source: ActionSourceType;
    sourceRef: string;
    actorUserId?: string;
    targetRef: string;
    identity: string;
    input: Record<string, unknown>;
  }): TrustedActionExecutionRequestV1 {
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: input.capability,
      source: {
        type: input.source,
        occurrenceScope: `p4-08:${input.capability}:${input.identity}`,
        sourceRef: input.sourceRef,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      },
      targetRef: input.targetRef,
      input: input.input,
      evidenceRefs: [
        `p4-08-policy:${P4_08_POLICY_VERSION}`,
        `p4-08-identity:${input.identity}`,
      ],
      callerIdempotency: {
        scope: `p4-08.${input.capability}`,
        key: input.identity,
      },
    };
  }

  private recurringIdentity(
    tenantId: string,
    due: Date,
    planId: string,
    amountKopecks: number,
    currency: string,
  ): string {
    return p408Hash([
      'p4-08.recurring-child.v1',
      tenantId,
      due.toISOString(),
      planId,
      this.planSnapshotHash(planId, amountKopecks, currency),
      String(amountKopecks),
      currency,
    ]);
  }

  private planSnapshotHash(
    planId: string,
    amountKopecks: number,
    currency: string,
  ): string {
    return p408Hash([planId, String(amountKopecks), currency]);
  }

  private async checkoutResult(tenantId: string, paymentId: string) {
    const payment = await this.payment(tenantId, paymentId);
    return {
      payment: this.serializePayment(payment),
      confirmation_url: payment.confirmationUrl,
      tenant: null,
    };
  }

  private async chargeResult(tenantId: string, paymentId: string) {
    const payment = await this.payment(tenantId, paymentId);
    return { payment: this.serializePayment(payment), tenant: null };
  }

  private payment(tenantId: string, paymentId: string) {
    return this.prisma.billingPayment.findUniqueOrThrow({
      where: { id_tenantId: { id: paymentId, tenantId } },
    });
  }

  private paymentByExecution(tenantId: string, actionExecutionId: string) {
    return this.prisma.billingPayment.findUniqueOrThrow({
      where: {
        actionExecutionId_tenantId: { actionExecutionId, tenantId },
      },
    });
  }

  private paymentId(value: P408ExecutionValue): string {
    if (!value.billingPaymentId) {
      throw new P408ContractError('BillingPayment result binding is absent');
    }
    return value.billingPaymentId;
  }

  private serializePayment(payment: BillingPayment) {
    return {
      id: payment.id,
      tenant_id: payment.tenantId,
      plan_id: payment.planId,
      provider: payment.provider,
      provider_payment_id: payment.providerPaymentId,
      purpose: payment.purpose,
      status: payment.status,
      amount_kopecks: payment.amountKopecks,
      amount: (payment.amountKopecks / 100).toFixed(2),
      currency: payment.currency,
      confirmation_url: payment.confirmationUrl,
      return_url: payment.returnUrl,
      paid_at: payment.paidAt,
      canceled_at: payment.canceledAt,
      created_at: payment.createdAt,
      updated_at: payment.updatedAt,
    };
  }

  private amountKopecks(priceMonthly: number): number {
    const amount = Math.round(priceMonthly * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('billing_plan_price_invalid');
    }
    return amount;
  }

  private recurringEnabled(): boolean {
    const raw = this.config.get<string>('YOOKASSA_RECURRING_ENABLED');
    if (raw === undefined || String(raw).trim() === '') return true;
    return !['false', '0', 'off', 'no'].includes(
      String(raw).trim().toLowerCase(),
    );
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new P408ContractError('Stored canonical identity is unavailable');
    }
    return value;
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown_error';
  }
}
