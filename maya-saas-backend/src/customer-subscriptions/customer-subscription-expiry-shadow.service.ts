import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionExpiryShadowDto } from './dto/customer-subscription-expiry-shadow.dto';

export type CustomerSubscriptionExpiryShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'subscription_not_expirable'
  | 'term_not_elapsed'
  | 'terminal_already_claimed'
  | 'lifecycle_evidence_incomplete';

export interface CustomerSubscriptionExpiryShadowResult {
  outcome: CustomerSubscriptionExpiryShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedExpiry: {
    model: 'CustomerSubscription';
    canonicalClientId: string;
    subscriptionId: string;
    termIdentityHash: string;
    termStartsAt: string;
    termEndsAt: string;
    expiryEligibleAt: string;
    expiryIdentityHash: string;
    currentLifecycleState: 'active';
    intendedStatus: 'expired';
    intendedEndedAt: string;
    policyProfile: typeof CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE;
    approvalRequirement: 'NONE';
    pendingRenewalBlocksExpiry: false;
    unknownApplicable: false;
    providerWritesRequired: false;
    mutatesImmutableTerm: false;
    createsRenewal: false;
    writesPerformed: false;
  } | null;
  subscriptionsExpiredByNewPath: 0;
  termMutationsByNewPath: 0;
  renewalsCreatedByNewPath: 0;
  paymentMutationsByNewPath: 0;
  providerWritesByNewPath: 0;
  usageMutationsByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class CustomerSubscriptionExpiryShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'customer_subscription_expiry_shadow_bridge_disabled',
      unauthorized: 'customer_subscription_expiry_shadow_unauthorized',
    });
  }

  async planExpiry(
    dto: CustomerSubscriptionExpiryShadowDto,
  ): Promise<CustomerSubscriptionExpiryShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_expiry_shadow_source_disabled',
        mismatch: 'customer_subscription_expiry_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_expiry_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const subscriptionId = dto.subscription_id.trim();
    if (!externalClientId || !subscriptionId) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        subscriptionId,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    externalClientId: string;
    subscriptionId: string;
  }): Promise<CustomerSubscriptionExpiryShadowResult> {
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
        planSnapshotHash: true,
        serviceScopeHash: true,
        status: true,
        activatedAt: true,
        termStartsAt: true,
        termEndsAt: true,
        endedAt: true,
        endExecutionId: true,
      },
    });
    if (!subscription || subscription.clientId !== link.client.id) {
      return this.noPlan('subscription_not_expirable', 1);
    }
    if (
      subscription.status !== 'active' ||
      subscription.endedAt !== null ||
      subscription.endExecutionId !== null
    ) {
      return this.noPlan('terminal_already_claimed', 0);
    }
    if (
      subscription.termEndsAt <= subscription.termStartsAt ||
      subscription.activatedAt > subscription.termStartsAt
    ) {
      return this.noPlan('lifecycle_evidence_incomplete', 1);
    }

    const trustedNow = new Date();
    if (trustedNow.getTime() <= subscription.termEndsAt.getTime()) {
      return this.noPlan('term_not_elapsed', 0);
    }

    const termStartsAt = subscription.termStartsAt.toISOString();
    const termEndsAt = subscription.termEndsAt.toISOString();
    const expiryEligibleAt = new Date(
      subscription.termEndsAt.getTime() + 1,
    ).toISOString();
    const expiryIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      termEndsAt,
    ]);
    const providerClientIdentityHash = this.hash([
      'p4-05.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const policySnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      termEndsAt,
      'strictly_after_immutable_term_end',
      'NONE',
    ]);
    const canonicalInput = {
      canonicalClientId: link.client.id,
      providerClientIdentityHash,
      subscriptionId: subscription.id,
      termIdentityHash: subscription.termIdentityHash,
      planSnapshotHash: subscription.planSnapshotHash,
      serviceScopeHash: subscription.serviceScopeHash,
      termStartsAt,
      termEndsAt,
      expiryEligibleAt,
      currentLifecycleState: 'active',
      serverTimeDecision: 'strictly_after_immutable_term_end',
      expiryIdentityHash,
      expiryContractVersion: CUSTOMER_SUBSCRIPTION_EXPIRY_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'eligible_term_elapsed',
      approvalRequirement: 'NONE',
      intendedStatus: 'expired',
      intendedEndedAt: termEndsAt,
      unknownApplicable: false,
      providerWritesRequired: false,
      mutatesImmutableTerm: false,
      createsRenewal: false,
      // A pending renewal checkout is payment intent, not successor value.
      pendingRenewalBlocksExpiry: false,
    };
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-05:subscription-expiry:${expiryIdentityHash}`,
        sourceRef: 'legacy-subscription:daily-expiry-job',
      },
      targetRef: `subscription:${subscription.id}`,
      input: canonicalInput,
      evidenceRefs: [
        `client:${link.client.id}`,
        `subscription:${subscription.id}`,
        `subscription-term:${subscription.termIdentityHash}`,
        `provider-client:${providerClientIdentityHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.expire-customer-subscription.shadow',
        key: expiryIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedExpiry: {
        model: 'CustomerSubscription',
        canonicalClientId: link.client.id,
        subscriptionId: subscription.id,
        termIdentityHash: subscription.termIdentityHash,
        termStartsAt,
        termEndsAt,
        expiryEligibleAt,
        expiryIdentityHash,
        currentLifecycleState: 'active',
        intendedStatus: 'expired',
        intendedEndedAt: termEndsAt,
        policyProfile: CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_POLICY_PROFILE,
        approvalRequirement: 'NONE',
        pendingRenewalBlocksExpiry: false,
        unknownApplicable: false,
        providerWritesRequired: false,
        mutatesImmutableTerm: false,
        createsRenewal: false,
        writesPerformed: false,
      },
      subscriptionsExpiredByNewPath: 0,
      termMutationsByNewPath: 0,
      renewalsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageMutationsByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_CUSTOMER_SUBSCRIPTION_EXPIRY_SHADOW_ENABLED || '')
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
    outcome: Exclude<CustomerSubscriptionExpiryShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): CustomerSubscriptionExpiryShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedExpiry: null,
      subscriptionsExpiredByNewPath: 0,
      termMutationsByNewPath: 0,
      renewalsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageMutationsByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
