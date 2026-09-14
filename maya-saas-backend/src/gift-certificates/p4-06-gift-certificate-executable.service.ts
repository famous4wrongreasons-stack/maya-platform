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
  P4_06_EXECUTABLE_CAPABILITIES,
  type P406ExecutableActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type {
  ActionFailureClassification,
  ActionRuntimeHandlers,
  ActionRuntimePhase,
  ActionRuntimeReceipt,
} from '../action-engine/action-engine.runtime';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import {
  giftCertificatePresentation,
  type GiftCertificatePresentationFacts,
} from './gift-certificate-claim.contract';

export interface P406ProviderPayment {
  id: string;
  status:
    'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled' | 'unknown';
  paid: boolean;
  amountKopecks: number;
  currency: string;
  capturedAt: string | null;
  confirmationUrl: string | null;
  metadata: Readonly<Record<string, string>>;
}

export interface P406ProviderCheckoutRequest {
  idempotencyKey: string;
  amountKopecks: number;
  currency: string;
  metadata: Readonly<Record<string, string>>;
}

export interface P406CheckoutProvider {
  createPayment(
    input: P406ProviderCheckoutRequest,
  ): Promise<P406ProviderPayment>;
  getPayment(providerPaymentId: string): Promise<P406ProviderPayment | null>;
  reconcileByIdempotencyKey(
    input: P406ProviderCheckoutRequest,
  ): Promise<
    | { outcome: 'FOUND'; payment: P406ProviderPayment }
    | { outcome: 'NOT_FOUND' }
    | { outcome: 'UNKNOWN' }
  >;
}

export interface P406ProviderReferenceCodec {
  encrypt(value: string): string;
  decrypt(value: string): string;
  hash(value: string): string;
}

export interface P406ExecutableOptions {
  provider: P406CheckoutProvider;
  providerReferenceCodec: P406ProviderReferenceCodec;
  presentationKey: string;
  presentationKeyVersion: string;
  claimLookupKey: string;
  now?: () => Date;
}

export interface P406ExecutionValue {
  actionClass: P406ExecutableActionClass;
  actionExecutionId: string;
  providerState?: P406ProviderPayment['status'];
  providerRequestIdentityHash?: string;
  providerPaymentIdentityHash?: string;
  checkoutConfirmationUrl?: string;
  canonicalPurchaserClientId?: string;
  checkoutIdentityHash?: string;
  purchaseIntentIdentityHash?: string;
  canonicalOfferId?: string;
  offerValueVersionId?: string;
  offerValueSnapshotHash?: string;
  certificateId?: string;
  issuanceIdentityHash?: string;
  presentationKeyVersion?: string;
  presentationReference?: string;
  codeHash?: string;
  redemptionId?: string;
  redemptionIdentityHash?: string;
  targetRefHash?: string;
  nominalAmountKopecks?: number;
  currency?: string;
  providerDispatches: number;
  certificateMutations: number;
  redemptionClaims: number;
  partialRedemption: false;
}

export class P406ExecutionContractError extends Error {}
export class P406ProviderDispatchAmbiguousError extends Error {}
export class P406ProviderDefinitiveError extends Error {}

const ACTION_BY_CAPABILITY = new Map<string, P406ExecutableActionClass>([
  [
    P4_06_EXECUTABLE_CAPABILITIES.initiatePurchase,
    'initiate_gift_certificate_purchase',
  ],
  [P4_06_EXECUTABLE_CAPABILITIES.activate, 'activate_gift_certificate'],
  [P4_06_EXECUTABLE_CAPABILITIES.redeem, 'redeem_gift_certificate'],
]);

