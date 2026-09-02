import { randomUUID } from 'node:crypto';

import {
  ActionApprovalDecision,
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  ActionEngineKernel,
  CanonicalActionIngressService,
  P4_09_ACTION_CLASSES,
  type P409ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';

type Tx = Prisma.TransactionClient;

export class P409ValueConfigurationExecutionError extends Error {}

export interface P409ExecutionValue {
  actionClass: P409ActionClass;
  actionExecutionId: string;
  targetId: string;
  versionId: string;
  version: number;
  previousVersionId: string | null;
  configurationMutations: 1;
  customerValueMutations: 0;
  providerWrites: 0;
  unknownApplicable: false;
}

export class P409ValueConfigurationExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<P409ExecutionValue> {
    const execution = await this.canonicalExecution(request);
    if (
      !P4_09_ACTION_CLASSES.includes(execution.actionClass as P409ActionClass)
    ) {
      throw new P409ValueConfigurationExecutionError(
        'P4-09 action class is not registered',
      );
    }
    if (execution.state === ActionExecutionState.SUCCEEDED) {
      return this.restore(execution);
    }
    if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
      throw new P409ValueConfigurationExecutionError(
        'ACTION_APPROVAL_REQUIRED',
      );
    }
    if (execution.state !== ActionExecutionState.READY) {
      throw new P409ValueConfigurationExecutionError(
        `Execution cannot run from ${execution.state}`,
      );
    }

    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${execution.tenantId}:p4-09:${execution.targetRef}`}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "ActionExecution" WHERE id = ${execution.id} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED) {
        return this.restore(locked);
      }
      this.assertExecutable(locked);
      const input = await this.kernel.readTrustedNormalizedInput(
        locked.tenantId,
        locked.id,
      );
      await this.assertAuthority(tx, locked, input);
      const attemptId = await this.begin(tx, locked);
      const value =
        locked.actionClass === 'update_referral_reward_policy'
          ? await this.referral(tx, locked, input)
          : await this.offer(tx, locked, input);
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  private async offer(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ): Promise<P409ExecutionValue> {
    const offerId = this.text(input.offerId);
    const versionId = this.text(input.versionId);
    const previousVersionId = this.nullableText(input.previousVersionId);
    const version = this.integer(input.nextVersion);
    const action = execution.actionClass as P409ActionClass;
    const operation = action.startsWith('create_')
      ? 'create'
      : action.startsWith('delete_')
        ? 'delete'
        : 'update';
    const expectedKind = action.includes('membership')
      ? 'membership'
      : 'certificate';
    if (
      input.offerKind !== expectedKind ||
      execution.targetRef !== `tenant-catalog-item:${offerId}`
    ) {
      throw new P409ValueConfigurationExecutionError(
        'Offer execution target changed after approval',
      );
    }

    let offer = await tx.tenantCatalogItem.findUnique({
      where: { id_tenantId: { id: offerId, tenantId: execution.tenantId } },
      include: { currentValueVersion: true },
    });
    if (operation === 'create' && !offer) {
      await tx.tenantCatalogItem.create({
        data: {
          id: offerId,
          tenantId: execution.tenantId,
          kind: expectedKind,
          name: this.text(input.name),
          description: this.nullableText(input.description),
          priceKopecks: this.integer(input.priceKopecks),
          currency: this.text(input.currency),
          active: input.availabilityState === 'ACTIVE',
          source: 'canonical_action_engine',
          externalRef: this.nullableText(input.externalRef),
          canonicalTemplateKey: this.text(input.templateKey),
          supersedesOfferId: this.nullableText(input.supersedesOfferId),
        },
      });
    }
    offer = await tx.tenantCatalogItem.findUniqueOrThrow({
      where: { id_tenantId: { id: offerId, tenantId: execution.tenantId } },
      include: { currentValueVersion: true },
    });
    if (
      offer.kind !== expectedKind ||
      offer.canonicalTemplateKey !== input.templateKey ||
      offer.supersedesOfferId !== input.supersedesOfferId
    ) {
      throw new P409ValueConfigurationExecutionError(
        'Offer identity or replacement lineage is stale',
      );
    }
    if (offer.currentValueVersionId === versionId) {
      const current = offer.currentValueVersion;
      if (!current || current.actionExecutionId !== execution.id) {
        throw new P409ValueConfigurationExecutionError(
          'Offer version belongs to a conflicting execution',
        );
      }
      return this.value(execution, offerId, input);
    }
    if (
      offer.currentValueVersionId !== previousVersionId ||
      (operation === 'create' && previousVersionId !== null) ||
      (operation !== 'create' && previousVersionId === null)
    ) {
      throw new P409ValueConfigurationExecutionError(
        'Offer version predecessor changed after approval',
      );
    }

    await tx.tenantCatalogItemValueVersion.create({
      data: {
        id: versionId,
        tenantId: execution.tenantId,
        offerId,
        actionExecutionId: execution.id,
        previousVersionId,
        version,
        templateKey: this.text(input.templateKey),
        offerKind: expectedKind,
        priceKopecks: this.integer(input.priceKopecks),
        currency: this.text(input.currency),
        availabilityState: this.text(input.availabilityState),
        valueSnapshotHash: this.text(input.valueSnapshotHash),
      },
    });
    await tx.tenantCatalogItem.update({
      where: { id_tenantId: { id: offerId, tenantId: execution.tenantId } },
      data: {
        name: this.text(input.name),
        description: this.nullableText(input.description),
        priceKopecks: this.integer(input.priceKopecks),
        currency: this.text(input.currency),
        active: input.availabilityState === 'ACTIVE',
        externalRef: this.nullableText(input.externalRef),
        currentValueVersionId: versionId,
      },
    });
    await this.audit(
      tx,
      execution,
      'business_content.offer_version.created',
      offerId,
      {
        offer_kind: expectedKind,
        template_key: input.templateKey,
        version_id: versionId,
        version,
        previous_version_id: previousVersionId,
        availability_state: input.availabilityState,
        replacement_predecessor_id: input.supersedesOfferId,
        customer_value_mutations: 0,
      },
    );
    return this.value(execution, offerId, input);
  }

  private async referral(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ): Promise<P409ExecutionValue> {
    const programId = this.text(input.programId);
    const versionId = this.text(input.versionId);
    const previousVersionId = this.nullableText(input.previousVersionId);
    if (execution.targetRef !== `referral-program:${programId}`) {
      throw new P409ValueConfigurationExecutionError(
        'Referral program target changed after approval',
      );
    }
    await tx.referralProgram.upsert({
      where: { tenantId: execution.tenantId },
      update: {},
      create: { id: programId, tenantId: execution.tenantId },
    });
    const program = await tx.referralProgram.findUniqueOrThrow({
      where: { tenantId: execution.tenantId },
      include: { currentValueVersion: true },
    });
    if (program.id !== programId) {
      throw new P409ValueConfigurationExecutionError(
        'Referral program immutable identity conflicts',
      );
    }
    if (program.currentValueVersionId === versionId) {
      if (program.currentValueVersion?.actionExecutionId !== execution.id) {
        throw new P409ValueConfigurationExecutionError(
          'Referral version belongs to a conflicting execution',
        );
      }
      return this.value(execution, programId, input);
    }
    if (program.currentValueVersionId !== previousVersionId) {
      throw new P409ValueConfigurationExecutionError(
        'Referral policy predecessor changed after approval',
      );
    }
    await tx.referralProgramValueVersion.create({
      data: {
        id: versionId,
        tenantId: execution.tenantId,
        programId,
        actionExecutionId: execution.id,
        previousVersionId,
        version: this.integer(input.nextVersion),
        enabled: this.boolean(input.enabled),
        inviterRewardKopecks: this.nullableInteger(input.inviterRewardKopecks),
        inviteeRewardKopecks: this.nullableInteger(input.inviteeRewardKopecks),
        inviterRewardPercentBasisPoints: this.nullableInteger(
          input.inviterRewardPercentBasisPoints,
        ),
        inviteeRewardPercentBasisPoints: this.nullableInteger(
          input.inviteeRewardPercentBasisPoints,
        ),
        inviterRewardLiabilityCapKopecks: this.nullableInteger(
          input.inviterRewardLiabilityCapKopecks,
        ),
        inviteeRewardLiabilityCapKopecks: this.nullableInteger(
          input.inviteeRewardLiabilityCapKopecks,
        ),
        currency: this.text(input.currency),
        valueSnapshotHash: this.text(input.valueSnapshotHash),
      },
    });
    await tx.referralProgram.update({
      where: { tenantId: execution.tenantId },
      data: {
        enabled: this.boolean(input.enabled),
        inviterRewardKopecks: this.nullableInteger(input.inviterRewardKopecks),
        inviteeRewardKopecks: this.nullableInteger(input.inviteeRewardKopecks),
        inviterRewardPercentBasisPoints: this.nullableInteger(
          input.inviterRewardPercentBasisPoints,
        ),
        inviteeRewardPercentBasisPoints: this.nullableInteger(
          input.inviteeRewardPercentBasisPoints,
        ),
        inviterRewardLiabilityCapKopecks: this.nullableInteger(
          input.inviterRewardLiabilityCapKopecks,
        ),
        inviteeRewardLiabilityCapKopecks: this.nullableInteger(
          input.inviteeRewardLiabilityCapKopecks,
        ),
        currency: this.text(input.currency),
        terms: this.nullableText(input.terms),
        codePrefix: this.nullableText(input.codePrefix),
        currentValueVersionId: versionId,
      },
    });
    await this.audit(
      tx,
      execution,
      'business_content.referral_policy_version.created',
      programId,
      {
        version_id: versionId,
        version: input.nextVersion,
        previous_version_id: previousVersionId,
        customer_value_mutations: 0,
      },
    );
    return this.value(execution, programId, input);
  }

  private async assertAuthority(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (!execution.actorUserId || !execution.approvalDecidedByUserId) {
      throw new P409ValueConfigurationExecutionError(
        'Requester and owner approver are required',
      );
    }
    const [actor, approver] = await Promise.all([
      tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: execution.actorUserId,
            tenantId: execution.tenantId,
          },
        },
      }),
      tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: execution.approvalDecidedByUserId,
            tenantId: execution.tenantId,
          },
        },
      }),
    ]);
    if (
      !actor ||
      actor.status !== 'active' ||
      actor.id !== input.actorMembershipId ||
      actor.role !== input.actorRole
    ) {
      throw new P409ValueConfigurationExecutionError(
        'Requester authority changed after planning',
      );
    }
    if (
      !approver ||
      approver.status !== 'active' ||
      (approver.role !== 'tenant_owner' && approver.role !== 'business_owner')
    ) {
      throw new P409ValueConfigurationExecutionError(
        'Owner approval authority is absent',
      );
    }
  }

  private assertExecutable(execution: ActionExecution) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.approvalRequirement !== 'REQUIRED' ||
      execution.approvalDecision !== ActionApprovalDecision.APPROVED ||
      execution.dryRun ||
      !execution.capability.endsWith('.execute.v1')
    ) {
      throw new P409ValueConfigurationExecutionError(
        'Execution is not an approved canonical P4-09 action',
      );
    }
  }

  private async begin(tx: Tx, execution: ActionExecution): Promise<string> {
    const now = this.now();
    const attemptNumber = execution.executionAttemptCount + 1;
    const attemptId = randomUUID();
    await tx.actionAttempt.create({
      data: {
        id: attemptId,
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        attemptNumber,
        kind: ActionAttemptKind.EXECUTION,
        state: ActionAttemptState.STARTED,
        executorKey: 'business-content.canonical-value',
        executorVersion: 1,
        externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        providerRequestIdentityHash: null,
        reconciliationRequired: false,
        startedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.EXECUTING,
        executionAttemptCount: attemptNumber,
        firstAttemptedAt: execution.firstAttemptedAt ?? now,
        leaseOwner: `p4-09-local:${execution.id}`,
        leaseTokenHash: `p4-09-local:${execution.id}`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async finalize(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: P409ExecutionValue,
  ) {
    const now = this.now();
    const safeResult = value as unknown as Prisma.InputJsonValue;
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: safeResult,
        reconciliationRequired: false,
        finishedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: 'local_transaction_committed',
        safeResultSummaryJson: safeResult,
        finalizedAt: now,
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private value(
    execution: ActionExecution,
    targetId: string,
    input: Record<string, unknown>,
  ): P409ExecutionValue {
    return {
      actionClass: execution.actionClass as P409ActionClass,
      actionExecutionId: execution.id,
      targetId,
      versionId: this.text(input.versionId),
      version: this.integer(input.nextVersion),
      previousVersionId: this.nullableText(input.previousVersionId),
      configurationMutations: 1,
      customerValueMutations: 0,
      providerWrites: 0,
      unknownApplicable: false,
    };
  }

  private async audit(
    tx: Tx,
    execution: ActionExecution,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        scope: 'tenant',
        tenantId: execution.tenantId,
        userId: execution.actorUserId,
        action,
        entityType:
          execution.actionClass === 'update_referral_reward_policy'
            ? 'referral_program'
            : 'tenant_catalog_item',
        entityId,
        metadataJson: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private restore(execution: ActionExecution): P409ExecutionValue {
    const result = execution.safeResultSummaryJson;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new P409ValueConfigurationExecutionError(
        'Committed configuration result is unavailable',
      );
    }
    return result as unknown as P409ExecutionValue;
  }

  private async canonicalExecution(request: TrustedActionExecutionRequestV1) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.ingress.createExecution(request);
      } catch (error) {
        if (this.serializationFailure(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new P409ValueConfigurationExecutionError(
      'Canonical execution could not serialize',
    );
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (this.serializationFailure(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new P409ValueConfigurationExecutionError(
      'Configuration transaction could not serialize',
    );
  }

  private serializationFailure(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    const databaseCode =
      typeof error.meta?.code === 'string' ? error.meta.code : '';
    return (
      error.code === 'P2034' ||
      databaseCode === '40001' ||
      (error.code === 'P2010' &&
        /40001|serializ|write conflict/i.test(error.message))
    );
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new P409ValueConfigurationExecutionError(
        'Canonical configuration string is missing',
      );
    }
    return value;
  }

  private nullableText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return this.text(value);
  }

  private integer(value: unknown): number {
    if (!Number.isSafeInteger(value)) {
      throw new P409ValueConfigurationExecutionError(
        'Canonical configuration integer is missing',
      );
    }
    return Number(value);
  }

  private nullableInteger(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    return this.integer(value);
  }

  private boolean(value: unknown): boolean {
    if (typeof value !== 'boolean') {
      throw new P409ValueConfigurationExecutionError(
        'Canonical configuration boolean is missing',
      );
    }
    return value;
  }
}
