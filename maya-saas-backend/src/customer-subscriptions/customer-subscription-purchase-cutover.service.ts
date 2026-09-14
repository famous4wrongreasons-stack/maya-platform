import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ActionExecutionState, Prisma } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
  P4_05_EXECUTABLE_CAPABILITIES,
} from '../action-engine';
import {
  P409CanonicalOfferAuthorityService,
  type P409CanonicalMembershipOffer,
} from '../business-content/p4-09-canonical-offer-authority.service';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionPurchaseCutoverDto } from './dto/customer-subscription-purchase-cutover.dto';
import {
  P405CustomerSubscriptionExecutableService,
  type P405ExecutionValue,
} from './p4-05-customer-subscription-executable.service';

const OPAQUE_INTENT = /^[A-Za-z0-9._:-]{8,180}$/;
const OFFER_TEMPLATE = /^(?:haircut|complex|beard)\.(?:senior|top)$/;

export interface CustomerSubscriptionPurchaseCutoverResult {
  outcome: 'checkout_ready';
  actionExecutionId: string;
  actionState: string;
  confirmation_url: string;
  canonicalClientId: string;
  canonicalOfferId: string;
  offerCode: string;
  plan: string;
  tier: string;
  amount: number;
  currency: 'RUB';
  providerState: string;
}

/**
 * B10: legacy HTTP is only an authenticated initiator. Client authority comes
 * from ClientChannelLink and value/provider execution remains P4-05-owned.
 */
