import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  REFERRAL_REWARD_CLAIM_CONTRACT,
  REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
  REFERRAL_REWARD_FULFILL_SHADOW_CAPABILITY,
  REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_POLICY_LIMITS,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ReferralRewardFulfillShadowDto } from './dto/referral-reward-fulfill-shadow.dto';
import { referralRewardClaimLookup } from './referral-reward-claim.contract';

const ADMINISTRATIVE_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);
const CASHIER_ELIGIBLE_ROLES = new Set([
  'manager',
  'branch_manager',
  'provider',
  'employee',
  'staff',
]);
const RECIPIENT_ROLES = new Set(['client', 'customer']);
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:/-]{1,240}$/;

type RequesterAuthority =
  'administrative_role' | 'server_cashier_allowlist' | 'reward_recipient';

export type ReferralRewardFulfillShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'policy_unresolved'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'reward_unresolved'
  | 'reward_expired'
  | 'already_fulfilled'
  | 'loyalty_account_unresolved';

export interface ReferralRewardFulfillShadowResult {
  outcome: ReferralRewardFulfillShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedFulfillment: {
    model: 'ReferralRewardFulfillment';
    rewardId: string;
    originatingReferralId: string;
    recipientClientId: string;
    loyaltyAccountId: string;
    fulfillmentIdentityHash: string;
    rewardAmountKopecks: number;
    currency: string;
    oneTimeClaimRequired: true;
    claimContract: typeof REFERRAL_REWARD_CLAIM_CONTRACT;
    requesterAuthority: RequesterAuthority;
    approvalRequirement: 'NONE_ACTOR_AUTHORIZED';
    providerBoundary: 'LOCAL_ONLY';
    unknownApplicable: false;
    reconciliationContract: typeof REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT;
    valueApplication: 'REFERRAL_REWARD_CLAIM_ONLY';
    writesPerformed: false;
  } | null;
  newPathFulfillments: 0;
  newPathLoyaltyValueMutations: 0;
  newPathProviderWrites: 0;
  newPathMessages: 0;
}

