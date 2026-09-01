import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
  CUSTOMER_SUBSCRIPTION_REVOCATION_REQUESTER_ROLES,
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_CAPABILITY,
  CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { CustomerSubscriptionRevocationShadowDto } from './dto/customer-subscription-revocation-shadow.dto';

const OWNER_ROLES = new Set(['tenant_owner', 'business_owner']);
const ADMIN_ROLES = new Set(['tenant_admin', 'administrator']);
const TERMINAL_ACTION_CLASSES = [
  'expire_customer_subscription',
  'cancel_customer_subscription',
  'revoke_customer_subscription',
] as const;

export type CustomerSubscriptionRevocationShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'requester_unauthorized'
  | 'revocation_evidence_unresolved'
  | 'subscription_not_revocable'
  | 'terminal_already_claimed'
  | 'terminal_transition_conflict'
  | 'lifecycle_evidence_incomplete';

export interface CustomerSubscriptionRevocationShadowResult {
  outcome: CustomerSubscriptionRevocationShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedRevocation: {
    model: 'CustomerSubscription';
    canonicalClientId: string;
    subscriptionId: string;
    termIdentityHash: string;
    termStartsAt: string;
    termEndsAt: string;
    revocationIdentityHash: string;
    revocationEvidenceIdentityHash: string;
    requesterRole: string;
    requesterAuthority: 'tenant_owner_or_admin';
    revocationReason: 'approved_policy_revocation';
    effectiveMode: 'immediate_on_canonical_commit';
    currentLifecycleState: 'active';
    intendedStatus: 'revoked';
    approvalRequirement: 'OWNER_APPROVAL_REQUIRED';
    approvalScopeHash: string;
    approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL';
    providerBoundary: 'LOCAL_ONLY';
    unknownApplicable: false;
    paymentRefundIncluded: false;
    providerCancellationIncluded: false;
    oneTimeTerminalClaim: true;
    writesPerformed: false;
  } | null;
  subscriptionsRevokedByNewPath: 0;
  termMutationsByNewPath: 0;
  renewalsCreatedByNewPath: 0;
  paymentMutationsByNewPath: 0;
  providerWritesByNewPath: 0;
  usageMutationsByNewPath: 0;
  messagesSentByNewPath: 0;
}

