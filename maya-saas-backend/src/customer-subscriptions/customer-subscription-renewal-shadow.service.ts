import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS,
  CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
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
import type { CustomerSubscriptionRenewalShadowDto } from './dto/customer-subscription-renewal-shadow.dto';

const DAY_MS = 86_400_000;

type RenewalPredecessor = {
  id: string;
  clientId: string;
  termIdentityHash: string;
  planCode: string;
  planSnapshotHash: string;
  serviceScopeHash: string;
  priceKopecks: number;
  currency: string;
  visitsIncluded: number;
  status: string;
  termStartsAt: Date;
  termEndsAt: Date;
  activationExecution: { safeResultSummaryJson: unknown } | null;
};

export type CustomerSubscriptionRenewalShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'subscription_not_found'
  | 'subscription_client_mismatch'
  | 'terminal_subscription'
  | 'renewal_window_closed'
  | 'invalid_plan'
  | 'successor_exists'
  | 'checkout_conflict';

export interface CustomerSubscriptionRenewalShadowResult {
  outcome: CustomerSubscriptionRenewalShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedRenewalCheckout: {
    actionClass: 'initiate_customer_subscription_renewal';
    checkoutMode: 'renewal';
    canonicalClientId: string;
    predecessorSubscriptionId: string;
    predecessorTermIdentityHash: string;
    predecessorTermStartsAt: string;
    predecessorTermEndsAt: string;
    renewalWindowOpensAt: string;
    canonicalOfferId: string;
    offerValueVersionId: string;
    offerCode: string;
    planCode: string;
    tier: string;
    priceKopecks: number;
    currency: 'RUB';
    visitsIncluded: number;
    termDays: number;
    nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at';
    minimumNextTermStartsAt: string;
    checkoutIdentityHash: string;
    paymentProvider: 'yookassa';
    intendedProviderOperation: 'provider_checkout_create';
    expectedProviderState: 'PENDING';
    policyProfile: typeof CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE;
    eligibility: 'eligible';
    approvalRequirement: 'NONE';
    providerDispatchPerformed: false;
    unknownApplicable: false;
    activatesSubscription: false;
    mutatesPredecessor: false;
  } | null;
  renewalCheckoutsCreatedByNewPath: 0;
  subscriptionTermMutationsByNewPath: 0;
  paymentMutationsByNewPath: 0;
  providerWritesByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class CustomerSubscriptionRenewalShadowService {
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
      disabled: 'customer_subscription_renewal_shadow_bridge_disabled',
      unauthorized: 'customer_subscription_renewal_shadow_bridge_unauthorized',
    });
  }

  async planRenewal(
    dto: CustomerSubscriptionRenewalShadowDto,
  ): Promise<CustomerSubscriptionRenewalShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_renewal_shadow_source_disabled',
        mismatch: 'customer_subscription_renewal_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_renewal_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const predecessorSubscriptionId = dto.subscription_id.trim();
    const renewalIntentRef = dto.renewal_intent_ref.trim();
    if (!externalClientId || !predecessorSubscriptionId || !renewalIntentRef) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        predecessorSubscriptionId,
        renewalIntentRef,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    externalClientId: string;
    predecessorSubscriptionId: string;
    renewalIntentRef: string;
  }): Promise<CustomerSubscriptionRenewalShadowResult> {
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
      select: { client: { select: { id: true, mergedIntoClientId: true } } },
    });
    if (!link || link.client.mergedIntoClientId !== null) {
      return this.noPlan('identity_unresolved', 1);
    }

    const predecessor = await this.prisma.customerSubscription.findUnique({
      where: {
        id_tenantId: {
          id: input.predecessorSubscriptionId,
          tenantId: input.tenantId,
        },
      },
      select: {
        id: true,
        clientId: true,
        termIdentityHash: true,
        planCode: true,
        planSnapshotHash: true,
        serviceScopeHash: true,
        priceKopecks: true,
        currency: true,
        visitsIncluded: true,
        status: true,
        termStartsAt: true,
        termEndsAt: true,
        activationExecution: { select: { safeResultSummaryJson: true } },
      },
    });
    if (!predecessor) return this.noPlan('subscription_not_found', 1);
    if (predecessor.clientId !== link.client.id) {
      return this.noPlan('subscription_client_mismatch', 1);
    }
    if (predecessor.status !== 'active') {
      return this.noPlan('terminal_subscription', 1);
    }

    const now = this.currentTime().getTime();
    const renewalWindowOpensAt = new Date(
      predecessor.termEndsAt.getTime() -
        CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_DAYS * DAY_MS,
    );
    if (
      now < renewalWindowOpensAt.getTime() ||
      now > predecessor.termEndsAt.getTime()
    ) {
      return this.noPlan('renewal_window_closed', 1);
    }

    const predecessorTemplateKey = this.predecessorTemplateKey(predecessor);
    if (!predecessorTemplateKey) return this.noPlan('invalid_plan', 1);
    let offer: P409CanonicalMembershipOffer;
    try {
      offer = await this.canonicalOffers.resolveMembershipOfferByTemplate(
        input.tenantId,
        predecessorTemplateKey,
      );
    } catch {
      return this.noPlan('invalid_plan', 1);
    }

    const successor = await this.prisma.customerSubscription.findFirst({
      where: {
        tenantId: input.tenantId,
        previousSubscriptionId: predecessor.id,
      },
      select: { id: true },
    });
    if (successor) return this.noPlan('successor_exists', 1);

    const providerClientIdentityHash = this.hash([
      'p4-05.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const renewalIntentIdentityHash = this.hash([
      'p4-05.renewal-intent.v1',
      input.tenantId,
      link.client.id,
      predecessor.id,
      predecessor.termIdentityHash,
      input.renewalIntentRef,
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
      CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
      input.tenantId,
      link.client.id,
      predecessor.id,
      predecessor.termIdentityHash,
      renewalIntentIdentityHash,
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
      CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
      CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
      input.tenantId,
      link.client.id,
      predecessor.id,
      predecessor.termIdentityHash,
      planSnapshotHash,
      'eligible',
      'NONE',
    ]);
    const predecessorTermStartsAt = predecessor.termStartsAt.toISOString();
    const predecessorTermEndsAt = predecessor.termEndsAt.toISOString();
    const canonicalInput = {
      providerClientSource: input.provider,
      canonicalClientId: link.client.id,
      providerClientIdentityHash,
      checkoutMode: 'renewal',
      predecessorSubscriptionId: predecessor.id,
      predecessorTermIdentityHash: predecessor.termIdentityHash,
      predecessorStatus: 'active',
      predecessorTermStartsAt,
      predecessorTermEndsAt,
      renewalWindowPolicy: CUSTOMER_SUBSCRIPTION_RENEWAL_WINDOW_POLICY,
      renewalWindowOpensAt: renewalWindowOpensAt.toISOString(),
      renewalIntentIdentityHash,
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
      nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
      minimumNextTermStartsAt: predecessorTermEndsAt,
      paymentProvider: 'yookassa',
      providerRequestIdentitySeedHash,
      checkoutContractVersion:
        CUSTOMER_SUBSCRIPTION_RENEWAL_CHECKOUT_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible',
      approvalRequirement: 'NONE',
      expectedProviderState: 'PENDING',
      unknownApplicable: false,
      intendedProviderOperation: 'provider_checkout_create',
      activatesSubscription: false,
      mutatesPredecessor: false,
    };
    const request = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge' as const,
        occurrenceScope: `p4-05:initiate-renewal:${checkoutIdentityHash}`,
        sourceRef: 'legacy-subscription:initiate-customer-renewal',
      },
      targetRef: `customer-subscription-renewal:${predecessor.id}`,
      input: canonicalInput,
      evidenceRefs: [
        `provider-client:${providerClientIdentityHash}`,
        `subscription-term:${predecessor.termIdentityHash}`,
        `subscription-plan:${predecessor.planSnapshotHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.initiate-customer-subscription-renewal.shadow',
        key: checkoutIdentityHash,
      },
    };
    const preview = await this.actionEngine.preview(request);
    const conflictingCheckout = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: input.tenantId,
        actionClass: 'initiate_customer_subscription_renewal',
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
      intendedRenewalCheckout: {
        actionClass: 'initiate_customer_subscription_renewal',
        checkoutMode: 'renewal',
        canonicalClientId: link.client.id,
        predecessorSubscriptionId: predecessor.id,
        predecessorTermIdentityHash: predecessor.termIdentityHash,
        predecessorTermStartsAt,
        predecessorTermEndsAt,
        renewalWindowOpensAt: renewalWindowOpensAt.toISOString(),
        canonicalOfferId: offer.offerId,
        offerValueVersionId: offer.offerValueVersionId,
        offerCode: offer.templateKey,
        planCode: offer.planCode,
        tier: offer.tier,
        priceKopecks: offer.priceKopecks,
        currency: offer.currency,
        visitsIncluded: offer.visitsIncluded,
        termDays: offer.termDays,
        nextTermStartRule: 'later_of_predecessor_end_or_payment_succeeded_at',
        minimumNextTermStartsAt: predecessorTermEndsAt,
        checkoutIdentityHash,
        paymentProvider: 'yookassa',
        intendedProviderOperation: 'provider_checkout_create',
        expectedProviderState: 'PENDING',
        policyProfile: CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_POLICY_PROFILE,
        eligibility: 'eligible',
        approvalRequirement: 'NONE',
        providerDispatchPerformed: false,
        unknownApplicable: false,
        activatesSubscription: false,
        mutatesPredecessor: false,
      },
      renewalCheckoutsCreatedByNewPath: 0,
      subscriptionTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private predecessorTemplateKey(
    predecessor: RenewalPredecessor,
  ): string | null {
    const value = predecessor.activationExecution?.safeResultSummaryJson;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const facts = value as Record<string, unknown>;
    return typeof facts.offerCode === 'string' && facts.offerCode.trim()
      ? facts.offerCode
      : null;
  }

  private currentTime(): Date {
    return new Date();
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(
        process.env.MAYA_CUSTOMER_SUBSCRIPTION_RENEWAL_SHADOW_ENABLED || '',
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
    outcome: Exclude<CustomerSubscriptionRenewalShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): CustomerSubscriptionRenewalShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedRenewalCheckout: null,
      renewalCheckoutsCreatedByNewPath: 0,
      subscriptionTermMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