@Injectable()
export class ReferralRewardFulfillShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'referral_reward_fulfill_shadow_bridge_disabled',
      unauthorized: 'referral_reward_fulfill_shadow_bridge_unauthorized',
    });
  }

  async planFulfillment(
    dto: ReferralRewardFulfillShadowDto,
  ): Promise<ReferralRewardFulfillShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);

    const claimSecret = String(
      process.env.MAYA_REFERRAL_REWARD_CLAIM_SECRET || '',
    ).trim();
    const cashierUserIds = this.cashierUserIds(
      process.env.MAYA_REFERRAL_REWARD_FULFILL_CASHIER_USER_IDS,
    );
    if (
      claimSecret.length < 32 ||
      claimSecret.length > 256 ||
      cashierUserIds === null
    ) {
      return this.noPlan('policy_unresolved', 1);
    }

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_REFERRAL_REWARD_FULFILL_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_REFERRAL_REWARD_FULFILL_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'referral_reward_fulfill_shadow_source_binding_disabled',
        mismatch: 'referral_reward_fulfill_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'referral_reward_fulfill_shadow_tenant_not_found',
    );
    const requesterProvider = dto.requester_identity_provider
      .trim()
      .toLowerCase();
    const externalRequesterId = dto.external_requester_id.trim();
    const recipientExternalId = dto.recipient_external_client_id.trim();
    const normalizedClaim = dto.reward_claim.trim().toUpperCase();
    if (
      !requesterProvider ||
      !externalRequesterId ||
      !recipientExternalId ||
      !normalizedClaim
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        requesterProvider,
        externalRequesterId,
        recipientExternalId,
        normalizedClaim,
        claimSecret,
        cashierUserIds,
        dto,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    requesterProvider: string;
    externalRequesterId: string;
    recipientExternalId: string;
    normalizedClaim: string;
    claimSecret: string;
    cashierUserIds: Set<string>;
    dto: ReferralRewardFulfillShadowDto;
  }): Promise<ReferralRewardFulfillShadowResult> {
    const requester = await this.prisma.authIdentity.findUnique({
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
    });
    if (
      !requester ||
      requester.user.status !== 'active' ||
      requester.membership.status !== 'active'
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const codeHash = referralRewardClaimLookup(
      input.claimSecret,
      input.normalizedClaim,
    );
    const reward = await this.prisma.referralReward.findUnique({
      where: {
        tenantId_codeHash: {
          tenantId: input.tenantId,
          codeHash,
        },
      },
      select: {
        id: true,
        tenantId: true,
        issuanceId: true,
        recipientClientId: true,
        rewardSlot: true,
        codeHash: true,
        amountKopecks: true,
        currency: true,
        percentBasisPoints: true,
        issuedAt: true,
        expiresAt: true,
        fulfillment: { select: { id: true, actionExecutionId: true } },
        recipient: {
          select: {
            id: true,
            userId: true,
            mergedIntoClientId: true,
            crmLinks: {
              where: { provider: input.provider, unlinkedAt: null },
              select: { externalId: true },
            },
          },
        },
        issuance: {
          select: {
            id: true,
            tenantId: true,
            referralId: true,
            actionExecutionId: true,
            policySnapshotHash: true,
            issuedAt: true,
            referral: { select: { id: true, status: true } },
            actionExecution: {
              select: {
                id: true,
                tenantId: true,
                actionClass: true,
                state: true,
                policyDecision: true,
              },
            },
          },
        },
      },
    });
    if (!reward) return this.noPlan('reward_unresolved', 1);
    if (reward.fulfillment) {
      return this.noPlan('already_fulfilled', 0);
    }
    const exactRecipientLink = reward.recipient.crmLinks.find(
      (link) => link.externalId === input.recipientExternalId,
    );
    if (
      reward.tenantId !== input.tenantId ||
      reward.recipient.id !== reward.recipientClientId ||
      reward.recipient.mergedIntoClientId !== null ||
      reward.recipient.crmLinks.length !== 1 ||
      !exactRecipientLink ||
      reward.issuance.id !== reward.issuanceId ||
      reward.issuance.tenantId !== input.tenantId ||
      reward.issuance.referral.id !== reward.issuance.referralId ||
      reward.issuance.referral.status !== 'qualified' ||
      !reward.issuance.actionExecutionId ||
      !reward.issuance.actionExecution ||
      reward.issuance.actionExecution.id !==
        reward.issuance.actionExecutionId ||
      reward.issuance.actionExecution.tenantId !== input.tenantId ||
      reward.issuance.actionExecution.actionClass !==
        'issue_referral_rewards' ||
      reward.issuance.actionExecution.state !== 'SUCCEEDED' ||
      reward.issuance.actionExecution.policyDecision !== 'ALLOW' ||
      reward.issuance.issuedAt.getTime() !== reward.issuedAt.getTime() ||
      (reward.rewardSlot !== 'inviter' && reward.rewardSlot !== 'invitee') ||
      !reward.codeHash ||
      reward.codeHash !== codeHash ||
      reward.percentBasisPoints !== null ||
      !Number.isInteger(reward.amountKopecks) ||
      reward.amountKopecks === null ||
      reward.amountKopecks < 1 ||
      reward.amountKopecks > REFERRAL_REWARD_POLICY_LIMITS.maxRewardKopecks ||
      !reward.currency ||
      !/^[A-Z]{3}$/.test(reward.currency) ||
      !Number.isFinite(reward.issuedAt.getTime()) ||
      !Number.isFinite(reward.expiresAt.getTime()) ||
      reward.expiresAt.getTime() <= reward.issuedAt.getTime()
    ) {
      return this.noPlan('reward_unresolved', 1);
    }

    const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
      tenantId: input.tenantId,
      provider: input.provider,
      externalId: input.recipientExternalId,
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
    if (reward.expiresAt.getTime() <= Date.now()) {
      return this.noPlan('reward_expired', 0);
    }

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        tenantId_clientId: {
          tenantId: input.tenantId,
          clientId: reward.recipientClientId,
        },
      },
      select: { id: true, tenantId: true, clientId: true, balance: true },
    });
    if (
      !account ||
      account.tenantId !== input.tenantId ||
      account.clientId !== reward.recipientClientId ||
      !Number.isInteger(account.balance)
    ) {
      return this.noPlan('loyalty_account_unresolved', 1);
    }

    const requesterRole = String(requester.membership.role);
    const requesterAuthority = this.requesterAuthority({
      initiator: input.dto.initiator,
      requesterRole,
      requesterUserId: requester.user.id,
      recipientUserId: reward.recipient.userId,
      cashierUserIds: input.cashierUserIds,
    });
    if (!requesterAuthority) {
      return this.noPlan('policy_unresolved', 1);
    }

    const rewardIdentityHash = this.hash([
      'p4-04.referral-reward.v1',
      input.tenantId,
      reward.id,
      reward.issuanceId,
      reward.recipientClientId,
      reward.rewardSlot,
      String(reward.amountKopecks),
      reward.currency,
      reward.issuedAt.toISOString(),
      reward.expiresAt.toISOString(),
      reward.codeHash,
    ]);
    const issuanceIdentityHash = this.hash([
      'p4-04.referral-reward-issuance.v1',
      input.tenantId,
      reward.issuance.id,
      reward.issuance.referralId,
      reward.issuance.actionExecutionId,
      reward.issuance.policySnapshotHash,
    ]);
    const claimBindingHash = this.hash([
      'p4-04.referral-reward-claim-binding.v1',
      input.tenantId,
      reward.id,
      reward.codeHash,
      REFERRAL_REWARD_CLAIM_CONTRACT,
    ]);
    const recipientIdentityHash = this.hash([
      input.tenantId,
      reward.recipientClientId,
      input.provider,
      input.recipientExternalId,
    ]);
    const loyaltyAccountIdentityHash = this.hash([
      input.tenantId,
      account.id,
      reward.recipientClientId,
    ]);
    const requesterIdentityHash = this.hash([
      input.tenantId,
      requester.user.id,
      requester.membership.id,
      requesterRole,
      requesterAuthority,
    ]);
    const fulfillmentIdentityHash = this.hash([
      'p4-04.fulfill-referral-reward.v1',
      input.tenantId,
      reward.id,
      rewardIdentityHash,
      claimBindingHash,
      loyaltyAccountIdentityHash,
      REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
    ]);
    const divergenceCodes = [
      ...(input.dto.legacy_claimed_value_kopecks !== reward.amountKopecks
        ? ['legacy_value_mismatch']
        : []),
      ...(input.dto.legacy_claimed_fulfilled
        ? ['legacy_fulfillment_mismatch']
        : []),
    ];
    const canonicalInput = {
      provider: input.provider,
      canonicalRewardId: reward.id,
      rewardIdentityHash,
      issuanceIdentityHash,
      originatingReferralId: reward.issuance.referralId,
      recipientClientId: reward.recipientClientId,
      recipientIdentityHash,
      loyaltyAccountIdentityHash,
      requesterIdentityHash,
      requesterRole,
      requesterAuthority,
      fulfillmentIdentityHash,
      claimBindingHash,
      claimContract: REFERRAL_REWARD_CLAIM_CONTRACT,
      rewardSlot: reward.rewardSlot,
      rewardRepresentation: 'fixed_money_kopecks',
      rewardAmountKopecks: reward.amountKopecks,
      currency: reward.currency,
      issuedAt: reward.issuedAt.toISOString(),
      expiresAt: reward.expiresAt.toISOString(),
      fulfillmentDecision: 'fulfill',
      fulfillmentPolicy: REFERRAL_REWARD_FULFILL_SHADOW_POLICY_PROFILE,
      approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
      providerBoundary: 'LOCAL_ONLY',
      reconciliationContract: REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
      existingFulfillmentDecision: 'none',
      legacyClaimedValueKopecks: input.dto.legacy_claimed_value_kopecks,
      legacyClaimedFulfilledDecision: input.dto.legacy_claimed_fulfilled
        ? 'already_fulfilled'
        : 'none',
      divergenceCodes,
    };
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: REFERRAL_REWARD_FULFILL_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-04:fulfill-referral-reward:${fulfillmentIdentityHash}`,
        sourceRef: 'legacy-referral:fulfill-referral-reward',
        actorUserId: requester.user.id,
      },
      targetRef: `referral-reward:${rewardIdentityHash}`,
      input: canonicalInput,
      evidenceRefs: [
        `referral:${reward.issuance.referralId}`,
        `reward-issuance:${issuanceIdentityHash}`,
        `reward:${rewardIdentityHash}`,
        `claim-binding:${claimBindingHash}`,
        `recipient:${recipientIdentityHash}`,
        `loyalty-account:${loyaltyAccountIdentityHash}`,
        `requester:${requesterIdentityHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-04.fulfill-referral-reward.shadow',
        key: fulfillmentIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: divergenceCodes.length,
      intendedFulfillment: {
        model: 'ReferralRewardFulfillment',
        rewardId: reward.id,
        originatingReferralId: reward.issuance.referralId,
        recipientClientId: reward.recipientClientId,
        loyaltyAccountId: account.id,
        fulfillmentIdentityHash,
        rewardAmountKopecks: reward.amountKopecks,
        currency: reward.currency,
        oneTimeClaimRequired: true,
        claimContract: REFERRAL_REWARD_CLAIM_CONTRACT,
        requesterAuthority,
        approvalRequirement: 'NONE_ACTOR_AUTHORIZED',
        providerBoundary: 'LOCAL_ONLY',
        unknownApplicable: false,
        reconciliationContract: REFERRAL_REWARD_FULFILL_RECONCILIATION_CONTRACT,
        valueApplication: 'REFERRAL_REWARD_CLAIM_ONLY',
        writesPerformed: false,
      },
      newPathFulfillments: 0,
      newPathLoyaltyValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }

  private requesterAuthority(input: {
    initiator: ReferralRewardFulfillShadowDto['initiator'];
    requesterRole: string;
    requesterUserId: string;
    recipientUserId: string | null;
    cashierUserIds: Set<string>;
  }): RequesterAuthority | null {
    if (
      input.initiator === 'admin_claim' &&
      ADMINISTRATIVE_ROLES.has(input.requesterRole)
    ) {
      return 'administrative_role';
    }
    if (
      input.initiator === 'cashier_claim' &&
      CASHIER_ELIGIBLE_ROLES.has(input.requesterRole) &&
      input.cashierUserIds.has(input.requesterUserId)
    ) {
      return 'server_cashier_allowlist';
    }
    if (
      input.initiator === 'client_claim' &&
      RECIPIENT_ROLES.has(input.requesterRole) &&
      input.recipientUserId === input.requesterUserId
    ) {
      return 'reward_recipient';
    }
    return null;
  }

  private cashierUserIds(value: string | undefined): Set<string> | null {
    const values = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      values.length > 64 ||
      values.some((item) => !OPAQUE_REF_PATTERN.test(item))
    ) {
      return null;
    }
    return new Set(values);
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_REFERRAL_REWARD_FULFILL_SHADOW_ENABLED || '')
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
    outcome: Exclude<ReferralRewardFulfillShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): ReferralRewardFulfillShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedFulfillment: null,
      newPathFulfillments: 0,
      newPathLoyaltyValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }
}