@Injectable()
export class CustomerSubscriptionPurchaseCutoverService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientChannels: ClientChannelRuntimeService,
    private readonly canonicalOffers: P409CanonicalOfferAuthorityService,
    private readonly executor: P405CustomerSubscriptionExecutableService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'customer_subscription_purchase_cutover_bridge_disabled',
      unauthorized:
        'customer_subscription_purchase_cutover_bridge_unauthorized',
    });
  }

  async initiatePurchase(
    dto: CustomerSubscriptionPurchaseCutoverDto,
  ): Promise<CustomerSubscriptionPurchaseCutoverResult> {
    const source = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',
        externalCompanyId: 'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_purchase_cutover_source_disabled',
        mismatch: 'customer_subscription_purchase_cutover_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      source,
      'customer_subscription_purchase_cutover_tenant_not_found',
    );
    const purchaseIntentRef = dto.purchase_intent_ref.trim();
    const offerCode = dto.offer_code.trim().toLowerCase();
    if (!OPAQUE_INTENT.test(purchaseIntentRef)) {
      throw new BadRequestException('Stable purchase intent is required');
    }
    if (!OFFER_TEMPLATE.test(offerCode)) {
      throw new BadRequestException('Canonical subscription offer is required');
    }

    return this.tenantContext.runAsPublicTenant(tenant.tenantId, () =>
      this.executeInsideTenant({
        tenantId: tenant.tenantId,
        sourceProvider: source.provider,
        channelProof: dto.channel_proof,
        purchaseIntentRef,
        offerCode,
      }),
    );
  }

  private async executeInsideTenant(input: {
    tenantId: string;
    sourceProvider: string;
    channelProof: string;
    purchaseIntentRef: string;
    offerCode: string;
  }): Promise<CustomerSubscriptionPurchaseCutoverResult> {
    const identity = await this.prisma.$transaction(
      (tx) => this.clientChannels.resolve(input.channelProof, tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (identity.tenantId !== input.tenantId) {
      throw new ForbiddenException('Cross-tenant Client binding is forbidden');
    }

    let offer: P409CanonicalMembershipOffer;
    try {
      offer = await this.canonicalOffers.resolveMembershipOfferByTemplate(
        input.tenantId,
        input.offerCode,
      );
    } catch {
      throw new BadRequestException(
        'Canonical subscription offer is unavailable',
      );
    }

    const hashes = this.checkoutHashes({
      tenantId: input.tenantId,
      sourceProvider: input.sourceProvider,
      clientId: identity.clientId,
      resolutionEvidenceHash: identity.resolutionEvidenceHash,
      purchaseIntentRef: input.purchaseIntentRef,
      offer,
    });
    const request = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: P4_05_EXECUTABLE_CAPABILITIES.initiatePurchase,
      source: {
        type: 'legacy_bridge' as const,
        occurrenceScope: `p4-05:initiate-purchase:${hashes.checkoutIdentityHash}`,
        sourceRef: 'legacy-subscription:verified-client-purchase',
      },
      targetRef: `customer-subscription-purchase:${identity.clientId}`,
      input: {
        providerClientSource: `verified_channel:${input.sourceProvider}`,
        canonicalClientId: identity.clientId,
        providerClientIdentityHash: hashes.providerClientIdentityHash,
        checkoutMode: 'initial_purchase',
        purchaseIntentIdentityHash: hashes.purchaseIntentIdentityHash,
        checkoutIdentityHash: hashes.checkoutIdentityHash,
        canonicalOfferId: offer.offerId,
        offerValueVersionId: offer.offerValueVersionId,
        offerValueSnapshotHash: offer.valueSnapshotHash,
        offerCode: offer.templateKey,
        planCode: offer.planCode,
        tier: offer.tier,
        catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
        planSnapshotHash: hashes.planSnapshotHash,
        serviceScopeHash: hashes.serviceScopeHash,
        priceKopecks: offer.priceKopecks,
        currency: offer.currency,
        visitsIncluded: offer.visitsIncluded,
        termDays: offer.termDays,
        paymentProvider: 'yookassa',
        providerRequestIdentitySeedHash: hashes.providerRequestIdentitySeedHash,
        checkoutContractVersion:
          CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
        policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
        policySnapshotHash: hashes.policySnapshotHash,
        eligibilityDecision: 'eligible',
        approvalRequirement: 'NONE',
        expectedProviderState: 'PENDING',
        unknownApplicable: false,
        intendedProviderOperation: 'provider_checkout_create',
        activatesSubscription: false,
      },
      evidenceRefs: [
        identity.resolutionEvidenceRef,
        `verified-client-authority:${identity.resolutionEvidenceHash}`,
        `subscription-plan:${hashes.planSnapshotHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.initiate-customer-subscription-purchase.cutover',
        key: hashes.checkoutIdentityHash,
      },
    };

    const preview = await this.actionEngine.preview(request);
    const conflict = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: input.tenantId,
        actionClass: 'initiate_customer_subscription_purchase',
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
    if (conflict) {
      throw new ConflictException(
        'Another canonical checkout is already active',
      );
    }

    const receipt = await this.executor.execute(request);
    return this.result(receipt.value, receipt.execution.state);
  }

  private checkoutHashes(input: {
    tenantId: string;
    sourceProvider: string;
    clientId: string;
    resolutionEvidenceHash: string;
    purchaseIntentRef: string;
    offer: P409CanonicalMembershipOffer;
  }) {
    const serviceScopeHash = this.hash([
      'p4-05.subscription-service-scope.v1',
      input.tenantId,
      ...input.offer.serviceScopeRefs,
    ]);
    const planSnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
      input.tenantId,
      input.offer.offerId,
      input.offer.offerValueVersionId,
      input.offer.valueSnapshotHash,
      input.offer.templateKey,
      input.offer.planCode,
      input.offer.tier,
      String(input.offer.priceKopecks),
      input.offer.currency,
      String(input.offer.visitsIncluded),
      String(input.offer.termDays),
      serviceScopeHash,
    ]);
    const providerClientIdentityHash = this.hash([
      'p4-05.verified-channel-client.v1',
      input.tenantId,
      input.sourceProvider,
      input.clientId,
      input.resolutionEvidenceHash,
    ]);
    const purchaseIntentIdentityHash = this.hash([
      'p4-05.initial-purchase-intent.v1',
      input.tenantId,
      input.clientId,
      input.purchaseIntentRef,
    ]);
    const checkoutIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
      input.tenantId,
      input.clientId,
      purchaseIntentIdentityHash,
      planSnapshotHash,
      String(input.offer.priceKopecks),
      input.offer.currency,
      String(input.offer.visitsIncluded),
    ]);
    return {
      serviceScopeHash,
      planSnapshotHash,
      providerClientIdentityHash,
      purchaseIntentIdentityHash,
      checkoutIdentityHash,
      providerRequestIdentitySeedHash: this.hash([
        'p4-05.yookassa-request-seed.v1',
        input.tenantId,
        checkoutIdentityHash,
        'yookassa',
      ]),
      policySnapshotHash: this.hash([
        CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
        input.tenantId,
        input.clientId,
        planSnapshotHash,
        'eligible',
        'NONE',
      ]),
    };
  }

  private result(
    value: P405ExecutionValue,
    state: string,
  ): CustomerSubscriptionPurchaseCutoverResult {
    if (
      value.actionClass !== 'initiate_customer_subscription_purchase' ||
      !value.checkoutConfirmationUrl ||
      !value.canonicalClientId ||
      !value.canonicalOfferId ||
      !value.offerCode ||
      !value.planCode ||
      !value.tier ||
      !value.priceKopecks ||
      value.currency !== 'RUB' ||
      !value.providerState
    ) {
      throw new ConflictException('Canonical checkout is not ready');
    }
    return {
      outcome: 'checkout_ready',
      actionExecutionId: value.actionExecutionId,
      actionState: state,
      confirmation_url: value.checkoutConfirmationUrl,
      canonicalClientId: value.canonicalClientId,
      canonicalOfferId: value.canonicalOfferId,
      offerCode: value.offerCode,
      plan: value.planCode,
      tier: value.tier,
      amount: value.priceKopecks,
      currency: value.currency,
      providerState: value.providerState,
    };
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }
}
