import { createHash } from 'node:crypto';

import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  MembershipStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import {
  P4_05_EXECUTABLE_CAPABILITIES,
  P4_05_SCHEDULER_ENVELOPE_CAPABILITY,
  type P405ExecutableActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type {
  ActionFailureClassification,
  ActionRuntimeHandlers,
  ActionRuntimePhase,
  ActionRuntimeReceipt,
} from '../action-engine/action-engine.runtime';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';

export interface P405ProviderPayment {
  id: string;
  status: 'pending' | 'succeeded' | 'canceled' | 'unknown';
  paid: boolean;
  amountKopecks: number;
  currency: string;
  capturedAt: string | null;
  confirmationUrl: string | null;
  metadata: Readonly<Record<string, string>>;
}

export interface P405ProviderCheckoutRequest {
  idempotencyKey: string;
  amountKopecks: number;
  currency: string;
  metadata: Readonly<Record<string, string>>;
}

export interface P405CheckoutProvider {
  createPayment(
    input: P405ProviderCheckoutRequest,
  ): Promise<P405ProviderPayment>;
  getPayment(providerPaymentId: string): Promise<P405ProviderPayment | null>;
  reconcileByIdempotencyKey(
    input: P405ProviderCheckoutRequest,
  ): Promise<
    | { outcome: 'FOUND'; payment: P405ProviderPayment }
    | { outcome: 'NOT_FOUND' }
    | { outcome: 'UNKNOWN' }
  >;
}

export interface P405ProviderReferenceCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
  hash(value: string): string;
}

export interface P405ExecutableOptions {
  provider: P405CheckoutProvider;
  providerReferenceCodec: P405ProviderReferenceCodec;
  now?: () => Date;
}

export interface P405ExecutionValue {
  actionClass: P405ExecutableActionClass | 'subscription_scheduler_envelope';
  actionExecutionId: string;
  checkoutMode?: 'initial_purchase' | 'renewal';
  providerState?: P405ProviderPayment['status'];
  providerRequestIdentityHash?: string;
  providerPaymentIdentityHash?: string;
  canonicalClientId?: string;
  providerClientIdentityHash?: string;
  checkoutIdentityHash?: string;
  purchaseIntentIdentityHash?: string;
  renewalIntentIdentityHash?: string;
  canonicalOfferId?: string;
  offerValueVersionId?: string;
  offerValueSnapshotHash?: string;
  offerCode?: string;
  planCode?: string;
  tier?: string;
  catalogVersion?: string;
  planSnapshotHash?: string;
  serviceScopeHash?: string;
  priceKopecks?: number;
  currency?: string;
  visitsIncluded?: number;
  termDays?: number;
  paymentProvider?: 'yookassa';
  checkoutConfirmationUrl?: string;
  subscriptionId?: string;
  previousSubscriptionId?: string;
  termIdentityHash?: string;
  termStartsAt?: string;
  termEndsAt?: string;
  usageId?: string;
  usageIdentityHash?: string;
  terminalStatus?: 'expired' | 'canceled' | 'revoked';
  batchIdentityHash?: string;
  childExecutionIdentities?: string[];
  providerDispatches: number;
  subscriptionMutations: number;
  usageClaims: number;
}

export class P405ExecutionContractError extends Error {}
export class P405ProviderDispatchAmbiguousError extends Error {}
export class P405ProviderDefinitiveError extends Error {}

const ACTION_BY_CAPABILITY = new Map<string, P405ExecutableActionClass>([
  [
    P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
    'initiate_customer_subscription_purchase',
  ],
  [
    P4_05_EXECUTABLE_CAPABILITIES.activatePurchase,
    'activate_customer_subscription',
  ],
  [
    P4_05_EXECUTABLE_CAPABILITIES.initiateRenewal,
    'initiate_customer_subscription_renewal',
  ],
  [
    P4_05_EXECUTABLE_CAPABILITIES.activateRenewal,
    'activate_customer_subscription_renewal',
  ],
  [P4_05_EXECUTABLE_CAPABILITIES.syncUsage, 'sync_customer_subscription_usage'],
  [P4_05_EXECUTABLE_CAPABILITIES.expire, 'expire_customer_subscription'],
  [P4_05_EXECUTABLE_CAPABILITIES.cancel, 'cancel_customer_subscription'],
  [P4_05_EXECUTABLE_CAPABILITIES.revoke, 'revoke_customer_subscription'],
]);