export class P406GiftCertificateExecutableService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly options: P406ExecutableOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P406ExecutionValue>> {
    const actionClass = ACTION_BY_CAPABILITY.get(request.capability);
    if (!actionClass) {
      throw new P406ExecutionContractError(
        'P4-06 executable capability is not registered',
      );
    }
    if (actionClass === 'initiate_gift_certificate_purchase') {
      return this.executeCheckout(request);
    }
    if (actionClass === 'activate_gift_certificate') {
      return this.executeActivation(request);
    }
    return this.executeRedemption(request);
  }

  private executeCheckout(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P406ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertClientClear(
            context.tenantId,
            input,
            'canonicalPurchaserClientId',
            'providerClientIdentityHash',
          );
          return {
            checkoutIdentityHash: this.text(
              input.checkoutIdentityHash,
              'checkoutIdentityHash',
            ),
          };
        },
        dispatch: async (input, transportKey, context) => {
          const providerRequest = this.providerRequest(
            context.tenantId,
            context.executionId,
            transportKey,
            input,
          );
          const payment =
            await this.options.provider.createPayment(providerRequest);
          this.assertPendingCheckout(input, context, payment);
          await this.persistProviderReference(
            context.tenantId,
            context.executionId,
            payment.id,
          );
          const value = this.checkoutValue(
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
              this.providerRequest(
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
          this.assertPendingCheckout(input, context, decision.payment);
          await this.persistProviderReference(
            context.tenantId,
            context.executionId,
            decision.payment.id,
            ActionAttemptKind.RECONCILIATION,
          );
          const value = this.checkoutValue(
            context.tenantId,
            context.executionId,
            attempt.providerRequestIdentityHash,
            input,
            decision.payment,
          );
          return { outcome: 'PROVEN_SUCCEEDED', safeResult: this.safe(value) };
        },
      }),
    );
  }

  private executeActivation(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P406ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertClientClear(
            context.tenantId,
            input,
            'canonicalPurchaserClientId',
            'providerClientIdentityHash',
          );
          await this.assertAuthoritativePayment(context.tenantId, input);
          return { providerBoundary: 'READ_ONLY_PAYMENT_EVIDENCE' };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.activateCertificate(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileLocalFact(context, 'activate_gift_certificate'),
      }),
    );
  }

  private executeRedemption(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P406ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertRedemptionFacts(
            this.prisma,
            context.tenantId,
            context.executionId,
            input,
          );
          return { providerBoundary: 'LOCAL_ONLY' };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.redeemCertificate(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileLocalFact(context, 'redeem_gift_certificate'),
      }),
    );
  }

  private handlers(
    handlers: Pick<
      ActionRuntimeHandlers<P406ExecutionValue>,
      'prepare' | 'dispatch' | 'reconcile'
    >,
  ): ActionRuntimeHandlers<P406ExecutionValue> {
    return {
      ...handlers,
      restore: (safeResult) => safeResult as unknown as P406ExecutionValue,
      classifyError: (error, phase) => this.classify(error, phase),
    };
  }

  private classify(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification {
    if (
      phase === 'prepare' ||
      error instanceof P406ExecutionContractError ||
      error instanceof P406ProviderDefinitiveError
    ) {
      return {
        kind: 'definitive',
        outcomeCode: 'p4_06_contract_rejected',
        errorClass: this.errorClass(error),
      };
    }
    return {
      kind: 'unknown',
      outcomeCode:
        error instanceof P406ProviderDispatchAmbiguousError
          ? 'provider_dispatch_outcome_unknown'
          : 'p4_06_local_commit_outcome_unknown',
      errorClass: this.errorClass(error),
    };
  }

  private async activateCertificate(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P406ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.giftCertificate.findUnique({
          where: {
            issueExecutionId_tenantId: {
              issueExecutionId: executionId,
              tenantId,
            },
          },
        });
        if (existing) return this.activationValue(executionId, existing);

        const presentationKeyVersion = this.text(
          input.presentationKeyVersion,
          'presentationKeyVersion',
        );
        if (presentationKeyVersion !== this.options.presentationKeyVersion) {
          throw new P406ExecutionContractError(
            'Presentation key version is not the selected server version',
          );
        }
        const facts = this.presentationFacts(tenantId, executionId, input);
        const material = giftCertificatePresentation(facts, {
          presentationKey: this.options.presentationKey,
          presentationKeyVersion,
          lookupKey: this.options.claimLookupKey,
        });
        const certificate = await tx.giftCertificate.create({
          data: {
            id: facts.certificateId,
            tenantId,
            issueExecutionId: executionId,
            issuanceIdentityHash: facts.issuanceIdentityHash,
            codeHash: material.codeHash,
            presentationKeyVersion,
            recipientSubjectHash: this.text(
              input.recipientSubjectHash,
              'recipientSubjectHash',
            ),
            offerSnapshotHash: this.text(
              input.offerSnapshotHash,
              'offerSnapshotHash',
            ),
            nominalAmountKopecks: this.integer(
              input.nominalAmountKopecks,
              'nominalAmountKopecks',
            ),
            currency: this.text(input.currency, 'currency'),
            paymentStatus: 'paid',
            provider: 'yookassa',
            providerPaymentRefHash: this.text(
              input.providerPaymentIdentityHash,
              'providerPaymentIdentityHash',
            ),
            issuedAt: new Date(this.text(input.issuedAt, 'issuedAt')),
            expiresAt: new Date(this.text(input.expiresAt, 'expiresAt')),
            paidAt: new Date(this.text(input.providerPaidAt, 'providerPaidAt')),
          },
        });
        return this.activationValue(
          executionId,
          certificate,
          material.presentationReference,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async redeemCertificate(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P406ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const certificateId = this.text(
          input.canonicalCertificateId,
          'canonicalCertificateId',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "GiftCertificate"
          WHERE "id" = ${certificateId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const existing = await tx.giftCertificateRedemption.findUnique({
          where: { certificateId_tenantId: { certificateId, tenantId } },
        });
        if (existing) {
          if (existing.actionExecutionId !== executionId) {
            throw new P406ExecutionContractError(
              'Certificate already has a full redemption winner',
            );
          }
          return this.redemptionValue(executionId, existing);
        }
        await this.assertRedemptionFacts(tx, tenantId, executionId, input);
        const redemption = await tx.giftCertificateRedemption.create({
          data: {
            id: this.text(
              input.redemptionIdentityHash,
              'redemptionIdentityHash',
            ),
            tenantId,
            certificateId,
            actionExecutionId: executionId,
            targetKind: 'appointment_service_bundle',
            targetRefHash: this.text(input.targetRefHash, 'targetRefHash'),
            redeemedAt: this.now(),
          },
        });
        return this.redemptionValue(executionId, redemption);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertAuthoritativePayment(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const checkoutExecutionId = this.text(
      input.checkoutExecutionId,
      'checkoutExecutionId',
    );
    const checkout = await this.prisma.actionExecution.findUnique({
      where: { id_tenantId: { id: checkoutExecutionId, tenantId } },
    });
    if (!checkout) {
      throw new P406ExecutionContractError('Checkout execution is missing');
    }
    if (checkout.state === ActionExecutionState.UNKNOWN) {
      throw new P406ExecutionContractError(
        'UNKNOWN checkout cannot activate certificate value',
      );
    }
    if (
      checkout.state !== ActionExecutionState.SUCCEEDED ||
      checkout.actionClass !== 'initiate_gift_certificate_purchase'
    ) {
      throw new P406ExecutionContractError(
        'Checkout is not authoritative activation evidence',
      );
    }
    const facts = this.record(
      checkout.safeResultSummaryJson,
      'checkout safe result',
    );
    for (const key of [
      'canonicalPurchaserClientId',
      'providerClientIdentityHash',
      'checkoutIdentityHash',
      'purchaseIntentIdentityHash',
      'canonicalOfferId',
      'offerValueVersionId',
      'offerValueSnapshotHash',
      'offerCode',
      'productCode',
      'catalogVersion',
      'offerSnapshotHash',
      'denominationType',
      'currency',
      'recipientSubjectHash',
      'expiryPolicyVersion',
      'providerRequestIdentityHash',
    ]) {
      if (facts[key] !== input[key]) {
        throw new P406ExecutionContractError(
          'Checkout and activation evidence do not match',
        );
      }
    }
    if (
      facts.nominalAmountKopecks !== input.nominalAmountKopecks ||
      facts.expiryDays !== input.expiryDays ||
      facts.providerState !== 'pending'
    ) {
      throw new P406ExecutionContractError(
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
      throw new P406ExecutionContractError(
        'Checkout provider reference is incomplete',
      );
    }
    const paymentId = this.options.providerReferenceCodec.decrypt(
      referenceAttempt.providerReferenceEncrypted,
    );
    const payment = await this.options.provider.getPayment(paymentId);
    if (!payment) {
      throw new P406ExecutionContractError(
        'Provider payment evidence is unavailable',
      );
    }
    if (payment.status !== 'succeeded' || !payment.paid) {
      throw new P406ExecutionContractError(
        payment.status === 'pending' || payment.status === 'waiting_for_capture'
          ? 'PENDING checkout cannot activate certificate value'
          : 'Provider payment is not successfully paid',
      );
    }
    this.assertPaymentCorrelation(
      tenantId,
      checkoutExecutionId,
      facts,
      payment,
    );
    const providerPaymentIdentityHash = this.hash([
      'p4-06.yookassa-payment.v1',
      tenantId,
      referenceAttempt.providerReferenceHash,
    ]);
    if (
      providerPaymentIdentityHash !== input.providerPaymentIdentityHash ||
      payment.capturedAt !== input.providerPaidAt
    ) {
      throw new P406ExecutionContractError(
        'Provider payment identity or paid time changed',
      );
    }
    const paidAt = this.text(payment.capturedAt, 'providerPaidAt');
    const activationIdentityHash = this.hash([
      'p4-06.paid-certificate-activation.v1',
      tenantId,
      checkoutExecutionId,
      'yookassa',
      providerPaymentIdentityHash,
      'succeeded',
      String(facts.offerSnapshotHash),
      String(facts.recipientSubjectHash),
      'gift-certificate-presentation.v1',
    ]);
    const issuanceIdentityHash = this.hash([
      'p4-06.gift-certificate-issuance.v1',
      tenantId,
      activationIdentityHash,
      String(facts.checkoutIdentityHash),
      String(facts.offerSnapshotHash),
      String(facts.recipientSubjectHash),
    ]);
    const certificateIdentityHash = this.hash([
      'p4-06.gift-certificate-identity.v1',
      tenantId,
      issuanceIdentityHash,
    ]);
    const expiresAt = new Date(
      new Date(paidAt).getTime() +
        Number(facts.expiryDays) * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const bearerDerivationIdentityHash = this.hash([
      'gift-certificate-presentation.v1',
      tenantId,
      certificateIdentityHash,
      issuanceIdentityHash,
      activationIdentityHash,
      String(facts.nominalAmountKopecks),
      String(facts.currency),
      expiresAt,
      this.options.presentationKeyVersion,
    ]);
    const expected: ReadonlyArray<[string, unknown]> = [
      ['activationIdentityHash', activationIdentityHash],
      ['issuanceIdentityHash', issuanceIdentityHash],
      ['certificateIdentityHash', certificateIdentityHash],
      ['issuedAt', paidAt],
      ['expiresAt', expiresAt],
      ['presentationKeyVersion', this.options.presentationKeyVersion],
      ['bearerDerivationIdentityHash', bearerDerivationIdentityHash],
    ];
    if (expected.some(([key, value]) => input[key] !== value)) {
      throw new P406ExecutionContractError(
        'Activation identity or presentation facts are not server-derived',
      );
    }
  }

  private async assertRedemptionFacts(
    tx: PrismaClient | Prisma.TransactionClient,
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    if (input.redemptionMode !== 'full_only') {
      throw new P406ExecutionContractError('Partial redemption is unsupported');
    }
    const certificateId = this.text(
      input.canonicalCertificateId,
      'canonicalCertificateId',
    );
    const certificate = await tx.giftCertificate.findUnique({
      where: { id_tenantId: { id: certificateId, tenantId } },
    });
    if (
      !certificate ||
      certificate.paymentStatus !== 'paid' ||
      !certificate.paidAt ||
      certificate.canceledAt ||
      certificate.expiresAt.getTime() <= this.now().getTime() ||
      certificate.issueExecutionId !== input.issueExecutionId ||
      certificate.issuanceIdentityHash !== input.issuanceIdentityHash ||
      certificate.recipientSubjectHash !== input.recipientSubjectHash ||
      certificate.offerSnapshotHash !== input.offerSnapshotHash ||
      certificate.presentationKeyVersion !== input.presentationKeyVersion ||
      certificate.nominalAmountKopecks !== input.nominalAmountKopecks ||
      certificate.currency !== input.currency
    ) {
      throw new P406ExecutionContractError(
        'Certificate is not an exact active full-value claim',
      );
    }
    const expectedCertificateIdentity = this.hash([
      'p4-06.gift-certificate-identity.v1',
      tenantId,
      certificate.issuanceIdentityHash,
    ]);
    const expectedClaimBinding = this.hash([
      'p4-06.gift-certificate-claim-binding.v1',
      tenantId,
      certificate.id,
      certificate.codeHash,
      certificate.presentationKeyVersion ?? '',
      'giftCertificateClaimLookup.v1',
    ]);
    if (
      input.certificateIdentityHash !== expectedCertificateIdentity ||
      input.claimBindingHash !== expectedClaimBinding
    ) {
      throw new P406ExecutionContractError(
        'Bearer lookup evidence is not bound to the certificate',
      );
    }
    await this.assertClientClear(
      tenantId,
      input,
      'targetClientId',
      'targetClientIdentityHash',
      'p4-06.gift-certificate-target-client.v1',
    );
    const appointment = await tx.appointment.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.targetAppointmentId, 'targetAppointmentId'),
          tenantId,
        },
      },
    });
    const serviceIds = this.stringArray(input.serviceIds, 'serviceIds');
    if (
      !appointment ||
      appointment.mayaClientId !== input.targetClientId ||
      appointment.crmProvider !== input.provider ||
      appointment.crmExternalId !== input.providerRecordIdentity ||
      appointment.totalPriceKopecks !== input.targetAmountKopecks ||
      appointment.currency !== input.targetCurrency ||
      JSON.stringify(this.stringArray(appointment.serviceIds, 'serviceIds')) !==
        JSON.stringify(serviceIds)
    ) {
      throw new P406ExecutionContractError(
        'Redemption target is not exact same-tenant business evidence',
      );
    }
    const providerVisitIdentity = this.providerVisitIdentity(
      appointment.providerPayload,
    );
    if (providerVisitIdentity !== input.providerVisitIdentity) {
      throw new P406ExecutionContractError(
        'Provider visit identity changed before redemption',
      );
    }
    const expectedTargetRefHash = this.hash([
      'p4-06.gift-certificate-redemption-target.appointment.v1',
      tenantId,
      String(input.targetClientId),
      appointment.id,
      String(input.provider),
      String(appointment.crmExternalId),
      providerVisitIdentity ?? '',
      ...serviceIds,
      String(appointment.totalPriceKopecks),
      appointment.currency,
    ]);
    if (expectedTargetRefHash !== input.targetRefHash) {
      throw new P406ExecutionContractError(
        'Redemption target identity is not server-derived',
      );
    }
    const execution = await tx.actionExecution.findUnique({
      where: { id_tenantId: { id: executionId, tenantId } },
      include: { actorMembership: true },
    });
    if (
      !execution?.actorUserId ||
      !execution.actorMembership ||
      execution.actorMembership.status !== MembershipStatus.active ||
      String(execution.actorMembership.role) !== input.requesterRole
    ) {
      throw new P406ExecutionContractError(
        'Redemption requires an active canonical actor',
      );
    }
    const expectedRequesterIdentity = this.hash([
      tenantId,
      execution.actorUserId,
      execution.actorMembership.id,
      String(execution.actorMembership.role),
      String(input.requesterAuthority),
    ]);
    if (expectedRequesterIdentity !== input.requesterIdentityHash) {
      throw new P406ExecutionContractError(
        'Redemption actor authority is not server-derived',
      );
    }
    const expectedRedemptionIdentity = this.hash([
      'p4-06.full-gift-certificate-redemption.v1',
      tenantId,
      certificate.id,
      expectedTargetRefHash,
      String(input.targetClientId),
      expectedRequesterIdentity,
    ]);
    if (expectedRedemptionIdentity !== input.redemptionIdentityHash) {
      throw new P406ExecutionContractError(
        'Redemption identity is not server-derived',
      );
    }
  }

  private async assertClientClear(
    tenantId: string,
    input: Record<string, unknown>,
    clientKey: string,
    identityKey: string,
    namespace = 'p4-06.provider-client.v1',
  ): Promise<void> {
    const clientId = this.text(input[clientKey], clientKey);
    const client = await this.prisma.client.findUnique({
      where: { id_tenantId: { id: clientId, tenantId } },
      include: { crmLinks: { where: { unlinkedAt: null } } },
    });
    if (!client || client.mergedIntoClientId || client.crmLinks.length < 1) {
      throw new P406ExecutionContractError(
        'Exact canonical Client identity is missing',
      );
    }
    const matchingLink = client.crmLinks.find(
      (link) =>
        this.hash([
          namespace,
          tenantId,
          namespace.includes('target-client') ? client.id : link.provider,
          namespace.includes('target-client') ? link.provider : link.externalId,
          namespace.includes('target-client') ? link.externalId : client.id,
        ]) === input[identityKey],
    );
    if (!matchingLink) {
      throw new P406ExecutionContractError(
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
      throw new P406ExecutionContractError('client_identity_unresolved');
    }
  }

  private presentationFacts(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): GiftCertificatePresentationFacts {
    return {
      tenantId,
      certificateId: this.text(
        input.certificateIdentityHash,
        'certificateIdentityHash',
      ),
      issuanceIdentityHash: this.text(
        input.issuanceIdentityHash,
        'issuanceIdentityHash',
      ),
      activationExecutionId: executionId,
      nominalAmountKopecks: this.integer(
        input.nominalAmountKopecks,
        'nominalAmountKopecks',
      ),
      currency: this.text(input.currency, 'currency'),
      expiresAt: this.text(input.expiresAt, 'expiresAt'),
    };
  }

  private providerMetadata(
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
        input.canonicalPurchaserClientId,
        'canonicalPurchaserClientId',
      ),
      offer_snapshot_hash: this.text(
        input.offerSnapshotHash,
        'offerSnapshotHash',
      ),
      recipient_subject_hash: this.text(
        input.recipientSubjectHash,
        'recipientSubjectHash',
      ),
    };
  }

  private providerRequest(
    tenantId: string,
    executionId: string,
    idempotencyKey: string,
    input: Record<string, unknown>,
  ): P406ProviderCheckoutRequest {
    return {
      idempotencyKey,
      amountKopecks: this.integer(
        input.nominalAmountKopecks,
        'nominalAmountKopecks',
      ),
      currency: this.text(input.currency, 'currency'),
      metadata: this.providerMetadata(tenantId, executionId, input),
    };
  }

  private assertPendingCheckout(
    input: Record<string, unknown>,
    context: { tenantId: string; executionId: string },
    payment: P406ProviderPayment,
  ): void {
    if (
      (payment.status !== 'pending' &&
        payment.status !== 'waiting_for_capture') ||
      payment.paid ||
      payment.amountKopecks !== input.nominalAmountKopecks ||
      payment.currency !== input.currency
    ) {
      throw new P406ProviderDefinitiveError(
        'Provider checkout response is not a canonical pending intent',
      );
    }
    const metadata = this.providerMetadata(
      context.tenantId,
      context.executionId,
      input,
    );
    if (
      Object.entries(metadata).some(
        ([key, value]) => payment.metadata[key] !== value,
      )
    ) {
      throw new P406ProviderDefinitiveError(
        'Provider checkout metadata does not match the execution',
      );
    }
  }

  private assertPaymentCorrelation(
    tenantId: string,
    executionId: string,
    facts: Record<string, unknown>,
    payment: P406ProviderPayment,
  ): void {
    if (
      payment.amountKopecks !== facts.nominalAmountKopecks ||
      payment.currency !== facts.currency ||
      payment.metadata.tenant_id !== tenantId ||
      payment.metadata.checkout_execution_id !== executionId ||
      payment.metadata.checkout_identity_hash !== facts.checkoutIdentityHash ||
      payment.metadata.canonical_client_id !==
        facts.canonicalPurchaserClientId ||
      payment.metadata.offer_snapshot_hash !== facts.offerSnapshotHash ||
      payment.metadata.recipient_subject_hash !== facts.recipientSubjectHash
    ) {
      throw new P406ExecutionContractError(
        'Authoritative provider payment does not match checkout facts',
      );
    }
  }

  private checkoutValue(
    tenantId: string,
    executionId: string,
    providerRequestIdentityHash: string,
    input: Record<string, unknown>,
    payment: P406ProviderPayment,
  ): P406ExecutionValue & Record<string, unknown> {
    return {
      actionClass: 'initiate_gift_certificate_purchase',
      actionExecutionId: executionId,
      providerState: payment.status,
      providerRequestIdentityHash,
      providerPaymentIdentityHash: this.hash([
        'p4-06.yookassa-payment.v1',
        tenantId,
        this.options.providerReferenceCodec.hash(payment.id),
      ]),
      ...(payment.confirmationUrl
        ? { checkoutConfirmationUrl: payment.confirmationUrl }
        : {}),
      canonicalPurchaserClientId: this.text(
        input.canonicalPurchaserClientId,
        'canonicalPurchaserClientId',
      ),
      providerClientIdentityHash: input.providerClientIdentityHash,
      checkoutIdentityHash: this.text(
        input.checkoutIdentityHash,
        'checkoutIdentityHash',
      ),
      purchaseIntentIdentityHash: this.text(
        input.purchaseIntentIdentityHash,
        'purchaseIntentIdentityHash',
      ),
      canonicalOfferId: this.text(input.canonicalOfferId, 'canonicalOfferId'),
      offerValueVersionId: this.text(
        input.offerValueVersionId,
        'offerValueVersionId',
      ),
      offerValueSnapshotHash: this.text(
        input.offerValueSnapshotHash,
        'offerValueSnapshotHash',
      ),
      offerCode: input.offerCode,
      productCode: input.productCode,
      catalogVersion: input.catalogVersion,
      offerSnapshotHash: input.offerSnapshotHash,
      denominationType: input.denominationType,
      nominalAmountKopecks: this.integer(
        input.nominalAmountKopecks,
        'nominalAmountKopecks',
      ),
      currency: this.text(input.currency, 'currency'),
      recipientSubjectHash: input.recipientSubjectHash,
      expiryDays: input.expiryDays,
      expiryPolicyVersion: input.expiryPolicyVersion,
      paymentProvider: 'yookassa',
      providerDispatches: 1,
      certificateMutations: 0,
      redemptionClaims: 0,
      partialRedemption: false,
    };
  }

  private activationValue(
    executionId: string,
    certificate: {
      id: string;
      issuanceIdentityHash: string;
      presentationKeyVersion: string | null;
      codeHash: string;
      nominalAmountKopecks: number;
      currency: string;
    },
    presentationReference?: string,
  ): P406ExecutionValue {
    return {
      actionClass: 'activate_gift_certificate',
      actionExecutionId: executionId,
      certificateId: certificate.id,
      issuanceIdentityHash: certificate.issuanceIdentityHash,
      presentationKeyVersion: certificate.presentationKeyVersion ?? undefined,
      codeHash: certificate.codeHash,
      ...(presentationReference ? { presentationReference } : {}),
      nominalAmountKopecks: certificate.nominalAmountKopecks,
      currency: certificate.currency,
      providerDispatches: 0,
      certificateMutations: 1,
      redemptionClaims: 0,
      partialRedemption: false,
    };
  }

  private redemptionValue(
    executionId: string,
    redemption: {
      id: string;
      certificateId: string;
      targetRefHash: string;
    },
  ): P406ExecutionValue {
    return {
      actionClass: 'redeem_gift_certificate',
      actionExecutionId: executionId,
      certificateId: redemption.certificateId,
      redemptionId: redemption.id,
      redemptionIdentityHash: redemption.id,
      targetRefHash: redemption.targetRefHash,
      providerDispatches: 0,
      certificateMutations: 0,
      redemptionClaims: 1,
      partialRedemption: false,
    };
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
    if (!attempt) {
      throw new P406ExecutionContractError(
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
    actionClass: 'activate_gift_certificate' | 'redeem_gift_certificate',
  ) {
    if (!context) return { outcome: 'STILL_UNKNOWN' as const };
    const value = await this.valueForExecution(
      context.tenantId,
      context.executionId,
      actionClass,
    );
    return value
      ? { outcome: 'PROVEN_SUCCEEDED' as const, safeResult: this.safe(value) }
      : { outcome: 'PROVEN_NOT_EXECUTED' as const };
  }

  private async valueForExecution(
    tenantId: string,
    executionId: string,
    actionClass: 'activate_gift_certificate' | 'redeem_gift_certificate',
  ): Promise<P406ExecutionValue | null> {
    if (actionClass === 'activate_gift_certificate') {
      const certificate = await this.prisma.giftCertificate.findUnique({
        where: {
          issueExecutionId_tenantId: {
            issueExecutionId: executionId,
            tenantId,
          },
        },
      });
      return certificate
        ? this.activationValue(executionId, certificate)
        : null;
    }
    const redemption = await this.prisma.giftCertificateRedemption.findUnique({
      where: {
        actionExecutionId_tenantId: {
          actionExecutionId: executionId,
          tenantId,
        },
      },
    });
    return redemption ? this.redemptionValue(executionId, redemption) : null;
  }

  private safe(value: P406ExecutionValue): Record<string, unknown> {
    const result = { ...value } as Record<string, unknown>;
    delete result.bearer;
    delete result.rawCode;
    delete result.presentationKey;
    delete result.claimLookupKey;
    return result;
  }

  private text(value: unknown, label: string): string {
    if (
      typeof value !== 'string' ||
      value.length < 1 ||
      value.length > 240 ||
      !/^[A-Za-z0-9._:/-]+$/.test(value)
    ) {
      throw new P406ExecutionContractError(
        `${label} must be an opaque reference`,
      );
    }
    return value;
  }

  private integer(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
      throw new P406ExecutionContractError(
        `${label} must be a positive integer`,
      );
    }
    return Number(value);
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new P406ExecutionContractError(`${label} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private stringArray(value: unknown, label: string): string[] {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new P406ExecutionContractError(`${label} must be a string list`);
    }
    return [...(value as string[])].sort();
  }

  private providerVisitIdentity(value: unknown): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const payload = value as Record<string, unknown>;
    for (const key of [
      'visit_id',
      'visitId',
      'attendance_id',
      'attendanceId',
    ]) {
      const candidate = payload[key];
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return String(candidate);
      }
    }
    return null;
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private errorClass(error: unknown): string {
    return error instanceof Error ? error.constructor.name : 'UnknownError';
  }
}
