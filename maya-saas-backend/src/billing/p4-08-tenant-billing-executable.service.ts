import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  Prisma,
  TenantStatus,
  type PrismaClient,
} from '@prisma/client';

import {
  P4_08_EXECUTABLE_CAPABILITIES,
  P4_08_SCHEDULER_ENVELOPE_CAPABILITY,
  p408Hash,
  type P408ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type {
  ActionFailureClassification,
  ActionRuntimeHandlers,
  ActionRuntimePhase,
  ActionRuntimeReceipt,
} from '../action-engine/action-engine.runtime';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import { PAST_DUE_GRACE_DAYS } from '../tenants/tenant-access-state';

export interface P408ProviderPayment {
  id: string;
  status: 'pending' | 'succeeded' | 'canceled' | 'unknown';
  paid: boolean;
  amountKopecks: number;
  currency: string;
  capturedAt: string | null;
  paymentMethodId: string | null;
  confirmationUrl: string | null;
  returnUrl: string | null;
  metadata: Readonly<Record<string, string>>;
}

export interface P408ProviderPaymentRequest {
  idempotencyKey: string;
  amountKopecks: number;
  currency: string;
  paymentMethodId: string | null;
  metadata: Readonly<Record<string, string>>;
}

export interface P408PaymentProvider {
  createPayment(
    input: P408ProviderPaymentRequest,
  ): Promise<P408ProviderPayment>;
  getPayment(providerPaymentId: string): Promise<P408ProviderPayment | null>;
  reconcileByIdempotencyKey(
    input: P408ProviderPaymentRequest,
  ): Promise<
    | { outcome: 'FOUND'; payment: P408ProviderPayment }
    | { outcome: 'NOT_FOUND' }
    | { outcome: 'UNKNOWN' }
  >;
}

export interface P408ProviderReferenceCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
  hash(value: string): string;
}

export interface P408ExecutionValue {
  actionClass: P408ActionClass | 'tenant_billing_scheduler_envelope';
  actionExecutionId: string;
  billingPaymentId?: string;
  providerState?: P408ProviderPayment['status'];
  providerPaymentIdentityHash?: string;
  confirmationKnown?: boolean;
  tenantStatus?: 'active' | 'past_due';
  periodStart?: string;
  periodEnd?: string;
  envelopeIdentityHash?: string;
  childExecutionIdentities?: string[];
  providerDispatches: number;
  paymentMutations: number;
  entitlementMutations: number;
}

export class P408ContractError extends Error {}
export class P408ProviderDefinitiveError extends Error {}
export class P408ProviderDispatchAmbiguousError extends Error {}

const ACTION_BY_CAPABILITY = new Map<string, P408ActionClass>([
  [P4_08_EXECUTABLE_CAPABILITIES.checkout, 'initiate_tenant_billing_checkout'],
  [P4_08_EXECUTABLE_CAPABILITIES.recurring, 'charge_tenant_billing_recurring'],
  [
    P4_08_EXECUTABLE_CAPABILITIES.outcome,
    'apply_tenant_billing_payment_outcome',
  ],
  [P4_08_EXECUTABLE_CAPABILITIES.pastDue, 'transition_tenant_billing_past_due'],
]);

