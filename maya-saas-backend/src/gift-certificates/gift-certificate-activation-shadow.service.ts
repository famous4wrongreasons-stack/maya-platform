import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY,
  GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
  GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
  GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
  GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
  GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  resolveGiftCertificatePurchaseOffer,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  YooKassaClientService,
  type YooKassaPayment,
} from '../billing/yookassa-client.service';
import type { GiftCertificateActivationShadowDto } from './dto/gift-certificate-activation-shadow.dto';

const PRESENTATION_KEY_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export type GiftCertificateActivationShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'checkout_not_activatable'
  | 'payment_pending'
  | 'payment_unknown'
  | 'payment_not_succeeded'
  | 'payment_evidence_mismatch'
  | 'provider_evidence_unavailable'
  | 'presentation_key_unavailable'
  | 'activation_already_claimed';

export interface GiftCertificateActivationShadowResult {
  outcome: GiftCertificateActivationShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedActivation: {
    model: 'GiftCertificate';
    intendedPaymentStatus: 'paid';
    canonicalPurchaserClientId: string;
    checkoutExecutionId: string;
    providerPaymentIdentityHash: string;
    activationIdentityHash: string;
    issuanceIdentityHash: string;
    certificateIdentityHash: string;
    offerCode: string;
    nominalAmountKopecks: number;
    currency: 'RUB';
    recipientSubjectHash: string;
    issuedAt: string;
    expiresAt: string;
    presentationContractVersion: typeof GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION;
    presentationKeyPolicyVersion: typeof GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION;
    presentationKeyVersion: string;
    claimLookupContractVersion: typeof GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION;
    bearerDerivationIdentityHash: string;
    policyProfile: typeof GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE;
    oneTimeActivationEligible: true;
    approvalRequirement: 'NONE';
    providerWritesRequired: false;
    unknownApplicable: false;
    certificateWritePerformed: false;
    rawBearerGenerated: false;
    rawCodePersisted: false;
    redemptionCreated: false;
  } | null;
  certificatesCreatedOrActivatedByNewPath: 0;
  rawBearerOrCodePersistedByNewPath: 0;
  redemptionsCreatedByNewPath: 0;
  paymentProviderValueWritesByNewPath: 0;
  messagesSentByNewPath: 0;
}

type CheckoutSafeResult = {
  checkoutMode: 'gift_certificate_purchase';
  canonicalPurchaserClientId: string;
  providerClientIdentityHash: string;
  checkoutIdentityHash: string;
  purchaseIntentIdentityHash: string;
  canonicalOfferId: string;
  offerValueVersionId: string;
  offerValueSnapshotHash: string;
  offerCode: string;
  productCode: 'digital-gift-certificate';
  catalogVersion: string;
  offerSnapshotHash: string;
  denominationType: 'fixed_money';
  nominalAmountKopecks: number;
  currency: 'RUB';
  recipientSubjectHash: string;
  expiryDays: number;
  expiryPolicyVersion: string;
  paymentProvider: 'yookassa';
  providerRequestIdentityHash: string;
  checkoutContractVersion: string;
  intendedCertificateSemantics: 'transferable_bearer_full_value';
  redemptionMode: 'full_only';
  presentationContractVersion: string;
  presentationKeyPolicyVersion: string;
  claimLookupContractVersion: string;
};

