import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
  CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS,
  CUSTOMER_SUBSCRIPTION_SERVICE_SCOPE_BY_EXACT_PROVIDER_NAME,
  CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
  type CustomerSubscriptionPurchaseOffer,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { CrmService } from '../crm/crm.service';
import { encodeCrmAppointmentKey } from '../domain';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionUsageShadowDto } from './dto/customer-subscription-usage-shadow.dto';

export type CustomerSubscriptionUsageShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'subscription_not_usable'
  | 'provider_evidence_unavailable'
  | 'usage_not_eligible'
  | 'entitlement_exhausted'
  | 'usage_already_claimed';

export interface CustomerSubscriptionUsageShadowResult {
  outcome: CustomerSubscriptionUsageShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedUsageClaim: {
    model: 'CustomerSubscriptionUsage';
    canonicalClientId: string;
    subscriptionId: string;
    termIdentityHash: string;
    providerVisitIdentityHash: string;
    providerObservationSnapshotHash: string;
    providerServiceIdentityHash: string;
    providerServiceScopeRef: string;
    usageIdentityHash: string;
    units: 1;
    remainingUnitsBefore: number;
    remainingUnitsAfter: number;
    usedAt: string;
    policyProfile: typeof CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE;
    approvalRequirement: 'NONE';
    unknownApplicable: false;
    providerWritesRequired: false;
    writesPerformed: false;
  } | null;
  usageClaimsCreatedByNewPath: 0;
  subscriptionEntitlementMutationsByNewPath: 0;
  paymentMutationsByNewPath: 0;
  providerWritesByNewPath: 0;
  messagesSentByNewPath: 0;
}

type SubscriptionTerm = {
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
};

