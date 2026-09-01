import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_ISSUE_SHADOW_CAPABILITY,
  REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
  REFERRAL_REWARD_POLICY_LIMITS,
  REFERRAL_REWARD_PRESENTATION_CONTRACT,
  REFERRAL_REWARD_VALUE_CONTRACT,
} from '../action-engine';
import {
  CLIENT_IDENTITY_GUARD_UNAVAILABLE,
  CLIENT_IDENTITY_UNRESOLVED,
  ClientIdentityService,
} from '../crm/client-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ReferralRewardIssueShadowDto } from './dto/referral-reward-issue-shadow.dto';
import {
  referralRewardPresentation,
  referralRewardPresentationConfig,
} from './referral-reward-claim.contract';

type RewardSlot = 'inviter' | 'invitee';

type IntendedReward = {
  slot: RewardSlot;
  recipientClientId: string;
  rewardId: string;
  rewardIdentityHash: string;
  denomination: 'FIXED_MONEY_DISCOUNT' | 'PERCENT_DISCOUNT';
  amountKopecks: number | null;
  percentBasisPoints: number | null;
  liabilityCapKopecks: number;
  liabilityCurrency: string;
  presentationKeyVersion: string;
  presentationReference: string;
  codeHash: string;
};

export type ReferralRewardIssueShadowOutcome =
  | 'planned'
  | 'shadow_disabled'
  | 'identity_unresolved'
  | 'identity_guard_unavailable'
  | 'referral_not_qualified'
  | 'reward_already_issued'
  | 'reward_policy_invalid'
  | 'reward_cap_exceeded'
  | 'presentation_contract_unavailable';

export interface ReferralRewardIssueShadowResult {
  outcome: ReferralRewardIssueShadowOutcome;
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedIssuance: {
    model: 'ReferralRewardIssuance';
    referralId: string;
    issuanceIdentityHash: string;
    issuanceId: string;
    resolutionExecutionId: string;
    resolutionEvidenceHash: string;
    policyProfile: typeof REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE;
    policySnapshotHash: string;
    valueContract: typeof REFERRAL_REWARD_VALUE_CONTRACT;
    currency: string;
    issuedAt: string;
    expiresAt: string;
    rewards: IntendedReward[];
    aggregateLiabilityKopecks: number;
    maxRecipients: 2;
    perRewardLiabilityCapKopecks: number;
    perIssuanceLiabilityCapKopecks: number;
    approvalThresholdKopecks: 1;
    executableApprovalRequirement: 'REQUIRED';
    presentationContract: typeof REFERRAL_REWARD_PRESENTATION_CONTRACT;
    claimLookupContract: typeof REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT;
    capDecision: 'within_cap';
  } | null;
  newPathRewardIssuances: 0;
  newPathRewards: 0;
  newPathLoyaltyValueMutations: 0;
  newPathProviderWrites: 0;
  newPathMessages: 0;
}

type ExactClientLink = {
  externalId: string;
  client: { id: string; mergedIntoClientId: string | null };
};