@Injectable()
export class GiftCertificateActivationShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
    private readonly encryption: EncryptionService,
    private readonly yooKassa: YooKassaClientService,
    private readonly config: ConfigService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'gift_certificate_activation_shadow_bridge_disabled',
      unauthorized: 'gift_certificate_activation_shadow_unauthorized',
    });
  }

  async planActivation(
    dto: GiftCertificateActivationShadowDto,
  ): Promise<GiftCertificateActivationShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'gift_certificate_activation_shadow_source_disabled',
        mismatch: 'gift_certificate_activation_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'gift_certificate_activation_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const checkoutExecutionId = dto.checkout_execution_id.trim();
    if (!externalClientId || !checkoutExecutionId) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        crmProvider: boundSource.provider,
        externalClientId,
        checkoutExecutionId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    crmProvider: string;
    externalClientId: string;
    checkoutExecutionId: string;
  }): Promise<GiftCertificateActivationShadowResult> {
    const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
      tenantId: input.tenantId,
      provider: input.crmProvider,
      externalId: input.externalClientId,
    });
    if (!guard.allowed) {
      return this.noPlan(
        guard.reasonCode === CLIENT_IDENTITY_UNRESOLVED
          ? 'identity_unresolved'
          : guard.reasonCode === CLIENT_IDENTITY_GUARD_UNAVAILABLE
            ? 'identity_guard_unavailable'
            : 'identity_unresolved',
        1,
      );
    }

    const link = await this.prisma.crmClientLink.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: input.tenantId,
          provider: input.crmProvider,
          externalId: input.externalClientId,
        },
      },
      select: {
        unlinkedAt: true,
        client: { select: { id: true, mergedIntoClientId: true } },
      },
    });
    if (
      !link ||
      link.unlinkedAt !== null ||
      link.client.mergedIntoClientId !== null
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const checkout = await this.prisma.actionExecution.findUnique({
      where: {
        id_tenantId: {
          id: input.checkoutExecutionId,
          tenantId: input.tenantId,
        },
      },
      select: {
        id: true,
        actionClass: true,
        state: true,
        dryRun: true,
        policyDecision: true,
        finalOutcomeCode: true,
        safeResultSummaryJson: true,
      },
    });
    if (!checkout) return this.noPlan('checkout_not_activatable', 1);
    if (checkout.state === ActionExecutionState.UNKNOWN) {
      return this.noPlan('payment_unknown', 0);
    }
    if (
      checkout.actionClass !== 'initiate_gift_certificate_purchase' ||
      checkout.state !== ActionExecutionState.SUCCEEDED ||
      checkout.dryRun ||
      checkout.policyDecision !== ActionPolicyDecision.ALLOW ||
      checkout.finalOutcomeCode !== 'provider_checkout_created'
    ) {
      return this.noPlan('checkout_not_activatable', 1);
    }

    const checkoutFacts = this.checkoutFacts(checkout.safeResultSummaryJson);
    if (
      !checkoutFacts ||
      checkoutFacts.canonicalPurchaserClientId !== link.client.id ||
      checkoutFacts.paymentProvider !== 'yookassa'
    ) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }
    const offer = resolveGiftCertificatePurchaseOffer(checkoutFacts.offerCode);
    if (!offer || !this.checkoutFactsMatchOffer(checkoutFacts, offer)) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }

    const attempt = await this.prisma.actionAttempt.findFirst({
      where: {
        tenantId: input.tenantId,
        actionExecutionId: checkout.id,
        state: ActionAttemptState.SUCCEEDED,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
      },
      orderBy: { attemptNumber: 'desc' },
      select: {
        providerRequestIdentityHash: true,
        providerReferenceEncrypted: true,
        providerReferenceHash: true,
      },
    });
    if (
      !attempt?.providerReferenceEncrypted ||
      !attempt.providerReferenceHash ||
      !attempt.providerRequestIdentityHash ||
      attempt.providerRequestIdentityHash !==
        checkoutFacts.providerRequestIdentityHash
    ) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }

    let providerPaymentId: string;
    let providerPayment: YooKassaPayment;
    try {
      providerPaymentId = this.encryption.decrypt(
        attempt.providerReferenceEncrypted,
      );
      providerPayment = await this.yooKassa.getPayment(providerPaymentId);
    } catch {
      return this.noPlan('provider_evidence_unavailable', 0);
    }
    if (providerPayment.id !== providerPaymentId) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }
    if (
      providerPayment.status === 'pending' ||
      providerPayment.status === 'waiting_for_capture'
    ) {
      return this.noPlan('payment_pending', 0);
    }
    if (providerPayment.status === 'unknown') {
      return this.noPlan('payment_unknown', 0);
    }
    if (
      providerPayment.status !== 'succeeded' ||
      providerPayment.paid !== true
    ) {
      return this.noPlan('payment_not_succeeded', 0);
    }
    if (
      this.paymentAmountKopecks(providerPayment) !==
        checkoutFacts.nominalAmountKopecks ||
      providerPayment.amount?.currency !== checkoutFacts.currency ||
      !this.providerMetadataMatches(
        providerPayment,
        input.tenantId,
        checkout.id,
        checkoutFacts,
      )
    ) {
      return this.noPlan('payment_evidence_mismatch', 1);
    }

    const paidAt = this.providerPaidAt(providerPayment);
    if (!paidAt) return this.noPlan('payment_evidence_mismatch', 1);
    const presentationKeyVersion = this.presentationKeyVersion();
    if (!presentationKeyVersion) {
      return this.noPlan('presentation_key_unavailable', 1);
    }

    const providerPaymentIdentityHash = this.hash([
      'p4-06.yookassa-payment.v1',
      input.tenantId,
      attempt.providerReferenceHash,
    ]);
    const activationIdentityHash = this.hash([
      GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
      input.tenantId,
      checkout.id,
      'yookassa',
      providerPaymentIdentityHash,
      'succeeded',
      checkoutFacts.offerSnapshotHash,
      checkoutFacts.recipientSubjectHash,
      GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
    ]);
    const issuanceIdentityHash = this.hash([
      'p4-06.gift-certificate-issuance.v1',
      input.tenantId,
      activationIdentityHash,
      checkoutFacts.checkoutIdentityHash,
      checkoutFacts.offerSnapshotHash,
      checkoutFacts.recipientSubjectHash,
    ]);
    const certificateIdentityHash = this.hash([
      'p4-06.gift-certificate-identity.v1',
      input.tenantId,
      issuanceIdentityHash,
    ]);
    const issuedAt = paidAt.toISOString();
    const expiresAt = new Date(
      paidAt.getTime() + checkoutFacts.expiryDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const bearerDerivationIdentityHash = this.hash([
      GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
      input.tenantId,
      certificateIdentityHash,
      issuanceIdentityHash,
      activationIdentityHash,
      String(checkoutFacts.nominalAmountKopecks),
      checkoutFacts.currency,
      expiresAt,
      presentationKeyVersion,
    ]);

    const claimed = await this.prisma.giftCertificate.findFirst({
      where: {
        tenantId: input.tenantId,
        OR: [
          { issuanceIdentityHash },
          {
            provider: 'yookassa',
            providerPaymentRefHash: providerPaymentIdentityHash,
          },
        ],
      },
      select: { id: true },
    });
    if (claimed) return this.noPlan('activation_already_claimed', 0);

    const policySnapshotHash = this.hash([
      GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      link.client.id,
      checkoutFacts.offerSnapshotHash,
      providerPaymentIdentityHash,
      presentationKeyVersion,
      'eligible_for_one_time_activation',
      'NONE',
    ]);
    const canonicalInput = {
      canonicalPurchaserClientId: link.client.id,
      providerClientIdentityHash: checkoutFacts.providerClientIdentityHash,
      checkoutExecutionId: checkout.id,
      checkoutIdentityHash: checkoutFacts.checkoutIdentityHash,
      purchaseIntentIdentityHash: checkoutFacts.purchaseIntentIdentityHash,
      canonicalOfferId: checkoutFacts.canonicalOfferId,
      offerValueVersionId: checkoutFacts.offerValueVersionId,
      offerValueSnapshotHash: checkoutFacts.offerValueSnapshotHash,
      offerCode: offer.offerCode,
      productCode: offer.productCode,
      catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
      offerSnapshotHash: checkoutFacts.offerSnapshotHash,
      denominationType: offer.denominationType,
      nominalAmountKopecks: checkoutFacts.nominalAmountKopecks,
      currency: offer.currency,
      recipientSubjectHash: checkoutFacts.recipientSubjectHash,
      expiryDays: offer.expiryDays,
      expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
      paymentProvider: 'yookassa',
      providerRequestIdentityHash: checkoutFacts.providerRequestIdentityHash,
      providerPaymentIdentityHash,
      providerPaymentState: 'succeeded',
      providerPaidAt: issuedAt,
      activationIdentityHash,
      issuanceIdentityHash,
      certificateIdentityHash,
      issuedAt,
      expiresAt,
      presentationContractVersion:
        GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
      presentationKeyPolicyVersion:
        GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
      presentationKeyVersion,
      claimLookupContractVersion:
        GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
      bearerDerivationIdentityHash,
      activationContractVersion: GIFT_CERTIFICATE_ACTIVATION_CONTRACT_VERSION,
      policyProfile: GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible_for_one_time_activation',
      oneTimeActivationEligible: true,
      approvalRequirement: 'NONE',
      intendedPaymentStatus: 'paid',
      intendedCertificateMutation: 'create_paid_certificate',
      unknownApplicable: false,
      providerWritesRequired: false,
      certificateWritePerformed: false,
      rawBearerGenerated: false,
      rawCodePersisted: false,
      redemptionCreated: false,
    } as const;
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: GIFT_CERTIFICATE_ACTIVATION_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-06:activate-certificate:${activationIdentityHash}`,
        sourceRef: 'legacy-gift-certificate:payment-evidence',
      },
      targetRef: `gift-certificate:${certificateIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `checkout-execution:${checkout.id}`,
        `provider-payment:${providerPaymentIdentityHash}`,
        `provider-client:${checkoutFacts.providerClientIdentityHash}`,
        `gift-certificate-offer:${checkoutFacts.offerSnapshotHash}`,
        `recipient-subject:${checkoutFacts.recipientSubjectHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-06.activate-gift-certificate.shadow',
        key: activationIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedActivation: {
        model: 'GiftCertificate',
        intendedPaymentStatus: 'paid',
        canonicalPurchaserClientId: link.client.id,
        checkoutExecutionId: checkout.id,
        providerPaymentIdentityHash,
        activationIdentityHash,
        issuanceIdentityHash,
        certificateIdentityHash,
        offerCode: offer.offerCode,
        nominalAmountKopecks: checkoutFacts.nominalAmountKopecks,
        currency: offer.currency,
        recipientSubjectHash: checkoutFacts.recipientSubjectHash,
        issuedAt,
        expiresAt,
        presentationContractVersion:
          GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
        presentationKeyPolicyVersion:
          GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
        presentationKeyVersion,
        claimLookupContractVersion:
          GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
        bearerDerivationIdentityHash,
        policyProfile: GIFT_CERTIFICATE_ACTIVATION_SHADOW_POLICY_PROFILE,
        oneTimeActivationEligible: true,
        approvalRequirement: 'NONE',
        providerWritesRequired: false,
        unknownApplicable: false,
        certificateWritePerformed: false,
        rawBearerGenerated: false,
        rawCodePersisted: false,
        redemptionCreated: false,
      },
      certificatesCreatedOrActivatedByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      paymentProviderValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private checkoutFacts(value: unknown): CheckoutSafeResult | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const source = value as Record<string, unknown>;
    const stringFields = [
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
      'paymentProvider',
      'providerRequestIdentityHash',
      'checkoutContractVersion',
      'intendedCertificateSemantics',
      'redemptionMode',
      'presentationContractVersion',
      'presentationKeyPolicyVersion',
      'claimLookupContractVersion',
    ] as const;
    if (
      stringFields.some(
        (key) =>
          typeof source[key] !== 'string' || source[key].trim().length === 0,
      )
    ) {
      return null;
    }
    if (
      source.checkoutMode !== 'gift_certificate_purchase' ||
      !Number.isSafeInteger(source.nominalAmountKopecks) ||
      !Number.isSafeInteger(source.expiryDays)
    ) {
      return null;
    }
    return source as unknown as CheckoutSafeResult;
  }

  private checkoutFactsMatchOffer(
    facts: CheckoutSafeResult,
    offer: NonNullable<ReturnType<typeof resolveGiftCertificatePurchaseOffer>>,
  ): boolean {
    return (
      facts.productCode === offer.productCode &&
      facts.catalogVersion === GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION &&
      facts.denominationType === offer.denominationType &&
      facts.nominalAmountKopecks > 0 &&
      facts.nominalAmountKopecks <= 500_000 &&
      facts.currency === offer.currency &&
      facts.expiryDays === offer.expiryDays &&
      facts.expiryPolicyVersion === GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION &&
      facts.checkoutContractVersion ===
        GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION &&
      facts.intendedCertificateSemantics === 'transferable_bearer_full_value' &&
      facts.redemptionMode === 'full_only' &&
      facts.presentationContractVersion ===
        GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION &&
      facts.presentationKeyPolicyVersion ===
        GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION &&
      facts.claimLookupContractVersion ===
        GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION
    );
  }

  private providerMetadataMatches(
    payment: YooKassaPayment,
    tenantId: string,
    checkoutExecutionId: string,
    facts: CheckoutSafeResult,
  ): boolean {
    return (
      payment.metadata?.tenant_id === tenantId &&
      payment.metadata?.checkout_execution_id === checkoutExecutionId &&
      payment.metadata?.checkout_identity_hash === facts.checkoutIdentityHash &&
      payment.metadata?.canonical_purchaser_client_id ===
        facts.canonicalPurchaserClientId &&
      payment.metadata?.offer_snapshot_hash === facts.offerSnapshotHash &&
      payment.metadata?.recipient_subject_hash === facts.recipientSubjectHash
    );
  }

  private paymentAmountKopecks(payment: YooKassaPayment): number | null {
    const value = payment.amount?.value;
    if (!value || !/^\d+\.\d{2}$/.test(value)) return null;
    const [rubles, kopecks] = value.split('.');
    const amount = Number(rubles) * 100 + Number(kopecks);
    return Number.isSafeInteger(amount) ? amount : null;
  }

  private providerPaidAt(payment: YooKassaPayment): Date | null {
    if (!payment.captured_at) return null;
    const paidAt = new Date(payment.captured_at);
    return Number.isNaN(paidAt.getTime()) ? null : paidAt;
  }

  private presentationKeyVersion(): string | null {
    const version = String(
      this.config.get<string>(
        'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION',
      ) || '',
    ).trim();
    return PRESENTATION_KEY_VERSION_PATTERN.test(version) ? version : null;
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_GIFT_CERTIFICATE_ACTIVATION_SHADOW_ENABLED || '')
        .trim()
        .toLowerCase(),
    );
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private noPlan(
    outcome: Exclude<GiftCertificateActivationShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): GiftCertificateActivationShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedActivation: null,
      certificatesCreatedOrActivatedByNewPath: 0,
      rawBearerOrCodePersistedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      paymentProviderValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
