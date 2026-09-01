import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_CLIENT_ROLES,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
  CUSTOMER_SUBSCRIPTION_CANCELLATION_STAFF_ROLES,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionCancellationShadowDto } from './dto/customer-subscription-cancellation-shadow.dto';

type CancellationRequesterAuthority =
  'subscription_client' | 'authorized_staff_role';
type CancellationReason =
  'customer_requested' | 'staff_confirmed_customer_request';

const TERMINAL_ACTION_CLASSES = [
  'expire_customer_subscription',
  'cancel_customer_subscription',
  'revoke_customer_subscription',
] as const;

export type CustomerSubscriptionCancellationShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'requester_unauthorized'
  | 'cancellation_intent_unresolved'
  | 'subscription_not_cancelable'
  | 'terminal_already_claimed'
  | 'terminal_transition_conflict'
  | 'lifecycle_evidence_incomplete';

export interface CustomerSubscriptionCancellationShadowResult {
  outcome: CustomerSubscriptionCancellationShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedCancellation: {
    model: 'CustomerSubscription';
    canonicalClientId: string;
    subscriptionId: string;
    termIdentityHash: string;
    termStartsAt: string;
    termEndsAt: string;
    cancellationIdentityHash: string;
    requesterAuthority: CancellationRequesterAuthority;
    cancellationReason: CancellationReason;
    effectiveMode: 'immediate_on_canonical_commit';
    currentLifecycleState: 'active';
    intendedStatus: 'canceled';
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED';
    providerBoundary: 'LOCAL_ONLY';
    unknownApplicable: false;
    paymentRefundIncluded: false;
    providerCancellationIncluded: false;
    oneTimeTerminalClaim: true;
    writesPerformed: false;
  } | null;
  subscriptionsCancelledByNewPath: 0;
  termMutationsByNewPath: 0;
  renewalsCreatedByNewPath: 0;
  paymentMutationsByNewPath: 0;
  providerWritesByNewPath: 0;
  usageMutationsByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class CustomerSubscriptionCancellationShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'customer_subscription_cancellation_shadow_bridge_disabled',
      unauthorized: 'customer_subscription_cancellation_shadow_unauthorized',
    });
  }

  async planCancellation(
    dto: CustomerSubscriptionCancellationShadowDto,
  ): Promise<CustomerSubscriptionCancellationShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider:
          'MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_cancellation_shadow_source_disabled',
        mismatch: 'customer_subscription_cancellation_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_cancellation_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const subscriptionId = dto.subscription_id.trim();
    const requesterProvider = dto.requester_identity_provider
      .trim()
      .toLowerCase();
    const externalRequesterId = dto.external_requester_id.trim();
    const cancellationIntentRef = dto.cancellation_intent_ref.trim();
    if (!externalClientId || !subscriptionId || !requesterProvider) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (!externalRequesterId) {
      return this.noPlan('requester_unauthorized', 1);
    }
    if (!cancellationIntentRef) {
      return this.noPlan('cancellation_intent_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        subscriptionId,
        requesterProvider,
        externalRequesterId,
        cancellationIntentRef,
        initiator: dto.initiator,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    externalClientId: string;
    subscriptionId: string;
    requesterProvider: string;
    externalRequesterId: string;
    cancellationIntentRef: string;
    initiator: CustomerSubscriptionCancellationShadowDto['initiator'];
  }): Promise<CustomerSubscriptionCancellationShadowResult> {
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

    const [link, requester, subscription] = await Promise.all([
      this.prisma.crmClientLink.findUnique({
        where: {
          tenantId_provider_externalId: {
            tenantId: input.tenantId,
            provider: input.provider,
            externalId: input.externalClientId,
          },
        },
        select: {
          client: {
            select: { id: true, userId: true, mergedIntoClientId: true },
          },
        },
      }),
      this.prisma.authIdentity.findUnique({
        where: {
          tenantId_provider_providerUserId: {
            tenantId: input.tenantId,
            provider: input.requesterProvider,
            providerUserId: input.externalRequesterId,
          },
        },
        select: {
          user: { select: { id: true, status: true } },
          membership: {
            select: { id: true, role: true, status: true, branchId: true },
          },
        },
      }),
      this.prisma.customerSubscription.findUnique({
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
      }),
    ]);

    if (!link || link.client.mergedIntoClientId !== null) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (
      !requester ||
      requester.user.status !== 'active' ||
      requester.membership.status !== 'active'
    ) {
      return this.noPlan('requester_unauthorized', 1);
    }
    if (!subscription || subscription.clientId !== link.client.id) {
      return this.noPlan('subscription_not_cancelable', 1);
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

    const requesterRole = String(requester.membership.role);
    const authority = this.requesterAuthority({
      initiator: input.initiator,
      requesterRole,
      requesterUserId: requester.user.id,
      subscriptionClientUserId: link.client.userId,
    });
    if (!authority) return this.noPlan('requester_unauthorized', 1);

    const cancellationReason: CancellationReason =
      authority === 'subscription_client'
        ? 'customer_requested'
        : 'staff_confirmed_customer_request';
    const providerClientIdentityHash = this.hash([
      'p4-05.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const requesterIdentityHash = this.hash([
      'p4-05.subscription-cancellation-requester.v1',
      input.tenantId,
      requester.user.id,
      requester.membership.id,
      requesterRole,
      authority,
    ]);
    const cancellationIntentIdentityHash = this.hash([
      'p4-05.subscription-cancellation-intent.v1',
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      requesterIdentityHash,
      input.cancellationIntentRef,
    ]);
    const cancellationIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      cancellationIntentIdentityHash,
      requesterIdentityHash,
      CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
    ]);
    const policySnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      subscription.id,
      requesterIdentityHash,
      authority,
      cancellationReason,
      'NONE_ACTOR_AUTHORIZED',
    ]);
    const canonicalInput = {
      canonicalClientId: link.client.id,
      providerClientIdentityHash,
      subscriptionId: subscription.id,
      termIdentityHash: subscription.termIdentityHash,
      planSnapshotHash: subscription.planSnapshotHash,
      serviceScopeHash: subscription.serviceScopeHash,
      currentLifecycleState: 'active',
      cancellationIntentIdentityHash,
      requesterIdentityHash,
      requesterRole,
      requesterAuthority: authority,
      cancellationReason,
      effectiveMode: 'immediate_on_canonical_commit',
      cancellationIdentityHash,
      cancellationContractVersion:
        CUSTOMER_SUBSCRIPTION_CANCELLATION_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'authorized_active_term',
      approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
      intendedStatus: 'canceled',
      providerBoundary: 'LOCAL_ONLY',
      paymentRefundIncluded: false,
      providerCancellationIncluded: false,
      unknownApplicable: false,
      mutatesImmutableTerm: false,
      createsRenewal: false,
      oneTimeTerminalClaim: true,
    };
    const request = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge' as const,
        occurrenceScope: `p4-05:subscription-cancellation:${cancellationIdentityHash}`,
        sourceRef: 'legacy-subscription:authorized-cancellation-request',
        actorUserId: requester.user.id,
      },
      targetRef: `subscription:${subscription.id}`,
      input: canonicalInput,
      evidenceRefs: [
        `client:${link.client.id}`,
        `subscription:${subscription.id}`,
        `subscription-term:${subscription.termIdentityHash}`,
        `provider-client:${providerClientIdentityHash}`,
        `requester:${requesterIdentityHash}`,
        `cancellation-intent:${cancellationIntentIdentityHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.cancel-customer-subscription.shadow',
        key: cancellationIdentityHash,
      },
    };
    const preview = await this.actionEngine.preview(request);
    const competingTerminal = await this.prisma.actionExecution.findFirst({
      where: {
        tenantId: input.tenantId,
        actionClass: { in: [...TERMINAL_ACTION_CLASSES] },
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
      select: { id: true, actionClass: true, state: true },
    });
    if (competingTerminal) {
      return this.noPlan('terminal_transition_conflict', 0);
    }

    const execution = await this.actionEngine.planShadow(request);
    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: 0,
      intendedCancellation: {
        model: 'CustomerSubscription',
        canonicalClientId: link.client.id,
        subscriptionId: subscription.id,
        termIdentityHash: subscription.termIdentityHash,
        termStartsAt: subscription.termStartsAt.toISOString(),
        termEndsAt: subscription.termEndsAt.toISOString(),
        cancellationIdentityHash,
        requesterAuthority: authority,
        cancellationReason,
        effectiveMode: 'immediate_on_canonical_commit',
        currentLifecycleState: 'active',
        intendedStatus: 'canceled',
        approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        paymentRefundIncluded: false,
        providerCancellationIncluded: false,
        oneTimeTerminalClaim: true,
        writesPerformed: false,
      },
      subscriptionsCancelledByNewPath: 0,
      termMutationsByNewPath: 0,
      renewalsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageMutationsByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private requesterAuthority(input: {
    initiator: CustomerSubscriptionCancellationShadowDto['initiator'];
    requesterRole: string;
    requesterUserId: string;
    subscriptionClientUserId: string | null;
  }): CancellationRequesterAuthority | null {
    if (
      (input.initiator === 'telegram_client_cancellation' ||
        input.initiator === 'pwa_client_cancellation') &&
      CUSTOMER_SUBSCRIPTION_CANCELLATION_CLIENT_ROLES.has(
        input.requesterRole,
      ) &&
      input.subscriptionClientUserId === input.requesterUserId
    ) {
      return 'subscription_client';
    }
    if (
      input.initiator === 'staff_cancellation' &&
      CUSTOMER_SUBSCRIPTION_CANCELLATION_STAFF_ROLES.has(input.requesterRole)
    ) {
      return 'authorized_staff_role';
    }
    return null;
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(
        process.env.MAYA_CUSTOMER_SUBSCRIPTION_CANCELLATION_SHADOW_ENABLED ||
          '',
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
    outcome: Exclude<CustomerSubscriptionCancellationShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): CustomerSubscriptionCancellationShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedCancellation: null,
      subscriptionsCancelledByNewPath: 0,
      termMutationsByNewPath: 0,
      renewalsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageMutationsByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