@Injectable()
export class ReferralRewardIssueShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly bridgeSource: BridgeSourceService,
    private readonly tenantContext: TenantContextService,
    private readonly clientIdentity: ClientIdentityService,
  ) {}

  assertSecret(header: string | undefined): void {
    this.bridgeSource.assertBridgeSecret(header, 'MAYA_INBOX_BRIDGE_TOKEN', {
      disabled: 'referral_reward_issue_shadow_bridge_disabled',
      unauthorized: 'referral_reward_issue_shadow_bridge_unauthorized',
    });
  }

  async planIssuance(
    dto: ReferralRewardIssueShadowDto,
  ): Promise<ReferralRewardIssueShadowResult> {
    if (!this.enabled()) return this.noPlan('shadow_disabled', 0);
    const presentationConfig = referralRewardPresentationConfig();
    if (!presentationConfig) {
      return this.noPlan('presentation_contract_unavailable', 1);
    }

    const boundSource = this.bridgeSource.assertBridgeIntegrationBinding(
      {
        provider: dto.provider,
        externalCompanyId: dto.external_company_id,
      },
      {
        provider: 'MAYA_REFERRAL_REWARD_ISSUE_SHADOW_SOURCE_PROVIDER',
        externalCompanyId:
          'MAYA_REFERRAL_REWARD_ISSUE_SHADOW_SOURCE_COMPANY_ID',
      },
      {
        disabled: 'referral_reward_issue_shadow_source_binding_disabled',
        mismatch: 'referral_reward_issue_shadow_source_binding_mismatch',
      },
    );
    const tenant = await this.bridgeSource.resolveTenantByIntegration(
      boundSource,
      'referral_reward_issue_shadow_tenant_not_found',
    );
    const referrerExternalId = dto.referrer_external_client_id.trim();
    const referredExternalId = dto.referred_external_client_id.trim();
    if (!referrerExternalId || !referredExternalId) {
      return this.noPlan('identity_unresolved', 1);
    }

    return this.tenantContext.runAsSystemTenant(tenant.tenantId, () =>
      this.planInsideTenant({
        tenantId: tenant.tenantId,
        provider: boundSource.provider,
        referrerExternalId,
        referredExternalId,
        presentationConfig,
        dto,
      }),
    );
  }

  private async planInsideTenant(input: {
    tenantId: string;
    provider: string;
    referrerExternalId: string;
    referredExternalId: string;
    presentationConfig: NonNullable<
      ReturnType<typeof referralRewardPresentationConfig>
    >;
    dto: ReferralRewardIssueShadowDto;
  }): Promise<ReferralRewardIssueShadowResult> {
    for (const externalId of [
      input.referrerExternalId,
      input.referredExternalId,
    ]) {
      const guard = await this.clientIdentity.checkCrmClientRegistrationGuard({
        tenantId: input.tenantId,
        provider: input.provider,
        externalId,
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
    }

    const links = (await this.prisma.crmClientLink.findMany({
      where: {
        tenantId: input.tenantId,
        provider: input.provider,
        externalId: {
          in: [input.referrerExternalId, input.referredExternalId],
        },
        unlinkedAt: null,
      },
      select: {
        externalId: true,
        client: { select: { id: true, mergedIntoClientId: true } },
      },
    })) as ExactClientLink[];
    const referrer = links.find(
      (link) => link.externalId === input.referrerExternalId,
    );
    const referred = links.find(
      (link) => link.externalId === input.referredExternalId,
    );
    if (
      links.length !== 2 ||
      !referrer ||
      !referred ||
      referrer.client.mergedIntoClientId !== null ||
      referred.client.mergedIntoClientId !== null ||
      referrer.client.id === referred.client.id
    ) {
      return this.noPlan('identity_unresolved', 1);
    }

    const relationshipIdentityHash = this.hash([
      'p4-04.create-customer-referral.v1',
      input.tenantId,
      referrer.client.id,
      this.hash([
        'p4-04.referred-subject.v1',
        input.tenantId,
        referred.client.id,
      ]),
    ]);
    const referral = await this.prisma.customerReferral.findUnique({
      where: {
        tenantId_identityHash: {
          tenantId: input.tenantId,
          identityHash: relationshipIdentityHash,
        },
      },
      select: {
        id: true,
        status: true,
        referrerClientId: true,
        referredClientId: true,
        identityHash: true,
        resolutionExecutionId: true,
        resolvedAt: true,
        rewardIssuance: { select: { id: true } },
        resolutionExecution: {
          select: {
            id: true,
            tenantId: true,
            actionClass: true,
            state: true,
            policyDecision: true,
            normalizedInputHash: true,
            policyContextHash: true,
            finalizedAt: true,
          },
        },
      },
    });
    if (referral?.rewardIssuance) {
      return this.noPlan('reward_already_issued', 0);
    }
    if (
      !referral ||
      referral.status !== 'qualified' ||
      referral.referrerClientId !== referrer.client.id ||
      referral.referredClientId !== referred.client.id ||
      referral.identityHash !== relationshipIdentityHash ||
      !referral.resolvedAt ||
      !referral.resolutionExecutionId ||
      !referral.resolutionExecution ||
      referral.resolutionExecution.id !== referral.resolutionExecutionId ||
      referral.resolutionExecution.tenantId !== input.tenantId ||
      referral.resolutionExecution.actionClass !==
        'resolve_customer_referral' ||
      referral.resolutionExecution.state !== 'SUCCEEDED' ||
      referral.resolutionExecution.policyDecision !== 'ALLOW' ||
      !referral.resolutionExecution.policyContextHash ||
      !referral.resolutionExecution.finalizedAt
    ) {
      return this.noPlan('referral_not_qualified', 1);
    }

    const program = await this.prisma.referralProgram.findUnique({
      where: { tenantId: input.tenantId },
      select: {
        id: true,
        enabled: true,
        inviterRewardKopecks: true,
        inviteeRewardKopecks: true,
        inviterRewardPercentBasisPoints: true,
        inviteeRewardPercentBasisPoints: true,
        inviterRewardLiabilityCapKopecks: true,
        inviteeRewardLiabilityCapKopecks: true,
        currency: true,
        updatedAt: true,
      },
    });
    if (!program?.enabled || !/^[A-Z]{3}$/.test(program.currency)) {
      return this.noPlan('reward_policy_invalid', 1);
    }
    const configuredRewards = [
      {
        slot: 'inviter' as const,
        recipientClientId: referrer.client.id,
        amountKopecks: program.inviterRewardKopecks ?? null,
        percentBasisPoints: program.inviterRewardPercentBasisPoints ?? null,
        configuredLiabilityCapKopecks:
          program.inviterRewardLiabilityCapKopecks ?? null,
      },
      {
        slot: 'invitee' as const,
        recipientClientId: referred.client.id,
        amountKopecks: program.inviteeRewardKopecks ?? null,
        percentBasisPoints: program.inviteeRewardPercentBasisPoints ?? null,
        configuredLiabilityCapKopecks:
          program.inviteeRewardLiabilityCapKopecks ?? null,
      },
    ];
    if (
      configuredRewards.some(
        (reward) =>
          (reward.amountKopecks !== null && reward.amountKopecks < 0) ||
          (reward.percentBasisPoints !== null &&
            (reward.percentBasisPoints < 0 ||
              reward.percentBasisPoints > 10_000)) ||
          (reward.configuredLiabilityCapKopecks !== null &&
            reward.configuredLiabilityCapKopecks < 0) ||
          (reward.amountKopecks !== null &&
            reward.percentBasisPoints !== null) ||
          (reward.percentBasisPoints !== null &&
            reward.percentBasisPoints > 0 &&
            (!reward.configuredLiabilityCapKopecks ||
              reward.configuredLiabilityCapKopecks < 1)),
      )
    ) {
      return this.noPlan('reward_policy_invalid', 1);
    }
    const activeRewards = configuredRewards
      .filter(
        (reward) =>
          (reward.amountKopecks !== null && reward.amountKopecks > 0) ||
          (reward.percentBasisPoints !== null && reward.percentBasisPoints > 0),
      )
      .map((reward) => ({
        ...reward,
        denomination: reward.amountKopecks
          ? ('FIXED_MONEY_DISCOUNT' as const)
          : ('PERCENT_DISCOUNT' as const),
        liabilityCapKopecks:
          reward.amountKopecks ?? reward.configuredLiabilityCapKopecks ?? 0,
      }));
    if (activeRewards.length < 1) {
      return this.noPlan('reward_policy_invalid', 1);
    }
    const aggregateLiabilityKopecks = activeRewards.reduce(
      (sum, reward) => sum + reward.liabilityCapKopecks,
      0,
    );
    if (
      activeRewards.length > REFERRAL_REWARD_POLICY_LIMITS.maxRecipients ||
      activeRewards.some(
        (reward) =>
          reward.liabilityCapKopecks >
          REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks,
      ) ||
      aggregateLiabilityKopecks >
        REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks
    ) {
      return this.noPlan('reward_cap_exceeded', 1);
    }

    const issuedAt = referral.resolvedAt.toISOString();
    const expiresAtDate = new Date(referral.resolvedAt);
    expiresAtDate.setUTCDate(
      expiresAtDate.getUTCDate() + REFERRAL_REWARD_POLICY_LIMITS.ttlDays,
    );
    const expiresAt = expiresAtDate.toISOString();
    const policySnapshotHash = this.hash([
      REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
      input.tenantId,
      program.id,
      String(program.enabled),
      String(program.inviterRewardKopecks ?? ''),
      String(program.inviteeRewardKopecks ?? ''),
      String(program.inviterRewardPercentBasisPoints ?? ''),
      String(program.inviteeRewardPercentBasisPoints ?? ''),
      String(program.inviterRewardLiabilityCapKopecks ?? ''),
      String(program.inviteeRewardLiabilityCapKopecks ?? ''),
      program.currency,
      String(REFERRAL_REWARD_POLICY_LIMITS.maxRecipients),
      String(REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks),
      String(REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks),
      String(REFERRAL_REWARD_POLICY_LIMITS.ttlDays),
      String(REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks),
      REFERRAL_REWARD_VALUE_CONTRACT,
      REFERRAL_REWARD_PRESENTATION_CONTRACT,
      REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
      input.presentationConfig.presentationKeyVersion,
      program.updatedAt.toISOString(),
    ]);
    const issuanceIdentityHash = this.hash([
      'p4-04.issue-referral-rewards.v1',
      input.tenantId,
      referral.id,
      policySnapshotHash,
    ]);
    const resolutionEvidenceHash = this.hash([
      'p4-04.qualified-resolution-evidence.v1',
      input.tenantId,
      referral.id,
      referral.resolutionExecution.id,
      referral.resolutionExecution.normalizedInputHash,
      referral.resolutionExecution.policyContextHash,
      referral.resolutionExecution.finalizedAt.toISOString(),
      referral.resolvedAt.toISOString(),
    ]);
    const rewards: IntendedReward[] = activeRewards.map((reward) => {
      const rewardId = this.hash([
        'p4-04.referral-reward-id.v1',
        input.tenantId,
        issuanceIdentityHash,
        reward.slot,
      ]);
      const presentation = referralRewardPresentation(
        {
          tenantId: input.tenantId,
          issuanceId: issuanceIdentityHash,
          rewardId,
          recipientClientId: reward.recipientClientId,
          rewardSlot: reward.slot,
          expiresAt,
        },
        {
          presentationKey: input.presentationConfig.presentationKey,
          presentationKeyVersion:
            input.presentationConfig.presentationKeyVersion,
          lookupKey: input.presentationConfig.lookupKey,
        },
      );
      return {
        slot: reward.slot,
        recipientClientId: reward.recipientClientId,
        rewardId,
        rewardIdentityHash: this.hash([
          'p4-04.referral-reward-slot.v1',
          input.tenantId,
          issuanceIdentityHash,
          reward.slot,
          reward.recipientClientId,
          reward.denomination,
          String(reward.amountKopecks ?? ''),
          String(reward.percentBasisPoints ?? ''),
          String(reward.liabilityCapKopecks),
          program.currency,
          expiresAt,
          REFERRAL_REWARD_VALUE_CONTRACT,
          presentation.presentationKeyVersion,
          presentation.codeHash,
        ]),
        denomination: reward.denomination,
        amountKopecks: reward.amountKopecks,
        percentBasisPoints: reward.percentBasisPoints,
        liabilityCapKopecks: reward.liabilityCapKopecks,
        liabilityCurrency: program.currency,
        presentationKeyVersion: presentation.presentationKeyVersion,
        presentationReference: presentation.presentationReference,
        codeHash: presentation.codeHash,
      };
    });

    const inviterAmount =
      rewards.find((reward) => reward.slot === 'inviter')
        ?.liabilityCapKopecks ?? 0;
    const inviteeAmount =
      rewards.find((reward) => reward.slot === 'invitee')
        ?.liabilityCapKopecks ?? 0;
    const divergences = [
      input.dto.legacy_claimed_inviter_reward_kopecks === undefined ||
        input.dto.legacy_claimed_inviter_reward_kopecks === inviterAmount,
      input.dto.legacy_claimed_invitee_reward_kopecks === undefined ||
        input.dto.legacy_claimed_invitee_reward_kopecks === inviteeAmount,
    ].filter((matches) => !matches).length;

    const canonicalInput = {
      provider: input.provider,
      customerReferralId: referral.id,
      resolutionExecutionId: referral.resolutionExecution.id,
      resolutionEvidenceHash,
      canonicalReferrerClientId: referrer.client.id,
      canonicalReferredClientId: referred.client.id,
      issuanceIdentityHash,
      issuanceId: issuanceIdentityHash,
      rewardPolicyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
      policySnapshotHash,
      valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
      currency: program.currency,
      issuedAt,
      expiresAt,
      maxRecipients: REFERRAL_REWARD_POLICY_LIMITS.maxRecipients,
      perRewardLiabilityCapKopecks:
        REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks,
      perIssuanceLiabilityCapKopecks:
        REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks,
      approvalThresholdKopecks:
        REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks,
      executableApprovalRequirement: 'REQUIRED',
      presentationContract: REFERRAL_REWARD_PRESENTATION_CONTRACT,
      claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
      rewards,
      aggregateLiabilityKopecks,
      capDecision: 'within_cap',
      legacyClaimedInviterRewardKopecks:
        input.dto.legacy_claimed_inviter_reward_kopecks ?? null,
      legacyClaimedInviteeRewardKopecks:
        input.dto.legacy_claimed_invitee_reward_kopecks ?? null,
      shadowDivergence: divergences > 0,
    };
    const execution = await this.actionEngine.planShadow({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: REFERRAL_REWARD_ISSUE_SHADOW_CAPABILITY,
      source: {
        type: 'legacy_bridge',
        occurrenceScope: `p4-04:issue-referral-rewards:${issuanceIdentityHash}`,
        sourceRef: 'legacy-referral:issue-referral-rewards',
      },
      targetRef: `referral:${referral.id}`,
      input: canonicalInput,
      evidenceRefs: [
        `referral:${referral.id}`,
        `resolution-execution:${referral.resolutionExecution.id}`,
        `resolution-evidence:${resolutionEvidenceHash}`,
      ],
      callerIdempotency: {
        scope: 'p4-04.issue-referral-rewards.shadow',
        key: issuanceIdentityHash,
      },
    });

    return {
      outcome: 'planned',
      actionExecutionId: execution.id,
      shadowDivergences: divergences,
      intendedIssuance: {
        model: 'ReferralRewardIssuance',
        referralId: referral.id,
        issuanceIdentityHash,
        issuanceId: issuanceIdentityHash,
        resolutionExecutionId: referral.resolutionExecution.id,
        resolutionEvidenceHash,
        policyProfile: REFERRAL_REWARD_ISSUE_SHADOW_POLICY_PROFILE,
        policySnapshotHash,
        valueContract: REFERRAL_REWARD_VALUE_CONTRACT,
        currency: program.currency,
        issuedAt,
        expiresAt,
        rewards,
        aggregateLiabilityKopecks,
        maxRecipients: REFERRAL_REWARD_POLICY_LIMITS.maxRecipients,
        perRewardLiabilityCapKopecks:
          REFERRAL_REWARD_POLICY_LIMITS.maxRewardLiabilityKopecks,
        perIssuanceLiabilityCapKopecks:
          REFERRAL_REWARD_POLICY_LIMITS.maxIssuanceLiabilityKopecks,
        approvalThresholdKopecks:
          REFERRAL_REWARD_POLICY_LIMITS.approvalThresholdKopecks,
        executableApprovalRequirement: 'REQUIRED',
        presentationContract: REFERRAL_REWARD_PRESENTATION_CONTRACT,
        claimLookupContract: REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
        capDecision: 'within_cap',
      },
      newPathRewardIssuances: 0,
      newPathRewards: 0,
      newPathLoyaltyValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }

  private enabled(): boolean {
    return ['1', 'true', 'on', 'yes'].includes(
      String(process.env.MAYA_REFERRAL_REWARD_ISSUE_SHADOW_ENABLED || '')
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
    outcome: Exclude<ReferralRewardIssueShadowOutcome, 'planned'>,
    shadowDivergences: number,
  ): ReferralRewardIssueShadowResult {
    return {
      outcome,
      actionExecutionId: null,
      shadowDivergences,
      intendedIssuance: null,
      newPathRewardIssuances: 0,
      newPathRewards: 0,
      newPathLoyaltyValueMutations: 0,
      newPathProviderWrites: 0,
      newPathMessages: 0,
    };
  }
}
