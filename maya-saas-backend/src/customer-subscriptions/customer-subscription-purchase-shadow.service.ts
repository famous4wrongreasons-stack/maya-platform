import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
} from '../action-engine';
import {
  P409CanonicalOfferAuthorityService,
  type P409CanonicalMembershipOffer,
} from '../business-content/p4-09-canonical-offer-authority.service';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionPurchaseShadowDto } from './dto/customer-subscription-purchase-shadow.dto';

export type CustomerSubscriptionPurchaseShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'invalid_plan'
  | 'active_subscription_conflict'
  | 'checkout_conflict';

export interface CustomerSubscriptionPurchaseShadowResult {
  outcome: CustomerSubscriptionPurchaseShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedCheckout: {
    actionClass: 'initiate_customer_subscription_purchase';
    checkoutMode: 'initial_purchase';
    canonicalClientId: string;
    canonicalOfferId: string;
    offerValueVersionId: string;
    offerCode: string;
    planCode: string;
    tier: string;
    priceKopecks: number;
    currency: 'RUB';
    visitsIncluded: number;
    termDays: number;
    planSnapshotHash: string;
    serviceScopeHash: string;
    checkoutIdentityHash: string;
    paymentProvider: 'yookassa';
    intendedProviderOperation: 'provider_checkout_create';
    expectedProviderState: 'PENDING';
    policyProfile: typeof CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE;
    eligibility: 'eligible';
    approvalRequirement: 'NONE';
    providerDispatchPerformed: false;
    unknownApplicable: false;
    activatesSubscription: false;
  } | null;
  providerCheckoutsCreatedByNewPath: 0;
  paymentMutationsByNewPath: 0;
  subscriptionsCreatedOrActivatedByNewPath: 0;
  providerWritesByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class CustomerSubscriptionPurchaseShadowService {
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
      disabled: 'customer_subscription_purchase_shadow_bridge_disabled',
      unauthorized: 'customer_subscription_purchase_shadow_bridge_unauthorized',
    });
  }

  async planPurchase(
    dto: CustomerSubscriptionPurchaseShadowDto,
  ): Promise<CustomerSubscriptionPurchaseShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_purchase_shadow_source_disabled',
        mismatch: 'customer_subscription_purchase_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_purchase_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const purchaseIntentRef = dto.purchase_intent_ref.trim();
    const offerId = dto.offer_code.trim();
    if (!externalClientId || !purchaseIntentRef) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (!offerId) return this.noPlan('invalid_plan', 1);

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        purchaseIntentRef,
        offerId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    externalClientId: string;
    purchaseIntentRef: string;
    offerId: string;
  }): Promise<CustomerSubscriptionPurchaseShadowResult> {
    let offer: P409CanonicalMembershipOffer;
    try {
      offer = await this.canonicalOffers.resolveMembershipOffer(
        input.tenantId,
        input.offerId,
      );
    } catch {
      return this.noPlan('invalid_plan', 1);
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
        client: { select: { id: true, mergedIntoClientId: true } },
      },
    });
    if (!link || link.client.mergedIntoClientId !== null) {
      return this.noPlan('identity_unresolved', 1);
    }

    const activeSubscription = await this.prisma.customerSubscription.findFirst(
      {
        where: {
          tenantId: input.tenantId,
          clientId: link.client.id,
          status: 'active',
        },
        select: { id: true },
      },
    );
    if (activeSubscription) {
      return this.noPlan('active_subscription_conflict', 1);
    }

    const providerClientIdentityHash = this.hash([
      'p4-05.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const purchaseIntentIdentityHash = this.hash([
      'p4-05.initial-purchase-intent.v1',
      input.tenantId,
      link.client.id,
      input.purchaseIntentRef,
    ]);
    const serviceScopeHash = this.hash([
      'p4-05.subscription-service-scope.v1',
      input.tenantId,
      ...offer.serviceScopeRefs,
    ]);
    const planSnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
      input.tenantId,
      offer.offerId,
      offer.offerValueVersionId,
      offer.valueSnapshotHash,
      offer.templateKey,
      offer.planCode,
      offer.tier,
      String(offer.priceKopecks),
      offer.currency,
      String(offer.visitsIncluded),
      String(offer.termDays),
      serviceScopeHash,
    ]);
    const checkoutIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
      input.tenantId,
      link.client.id,
      purchaseIntentIdentityHash,
      planSnapshotHash,
      String(offer.priceKopecks),
      offer.currency,
      String(offer.visitsIncluded),
    ]);
    const providerRequestIdentitySeedHash = this.hash([
      'p4-05.yookassa-request-seed.v1',
      input.tenantId,
      checkoutIdentityHash,
      'yookassa',
    ]);
    const policySnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      link.client.id,
      planSnapshotHash,
      'eligible',
      'NONE',
    ]);
    const canonicalInput = {
      providerClientSource: input.provider,
      canonicalClientId: link.client.id,
      providerClientIdentityHash,
      checkoutMode: 'initial_purchase',
      purchaseIntentIdentityHash,
      checkoutIdentityHash,
      canonicalOfferId: offer.offerId,
      offerValueVersionId: offer.offerValueVersionId,
      offerValueSnapshotHash: offer.valueSnapshotHash,
      offerCode: offer.templateKey,
      planCode: offer.planCode,
      tier: offer.tier,
      catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
      planSnapshotHash,
      serviceScopeHash,
      priceKopecks: offer.priceKopecks,
      currency: offer.currency,
      visitsIncluded: offer.visitsIncluded,
      termDays: offer.termDays,
      paymentProvider: 'yookassa',
      providerRequestIdentitySeedHash,
      checkoutContractVersion: CUSTOMER_SUBSCRIPTION_CHECKOUT_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible',
      approvalRequirement: 'NONE',
      expectedProviderState: 'PENDING',
      unknownApplicable: false,
      intendedProviderOperation: 'provider_checkout_create',
      activatesSubscription: false,
    };
    const request = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge' as const,
        occurrenceScope: `p4-05:initiate-purchase:${checkoutIdentityHash}`,
        sourceRef: 'legacy-subscription:initiate-customer-purchase',
      },
      targetRef: `customer-subscription-purchase:${link.client.id}`,
      input: canonicalInput,
      evidenceRefs: [
        `provider-client:${providerClientIdentityHash}`,
        `subscription-plan:${planSnapshotHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.initiate-customer-subscription-purchase.shadow',
        key: checkoutIdentityHash,
      },
    };
    const preview = await this.actionEngine.preview(request);
    const conflictingCheckout = await this.prisma.actionExecution.findFirst({
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
    if (conflictingCheckout) return this.noPlan('checkout_conflict', 1);

    const execution = await this.actionEngine.planShadow(request);
    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedCheckout: {
        actionClass: 'initiate_customer_subscription_purchase',
        checkoutMode: 'initial_purchase',
        canonicalClientId: link.client.id,
        canonicalOfferId: offer.offerId,
        offerValueVersionId: offer.offerValueVersionId,
        offerCode: offer.templateKey,
        planCode: offer.planCode,
        tier: offer.tier,
        priceKopecks: offer.priceKopecks,
        currency: offer.currency,
        visitsIncluded: offer.visitsIncluded,
        termDays: offer.termDays,
        planSnapshotHash,
        serviceScopeHash,
        checkoutIdentityHash,
        paymentProvider: 'yookassa',
        intendedProviderOperation: 'provider_checkout_create',
        expectedProviderState: 'PENDING',
        policyProfile: CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_POLICY_PROFILE,
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
        providerDispatchPerformed: false,
        unknownApplicable: false,
        activatesSubscription: false,
      },
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      subscriptionsCreatedOrActivatedByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(
        process.env.MAYA_CUSTOMER_SUBSCRIPTION_PURCHASE_SHADOW_ENABLED || '',
      )
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
    outcome: Exclude<CustomerSubscriptionPurchaseShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): CustomerSubscriptionPurchaseShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedCheckout: null,
      providerCheckoutsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      subscriptionsCreatedOrActivatedByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
