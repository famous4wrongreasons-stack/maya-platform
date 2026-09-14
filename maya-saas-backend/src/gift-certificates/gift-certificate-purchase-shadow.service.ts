import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
  GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
  GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
  GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
  GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
  GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY,
  GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
} from '../action-engine';
import {
  P409CanonicalOfferAuthorityService,
  type P409CanonicalCertificateOffer,
} from '../business-content/p4-09-canonical-offer-authority.service';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { GiftCertificatePurchaseShadowDto } from './dto/gift-certificate-purchase-shadow.dto';

const LEGACY_RECIPIENT_SUBJECT_REF_PATTERN = /^[a-f0-9]{64}$/;

export type GiftCertificatePurchaseShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'invalid_certificate_config'
  | 'checkout_conflict';

export interface GiftCertificatePurchaseShadowResult {
  outcome: GiftCertificatePurchaseShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedCheckout: {
    actionClass: 'initiate_gift_certificate_purchase';
    canonicalPurchaserClientId: string;
    recipientSubjectHash: string;
    canonicalOfferId: string;
    offerValueVersionId: string;
    offerCode: string;
    productCode: 'digital-gift-certificate';
    denominationType: 'fixed_money';
    nominalAmountKopecks: number;
    currency: 'RUB';
    expiryDays: 365;
    expiryPolicyVersion: typeof GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION;
    offerSnapshotHash: string;
    checkoutIdentityHash: string;
    paymentProvider: 'yookassa';
    intendedProviderOperation: 'provider_checkout_create';
    expectedProviderState: 'PENDING';
    presentationContractVersion: typeof GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION;
    presentationKeyPolicyVersion: typeof GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION;
    claimLookupContractVersion: typeof GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION;
    policyProfile: typeof GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE;
    eligibility: 'eligible';
    approvalRequirement: 'NONE';
    providerDispatchPerformed: false;
    unknownApplicable: false;
    createsCertificate: false;
    issuesBearer: false;
  } | null;
  providerCheckoutsCreatedByNewPath: 0;
  paymentMutationsByNewPath: 0;
  certificatesCreatedOrActivatedByNewPath: 0;
  redemptionsCreatedByNewPath: 0;
  providerValueWritesByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class GiftCertificatePurchaseShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
    private readonly canonicalOffers: P409CanonicalOfferAuthorityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'gift_certificate_purchase_shadow_bridge_disabled',
      unauthorized: 'gift_certificate_purchase_shadow_bridge_unauthorized',
    });
  }

  async planPurchase(
    dto: GiftCertificatePurchaseShadowDto,
  ): Promise<GiftCertificatePurchaseShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'gift_certificate_purchase_shadow_source_disabled',
        mismatch: 'gift_certificate_purchase_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'gift_certificate_purchase_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const purchaseIntentRef = dto.purchase_intent_ref.trim();
    const recipientSubjectRef = dto.recipient_subject_ref.trim();
    const offerId = dto.offer_code.trim();
    if (
      !externalClientId ||
      !purchaseIntentRef ||
      !LEGACY_RECIPIENT_SUBJECT_REF_PATTERN.test(recipientSubjectRef)
    ) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (!offerId) return this.noPlan('invalid_certificate_config', 1);

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        purchaseIntentRef,
        recipientSubjectRef,
        offerId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    externalClientId: string;
    purchaseIntentRef: string;
    recipientSubjectRef: string;
    offerId: string;
  }): Promise<GiftCertificatePurchaseShadowResult> {
    let offer: P409CanonicalCertificateOffer;
    try {
      offer = await this.canonicalOffers.resolveCertificateOffer(
        input.tenantId,
        input.offerId,
      );
    } catch {
      return this.noPlan('invalid_certificate_config', 1);
    }
    const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
      tenantId: input.tenantId,
      provider: input.provider,
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
          provider: input.provider,
          externalId: input.externalClientId,
        },
      },
      select: {
        externalId: true,
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

    const providerClientIdentityHash = this.hash([
      'p4-06.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const purchaseIntentIdentityHash = this.hash([
      'p4-06.purchase-intent.v1',
      input.tenantId,
      link.client.id,
      input.purchaseIntentRef,
    ]);
    const recipientSubjectHash = this.hash([
      'p4-06.recipient-subject.v1',
      input.tenantId,
      input.recipientSubjectRef,
    ]);
    const offerSnapshotHash = this.hash([
      GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
      input.tenantId,
      offer.offerId,
      offer.offerValueVersionId,
      offer.valueSnapshotHash,
      offer.templateKey,
      offer.productCode,
      offer.denominationType,
      String(offer.nominalAmountKopecks),
      offer.currency,
      String(offer.expiryDays),
      GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    ]);
    const checkoutIdentityHash = this.hash([
      GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
      input.tenantId,
      link.client.id,
      purchaseIntentIdentityHash,
      offerSnapshotHash,
      String(offer.nominalAmountKopecks),
      offer.currency,
      recipientSubjectHash,
      GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
    ]);
    const providerRequestIdentitySeedHash = this.hash([
      'p4-06.yookassa-request-seed.v1',
      input.tenantId,
      checkoutIdentityHash,
      'yookassa',
    ]);
    const policySnapshotHash = this.hash([
      GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      link.client.id,
      offerSnapshotHash,
      recipientSubjectHash,
      'eligible',
      'NONE',
    ]);
    const canonicalInput = {
      providerClientSource: input.provider,
      canonicalPurchaserClientId: link.client.id,
      providerClientIdentityHash,
      purchaseIntentIdentityHash,
      recipientSubjectHash,
      checkoutIdentityHash,
      canonicalOfferId: offer.offerId,
      offerValueVersionId: offer.offerValueVersionId,
      offerValueSnapshotHash: offer.valueSnapshotHash,
      offerCode: offer.templateKey,
      productCode: offer.productCode,
      catalogVersion: GIFT_CERTIFICATE_PURCHASE_CATALOG_VERSION,
      offerSnapshotHash,
      denominationType: offer.denominationType,
      nominalAmountKopecks: offer.nominalAmountKopecks,
      currency: offer.currency,
      expiryDays: offer.expiryDays,
      expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
      paymentProvider: 'yookassa',
      providerRequestIdentitySeedHash,
      checkoutContractVersion: GIFT_CERTIFICATE_CHECKOUT_CONTRACT_VERSION,
      intendedCertificateSemantics: 'transferable_bearer_full_value',
      redemptionMode: 'full_only',
      presentationContractVersion:
        GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
      presentationKeyPolicyVersion:
        GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
      claimLookupContractVersion:
        GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
      policyProfile: GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible',
      approvalRequirement: 'NONE',
      expectedProviderState: 'PENDING',
      unknownApplicable: false,
      intendedProviderOperation: 'provider_checkout_create',
      createsCertificate: false,
      issuesBearer: false,
    } as const;
    const request = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: GIFT_CERTIFICATE_PURCHASE_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge' as const,
        occurrenceScope: `p4-06:initiate-purchase:${checkoutIdentityHash}`,
        sourceRef: 'legacy-gift-certificate:initiate-purchase',
      },
      targetRef: `gift-certificate-purchase:${purchaseIntentIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `provider-client:${providerClientIdentityHash}`,
        `gift-certificate-offer:${offerSnapshotHash}`,
        `recipient-subject:${recipientSubjectHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-06.initiate-gift-certificate-purchase.shadow',
        key: checkoutIdentityHash,
      },
    };
    const preview = await this.actionEngine.preview(request);
    const conflictingCheckout = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: input.tenantId,
        actionClass: 'initiate_gift_certificate_purchase',
        targetRef: request.targetRef,
        identityFingerprint: { not: preview.identityFingerprint },
        state: {
          in: [
            ActionExecutionState.PENDING_APPROVAL,
            ActionExecutionState.READY,
            ActionExecutionState.EXECUTING,
            ActionExecutionState.UNKNOWN,
            ActionExecutionState.SUCCEEDED,
          ],
        },
      },
      select: { id: true },
    });
    if (conflictingCheckout) return this.noPlan('checkout_conflict', 1);

    const execution = await this.actionEngine.planShadow(request);
    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedCheckout: {
        actionClass: 'initiate_gift_certificate_purchase',
        canonicalPurchaserClientId: link.client.id,
        recipientSubjectHash,
        canonicalOfferId: offer.offerId,
        offerValueVersionId: offer.offerValueVersionId,
        offerCode: offer.templateKey,
        productCode: offer.productCode,
        denominationType: offer.denominationType,
        nominalAmountKopecks: offer.nominalAmountKopecks,
        currency: offer.currency,
        expiryDays: offer.expiryDays,
        expiryPolicyVersion: GIFT_CERTIFICATE_EXPIRY_POLICY_VERSION,
        offerSnapshotHash,
        checkoutIdentityHash,
        paymentProvider: 'yookassa',
        intendedProviderOperation: 'provider_checkout_create',
        expectedProviderState: 'PENDING',
        presentationContractVersion:
          GIFT_CERTIFICATE_PRESENTATION_CONTRACT_VERSION,
        presentationKeyPolicyVersion:
          GIFT_CERTIFICATE_PRESENTATION_KEY_POLICY_VERSION,
        claimLookupContractVersion:
          GIFT_CERTIFICATE_CLAIM_LOOKUP_CONTRACT_VERSION,
        policyProfile: GIFT_CERTIFICATE_PURCHASE_SHADOW_POLICY_PROFILE,
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
        providerDispatchPerformed: false,
        unknownApplicable: false,
        createsCertificate: false,
        issuesBearer: false,
      },
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      certificatesCreatedOrActivatedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      providerValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_GIFT_CERTIFICATE_PURCHASE_SHADOW_ENABLED || '')
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
    outcome: Exclude<GiftCertificatePurchaseShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): GiftCertificatePurchaseShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedCheckout: null,
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      certificatesCreatedOrActivatedByNewPath: 0,
      redemptionsCreatedByNewPath: 0,
      providerValueWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