export class P405CustomerSubscriptionExecutableService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly options: P405ExecutableOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P405ExecutionValue>> {
    if (request.capability === P4_05_SCHEDULER_ENVELOPE_CAPABILITY) {
      return this.executeEnvelope(request);
    }
    const actionClass = ACTION_BY_CAPABILITY.get(request.capability);
    if (!actionClass) {
      throw new P405ExecutionContractError(
        'P4-05 executable capability is not registered',
      );
    }
    if (
      actionClass === 'initiate_customer_subscription_purchase' ||
      actionClass === 'initiate_customer_subscription_renewal'
    ) {
      return this.executeCheckout(request, actionClass);
    }
    if (
      actionClass === 'activate_customer_subscription' ||
      actionClass === 'activate_customer_subscription_renewal'
    ) {
      return this.executeActivation(request, actionClass);
    }
    if (actionClass === 'sync_customer_subscription_usage') {
      return this.executeUsage(request);
    }
    return this.executeTerminal(request, actionClass);
  }

  private executeEnvelope(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P405ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: (input, context) => {
          if (input.tenantId !== context.tenantId) {
            throw new P405ExecutionContractError(
              'Scheduler envelope tenant is not canonical',
            );
          }
          return Promise.resolve({ valueMutationPermitted: false });
        },
        dispatch: (input, _key, context) => {
          const value: P405ExecutionValue = {
            actionClass: 'subscription_scheduler_envelope',
            actionExecutionId: context.executionId,
            batchIdentityHash: this.text(
              input.batchIdentityHash,
              'batchIdentityHash',
            ),
            childExecutionIdentities: this.strings(
              input.childExecutionIdentities,
              'childExecutionIdentities',
            ),
            providerDispatches: 0,
            subscriptionMutations: 0,
            usageClaims: 0,
          };
          return Promise.resolve({ value, safeResult: this.safe(value) });
        },
        reconcile: () => Promise.resolve({ outcome: 'PROVEN_NOT_EXECUTED' }),
      }),
    );
  }

  private executeCheckout(
    request: TrustedActionExecutionRequestV1,
    actionClass:
      | 'initiate_customer_subscription_purchase'
      | 'initiate_customer_subscription_renewal',
  ): Promise<ActionRuntimeReceipt<P405ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertClientClear(context.tenantId, input);
          if (actionClass === 'initiate_customer_subscription_purchase') {
            const active = await this.prisma.customerSubscription.findFirst({
              where: {
                tenantId: context.tenantId,
                clientId: this.text(
                  input.canonicalClientId,
                  'canonicalClientId',
                ),
                status: 'active',
              },
              select: { id: true },
            });
            if (active) {
              throw new P405ExecutionContractError(
                'Initial purchase conflicts with an active term',
              );
            }
          } else {
            await this.assertRenewalPredecessor(context.tenantId, input);
          }
          return {
            checkoutIdentityHash: this.text(
              input.checkoutIdentityHash,
              'checkoutIdentityHash',
            ),
            providerRequestIdentitySeedHash: this.text(
              input.providerRequestIdentitySeedHash,
              'providerRequestIdentitySeedHash',
            ),
          };
        },
        dispatch: async (input, transportKey, context) => {
          const providerRequest = this.checkoutProviderRequest(
            context.tenantId,
            context.executionId,
            transportKey,
            input,
          );
          const payment = await this.options.provider.createPayment({
            ...providerRequest,
          });
          this.assertCheckoutPayment(input, context, payment);
          await this.persistProviderReference(
            context.tenantId,
            context.executionId,
            payment.id,
          );
          const value = this.checkoutValue(
            actionClass,
            context.tenantId,
            context.executionId,
            transportKey,
            input,
            payment,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (input, _previous, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' };
          const attempt = await this.latestExecutionAttempt(
            context.tenantId,
            context.executionId,
          );
          if (!attempt?.providerRequestIdentityHash) {
            return { outcome: 'STILL_UNKNOWN' };
          }
          const decision =
            await this.options.provider.reconcileByIdempotencyKey(
              this.checkoutProviderRequest(
                context.tenantId,
                context.executionId,
                attempt.providerRequestIdentityHash,
                input,
              ),
            );
          if (decision.outcome === 'UNKNOWN') {
            return { outcome: 'STILL_UNKNOWN' };
          }
          if (decision.outcome === 'NOT_FOUND') {
            return { outcome: 'PROVEN_NOT_EXECUTED' };
          }
          this.assertCheckoutPayment(input, context, decision.payment);
          await this.persistProviderReference(
            context.tenantId,
            context.executionId,
            decision.payment.id,
            ActionAttemptKind.RECONCILIATION,
          );
          const value = this.checkoutValue(
            actionClass,
            context.tenantId,
            context.executionId,
            attempt.providerRequestIdentityHash,
            input,
            decision.payment,
          );
          return {
            outcome: 'PROVEN_SUCCEEDED',
            safeResult: this.safe(value),
          };
        },
      }),
    );
  }

  private executeActivation(
    request: TrustedActionExecutionRequestV1,
    actionClass:
      | 'activate_customer_subscription'
      | 'activate_customer_subscription_renewal',
  ): Promise<ActionRuntimeReceipt<P405ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertClientClear(context.tenantId, input);
          await this.assertAuthoritativePayment(
            context.tenantId,
            input,
            actionClass === 'activate_customer_subscription_renewal',
          );
          return { providerDispatch: 'read_only_evidence' };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.activateTerm(
            context.tenantId,
            context.executionId,
            input,
            actionClass === 'activate_customer_subscription_renewal',
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (input, _previous, context) =>
          this.reconcileLocalFact(context, actionClass, input),
      }),
    );
  }

  private executeUsage(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P405ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertClientClear(context.tenantId, input);
          await this.assertUsageFacts(
            this.prisma,
            context.tenantId,
            context.executionId,
            input,
          );
          return { providerDispatch: 'read_only_evidence' };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.claimUsage(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileLocalFact(context, 'sync_customer_subscription_usage'),
      }),
    );
  }

  private executeTerminal(
    request: TrustedActionExecutionRequestV1,
    actionClass:
      | 'expire_customer_subscription'
      | 'cancel_customer_subscription'
      | 'revoke_customer_subscription',
  ): Promise<ActionRuntimeReceipt<P405ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertClientClear(context.tenantId, input);
          await this.assertTerminalFacts(
            context.tenantId,
            context.executionId,
            input,
            actionClass,
          );
          return { providerBoundary: 'LOCAL_ONLY' };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.terminalize(
            context.tenantId,
            context.executionId,
            input,
            actionClass,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileLocalFact(context, actionClass),
      }),
    );
  }

  private handlers(
    handlers: Pick<
      ActionRuntimeHandlers<P405ExecutionValue>,
      'prepare' | 'dispatch' | 'reconcile'
    >,
  ): ActionRuntimeHandlers<P405ExecutionValue> {
    return {
      ...handlers,
      restore: (safeResult) => safeResult as unknown as P405ExecutionValue,
      classifyError: (error, phase) => this.classify(error, phase),
    };
  }

  private classify(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification {
    if (
      phase === 'prepare' ||
      error instanceof P405ExecutionContractError ||
      error instanceof P405ProviderDefinitiveError
    ) {
      return {
        kind: 'definitive',
        outcomeCode: 'p4_05_contract_rejected',
        errorClass: this.errorClass(error),
      };
    }
    return {
      kind: 'unknown',
      outcomeCode:
        error instanceof P405ProviderDispatchAmbiguousError
          ? 'provider_dispatch_outcome_unknown'
          : 'p4_05_local_commit_outcome_unknown',
      errorClass: this.errorClass(error),
    };
  }

  private async activateTerm(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    renewal: boolean,
  ): Promise<P405ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.customerSubscription.findUnique({
          where: {
            activationExecutionId_tenantId: {
              activationExecutionId: executionId,
              tenantId,
            },
          },
        });
        if (existing) {
          return this.termValue(
            renewal
              ? 'activate_customer_subscription_renewal'
              : 'activate_customer_subscription',
            executionId,
            existing,
            input,
          );
        }
        const clientId = this.text(
          input.canonicalClientId,
          'canonicalClientId',
        );
        const previousSubscriptionId = renewal
          ? this.text(
              input.predecessorSubscriptionId,
              'predecessorSubscriptionId',
            )
          : null;
        if (previousSubscriptionId) {
          await tx.$queryRaw`
            SELECT "id" FROM "CustomerSubscription"
            WHERE "id" = ${previousSubscriptionId} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;
          const predecessor = await tx.customerSubscription.findUnique({
            where: {
              id_tenantId: { id: previousSubscriptionId, tenantId },
            },
          });
          if (
            !predecessor ||
            predecessor.clientId !== clientId ||
            predecessor.termIdentityHash !== input.predecessorTermIdentityHash
          ) {
            throw new P405ExecutionContractError(
              'Renewal predecessor changed before commit',
            );
          }
          const claimedRenewal = await tx.customerSubscription.findUnique({
            where: {
              previousSubscriptionId_tenantId: {
                previousSubscriptionId,
                tenantId,
              },
            },
          });
          if (claimedRenewal) {
            throw new P405ExecutionContractError(
              'Renewal predecessor already has a successor term',
            );
          }
        } else {
          const active = await tx.customerSubscription.findFirst({
            where: { tenantId, clientId, status: 'active' },
            select: { id: true },
          });
          if (active) {
            throw new P405ExecutionContractError(
              'Initial activation conflicts with an active term',
            );
          }
        }
        const term = await tx.customerSubscription.create({
          data: {
            id: this.text(input.termIdentityHash, 'termIdentityHash'),
            tenantId,
            activationExecutionId: executionId,
            clientId,
            previousSubscriptionId,
            termIdentityHash: this.text(
              input.termIdentityHash,
              'termIdentityHash',
            ),
            planCode: this.text(input.planCode, 'planCode'),
            planSnapshotHash: this.text(
              input.planSnapshotHash,
              'planSnapshotHash',
            ),
            serviceScopeHash: this.text(
              input.serviceScopeHash,
              'serviceScopeHash',
            ),
            priceKopecks: this.integer(input.priceKopecks, 'priceKopecks'),
            currency: this.text(input.currency, 'currency'),
            visitsIncluded: this.integer(
              input.visitsIncluded,
              'visitsIncluded',
            ),
            status: 'active',
            provider: 'yookassa',
            providerPaymentRefHash: this.text(
              input.providerPaymentIdentityHash,
              'providerPaymentIdentityHash',
            ),
            activatedAt: new Date(
              this.text(input.providerPaidAt, 'providerPaidAt'),
            ),
            termStartsAt: new Date(
              this.text(input.termStartsAt, 'termStartsAt'),
            ),
            termEndsAt: new Date(this.text(input.termEndsAt, 'termEndsAt')),
          },
        });
        return this.termValue(
          renewal
            ? 'activate_customer_subscription_renewal'
            : 'activate_customer_subscription',
          executionId,
          term,
          input,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async claimUsage(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P405ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const subscriptionId = this.text(
          input.subscriptionId,
          'subscriptionId',
        );
        const usageIdentityHash = this.text(
          input.usageIdentityHash,
          'usageIdentityHash',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "CustomerSubscription"
          WHERE "id" = ${subscriptionId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const existing = await tx.customerSubscriptionUsage.findUnique({
          where: {
            subscriptionId_tenantId_usageIdentityHash: {
              subscriptionId,
              tenantId,
              usageIdentityHash,
            },
          },
        });
        if (existing) {
          if (existing.actionExecutionId !== executionId) {
            throw new P405ExecutionContractError(
              'Usage was already claimed by another execution',
            );
          }
          return this.usageValue(executionId, existing);
        }
        await this.assertUsageFacts(tx, tenantId, executionId, input);
        const usage = await tx.customerSubscriptionUsage.create({
          data: {
            tenantId,
            subscriptionId,
            actionExecutionId: executionId,
            usageIdentityHash,
            targetKind: 'provider_visit_service',
            targetRefHash: this.text(
              input.providerVisitIdentityHash,
              'providerVisitIdentityHash',
            ),
            units: this.integer(input.units, 'units'),
            usedAt: new Date(
              this.text(input.visitOccurredAt, 'visitOccurredAt'),
            ),
          },
        });
        return this.usageValue(executionId, usage);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async terminalize(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    actionClass:
      | 'expire_customer_subscription'
      | 'cancel_customer_subscription'
      | 'revoke_customer_subscription',
  ): Promise<P405ExecutionValue> {
    const status = this.terminalStatus(actionClass);
    return this.prisma.$transaction(
      async (tx) => {
        const subscriptionId = this.text(
          input.subscriptionId,
          'subscriptionId',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "CustomerSubscription"
          WHERE "id" = ${subscriptionId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const term = await tx.customerSubscription.findUnique({
          where: { id_tenantId: { id: subscriptionId, tenantId } },
        });
        if (!term) {
          throw new P405ExecutionContractError('Subscription term is missing');
        }
        if (term.status !== 'active') {
          if (term.endExecutionId === executionId && term.status === status) {
            return this.terminalValue(
              actionClass,
              executionId,
              term.id,
              status,
            );
          }
          throw new P405ExecutionContractError(
            'Subscription already has a terminal winner',
          );
        }
        const execution = await tx.actionExecution.findUniqueOrThrow({
          where: { id_tenantId: { id: executionId, tenantId } },
          select: { createdAt: true },
        });
        const endedAt =
          actionClass === 'expire_customer_subscription'
            ? term.termEndsAt
            : execution.createdAt;
        const updated = await tx.customerSubscription.update({
          where: { id_tenantId: { id: term.id, tenantId } },
          data: { status, endedAt, endExecutionId: executionId },
        });
        return this.terminalValue(actionClass, executionId, updated.id, status);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertAuthoritativePayment(
    tenantId: string,
    input: Record<string, unknown>,
    renewal: boolean,
  ): Promise<void> {
    const checkoutExecutionId = this.text(
      input.checkoutExecutionId,
      'checkoutExecutionId',
    );
    const checkout = await this.prisma.actionExecution.findUnique({
      where: { id_tenantId: { id: checkoutExecutionId, tenantId } },
    });
    if (!checkout) {
      throw new P405ExecutionContractError('Checkout execution is missing');
    }
    if (checkout.state === ActionExecutionState.UNKNOWN) {
      throw new P405ExecutionContractError(
        'UNKNOWN checkout cannot activate subscription value',
      );
    }
    if (
      checkout.state !== ActionExecutionState.SUCCEEDED ||
      checkout.actionClass !==
        (renewal
          ? 'initiate_customer_subscription_renewal'
          : 'initiate_customer_subscription_purchase')
    ) {
      throw new P405ExecutionContractError(
        'Checkout is not authoritative activation evidence',
      );
    }
    const facts = this.record(
      checkout.safeResultSummaryJson,
      'checkout safe result',
    );
    const expected: ReadonlyArray<[string, string]> = [
      ['canonicalClientId', 'canonicalClientId'],
      ['checkoutIdentityHash', 'checkoutIdentityHash'],
      ['canonicalOfferId', 'canonicalOfferId'],
      ['offerValueVersionId', 'offerValueVersionId'],
      ['offerValueSnapshotHash', 'offerValueSnapshotHash'],
      ['offerCode', 'offerCode'],
      ['planCode', 'planCode'],
      ['tier', 'tier'],
      ['catalogVersion', 'catalogVersion'],
      ['planSnapshotHash', 'planSnapshotHash'],
      ['serviceScopeHash', 'serviceScopeHash'],
      ['currency', 'currency'],
      ['providerRequestIdentityHash', 'providerRequestIdentityHash'],
    ];
    for (const [factKey, inputKey] of expected) {
      if (facts[factKey] !== input[inputKey]) {
        throw new P405ExecutionContractError(
          'Checkout and activation evidence do not match',
        );
      }
    }
    if (
      facts.priceKopecks !== input.priceKopecks ||
      facts.visitsIncluded !== input.visitsIncluded ||
      facts.termDays !== input.termDays ||
      facts.providerState !== 'pending'
    ) {
      throw new P405ExecutionContractError(
        'Checkout value facts changed before activation',
      );
    }
    const executionAttempt = await this.latestExecutionAttempt(
      tenantId,
      checkoutExecutionId,
    );
    const referenceAttempt = await this.latestProviderReferenceAttempt(
      tenantId,
      checkoutExecutionId,
    );
    if (
      !referenceAttempt?.providerReferenceEncrypted ||
      !referenceAttempt.providerReferenceHash ||
      executionAttempt?.providerRequestIdentityHash !==
        input.providerRequestIdentityHash
    ) {
      throw new P405ExecutionContractError(
        'Checkout provider reference is incomplete',
      );
    }
    const paymentId = this.options.providerReferenceCodec.decrypt(
      referenceAttempt.providerReferenceEncrypted,
    );
    const payment = await this.options.provider.getPayment(paymentId);
    if (!payment) {
      throw new P405ExecutionContractError(
        'Provider payment evidence is unavailable',
      );
    }
    if (payment.status !== 'succeeded' || !payment.paid) {
      throw new P405ExecutionContractError(
        payment.status === 'pending'
          ? 'PENDING checkout cannot activate subscription value'
          : 'Provider payment is not successfully paid',
      );
    }
    this.assertPaymentCorrelation(
      tenantId,
      checkoutExecutionId,
      facts,
      payment,
    );
    const identityHash = this.hash([
      'p4-05.yookassa-payment.v1',
      tenantId,
      referenceAttempt.providerReferenceHash,
    ]);
    if (identityHash !== input.providerPaymentIdentityHash) {
      throw new P405ExecutionContractError('Provider payment identity changed');
    }
    if (payment.capturedAt !== input.providerPaidAt) {
      throw new P405ExecutionContractError('Provider paid time changed');
    }
    if (renewal) {
      await this.assertRenewalPredecessor(tenantId, input);
    }
  }

  private async assertUsageFacts(
    tx: PrismaClient | Prisma.TransactionClient,
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const subscriptionId = this.text(input.subscriptionId, 'subscriptionId');
    const term = await tx.customerSubscription.findUnique({
      where: { id_tenantId: { id: subscriptionId, tenantId } },
    });
    if (
      !term ||
      term.clientId !== input.canonicalClientId ||
      term.termIdentityHash !== input.termIdentityHash ||
      term.planCode !== input.planCode ||
      term.planSnapshotHash !== input.planSnapshotHash ||
      term.serviceScopeHash !== input.serviceScopeHash ||
      term.visitsIncluded !== input.visitsIncluded ||
      term.termStartsAt.toISOString() !== input.termStartsAt ||
      term.termEndsAt.toISOString() !== input.termEndsAt ||
      term.status !== 'active'
    ) {
      throw new P405ExecutionContractError(
        'Usage does not match an active immutable term',
      );
    }
    const used = await tx.customerSubscriptionUsage.aggregate({
      where: { tenantId, subscriptionId },
      _sum: { units: true },
    });
    const remaining = term.visitsIncluded - (used._sum.units ?? 0);
    if (
      remaining !== input.remainingUnitsBefore ||
      remaining - this.integer(input.units, 'units') !==
        input.remainingUnitsAfter
    ) {
      throw new P405ExecutionContractError(
        'Usage allowance changed before the claim',
      );
    }
    const existing = await tx.customerSubscriptionUsage.findUnique({
      where: {
        subscriptionId_tenantId_usageIdentityHash: {
          subscriptionId,
          tenantId,
          usageIdentityHash: this.text(
            input.usageIdentityHash,
            'usageIdentityHash',
          ),
        },
      },
    });
    if (existing && existing.actionExecutionId !== executionId) {
      throw new P405ExecutionContractError('Usage was already claimed');
    }
  }

  private async assertTerminalFacts(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    actionClass:
      | 'expire_customer_subscription'
      | 'cancel_customer_subscription'
      | 'revoke_customer_subscription',
  ): Promise<void> {
    const term = await this.prisma.customerSubscription.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.subscriptionId, 'subscriptionId'),
          tenantId,
        },
      },
    });
    if (
      !term ||
      term.clientId !== input.canonicalClientId ||
      term.termIdentityHash !== input.termIdentityHash ||
      term.planSnapshotHash !== input.planSnapshotHash ||
      term.serviceScopeHash !== input.serviceScopeHash
    ) {
      throw new P405ExecutionContractError(
        'Terminal transition term evidence changed',
      );
    }
    if (term.status !== 'active') {
      if (term.endExecutionId === executionId) return;
      throw new P405ExecutionContractError(
        'Subscription already has a terminal winner',
      );
    }
    if (
      actionClass === 'expire_customer_subscription' &&
      this.now().getTime() <= term.termEndsAt.getTime()
    ) {
      throw new P405ExecutionContractError('Subscription term is still active');
    }
    if (actionClass !== 'expire_customer_subscription') {
      const execution = await this.prisma.actionExecution.findUnique({
        where: { id_tenantId: { id: executionId, tenantId } },
        include: { actorMembership: true },
      });
      if (
        !execution?.actorUserId ||
        !execution.actorMembership ||
        execution.actorMembership.status !== MembershipStatus.active
      ) {
        throw new P405ExecutionContractError(
          'Terminal mutation requires an active canonical actor',
        );
      }
      const role = String(execution.actorMembership.role);
      if (role !== input.requesterRole) {
        throw new P405ExecutionContractError('Requester role changed');
      }
      const namespace =
        actionClass === 'cancel_customer_subscription'
          ? 'p4-05.subscription-cancellation-requester.v1'
          : 'p4-05.subscription-revocation-requester.v1';
      const expected = this.hash([
        namespace,
        tenantId,
        execution.actorUserId,
        execution.actorMembership.id,
        role,
        String(input.requesterAuthority),
      ]);
      if (expected !== input.requesterIdentityHash) {
        throw new P405ExecutionContractError(
          'Requester authority is not server-derived',
        );
      }
    }
  }

  private async assertRenewalPredecessor(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const predecessor = await this.prisma.customerSubscription.findUnique({
      where: {
        id_tenantId: {
          id: this.text(
            input.predecessorSubscriptionId,
            'predecessorSubscriptionId',
          ),
          tenantId,
        },
      },
    });
    if (
      !predecessor ||
      predecessor.clientId !== input.canonicalClientId ||
      predecessor.termIdentityHash !== input.predecessorTermIdentityHash ||
      predecessor.status !== 'active' ||
      predecessor.termStartsAt.toISOString() !==
        input.predecessorTermStartsAt ||
      predecessor.termEndsAt.toISOString() !== input.predecessorTermEndsAt
    ) {
      throw new P405ExecutionContractError(
        'Renewal predecessor is not canonical',
      );
    }
    if (
      input.renewalWindowOpensAt !== undefined &&
      (this.now().getTime() <
        new Date(
          this.text(input.renewalWindowOpensAt, 'renewalWindowOpensAt'),
        ).getTime() ||
        this.now().getTime() > predecessor.termEndsAt.getTime())
    ) {
      throw new P405ExecutionContractError(
        'Renewal is outside the policy window',
      );
    }
  }

  private async assertClientClear(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const clientId = this.text(input.canonicalClientId, 'canonicalClientId');
    const client = await this.prisma.client.findUnique({
      where: { id_tenantId: { id: clientId, tenantId } },
      include: { crmLinks: { where: { unlinkedAt: null } } },
    });
    if (!client || client.mergedIntoClientId || client.crmLinks.length < 1) {
      throw new P405ExecutionContractError(
        'Exact canonical Client identity is missing',
      );
    }
    const matchingLink = client.crmLinks.find(
      (link) =>
        this.hash([
          'p4-05.provider-client.v1',
          tenantId,
          link.provider,
          link.externalId,
          client.id,
        ]) === input.providerClientIdentityHash,
    );
    if (!matchingLink) {
      throw new P405ExecutionContractError(
        'Provider Client identity is not canonical',
      );
    }
    const hold = await this.prisma.unresolvedClientIdentityHold.findFirst({
      where: {
        tenantId,
        provider: matchingLink.provider,
        externalId: matchingLink.externalId,
        resolvedAt: null,
      },
      select: { id: true },
    });
    if (hold) {
      throw new P405ExecutionContractError('client_identity_unresolved');
    }
  }

  private checkoutMetadata(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Readonly<Record<string, string>> {
    return {
      tenant_id: tenantId,
      checkout_execution_id: executionId,
      checkout_identity_hash: this.text(
        input.checkoutIdentityHash,
        'checkoutIdentityHash',
      ),
      canonical_client_id: this.text(
        input.canonicalClientId,
        'canonicalClientId',
      ),
      checkout_mode: this.text(input.checkoutMode, 'checkoutMode'),
    };
  }

  private checkoutProviderRequest(
    tenantId: string,
    executionId: string,
    idempotencyKey: string,
    input: Record<string, unknown>,
  ): P405ProviderCheckoutRequest {
    return {
      idempotencyKey,
      amountKopecks: this.integer(input.priceKopecks, 'priceKopecks'),
      currency: this.text(input.currency, 'currency'),
      metadata: this.checkoutMetadata(tenantId, executionId, input),
    };
  }

  private assertCheckoutPayment(
    input: Record<string, unknown>,
    context: { tenantId: string; executionId: string },
    payment: P405ProviderPayment,
  ): void {
    if (
      payment.status !== 'pending' ||
      payment.paid ||
      payment.amountKopecks !== input.priceKopecks ||
      payment.currency !== input.currency
    ) {
      throw new P405ProviderDefinitiveError(
        'Provider checkout response is not the canonical pending intent',
      );
    }
    const expected = this.checkoutMetadata(
      context.tenantId,
      context.executionId,
      input,
    );
    if (
      Object.entries(expected).some(
        ([key, value]) => payment.metadata[key] !== value,
      )
    ) {
      throw new P405ProviderDefinitiveError(
        'Provider checkout metadata does not match the execution',
      );
    }
  }

  private assertPaymentCorrelation(
    tenantId: string,
    checkoutExecutionId: string,
    facts: Record<string, unknown>,
    payment: P405ProviderPayment,
  ): void {
    if (
      payment.amountKopecks !== facts.priceKopecks ||
      payment.currency !== facts.currency ||
      payment.metadata.tenant_id !== tenantId ||
      payment.metadata.checkout_execution_id !== checkoutExecutionId ||
      payment.metadata.checkout_identity_hash !== facts.checkoutIdentityHash ||
      payment.metadata.canonical_client_id !== facts.canonicalClientId
    ) {
      throw new P405ExecutionContractError(
        'Authoritative provider payment does not match checkout facts',
      );
    }
  }

  private checkoutValue(
    actionClass:
      | 'initiate_customer_subscription_purchase'
      | 'initiate_customer_subscription_renewal',
    tenantId: string,
    executionId: string,
    providerRequestIdentityHash: string,
    input: Record<string, unknown>,
    payment: P405ProviderPayment,
  ): P405ExecutionValue {
    return {
      actionClass,
      actionExecutionId: executionId,
      checkoutMode: input.checkoutMode as 'initial_purchase' | 'renewal',
      providerState: payment.status,
      providerRequestIdentityHash,
      providerPaymentIdentityHash: this.hash([
        'p4-05.yookassa-payment.v1',
        tenantId,
        this.options.providerReferenceCodec.hash(payment.id),
      ]),
      canonicalClientId: this.text(
        input.canonicalClientId,
        'canonicalClientId',
      ),
      providerClientIdentityHash: this.text(
        input.providerClientIdentityHash,
        'providerClientIdentityHash',
      ),
      checkoutIdentityHash: this.text(
        input.checkoutIdentityHash,
        'checkoutIdentityHash',
      ),
      ...(input.purchaseIntentIdentityHash
        ? {
            purchaseIntentIdentityHash: this.text(
              input.purchaseIntentIdentityHash,
              'purchaseIntentIdentityHash',
            ),
          }
        : {}),
      ...(input.renewalIntentIdentityHash
        ? {
            renewalIntentIdentityHash: this.text(
              input.renewalIntentIdentityHash,
              'renewalIntentIdentityHash',
            ),
          }
        : {}),
      canonicalOfferId: this.text(input.canonicalOfferId, 'canonicalOfferId'),
      offerValueVersionId: this.text(
        input.offerValueVersionId,
        'offerValueVersionId',
      ),
      offerValueSnapshotHash: this.text(
        input.offerValueSnapshotHash,
        'offerValueSnapshotHash',
      ),
      offerCode: this.text(input.offerCode, 'offerCode'),
      planCode: this.text(input.planCode, 'planCode'),
      tier: this.text(input.tier, 'tier'),
      catalogVersion: this.text(input.catalogVersion, 'catalogVersion'),
      planSnapshotHash: this.text(input.planSnapshotHash, 'planSnapshotHash'),
      serviceScopeHash: this.text(input.serviceScopeHash, 'serviceScopeHash'),
      priceKopecks: this.integer(input.priceKopecks, 'priceKopecks'),
      currency: this.text(input.currency, 'currency'),
      visitsIncluded: this.integer(input.visitsIncluded, 'visitsIncluded'),
      termDays: this.integer(input.termDays, 'termDays'),
      paymentProvider: 'yookassa',
      ...(payment.confirmationUrl
        ? { checkoutConfirmationUrl: payment.confirmationUrl }
        : {}),
      ...(input.predecessorSubscriptionId
        ? {
            previousSubscriptionId: this.text(
              input.predecessorSubscriptionId,
              'predecessorSubscriptionId',
            ),
          }
        : {}),
      providerDispatches: 1,
      subscriptionMutations: 0,
      usageClaims: 0,
    };
  }

  private async persistProviderReference(
    tenantId: string,
    executionId: string,
    providerPaymentId: string,
    attemptKind: ActionAttemptKind = ActionAttemptKind.EXECUTION,
  ): Promise<void> {
    const attempt = await this.prisma.actionAttempt.findFirst({
      where: {
        tenantId,
        actionExecutionId: executionId,
        kind: attemptKind,
        state: ActionAttemptState.STARTED,
      },
      orderBy: { attemptNumber: 'desc' },
    });
    if (!attempt) {
      throw new P405ExecutionContractError(
        'Checkout execution attempt is missing',
      );
    }
    await this.prisma.actionAttempt.update({
      where: { id_tenantId: { id: attempt.id, tenantId } },
      data: {
        providerReferenceEncrypted:
          this.options.providerReferenceCodec.encrypt(providerPaymentId),
        providerReferenceHash:
          this.options.providerReferenceCodec.hash(providerPaymentId),
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

  private latestProviderReferenceAttempt(
    tenantId: string,
    executionId: string,
  ) {
    return this.prisma.actionAttempt.findFirst({
      where: {
        tenantId,
        actionExecutionId: executionId,
        providerReferenceEncrypted: { not: null },
        providerReferenceHash: { not: null },
      },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  private async reconcileLocalFact(
    context: { tenantId: string; executionId: string } | undefined,
    actionClass: Exclude<
      P405ExecutableActionClass,
      | 'initiate_customer_subscription_purchase'
      | 'initiate_customer_subscription_renewal'
    >,
    input?: Record<string, unknown>,
  ) {
    if (!context) return { outcome: 'STILL_UNKNOWN' as const };
    const value = await this.valueForExecution(
      context.tenantId,
      context.executionId,
      actionClass,
      input,
    );
    return value
      ? {
          outcome: 'PROVEN_SUCCEEDED' as const,
          safeResult: this.safe(value),
        }
      : { outcome: 'PROVEN_NOT_EXECUTED' as const };
  }

  private async valueForExecution(
    tenantId: string,
    executionId: string,
    actionClass: Exclude<
      P405ExecutableActionClass,
      | 'initiate_customer_subscription_purchase'
      | 'initiate_customer_subscription_renewal'
    >,
    input?: Record<string, unknown>,
  ): Promise<P405ExecutionValue | null> {
    if (
      actionClass === 'activate_customer_subscription' ||
      actionClass === 'activate_customer_subscription_renewal'
    ) {
      const term = await this.prisma.customerSubscription.findUnique({
        where: {
          activationExecutionId_tenantId: {
            activationExecutionId: executionId,
            tenantId,
          },
        },
      });
      return term && input
        ? this.termValue(actionClass, executionId, term, input)
        : null;
    }
    if (actionClass === 'sync_customer_subscription_usage') {
      const usage = await this.prisma.customerSubscriptionUsage.findFirst({
        where: { tenantId, actionExecutionId: executionId },
      });
      return usage ? this.usageValue(executionId, usage) : null;
    }
    const term = await this.prisma.customerSubscription.findUnique({
      where: {
        endExecutionId_tenantId: { endExecutionId: executionId, tenantId },
      },
    });
    return term
      ? this.terminalValue(
          actionClass,
          executionId,
          term.id,
          this.terminalStatus(actionClass),
        )
      : null;
  }

  private termValue(
    actionClass:
      | 'activate_customer_subscription'
      | 'activate_customer_subscription_renewal',
    executionId: string,
    term: {
      id: string;
      clientId: string;
      previousSubscriptionId: string | null;
      termIdentityHash: string;
      termStartsAt: Date;
      termEndsAt: Date;
    },
    input: Record<string, unknown>,
  ): P405ExecutionValue {
    return {
      actionClass,
      actionExecutionId: executionId,
      subscriptionId: term.id,
      canonicalClientId: term.clientId,
      previousSubscriptionId: term.previousSubscriptionId ?? undefined,
      termIdentityHash: term.termIdentityHash,
      canonicalOfferId: this.text(input.canonicalOfferId, 'canonicalOfferId'),
      offerValueVersionId: this.text(
        input.offerValueVersionId,
        'offerValueVersionId',
      ),
      offerValueSnapshotHash: this.text(
        input.offerValueSnapshotHash,
        'offerValueSnapshotHash',
      ),
      offerCode: this.text(input.offerCode, 'offerCode'),
      termStartsAt: term.termStartsAt.toISOString(),
      termEndsAt: term.termEndsAt.toISOString(),
      providerDispatches: 0,
      subscriptionMutations: 1,
      usageClaims: 0,
    };
  }

  private usageValue(
    executionId: string,
    usage: {
      id: string;
      subscriptionId: string;
      usageIdentityHash: string;
    },
  ): P405ExecutionValue {
    return {
      actionClass: 'sync_customer_subscription_usage',
      actionExecutionId: executionId,
      subscriptionId: usage.subscriptionId,
      usageId: usage.id,
      usageIdentityHash: usage.usageIdentityHash,
      providerDispatches: 0,
      subscriptionMutations: 0,
      usageClaims: 1,
    };
  }

  private terminalValue(
    actionClass:
      | 'expire_customer_subscription'
      | 'cancel_customer_subscription'
      | 'revoke_customer_subscription',
    executionId: string,
    subscriptionId: string,
    status: 'expired' | 'canceled' | 'revoked',
  ): P405ExecutionValue {
    return {
      actionClass,
      actionExecutionId: executionId,
      subscriptionId,
      terminalStatus: status,
      providerDispatches: 0,
      subscriptionMutations: 1,
      usageClaims: 0,
    };
  }

  private terminalStatus(
    actionClass:
      | 'expire_customer_subscription'
      | 'cancel_customer_subscription'
      | 'revoke_customer_subscription',
  ): 'expired' | 'canceled' | 'revoked' {
    return actionClass === 'expire_customer_subscription'
      ? 'expired'
      : actionClass === 'cancel_customer_subscription'
        ? 'canceled'
        : 'revoked';
  }

  private safe(value: P405ExecutionValue): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new P405ExecutionContractError(`${label} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 240) {
      throw new P405ExecutionContractError(`${label} is not canonical`);
    }
    return value;
  }

  private integer(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value)) {
      throw new P405ExecutionContractError(`${label} is not an integer`);
    }
    return Number(value);
  }

  private strings(value: unknown, label: string): string[] {
    if (!Array.isArray(value)) {
      throw new P405ExecutionContractError(`${label} must be an array`);
    }
    return value.map((item) => this.text(item, label));
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private errorClass(error: unknown): string {
    const name =
      error instanceof Error ? error.constructor.name : 'UnknownError';
    return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ? name : 'UnknownError';
  }
}