@Injectable()
export class CustomerSubscriptionRevocationShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'customer_subscription_revocation_shadow_bridge_disabled',
      unauthorized: 'customer_subscription_revocation_shadow_unauthorized',
    });
  }

  async planRevocation(
    dto: CustomerSubscriptionRevocationShadowDto,
  ): Promise<CustomerSubscriptionRevocationShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider:
          'MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'customer_subscription_revocation_shadow_source_disabled',
        mismatch: 'customer_subscription_revocation_shadow_source_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'customer_subscription_revocation_shadow_tenant_not_found',
    );
    const externalClientId = dto.external_client_id.trim();
    const subscriptionId = dto.subscription_id.trim();
    const requesterProvider = dto.requester_identity_provider
      .trim()
      .toLowerCase();
    const externalRequesterId = dto.external_requester_id.trim();
    const revocationDecisionRef = dto.revocation_decision_ref.trim();
    const revocationEvidenceRef = dto.revocation_evidence_ref.trim();
    if (!externalClientId || !subscriptionId || !requesterProvider) {
      return this.noPlan('identity_unresolved', 1);
    }
    if (!externalRequesterId) {
      return this.noPlan('requester_unauthorized', 1);
    }
    if (!revocationDecisionRef || !revocationEvidenceRef) {
      return this.noPlan('revocation_evidence_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        externalClientId,
        subscriptionId,
        requesterProvider,
        externalRequesterId,
        revocationDecisionRef,
        revocationEvidenceRef,
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
    revocationDecisionRef: string;
    revocationEvidenceRef: string;
    initiator: CustomerSubscriptionRevocationShadowDto['initiator'];
  }): Promise<CustomerSubscriptionRevocationShadowResult> {
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
          client: { select: { id: true, mergedIntoClientId: true } },
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
    const requesterRole = String(requester.membership.role);
    if (
      !CUSTOMER_SUBSCRIPTION_REVOCATION_REQUESTER_ROLES.has(requesterRole) ||
      !this.initiatorMatchesRole(input.initiator, requesterRole)
    ) {
      return this.noPlan('requester_unauthorized', 1);
    }
    if (!subscription || subscription.clientId !== link.client.id) {
      return this.noPlan('subscription_not_revocable', 1);
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

    const providerClientIdentityHash = this.hash([
      'p4-05.provider-client.v1',
      input.tenantId,
      input.provider,
      input.externalClientId,
      link.client.id,
    ]);
    const requesterIdentityHash = this.hash([
      'p4-05.subscription-revocation-requester.v1',
      input.tenantId,
      requester.user.id,
      requester.membership.id,
      requesterRole,
      'tenant_owner_or_admin',
    ]);
    const revocationDecisionIdentityHash = this.hash([
      'p4-05.subscription-revocation-decision.v1',
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      input.revocationDecisionRef,
    ]);
    const revocationEvidenceIdentityHash = this.hash([
      'p4-05.subscription-revocation-evidence.v1',
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      input.revocationEvidenceRef,
    ]);
    const approvalScopeHash = this.hash([
      'p4-05.subscription-revocation-owner-approval-scope.v1',
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      revocationDecisionIdentityHash,
      revocationEvidenceIdentityHash,
      'approved_policy_revocation',
      CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
    ]);
    const revocationIdentityHash = this.hash([
      CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
      input.tenantId,
      subscription.id,
      subscription.termIdentityHash,
      revocationDecisionIdentityHash,
      approvalScopeHash,
      CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
    ]);
    const policySnapshotHash = this.hash([
      CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
      input.tenantId,
      subscription.id,
      requesterIdentityHash,
      revocationEvidenceIdentityHash,
      approvalScopeHash,
      'OWNER_APPROVAL_REQUIRED',
    ]);
    const canonicalInput = {
      canonicalClientId: link.client.id,
      providerClientIdentityHash,
      subscriptionId: subscription.id,
      termIdentityHash: subscription.termIdentityHash,
      planSnapshotHash: subscription.planSnapshotHash,
      serviceScopeHash: subscription.serviceScopeHash,
      currentLifecycleState: 'active',
      revocationDecisionIdentityHash,
      revocationEvidenceIdentityHash,
      requesterIdentityHash,
      requesterRole,
      requesterAuthority: 'tenant_owner_or_admin',
      revocationReason: 'approved_policy_revocation',
      effectiveMode: 'immediate_on_canonical_commit',
      approvalScopeHash,
      approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
      revocationIdentityHash,
      revocationContractVersion:
        CUSTOMER_SUBSCRIPTION_REVOCATION_CONTRACT_VERSION,
      policyProfile: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      eligibilityDecision: 'authorized_active_term_with_exact_evidence',
      approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
      intendedStatus: 'revoked',
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
      capability: CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge' as const,
        occurrenceScope: `p4-05:subscription-revocation:${revocationIdentityHash}`,
        sourceRef: 'legacy-subscription:owner-approved-revocation-decision',
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
        `revocation-decision:${revocationDecisionIdentityHash}`,
        `revocation-evidence:${revocationEvidenceIdentityHash}`,
        `owner-approval-scope:${approvalScopeHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-05.revoke-customer-subscription.shadow',
        key: revocationIdentityHash,
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
      intendedRevocation: {
        model: 'CustomerSubscription',
        canonicalClientId: link.client.id,
        subscriptionId: subscription.id,
        termIdentityHash: subscription.termIdentityHash,
        termStartsAt: subscription.termStartsAt.toISOString(),
        termEndsAt: subscription.termEndsAt.toISOString(),
        revocationIdentityHash,
        revocationEvidenceIdentityHash,
        requesterRole,
        requesterAuthority: 'tenant_owner_or_admin',
        revocationReason: 'approved_policy_revocation',
        effectiveMode: 'immediate_on_canonical_commit',
        currentLifecycleState: 'active',
        intendedStatus: 'revoked',
        approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
        approvalScopeHash,
        approvalBindingMode: 'CANONICAL_EXECUTION_OWNER_APPROVAL',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        paymentRefundIncluded: false,
        providerCancellationIncluded: false,
        oneTimeTerminalClaim: true,
        writesPerformed: false,
      },
      subscriptionsRevokedByNewPath: 0,
      termMutationsByNewPath: 0,
      renewalsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageMutationsByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }

  private initiatorMatchesRole(
    initiator: CustomerSubscriptionRevocationShadowDto['initiator'],
    requesterRole: string,
  ): boolean {
    return (
      (initiator === 'owner_revocation_decision' &&
        OWNER_ROLES.has(requesterRole)) ||
      (initiator === 'admin_revocation_decision' &&
        ADMIN_ROLES.has(requesterRole))
    );
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(
        process.env.MAYA_CUSTOMER_SUBSCRIPTION_REVOCATION_SHADOW_ENABLED || '',
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
    outcome: Exclude<CustomerSubscriptionRevocationShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): CustomerSubscriptionRevocationShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedRevocation: null,
      subscriptionsRevokedByNewPath: 0,
      termMutationsByNewPath: 0,
      renewalsCreatedByNewPath: 0,
      paymentMutationsByNewPath: 0,
      providerWritesByNewPath: 0,
      usageMutationsByNewPath: 0,
      messagesSentByNewPath: 0,
    };
  }
}