@Injectable()
export class CustomerSubscriptionUsageShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
    private readonly crm: CrmService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'customer_subscription_usage_shadow_bridge_disabled',
      unauthorized: 'customer_subscription_usage_shadow_unauthorized',
    });
  }

  async planUsage(
    dto: CustomerSubscriptionUsageShadowDto,
  ): Promise<CustomerSubscriptionUsageShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_usage_shadow_source_disabled',
        mismatch: 'customer_subscription_usage_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_usage_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const subscriptionId = dto.subscription_id.trim();
    const visitRecordId = dto.visit_record_id.trim();
    if (!externalClientId || !subscriptionId || !visitRecordId) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        subscriptionId,
        visitRecordId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    externalClientId: string;
    subscriptionId: string;
    visitRecordId: string;
  }): Promise<CustomerSubscriptionUsageShadowResult> {
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

    const subscription = await this.prisma.customerSubscription.findUnique({
      where: {
        id_tenantId: {
          id: input.subscriptionId,
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
      },
    });
    if (
      !subscription ||
      subscription.clientId !== link.client.id ||
      subscription.status !== 'active'
    ) {
      return this.noPlan('subscription_not_usable', 1);
    }

    const offer = this.resolveFrozenOffer(input.tenantId, subscription);
    if (!offer) return this.noPlan('subscription_not_usable', 1);

    let visit: Awaited<ReturnType<CrmService['getAppointmentDetailForSystem']>>;
    try {
      visit = await this.crm.getAppointmentDetailForSystem(
        input.tenantId,
        input.visitRecordId,
      );
    } catch {
      return this.noPlan('provider_evidence_unavailable', 0);
    }
    if (
      visit.id !== encodeCrmAppointmentKey(input.visitRecordId) ||
      visit.client.id !== input.externalClientId ||
      visit.attendance !== 'arrived'
    ) {
      return this.noPlan('provider_evidence_unavailable', 1);
    }

    const visitOccurredAt = new Date(visit.start_at);
    if (
      Number.isNaN(visitOccurredAt.getTime()) ||
      visitOccurredAt < subscription.termStartsAt ||
      visitOccurredAt > subscription.termEndsAt
    ) {
      return this.noPlan('subscription_not_usable', 1);
    }

    const eligibleService = visit.services.find((service) => {
      const scopeRef = this.serviceScopeRef(service.name);
      return scopeRef ? offer.serviceScopeRefs.includes(scopeRef) : false;
    });
    const providerServiceScopeRef = eligibleService
      ? this.serviceScopeRef(eligibleService.name)
      : null;
    if (
      !eligibleService ||
      !providerServiceScopeRef ||
      !this.tierAllowsProvider(offer.tier, visit.provider.title ?? '')
    ) {
      return this.noPlan('usage_not_eligible', 0);
    }

    const providerVisitRecordRefHash = this.hash([
      'p4-05.provider-visit-record-ref.v1',
      input.tenantId,
      input.provider,
      input.visitRecordId,
    ]);
    const providerVisitIdentityHash = this.hash([
      'p4-05.provider-attended-visit.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      providerVisitRecordRefHash,
      visit.start_at,
    ]);
    const providerServiceIdentityHash = this.hash([
      'p4-05.provider-service.v1',
      input.tenantId,
      input.provider,
      eligibleService.id,
      providerServiceScopeRef,
    ]);
    const usageIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
      input.tenantId,
      subscription.id,
      input.provider,
      providerVisitIdentityHash,
    ]);

    const claimed = await this.prisma.customerSubscriptionUsage.findUnique({
      where: {
        subscriptionId_tenantId_usageIdentityHash: {
          subscriptionId: subscription.id,
          tenantId: input.tenantId,
          usageIdentityHash,
        },
      },
      select: { id: true },
    });
    if (claimed) return this.noPlan('usage_already_claimed', 0);

    const usage = await this.prisma.customerSubscriptionUsage.aggregate({
      where: {
        subscriptionId: subscription.id,
        tenantId: input.tenantId,
      },
      _sum: { units: true },
    });
    const usedUnits = usage._sum.units ?? 0;
    const remainingUnitsBefore = subscription.visitsIncluded - usedUnits;
    if (remainingUnitsBefore < 1) {
      return this.noPlan('entitlement_exhausted', 0);
    }
    const remainingUnitsAfter = remainingUnitsBefore - 1;

    const sortedServiceEvidence = visit.services
      .map((service) => `${service.id}:${service.name.trim().toLowerCase()}`)
      .sort();
    const providerObservationSnapshotHash = this.hash([
      'p4-05.subscription-usage-observation.v1',
      input.tenantId,
      input.provider,
      providerVisitIdentityHash,
      visit.attendance,
      visit.status,
      visit.start_at,
      ...sortedServiceEvidence,
    ]);
    const providerClientIdentityHash = this.hash([
      'p4-05.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const policySnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      subscription.planSnapshotHash,
      providerObservationSnapshotHash,
      String(remainingUnitsBefore),
      'eligible_exact_attended_visit',
    ]);
    const canonicalInput = {
      canonicalClientId: link.client.id,
      providerClientIdentityHash,
      subscriptionId: subscription.id,
      termIdentityHash: subscription.termIdentityHash,
      offerCode: offer.offerCode,
      planCode: offer.planCode,
      tier: offer.tier,
      catalogVersion: CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
      planSnapshotHash: subscription.planSnapshotHash,
      serviceScopeHash: subscription.serviceScopeHash,
      visitsIncluded: subscription.visitsIncluded,
      termStartsAt: subscription.termStartsAt.toISOString(),
      termEndsAt: subscription.termEndsAt.toISOString(),
      provider: input.provider,
      providerVisitRecordRefHash,
      providerVisitIdentityHash,
      providerObservationSnapshotHash,
      providerServiceIdentityHash,
      providerServiceScopeRef,
      visitOccurredAt: visitOccurredAt.toISOString(),
      visitAttendance: 'arrived',
      units: 1,
      usageIdentityHash,
      usageContractVersion: CUSTOMER_SUBSCRIPTION_USAGE_CONTRACT_VERSION,
      remainingUnitsBefore,
      remainingUnitsAfter,
      policyProfile: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible_exact_attended_visit',
      approvalRequirement: 'NONE',
      unknownApplicable: false,
      providerWritesRequired: false,
    };
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-05:subscription-usage:${usageIdentityHash}`,
        sourceRef: 'legacy-subscription:sync-customer-subscription-usage',
      },
      targetRef: `subscription-usage:${usageIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `client:${link.client.id}`,
        `subscription:${subscription.id}`,
        `provider-client:${providerClientIdentityHash}`,
        `provider-visit:${providerVisitIdentityHash}`,
        `provider-service:${providerServiceIdentityHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.sync-customer-subscription-usage.shadow',
        key: usageIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedUsageClaim: {
        model: 'CustomerSubscriptionUsage',
        canonicalClientId: link.client.id,
        subscriptionId: subscription.id,
        termIdentityHash: subscription.termIdentityHash,
        providerVisitIdentityHash,
        providerObservationSnapshotHash,
        providerServiceIdentityHash,
        providerServiceScopeRef,
        usageIdentityHash,
        units: 1,
        remainingUnitsBefore,
        remainingUnitsAfter,
        usedAt: visitOccurredAt.toISOString(),
        policyProfile: CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_POLICY_PROFILE,
        approvalRequirement: 'NONE',
        unknownApplicable: false,
        providerWritesRequired: false,
        writesPerformed: false,
      },
      usageClaimsCreatedByNewPath: 0,
      subscriptionEntitlementMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private resolveFrozenOffer(
    tenantId: string,
    subscription: SubscriptionTerm,
  ): CustomerSubscriptionPurchaseOffer | null {
    const matches = Object.values(CUSTOMER_SUBSCRIPTION_PURCHASE_OFFERS).filter(
      (offer) => {
        const serviceScopeHash = this.hash([
          'p4-05.subscription-service-scope.v1',
          tenantId,
          ...offer.serviceScopeRefs,
        ]);
        const planSnapshotHash = this.hash([
          CUSTOMER_SUBSCRIPTION_PURCHASE_CATALOG_VERSION,
          tenantId,
          offer.offerCode,
          offer.planCode,
          offer.tier,
          String(offer.priceKopecks),
          offer.currency,
          String(offer.visitsIncluded),
          String(offer.termDays),
          serviceScopeHash,
        ]);
        return (
          subscription.planCode === offer.planCode &&
          subscription.priceKopecks === offer.priceKopecks &&
          subscription.currency === offer.currency &&
          subscription.visitsIncluded === offer.visitsIncluded &&
          subscription.serviceScopeHash === serviceScopeHash &&
          subscription.planSnapshotHash === planSnapshotHash
        );
      },
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  private serviceScopeRef(serviceName: string): string | null {
    const normalized = serviceName.trim().toLowerCase();
    return (
      CUSTOMER_SUBSCRIPTION_SERVICE_SCOPE_BY_EXACT_PROVIDER_NAME[
        normalized as keyof typeof CUSTOMER_SUBSCRIPTION_SERVICE_SCOPE_BY_EXACT_PROVIDER_NAME
      ] ?? null
    );
  }

  private tierAllowsProvider(
    subscriptionTier: CustomerSubscriptionPurchaseOffer['tier'],
    providerTitle: string,
  ): boolean {
    const title = providerTitle.trim().toLowerCase();
    const isSenior = title.includes('старший');
    const isTop = title.includes('топ') || title.includes('руководитель');
    if (!isSenior && !isTop) return false;
    return subscriptionTier === 'top' || isSenior;
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_CUSTOMER_SUBSCRIPTION_USAGE_SHADOW_ENABLED || '')
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
    outcome: Exclude<CustomerSubscriptionUsageShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): CustomerSubscriptionUsageShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedUsageClaim: null,
      usageClaimsCreatedByNewPath: 0,
      subscriptionEntitlementMutationsByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