export class P408TenantBillingExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly provider: P408PaymentProvider,
    private readonly providerReferenceCodec: P408ProviderReferenceCodec,
    private readonly now: () => Date = () => new Date(),
  ) {}

  execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P408ExecutionValue>> {
    if (request.capability === P4_08_SCHEDULER_ENVELOPE_CAPABILITY) {
      return this.executeEnvelope(request);
    }
    const actionClass = ACTION_BY_CAPABILITY.get(request.capability);
    if (!actionClass)
      throw new P408ContractError('P4-08 capability is unknown');
    if (
      actionClass === 'initiate_tenant_billing_checkout' ||
      actionClass === 'charge_tenant_billing_recurring'
    ) {
      return this.executePaymentInitiation(request, actionClass);
    }
    if (actionClass === 'apply_tenant_billing_payment_outcome') {
      return this.executeOutcome(request);
    }
    return this.executePastDue(request);
  }

  private executeEnvelope(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P408ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers(
        {
          prepare: () => Promise.resolve({ valueMutationPermitted: false }),
          dispatch: (input, _key, context) => {
            const value: P408ExecutionValue = {
              actionClass: 'tenant_billing_scheduler_envelope',
              actionExecutionId: context.executionId,
              envelopeIdentityHash: this.text(input.envelopeIdentityHash),
              childExecutionIdentities: this.strings(
                input.childExecutionIdentities,
              ),
              providerDispatches: 0,
              paymentMutations: 0,
              entitlementMutations: 0,
            };
            return Promise.resolve({ value, safeResult: this.safe(value) });
          },
          reconcile: () => Promise.resolve({ outcome: 'PROVEN_NOT_EXECUTED' }),
        },
        true,
      ),
    );
  }

  private executePaymentInitiation(
    request: TrustedActionExecutionRequestV1,
    actionClass:
      'initiate_tenant_billing_checkout' | 'charge_tenant_billing_recurring',
  ): Promise<ActionRuntimeReceipt<P408ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          if (input.tenantId !== context.tenantId) {
            throw new P408ContractError('Tenant evidence is not canonical');
          }
          await this.assertCurrentBillingFacts(
            context.tenantId,
            input,
            actionClass,
          );
          const payment = await this.ensurePayment(
            context.tenantId,
            context.executionId,
            input,
            actionClass,
          );
          return { billingPaymentId: payment.id };
        },
        dispatch: async (input, key, context) => {
          const payment = await this.paymentForExecution(
            context.tenantId,
            context.executionId,
          );
          const request = await this.providerRequest(
            context.tenantId,
            context.executionId,
            payment.id,
            key,
            input,
            actionClass,
          );
          let providerPayment: P408ProviderPayment;
          try {
            providerPayment = await this.provider.createPayment(request);
          } catch (error) {
            if (error instanceof P408ProviderDefinitiveError) {
              await this.prisma.billingPayment.updateMany({
                where: {
                  id: payment.id,
                  tenantId: context.tenantId,
                  status: 'pending',
                },
                data: { status: 'failed' },
              });
            }
            throw error;
          }
          this.assertProviderPayment(providerPayment, request);
          await this.persistProviderReference(
            context.tenantId,
            context.executionId,
            providerPayment.id,
          );
          await this.prisma.billingPayment.update({
            where: {
              id_tenantId: { id: payment.id, tenantId: context.tenantId },
            },
            data: {
              providerPaymentId: providerPayment.id,
              confirmationUrl: providerPayment.confirmationUrl,
              returnUrl: providerPayment.returnUrl,
            },
          });
          if (providerPayment.status === 'unknown') {
            throw new P408ProviderDispatchAmbiguousError(
              'Provider returned an unrecognized payment state',
            );
          }
          const value = this.paymentValue(
            actionClass,
            context.executionId,
            payment.id,
            providerPayment,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (input, _pre, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' };
          const payment = await this.paymentForExecution(
            context.tenantId,
            context.executionId,
          );
          const attempt = await this.latestExecutionAttempt(
            context.tenantId,
            context.executionId,
          );
          if (!attempt?.providerRequestIdentityHash) {
            return { outcome: 'STILL_UNKNOWN' };
          }
          const request = await this.providerRequest(
            context.tenantId,
            context.executionId,
            payment.id,
            attempt.providerRequestIdentityHash,
            input,
            actionClass,
          );
          const decision = payment.providerPaymentId
            ? await this.provider
                .getPayment(payment.providerPaymentId)
                .then((found) =>
                  found
                    ? ({ outcome: 'FOUND', payment: found } as const)
                    : ({ outcome: 'UNKNOWN' } as const),
                )
            : await this.provider.reconcileByIdempotencyKey(request);
          if (decision.outcome === 'UNKNOWN') {
            return { outcome: 'STILL_UNKNOWN' };
          }
          if (decision.outcome === 'NOT_FOUND') {
            return { outcome: 'PROVEN_NOT_EXECUTED' };
          }
          this.assertProviderPayment(decision.payment, request);
          await this.persistProviderReference(
            context.tenantId,
            context.executionId,
            decision.payment.id,
            ActionAttemptKind.RECONCILIATION,
          );
          await this.prisma.billingPayment.update({
            where: {
              id_tenantId: { id: payment.id, tenantId: context.tenantId },
            },
            data: {
              providerPaymentId: decision.payment.id,
              confirmationUrl: decision.payment.confirmationUrl,
              returnUrl: decision.payment.returnUrl,
            },
          });
          if (decision.payment.status === 'unknown') {
            return { outcome: 'STILL_UNKNOWN' };
          }
          const value = this.paymentValue(
            actionClass,
            context.executionId,
            payment.id,
            decision.payment,
          );
          return { outcome: 'PROVEN_SUCCEEDED', safeResult: this.safe(value) };
        },
      }),
    );
  }

  private executeOutcome(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P408ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers(
        {
          prepare: async (input, context) => {
            await this.authoritativePayment(context.tenantId, input);
            return { providerBoundary: 'READ_ONLY' };
          },
          dispatch: async (input, _key, context) => {
            const providerPayment = await this.authoritativePayment(
              context.tenantId,
              input,
            );
            const value = await this.applyOutcome(
              context.tenantId,
              context.executionId,
              input,
              providerPayment,
            );
            return { value, safeResult: this.safe(value) };
          },
          reconcile: async (_input, _pre, context) =>
            this.reconcileLocal(
              context,
              'apply_tenant_billing_payment_outcome',
            ),
        },
        true,
      ),
    );
  }

  private executePastDue(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P408ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers(
        {
          prepare: async (input, context) => {
            await this.assertPastDueFacts(context.tenantId, input);
            return { providerBoundary: 'LOCAL_ONLY' };
          },
          dispatch: async (input, _key, context) => {
            const value = await this.applyPastDue(
              context.tenantId,
              context.executionId,
              input,
            );
            return { value, safeResult: this.safe(value) };
          },
          reconcile: async (_input, _pre, context) =>
            this.reconcileLocal(context, 'transition_tenant_billing_past_due'),
        },
        true,
      ),
    );
  }

  private handlers(
    handlers: Pick<
      ActionRuntimeHandlers<P408ExecutionValue>,
      'prepare' | 'dispatch' | 'reconcile'
    >,
    localOnly = false,
  ): ActionRuntimeHandlers<P408ExecutionValue> {
    return {
      ...handlers,
      restore: (safeResult) => safeResult as unknown as P408ExecutionValue,
      classifyError: (error, phase) => this.classify(error, phase, localOnly),
    };
  }

  private classify(
    error: unknown,
    phase: ActionRuntimePhase,
    localOnly: boolean,
  ): ActionFailureClassification {
    if (
      localOnly ||
      phase === 'prepare' ||
      error instanceof P408ContractError ||
      error instanceof P408ProviderDefinitiveError
    ) {
      return {
        kind: 'definitive',
        outcomeCode: localOnly
          ? 'p4_08_local_transaction_not_applied'
          : 'p4_08_contract_rejected',
        errorClass: this.errorClass(error),
      };
    }
    return {
      kind: 'unknown',
      outcomeCode: 'provider_dispatch_outcome_unknown',
      errorClass: this.errorClass(error),
    };
  }

  private async assertCurrentBillingFacts(
    tenantId: string,
    input: Record<string, unknown>,
    actionClass:
      'initiate_tenant_billing_checkout' | 'charge_tenant_billing_recurring',
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
    if (!tenant) throw new P408ContractError('Tenant is absent');
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: this.text(input.planId) },
    });
    if (
      !plan ||
      plan.priceMonthly * 100 !== input.amountKopecks ||
      p408Hash([plan.id, String(plan.priceMonthly * 100), 'RUB']) !==
        input.planSnapshotHash ||
      input.currency !== tenant.defaultCurrency ||
      input.currency !== 'RUB'
    ) {
      throw new P408ContractError('Plan price/currency is not server-derived');
    }
    if (actionClass === 'charge_tenant_billing_recurring') {
      if (
        tenant.planId !== plan.id ||
        !tenant.billingMethodId ||
        this.providerReferenceCodec.hash(tenant.billingMethodId) !==
          input.billingMethodIdentityHash ||
        !tenant.currentPeriodEnd ||
        tenant.currentPeriodEnd.toISOString() !== input.dueWindowEndsAt ||
        tenant.currentPeriodEnd > this.now()
      ) {
        throw new P408ContractError('Recurring charge facts changed');
      }
      return;
    }
    const active =
      tenant.currentPeriodEnd && tenant.currentPeriodEnd > this.now();
    if (
      input.activePlanId !== (active ? tenant.planId : null) ||
      input.activeWindowEndsAt !==
        (active ? tenant.currentPeriodEnd?.toISOString() : null) ||
      input.samePlanPrepayment !== Boolean(active) ||
      (active && tenant.planId !== plan.id)
    ) {
      throw new P408ContractError('billing_plan_change_contract_required');
    }
  }

  private async ensurePayment(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    actionClass:
      'initiate_tenant_billing_checkout' | 'charge_tenant_billing_recurring',
  ) {
    const existing = await this.prisma.billingPayment.findUnique({
      where: {
        actionExecutionId_tenantId: {
          actionExecutionId: executionId,
          tenantId,
        },
      },
    });
    if (existing) return existing;
    const execution = await this.prisma.actionExecution.findUniqueOrThrow({
      where: { id_tenantId: { id: executionId, tenantId } },
      select: { transportIdempotencyKey: true },
    });
    return this.prisma.billingPayment.create({
      data: {
        tenantId,
        actionExecutionId: executionId,
        planId: this.text(input.planId),
        provider: 'yookassa',
        idempotenceKey: execution.transportIdempotencyKey,
        purpose:
          actionClass === 'charge_tenant_billing_recurring'
            ? 'recurring'
            : 'initial_checkout',
        status: 'pending',
        amountKopecks: this.integer(input.amountKopecks),
        currency: this.text(input.currency),
      },
    });
  }

  private paymentForExecution(tenantId: string, executionId: string) {
    return this.prisma.billingPayment.findUniqueOrThrow({
      where: {
        actionExecutionId_tenantId: {
          actionExecutionId: executionId,
          tenantId,
        },
      },
    });
  }

  private async providerRequest(
    tenantId: string,
    executionId: string,
    paymentId: string,
    idempotencyKey: string,
    input: Record<string, unknown>,
    actionClass:
      'initiate_tenant_billing_checkout' | 'charge_tenant_billing_recurring',
  ): Promise<P408ProviderPaymentRequest> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { billingMethodId: true },
    });
    return {
      idempotencyKey,
      amountKopecks: this.integer(input.amountKopecks),
      currency: this.text(input.currency),
      paymentMethodId:
        actionClass === 'charge_tenant_billing_recurring'
          ? tenant.billingMethodId
          : null,
      metadata: {
        tenant_id: tenantId,
        billing_payment_id: paymentId,
        origin_action_execution_id: executionId,
        plan_id: this.text(input.planId),
        purpose:
          actionClass === 'charge_tenant_billing_recurring'
            ? 'recurring'
            : 'initial_checkout',
      },
    };
  }

  private assertProviderPayment(
    payment: P408ProviderPayment,
    request: P408ProviderPaymentRequest,
  ): void {
    if (
      payment.amountKopecks !== request.amountKopecks ||
      payment.currency !== request.currency ||
      Object.entries(request.metadata).some(
        ([key, value]) => payment.metadata[key] !== value,
      )
    ) {
      throw new P408ProviderDefinitiveError(
        'Provider payment does not match the frozen request',
      );
    }
  }

  private paymentValue(
    actionClass:
      'initiate_tenant_billing_checkout' | 'charge_tenant_billing_recurring',
    executionId: string,
    paymentId: string,
    payment: P408ProviderPayment,
  ): P408ExecutionValue {
    return {
      actionClass,
      actionExecutionId: executionId,
      billingPaymentId: paymentId,
      providerState: payment.status,
      providerPaymentIdentityHash: this.providerReferenceCodec.hash(payment.id),
      confirmationKnown: payment.status === 'pending',
      providerDispatches: 1,
      paymentMutations: 1,
      entitlementMutations: 0,
    };
  }

  private async authoritativePayment(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<P408ProviderPayment> {
    const payment = await this.prisma.billingPayment.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.billingPaymentId),
          tenantId,
        },
      },
    });
    if (
      !payment ||
      !payment.providerPaymentId ||
      payment.actionExecutionId !== input.originActionExecutionId ||
      payment.planId !== input.planId ||
      payment.amountKopecks !== input.amountKopecks ||
      payment.currency !== input.currency ||
      payment.purpose !== input.purpose ||
      this.providerReferenceCodec.hash(payment.providerPaymentId) !==
        input.providerPaymentIdentityHash
    ) {
      throw new P408ContractError('BillingPayment correlation is invalid');
    }
    const originActionExecutionId = payment.actionExecutionId;
    if (!originActionExecutionId) {
      throw new P408ContractError('BillingPayment origin execution is absent');
    }
    const provider = await this.provider.getPayment(payment.providerPaymentId);
    if (!provider) throw new P408ContractError('Provider payment is absent');
    const request = await this.providerRequest(
      tenantId,
      originActionExecutionId,
      payment.id,
      payment.idempotenceKey,
      input,
      payment.purpose === 'recurring'
        ? 'charge_tenant_billing_recurring'
        : 'initiate_tenant_billing_checkout',
    );
    this.assertProviderPayment(provider, request);
    if (
      (provider.paymentMethodId
        ? this.providerReferenceCodec.hash(provider.paymentMethodId)
        : null) !== input.providerMethodIdentityHash
    ) {
      throw new P408ContractError(
        'Provider payment method evidence is not canonical',
      );
    }
    if (
      provider.status !== input.providerStatus ||
      provider.capturedAt !== input.providerPaidAt ||
      (provider.status === 'succeeded' && !provider.paid)
    ) {
      throw new P408ContractError(
        'Provider terminal status is not authoritative',
      );
    }
    return provider;
  }

  private async applyOutcome(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    provider: P408ProviderPayment,
  ): Promise<P408ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const paymentId = this.text(input.billingPaymentId);
        await tx.$queryRaw`
          SELECT "id" FROM "BillingPayment"
          WHERE "id" = ${paymentId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const payment = await tx.billingPayment.findUniqueOrThrow({
          where: { id_tenantId: { id: paymentId, tenantId } },
        });
        if (payment.status === 'succeeded' || payment.status === 'canceled') {
          if (payment.status !== provider.status) {
            throw new P408ContractError(
              'Provider terminal outcome conflicts with the claimed payment',
            );
          }
          return {
            actionClass: 'apply_tenant_billing_payment_outcome',
            actionExecutionId: executionId,
            billingPaymentId: payment.id,
            providerState: payment.status,
            providerPaymentIdentityHash: this.providerReferenceCodec.hash(
              payment.providerPaymentId ?? provider.id,
            ),
            providerDispatches: 0,
            paymentMutations: 0,
            entitlementMutations: 0,
          };
        }
        if (payment.status !== 'pending') {
          throw new P408ContractError('Payment is not outcome-applicable');
        }
        if (provider.status === 'canceled') {
          await tx.billingPayment.update({
            where: { id_tenantId: { id: payment.id, tenantId } },
            data: {
              status: 'canceled',
              canceledAt: new Date(),
              providerPayload: { status: 'canceled' },
            },
          });
          return {
            actionClass: 'apply_tenant_billing_payment_outcome',
            actionExecutionId: executionId,
            billingPaymentId: payment.id,
            providerState: 'canceled',
            providerPaymentIdentityHash: this.providerReferenceCodec.hash(
              provider.id,
            ),
            providerDispatches: 0,
            paymentMutations: 1,
            entitlementMutations: 0,
          };
        }
        if (provider.status !== 'succeeded' || !provider.capturedAt) {
          throw new P408ContractError(
            'Non-terminal payment cannot grant access',
          );
        }
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
        });
        if (
          tenant.currentPeriodEnd &&
          tenant.currentPeriodEnd > new Date(provider.capturedAt) &&
          tenant.planId !== payment.planId
        ) {
          throw new P408ContractError('billing_plan_change_contract_required');
        }
        const paidAt = new Date(provider.capturedAt);
        const periodStart =
          tenant.currentPeriodEnd && tenant.currentPeriodEnd > paidAt
            ? tenant.currentPeriodEnd
            : paidAt;
        const periodEnd = this.addCalendarMonth(periodStart);
        await tx.billingPayment.update({
          where: { id_tenantId: { id: payment.id, tenantId } },
          data: {
            status: 'succeeded',
            paidAt,
            providerPayload: { status: 'succeeded', paid: true },
          },
        });
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            status: TenantStatus.active,
            planId: payment.planId,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            pastDueAt: null,
            graceEndsAt: null,
            ...(provider.paymentMethodId
              ? { billingMethodId: provider.paymentMethodId }
              : {}),
          },
        });
        return {
          actionClass: 'apply_tenant_billing_payment_outcome',
          actionExecutionId: executionId,
          billingPaymentId: payment.id,
          providerState: 'succeeded',
          providerPaymentIdentityHash: this.providerReferenceCodec.hash(
            provider.id,
          ),
          tenantStatus: 'active',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          providerDispatches: 0,
          paymentMutations: 1,
          entitlementMutations: 1,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertPastDueFacts(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const boundary = tenant.currentPeriodEnd ?? tenant.trialEndsAt;
    const expectedPastDueAt = boundary?.toISOString() ?? null;
    const expectedGraceEndsAt = boundary
      ? new Date(
          boundary.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;
    if (
      !boundary ||
      boundary.toISOString() !== input.accessWindowEndsAt ||
      boundary > this.now() ||
      input.transitionAt !== expectedPastDueAt ||
      input.pastDueAt !== expectedPastDueAt ||
      input.graceEndsAt !== expectedGraceEndsAt
    ) {
      throw new P408ContractError('Access window is not expired');
    }
    const pending = await this.prisma.billingPayment.findFirst({
      where: { tenantId, purpose: 'recurring', status: 'pending' },
      include: { actionExecution: true },
    });
    if (pending) {
      throw new P408ContractError(
        pending.actionExecution?.state === ActionExecutionState.UNKNOWN
          ? 'billing_payment_outcome_unknown'
          : 'billing_payment_pending',
      );
    }
  }

  private async applyPastDue(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P408ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE
        `;
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
        });
        if (tenant.status === TenantStatus.past_due) {
          return {
            actionClass: 'transition_tenant_billing_past_due',
            actionExecutionId: executionId,
            tenantStatus: 'past_due',
            providerDispatches: 0,
            paymentMutations: 0,
            entitlementMutations: 0,
          };
        }
        const pending = await tx.billingPayment.count({
          where: { tenantId, purpose: 'recurring', status: 'pending' },
        });
        if (pending) throw new P408ContractError('billing_payment_pending');
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            status: TenantStatus.past_due,
            trialFullAccess: false,
            pastDueAt: new Date(this.text(input.pastDueAt)),
            graceEndsAt: new Date(this.text(input.graceEndsAt)),
          },
        });
        return {
          actionClass: 'transition_tenant_billing_past_due',
          actionExecutionId: executionId,
          tenantStatus: 'past_due',
          providerDispatches: 0,
          paymentMutations: 0,
          entitlementMutations: 1,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async reconcileLocal(
    context: { tenantId: string; executionId: string } | undefined,
    actionClass:
      | 'apply_tenant_billing_payment_outcome'
      | 'transition_tenant_billing_past_due',
  ) {
    if (!context) return { outcome: 'STILL_UNKNOWN' as const };
    if (actionClass === 'apply_tenant_billing_payment_outcome') {
      const execution = await this.prisma.actionExecution.findUnique({
        where: {
          id_tenantId: {
            id: context.executionId,
            tenantId: context.tenantId,
          },
        },
      });
      if (execution?.state === ActionExecutionState.SUCCEEDED) {
        return {
          outcome: 'PROVEN_SUCCEEDED' as const,
          safeResult: execution.safeResultSummaryJson as Record<
            string,
            unknown
          >,
        };
      }
    } else {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: context.tenantId },
      });
      if (tenant?.status === TenantStatus.past_due) {
        const value: P408ExecutionValue = {
          actionClass,
          actionExecutionId: context.executionId,
          tenantStatus: 'past_due',
          providerDispatches: 0,
          paymentMutations: 0,
          entitlementMutations: 1,
        };
        return {
          outcome: 'PROVEN_SUCCEEDED' as const,
          safeResult: this.safe(value),
        };
      }
    }
    return { outcome: 'PROVEN_NOT_EXECUTED' as const };
  }

  private async persistProviderReference(
    tenantId: string,
    executionId: string,
    providerPaymentId: string,
    kind: ActionAttemptKind = ActionAttemptKind.EXECUTION,
  ): Promise<void> {
    const attempt = await this.prisma.actionAttempt.findFirst({
      where: {
        tenantId,
        actionExecutionId: executionId,
        kind,
        state: ActionAttemptState.STARTED,
      },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!attempt) throw new P408ContractError('ActionAttempt is absent');
    await this.prisma.actionAttempt.update({
      where: { id_tenantId: { id: attempt.id, tenantId } },
      data: {
        providerReferenceEncrypted:
          this.providerReferenceCodec.encrypt(providerPaymentId),
        providerReferenceHash:
          this.providerReferenceCodec.hash(providerPaymentId),
      },
    });
  }

  private latestExecutionAttempt(tenantId: string, executionId: string) {
    return this.prisma.actionAttempt.findFirst({
      where: {
        tenantId,
        actionExecutionId: executionId,
        kind: ActionAttemptKind.EXECUTION,
      },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  private addCalendarMonth(value: Date): Date {
    const result = new Date(value);
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    const last = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, last));
    return result;
  }

  private safe(value: P408ExecutionValue): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new P408ContractError('Canonical text value is missing');
    }
    return value;
  }

  private integer(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new P408ContractError('Canonical integer value is invalid');
    }
    return Number(value);
  }

  private strings(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new P408ContractError('Canonical identity list is invalid');
    }
    return value as string[];
  }

  private errorClass(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'UnknownError';
  }
}
