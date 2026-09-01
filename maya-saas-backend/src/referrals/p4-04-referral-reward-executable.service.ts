import { createHash } from 'node:crypto';

import {
  ActionExecutionState,
  MembershipStatus,
  Prisma,
  type PrismaClient,
  UserRole,
} from '@prisma/client';

import {
  P4_04_EXECUTABLE_CAPABILITIES,
  P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
  REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
  REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
  REFERRAL_REWARD_VALUE_CONTRACT,
  type P404ExecutableActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type {
  ActionFailureClassification,
  ActionRuntimeHandlers,
  ActionRuntimePhase,
  ActionRuntimeReceipt,
} from '../action-engine/action-engine.runtime';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import { referralRewardPresentation } from './referral-reward-claim.contract';

interface P404ExecutableOptions {
  presentationKey: string;
  presentationKeyVersion: string;
  claimLookupKey: string;
  now?: () => Date;
}

export interface P404ExecutionValue {
  actionClass: P404ExecutableActionClass | 'referral_reward_batch';
  actionExecutionId: string;
  referralId?: string;
  issuanceId?: string;
  rewardIds?: string[];
  fulfillmentId?: string;
  appliedAmountKopecks?: number;
  batchIdentityHash?: string;
  childExecutionIdentities?: string[];
  referralMutations: number;
  rewardValueFacts: number;
  providerWrites: 0;
  loyaltyPointMutations: 0;
}

class P404ExecutionContractError extends Error {}

const ACTION_BY_CAPABILITY = new Map<string, P404ExecutableActionClass>([
  [P4_04_EXECUTABLE_CAPABILITIES.createReferral, 'create_customer_referral'],
  [P4_04_EXECUTABLE_CAPABILITIES.resolveReferral, 'resolve_customer_referral'],
  [P4_04_EXECUTABLE_CAPABILITIES.issueRewards, 'issue_referral_rewards'],
  [P4_04_EXECUTABLE_CAPABILITIES.fulfillReward, 'fulfill_referral_reward'],
]);

/**
 * Isolated canonical execution owner used by the P4-04 executable gate.
 * Production initiators are deliberately not cut over in this checkpoint.
 */
export class P404ReferralRewardExecutableService {
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly options: P404ExecutableOptions,
  ) {
    if (
      options.presentationKey.length < 32 ||
      options.claimLookupKey.length < 32 ||
      !/^[A-Za-z0-9._:-]{1,64}$/.test(options.presentationKeyVersion)
    ) {
      throw new P404ExecutionContractError(
        'Referral reward presentation keys are not configured',
      );
    }
    this.now = options.now ?? (() => new Date());
  }

  execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P404ExecutionValue>> {
    if (request.capability === P4_04_SCHEDULER_ENVELOPE_CAPABILITY) {
      return this.executeSchedulerEnvelope(request);
    }
    const actionClass = ACTION_BY_CAPABILITY.get(request.capability);
    if (!actionClass) {
      throw new P404ExecutionContractError(
        'P4-04 executable capability is not registered',
      );
    }
    if (actionClass === 'create_customer_referral') {
      return this.executeCreate(request);
    }
    if (actionClass === 'resolve_customer_referral') {
      return this.executeResolve(request);
    }
    if (actionClass === 'issue_referral_rewards') {
      return this.executeIssue(request);
    }
    return this.executeFulfill(request);
  }

  private executeSchedulerEnvelope(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P404ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: (input, context) => {
          if (input.tenantId !== context.tenantId) {
            throw new P404ExecutionContractError(
              'Scheduler envelope tenant is not canonical',
            );
          }
          return Promise.resolve({ valueMutationPermitted: false });
        },
        dispatch: (input, _key, context) => {
          const value: P404ExecutionValue = {
            actionClass: 'referral_reward_batch',
            actionExecutionId: context.executionId,
            batchIdentityHash: this.text(
              input.batchIdentityHash,
              'batchIdentityHash',
            ),
            childExecutionIdentities: this.strings(
              input.childExecutionIdentities,
              'childExecutionIdentities',
            ),
            referralMutations: 0,
            rewardValueFacts: 0,
            providerWrites: 0,
            loyaltyPointMutations: 0,
          };
          return Promise.resolve({ value, safeResult: this.safe(value) });
        },
        reconcile: () => Promise.resolve({ outcome: 'PROVEN_NOT_EXECUTED' }),
      }),
    );
  }

  private executeCreate(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P404ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertExactClientsClear(context.tenantId, input, [
            'canonicalReferrerClientId',
            'canonicalReferredClientId',
          ]);
          return { relationship: input.relationshipIdentityHash };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.createReferral(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileFact(context, 'create_customer_referral'),
      }),
    );
  }

  private executeResolve(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P404ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertExactClientsClear(context.tenantId, input, [
            'canonicalReferrerClientId',
            'canonicalReferredClientId',
          ]);
          await this.assertReferralMatches(context.tenantId, input, false);
          return { referral: input.customerReferralId };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.resolveReferral(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileFact(context, 'resolve_customer_referral'),
      }),
    );
  }

  private executeIssue(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P404ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertExactClientsClear(context.tenantId, input, [
            'canonicalReferrerClientId',
            'canonicalReferredClientId',
          ]);
          await this.assertReferralMatches(context.tenantId, input, true);
          this.assertPresentationFacts(context.tenantId, input);
          return { frozenValueContract: REFERRAL_REWARD_VALUE_CONTRACT };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.issueRewards(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileFact(context, 'issue_referral_rewards'),
      }),
    );
  }

  private executeFulfill(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P404ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertFulfillmentFacts(
            this.prisma,
            context.tenantId,
            context.executionId,
            input,
          );
          return { providerDispatch: 'forbidden_local_only' };
        },
        dispatch: async (input, _key, context) => {
          const value = await this.fulfillReward(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) =>
          this.reconcileFact(context, 'fulfill_referral_reward'),
      }),
    );
  }

  private handlers(
    handlers: Pick<
      ActionRuntimeHandlers<P404ExecutionValue>,
      'prepare' | 'dispatch' | 'reconcile'
    >,
  ): ActionRuntimeHandlers<P404ExecutionValue> {
    return {
      ...handlers,
      restore: (safeResult) => this.restore(safeResult),
      classifyError: (error, phase) => this.classify(error, phase),
    };
  }

  private classify(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification {
    if (phase === 'prepare' || error instanceof P404ExecutionContractError) {
      return {
        kind: 'definitive',
        outcomeCode: 'p4_04_contract_rejected',
        errorClass: this.errorClass(error),
      };
    }
    return {
      kind: 'unknown',
      outcomeCode: 'p4_04_local_commit_outcome_unknown',
      errorClass: this.errorClass(error),
    };
  }

  private async createReferral(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P404ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const identityHash = this.text(
          input.relationshipIdentityHash,
          'relationshipIdentityHash',
        );
        const existing = await tx.customerReferral.findUnique({
          where: { tenantId_identityHash: { tenantId, identityHash } },
        });
        if (existing) {
          if (existing.createExecutionId !== executionId) {
            throw new P404ExecutionContractError(
              'Logical referral is already owned by another execution',
            );
          }
          return this.referralValue(
            'create_customer_referral',
            executionId,
            existing.id,
          );
        }
        const execution = await tx.actionExecution.findUniqueOrThrow({
          where: { id_tenantId: { id: executionId, tenantId } },
          select: { createdAt: true },
        });
        const referral = await tx.customerReferral.create({
          data: {
            id: identityHash,
            tenantId,
            createExecutionId: executionId,
            referrerClientId: this.text(
              input.canonicalReferrerClientId,
              'canonicalReferrerClientId',
            ),
            referredClientId: this.text(
              input.canonicalReferredClientId,
              'canonicalReferredClientId',
            ),
            identityHash,
            referredSubjectHash: this.text(
              input.referredSubjectHash,
              'referredSubjectHash',
            ),
            referralCodeHash: this.text(
              input.referralCodeBindingHash,
              'referralCodeBindingHash',
            ),
            status: 'pending',
            joinedAt: execution.createdAt,
            legacySourceRef: identityHash,
          },
        });
        return this.referralValue(
          'create_customer_referral',
          executionId,
          referral.id,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async resolveReferral(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P404ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const referralId = this.text(
          input.customerReferralId,
          'customerReferralId',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "CustomerReferral"
          WHERE "id" = ${referralId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const referral = await tx.customerReferral.findUnique({
          where: { id_tenantId: { id: referralId, tenantId } },
        });
        if (!referral) {
          throw new P404ExecutionContractError('Referral is missing');
        }
        if (referral.resolutionExecutionId) {
          if (referral.resolutionExecutionId !== executionId) {
            throw new P404ExecutionContractError(
              'Referral is already resolved by another execution',
            );
          }
          return this.referralValue(
            'resolve_customer_referral',
            executionId,
            referral.id,
          );
        }
        if (referral.status !== 'pending') {
          throw new P404ExecutionContractError(
            'Referral is not pending resolution',
          );
        }
        const execution = await tx.actionExecution.findUniqueOrThrow({
          where: { id_tenantId: { id: executionId, tenantId } },
          select: { createdAt: true },
        });
        const terminalOutcome = this.text(
          input.terminalOutcome,
          'terminalOutcome',
        );
        await tx.customerReferral.update({
          where: { id_tenantId: { id: referral.id, tenantId } },
          data: {
            resolutionExecutionId: executionId,
            status:
              terminalOutcome === 'self_blocked'
                ? 'self_blocked'
                : terminalOutcome,
            resolvedAt: execution.createdAt,
          },
        });
        return this.referralValue(
          'resolve_customer_referral',
          executionId,
          referral.id,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async issueRewards(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P404ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.referralRewardIssuance.findUnique({
          where: {
            actionExecutionId_tenantId: {
              actionExecutionId: executionId,
              tenantId,
            },
          },
          include: { rewards: true },
        });
        if (existing) return this.issuanceValue(executionId, existing);

        const referralId = this.text(
          input.customerReferralId,
          'customerReferralId',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "CustomerReferral"
          WHERE "id" = ${referralId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const referral = await tx.customerReferral.findUnique({
          where: { id_tenantId: { id: referralId, tenantId } },
        });
        if (
          !referral ||
          referral.status !== 'qualified' ||
          referral.resolutionExecutionId !== input.resolutionExecutionId
        ) {
          throw new P404ExecutionContractError(
            'Reward issuance referral evidence changed',
          );
        }
        const claimed = await tx.referralRewardIssuance.findUnique({
          where: { referralId_tenantId: { referralId, tenantId } },
        });
        if (claimed) {
          throw new P404ExecutionContractError(
            'Referral already has a reward issuance',
          );
        }
        const rewards = this.rewardPlans(input);
        const issuanceId = this.text(input.issuanceId, 'issuanceId');
        const issuedAt = new Date(this.text(input.issuedAt, 'issuedAt'));
        const expiresAt = new Date(this.text(input.expiresAt, 'expiresAt'));
        await tx.referralRewardIssuance.create({
          data: {
            id: issuanceId,
            tenantId,
            referralId,
            actionExecutionId: executionId,
            policySnapshotHash: this.text(
              input.policySnapshotHash,
              'policySnapshotHash',
            ),
            issuedAt,
            legacySourceRef: this.text(
              input.issuanceIdentityHash,
              'issuanceIdentityHash',
            ),
          },
        });
        await tx.referralReward.createMany({
          data: rewards.map((reward) => ({
            id: this.text(reward.rewardId, 'rewardId'),
            tenantId,
            issuanceId,
            recipientClientId: this.text(
              reward.recipientClientId,
              'recipientClientId',
            ),
            rewardSlot: this.text(reward.slot, 'slot'),
            codeHash: this.text(reward.codeHash, 'codeHash'),
            amountKopecks:
              reward.amountKopecks === null
                ? null
                : this.integer(reward.amountKopecks, 'amountKopecks'),
            currency:
              reward.amountKopecks === null
                ? null
                : this.text(reward.liabilityCurrency, 'currency'),
            percentBasisPoints:
              reward.percentBasisPoints === null
                ? null
                : this.integer(reward.percentBasisPoints, 'percentBasisPoints'),
            liabilityCapKopecks: this.integer(
              reward.liabilityCapKopecks,
              'liabilityCapKopecks',
            ),
            liabilityCurrency: this.text(
              reward.liabilityCurrency,
              'liabilityCurrency',
            ),
            presentationKeyVersion: this.text(
              reward.presentationKeyVersion,
              'presentationKeyVersion',
            ),
            issuedAt,
            expiresAt,
          })),
        });
        const issuance = await tx.referralRewardIssuance.findUniqueOrThrow({
          where: { id_tenantId: { id: issuanceId, tenantId } },
          include: { rewards: true },
        });
        return this.issuanceValue(executionId, issuance);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async fulfillReward(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P404ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.referralRewardFulfillment.findUnique({
          where: {
            actionExecutionId_tenantId: {
              actionExecutionId: executionId,
              tenantId,
            },
          },
        });
        if (existing) return this.fulfillmentValue(executionId, existing);
        const rewardId = this.text(
          input.canonicalRewardId,
          'canonicalRewardId',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "ReferralReward"
          WHERE "id" = ${rewardId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        await this.assertFulfillmentFacts(tx, tenantId, executionId, input);
        const claimed = await tx.referralRewardFulfillment.findUnique({
          where: { rewardId_tenantId: { rewardId, tenantId } },
        });
        if (claimed) {
          throw new P404ExecutionContractError(
            'Reward is already fulfilled by another execution',
          );
        }
        const execution = await tx.actionExecution.findUniqueOrThrow({
          where: { id_tenantId: { id: executionId, tenantId } },
          select: { createdAt: true },
        });
        const fulfillment = await tx.referralRewardFulfillment.create({
          data: {
            tenantId,
            rewardId,
            actionExecutionId: executionId,
            targetAppointmentId: this.text(
              input.targetAppointmentId,
              'targetAppointmentId',
            ),
            targetIdentityHash: this.text(
              input.targetIdentityHash,
              'targetIdentityHash',
            ),
            eligibleAmountKopecks: this.integer(
              input.eligibleAmountKopecks,
              'eligibleAmountKopecks',
            ),
            appliedAmountKopecks: this.integer(
              input.appliedAmountKopecks,
              'appliedAmountKopecks',
            ),
            currency: this.text(input.currency, 'currency'),
            fulfilledAt: execution.createdAt,
            legacySourceRef: this.text(
              input.fulfillmentIdentityHash,
              'fulfillmentIdentityHash',
            ),
          },
        });
        return this.fulfillmentValue(executionId, fulfillment);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertReferralMatches(
    tenantId: string,
    input: Record<string, unknown>,
    requireQualified: boolean,
  ): Promise<void> {
    const referral = await this.prisma.customerReferral.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.customerReferralId, 'customerReferralId'),
          tenantId,
        },
      },
      include: { resolutionExecution: true },
    });
    if (
      !referral ||
      referral.referrerClientId !== input.canonicalReferrerClientId ||
      referral.referredClientId !== input.canonicalReferredClientId ||
      (input.relationshipIdentityHash !== undefined &&
        referral.identityHash !== input.relationshipIdentityHash)
    ) {
      throw new P404ExecutionContractError(
        'Referral identity does not match canonical facts',
      );
    }
    if (!requireQualified) return;
    const resolution = referral.resolutionExecution;
    if (
      referral.status !== 'qualified' ||
      !resolution ||
      resolution.id !== input.resolutionExecutionId ||
      resolution.state !== ActionExecutionState.SUCCEEDED ||
      !resolution.finalizedAt
    ) {
      throw new P404ExecutionContractError(
        'Exact qualified referral resolution is missing',
      );
    }
    const expectedEvidence = this.hash([
      'p4-04.qualified-resolution-evidence.v1',
      tenantId,
      referral.id,
      resolution.id,
      resolution.normalizedInputHash,
      resolution.policyContextHash ?? '',
      resolution.finalizedAt.toISOString(),
      referral.resolvedAt?.toISOString() ?? '',
    ]);
    if (input.resolutionEvidenceHash !== expectedEvidence) {
      throw new P404ExecutionContractError(
        'Qualified referral resolution evidence changed',
      );
    }
  }

  private async assertExactClientsClear(
    tenantId: string,
    input: Record<string, unknown>,
    clientKeys: readonly string[],
  ): Promise<void> {
    const provider = this.text(input.provider, 'provider');
    const ids = clientKeys.map((key) => this.text(input[key], key));
    if (new Set(ids).size !== ids.length) {
      throw new P404ExecutionContractError('Self referral is forbidden');
    }
    const clients = await this.prisma.client.findMany({
      where: { tenantId, id: { in: ids }, mergedIntoClientId: null },
      include: {
        crmLinks: { where: { provider, unlinkedAt: null } },
      },
    });
    if (
      clients.length !== ids.length ||
      clients.some((client) => client.crmLinks.length !== 1)
    ) {
      throw new P404ExecutionContractError(
        'Exact canonical Client/provider identity is missing',
      );
    }
    const externalIds = clients.map((client) => client.crmLinks[0].externalId);
    const hold = await this.prisma.unresolvedClientIdentityHold.findFirst({
      where: {
        tenantId,
        provider,
        externalId: { in: externalIds },
        resolvedAt: null,
      },
    });
    if (hold) {
      throw new P404ExecutionContractError('loyalty_identity_unresolved');
    }
  }

  private assertPresentationFacts(
    tenantId: string,
    input: Record<string, unknown>,
  ): void {
    const issuanceId = this.text(input.issuanceId, 'issuanceId');
    const expiresAt = this.text(input.expiresAt, 'expiresAt');
    for (const reward of this.rewardPlans(input)) {
      const material = referralRewardPresentation(
        {
          tenantId,
          issuanceId,
          rewardId: this.text(reward.rewardId, 'rewardId'),
          recipientClientId: this.text(
            reward.recipientClientId,
            'recipientClientId',
          ),
          rewardSlot: this.rewardSlot(reward.slot),
          expiresAt,
        },
        {
          presentationKey: this.options.presentationKey,
          presentationKeyVersion: this.options.presentationKeyVersion,
          lookupKey: this.options.claimLookupKey,
        },
      );
      if (
        material.codeHash !== reward.codeHash ||
        material.presentationReference !== reward.presentationReference ||
        material.presentationKeyVersion !== reward.presentationKeyVersion
      ) {
        throw new P404ExecutionContractError(
          'Reward presentation contract changed after planning',
        );
      }
    }
  }

  private async assertFulfillmentFacts(
    tx: Prisma.TransactionClient | PrismaClient,
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const reward = await tx.referralReward.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.canonicalRewardId, 'canonicalRewardId'),
          tenantId,
        },
      },
      include: {
        issuance: { include: { referral: true } },
        recipient: { include: { crmLinks: true } },
        fulfillment: true,
      },
    });
    if (!reward) throw new P404ExecutionContractError('Reward is missing');
    if (
      reward.fulfillment &&
      reward.fulfillment.actionExecutionId !== executionId
    ) {
      throw new P404ExecutionContractError('Reward is already fulfilled');
    }
    const execution = await tx.actionExecution.findUnique({
      where: { id_tenantId: { id: executionId, tenantId } },
      include: { actorMembership: true },
    });
    if (!execution?.actorUserId || !execution.actorMembership) {
      throw new P404ExecutionContractError(
        'Fulfillment requires a canonical requester actor',
      );
    }
    const membership = execution.actorMembership;
    if (membership.status !== MembershipStatus.active) {
      throw new P404ExecutionContractError('Requester membership is inactive');
    }
    const authority = String(input.requesterAuthority);
    const expectedAuthority =
      reward.recipient.userId === execution.actorUserId
        ? 'reward_recipient'
        : membership.role === UserRole.tenant_owner ||
            membership.role === UserRole.administrator
          ? 'administrative_role'
          : null;
    if (!expectedAuthority || authority !== expectedAuthority) {
      throw new P404ExecutionContractError(
        'Requester authority is not server-derived',
      );
    }
    const requesterHash = this.hash([
      tenantId,
      execution.actorUserId,
      membership.id,
      String(membership.role),
      authority,
    ]);
    if (input.requesterIdentityHash !== requesterHash) {
      throw new P404ExecutionContractError('Requester identity changed');
    }
    const appointment = await tx.appointment.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.targetAppointmentId, 'targetAppointmentId'),
          tenantId,
        },
      },
    });
    const serviceIds = this.strings(
      appointment?.serviceIds,
      'serviceIds',
    ).sort();
    const providerVisitIdentity = this.providerVisitIdentity(
      appointment?.providerPayload,
    );
    if (
      !appointment ||
      appointment.mayaClientId !== reward.recipientClientId ||
      appointment.crmProvider !== input.provider ||
      appointment.crmExternalId !== input.providerRecordIdentity ||
      appointment.totalPriceKopecks !== input.eligibleAmountKopecks ||
      appointment.currency !== input.currency ||
      JSON.stringify(serviceIds) !==
        JSON.stringify(this.strings(input.serviceIds, 'serviceIds').sort()) ||
      (providerVisitIdentity ?? null) !==
        (input.providerVisitIdentity === null
          ? null
          : this.text(input.providerVisitIdentity, 'providerVisitIdentity'))
    ) {
      throw new P404ExecutionContractError(
        'Exact fulfillment target changed after planning',
      );
    }
    const denomination =
      reward.amountKopecks === null
        ? 'PERCENT_DISCOUNT'
        : 'FIXED_MONEY_DISCOUNT';
    const targetHash = this.hash([
      REFERRAL_REWARD_FULFILL_TARGET_CONTRACT,
      tenantId,
      reward.recipientClientId,
      appointment.id,
      appointment.crmProvider ?? '',
      appointment.crmExternalId ?? '',
      providerVisitIdentity ?? '',
      ...serviceIds,
      String(appointment.totalPriceKopecks),
      appointment.currency,
    ]);
    const rewardHash = this.hash([
      'p4-04.referral-reward.v1',
      tenantId,
      reward.id,
      reward.issuanceId,
      reward.recipientClientId,
      reward.rewardSlot,
      denomination,
      String(reward.amountKopecks ?? ''),
      String(reward.percentBasisPoints ?? ''),
      String(reward.liabilityCapKopecks),
      reward.liabilityCurrency ?? '',
      reward.presentationKeyVersion ?? '',
      reward.issuedAt.toISOString(),
      reward.expiresAt.toISOString(),
      reward.codeHash,
    ]);
    const issuanceHash = this.hash([
      'p4-04.referral-reward-issuance.v1',
      tenantId,
      reward.issuance.id,
      reward.issuance.referralId,
      reward.issuance.actionExecutionId ?? '',
      reward.issuance.policySnapshotHash,
    ]);
    const claimHash = this.hash([
      'p4-04.referral-reward-claim-binding.v1',
      tenantId,
      reward.id,
      reward.codeHash,
      REFERRAL_REWARD_CLAIM_LOOKUP_CONTRACT,
    ]);
    const recipientLink = reward.recipient.crmLinks.find(
      (link) => link.provider === input.provider && link.unlinkedAt === null,
    );
    const recipientHash = this.hash([
      tenantId,
      reward.recipientClientId,
      String(input.provider),
      recipientLink?.externalId ?? '',
    ]);
    if (
      input.rewardIdentityHash !== rewardHash ||
      input.issuanceIdentityHash !== issuanceHash ||
      input.claimBindingHash !== claimHash ||
      input.recipientIdentityHash !== recipientHash ||
      input.targetIdentityHash !== targetHash ||
      input.originatingReferralId !== reward.issuance.referralId ||
      input.recipientClientId !== reward.recipientClientId ||
      input.rewardSlot !== reward.rewardSlot ||
      input.denomination !== denomination ||
      input.amountKopecks !== reward.amountKopecks ||
      input.percentBasisPoints !== reward.percentBasisPoints ||
      input.liabilityCapKopecks !== reward.liabilityCapKopecks ||
      input.currency !== reward.liabilityCurrency ||
      input.issuedAt !== reward.issuedAt.toISOString() ||
      input.expiresAt !== reward.expiresAt.toISOString()
    ) {
      throw new P404ExecutionContractError(
        'Frozen reward or fulfillment evidence changed',
      );
    }
    if (reward.expiresAt <= this.now()) {
      throw new P404ExecutionContractError('Reward is expired');
    }
  }

  private async reconcileFact(
    context: { tenantId: string; executionId: string } | undefined,
    actionClass: P404ExecutableActionClass,
  ) {
    if (!context) return { outcome: 'STILL_UNKNOWN' as const };
    const value = await this.valueForExecution(
      context.tenantId,
      context.executionId,
      actionClass,
    );
    return value
      ? {
          outcome: 'PROVEN_SUCCEEDED' as const,
          safeResult: this.safe(value),
        }
      : { outcome: 'PROVEN_NOT_EXECUTED' as const };
  }

  private async valueForExecution(
    tenantId: string,
    executionId: string,
    actionClass: P404ExecutableActionClass,
  ): Promise<P404ExecutionValue | null> {
    if (actionClass === 'create_customer_referral') {
      const row = await this.prisma.customerReferral.findUnique({
        where: {
          createExecutionId_tenantId: {
            createExecutionId: executionId,
            tenantId,
          },
        },
      });
      return row ? this.referralValue(actionClass, executionId, row.id) : null;
    }
    if (actionClass === 'resolve_customer_referral') {
      const row = await this.prisma.customerReferral.findUnique({
        where: {
          resolutionExecutionId_tenantId: {
            resolutionExecutionId: executionId,
            tenantId,
          },
        },
      });
      return row ? this.referralValue(actionClass, executionId, row.id) : null;
    }
    if (actionClass === 'issue_referral_rewards') {
      const row = await this.prisma.referralRewardIssuance.findUnique({
        where: {
          actionExecutionId_tenantId: {
            actionExecutionId: executionId,
            tenantId,
          },
        },
        include: { rewards: true },
      });
      return row ? this.issuanceValue(executionId, row) : null;
    }
    const row = await this.prisma.referralRewardFulfillment.findUnique({
      where: {
        actionExecutionId_tenantId: {
          actionExecutionId: executionId,
          tenantId,
        },
      },
    });
    return row ? this.fulfillmentValue(executionId, row) : null;
  }

  private referralValue(
    actionClass: 'create_customer_referral' | 'resolve_customer_referral',
    executionId: string,
    referralId: string,
  ): P404ExecutionValue {
    return {
      actionClass,
      actionExecutionId: executionId,
      referralId,
      referralMutations: 1,
      rewardValueFacts: 0,
      providerWrites: 0,
      loyaltyPointMutations: 0,
    };
  }

  private issuanceValue(
    executionId: string,
    issuance: { id: string; rewards: readonly { id: string }[] },
  ): P404ExecutionValue {
    return {
      actionClass: 'issue_referral_rewards',
      actionExecutionId: executionId,
      issuanceId: issuance.id,
      rewardIds: issuance.rewards.map((reward) => reward.id).sort(),
      referralMutations: 0,
      rewardValueFacts: issuance.rewards.length,
      providerWrites: 0,
      loyaltyPointMutations: 0,
    };
  }

  private fulfillmentValue(
    executionId: string,
    fulfillment: {
      id: string;
      appliedAmountKopecks: number | null;
    },
  ): P404ExecutionValue {
    return {
      actionClass: 'fulfill_referral_reward',
      actionExecutionId: executionId,
      fulfillmentId: fulfillment.id,
      appliedAmountKopecks: fulfillment.appliedAmountKopecks ?? undefined,
      referralMutations: 0,
      rewardValueFacts: 1,
      providerWrites: 0,
      loyaltyPointMutations: 0,
    };
  }

  private rewardPlans(
    input: Record<string, unknown>,
  ): Record<string, unknown>[] {
    if (!Array.isArray(input.rewards)) {
      throw new P404ExecutionContractError('Rewards are missing');
    }
    return input.rewards.map((reward) => this.record(reward, 'reward'));
  }

  private providerVisitIdentity(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const candidate = value.visit_id ?? value.visitId;
    return typeof candidate === 'string' || typeof candidate === 'number'
      ? String(candidate)
      : null;
  }

  private restore(safeResult: Record<string, unknown>): P404ExecutionValue {
    return safeResult as unknown as P404ExecutionValue;
  }

  private safe(value: P404ExecutionValue): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private hash(parts: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('base64url');
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new P404ExecutionContractError(`${label} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 240) {
      throw new P404ExecutionContractError(`${label} is not canonical`);
    }
    return value;
  }

  private integer(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value)) {
      throw new P404ExecutionContractError(`${label} is not an integer`);
    }
    return Number(value);
  }

  private strings(value: unknown, label: string): string[] {
    if (!Array.isArray(value)) {
      throw new P404ExecutionContractError(`${label} must be an array`);
    }
    return value.map((item) => this.text(item, label));
  }

  private rewardSlot(value: unknown): 'inviter' | 'invitee' {
    if (value !== 'inviter' && value !== 'invitee') {
      throw new P404ExecutionContractError('reward slot is not canonical');
    }
    return value;
  }

  private errorClass(error: unknown): string {
    const name =
      error instanceof Error ? error.constructor.name : 'UnknownError';
    return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ? name : 'UnknownError';
  }
}
