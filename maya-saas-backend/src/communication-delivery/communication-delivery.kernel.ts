import { randomBytes, randomUUID } from 'node:crypto';

import {
  ActionApprovalDecision,
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  CommunicationCampaignState,
  CommunicationDeliveryState,
  CommunicationScope,
  ExternalDispatchState,
  Prisma,
  type MarketingCampaign,
  type MarketingCampaignRecipient,
  type MarketingDeliveryAttempt,
  type PrismaClient,
} from '@prisma/client';

import { CommunicationCapabilityRegistry } from './communication-delivery.capabilities';
import {
  COMMUNICATION_ENVELOPE_CONTRACT,
  type CommunicationDispatchBoundaryV1,
  type CommunicationDeliveryClaimV1,
  type CommunicationDeliveryMetricsV1,
  type CommunicationReconciliationOutcome,
  type CommunicationRecipientV1,
  type CreateCommunicationEnvelopeV1,
  type OwnedCommunicationAttemptV1,
} from './communication-delivery.contract';
import {
  CommunicationClaimError,
  CommunicationConflictError,
  CommunicationContractError,
  CommunicationLeaseError,
} from './communication-delivery.errors';
import { CommunicationDeliveryIdentity } from './communication-delivery.identity';

const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const SAFE_HASH = /^[A-Za-z0-9_-]{16,256}$/;
const ACTION_STATES_ALLOWED_TO_DELIVER = new Set<ActionExecutionState>([
  ActionExecutionState.READY,
  ActionExecutionState.EXECUTING,
  ActionExecutionState.SUCCEEDED,
]);
const TERMINAL_CAMPAIGN_STATES = new Set<CommunicationCampaignState>([
  CommunicationCampaignState.COMPLETED,
  CommunicationCampaignState.PARTIAL,
  CommunicationCampaignState.FAILED,
  CommunicationCampaignState.SKIPPED,
  CommunicationCampaignState.CANCELLED,
  CommunicationCampaignState.EXPIRED,
]);

type TransactionClient = Prisma.TransactionClient;

interface AggregateProjection {
  state: CommunicationCampaignState;
  accepted: number;
  delivered: number;
  failed: number;
  skipped: number;
  unknown: number;
}

interface LockedAttempt {
  campaign: MarketingCampaign;
  recipient: MarketingCampaignRecipient;
  attempt: MarketingDeliveryAttempt;
}

interface ClaimedRecipientRow {
  id: string;
  campaignId: string;
}

function assertCode(value: string, label: string): string {
  if (!SAFE_CODE.test(value)) {
    throw new CommunicationContractError(
      'INVALID_STABLE_CODE',
      `${label} must be a stable opaque code`,
    );
  }
  return value;
}

function assertHash(value: string, label: string): string {
  if (!SAFE_HASH.test(value)) {
    throw new CommunicationContractError(
      'INVALID_HASH',
      `${label} must be a stable digest`,
    );
  }
  return value;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

function deliveryStatus(state: CommunicationDeliveryState): string {
  return state;
}

export function projectCommunicationAggregate(
  recipients: Array<
    Pick<
      MarketingCampaignRecipient,
      'deliveryState' | 'terminalAt' | 'terminalReasonCode' | 'attemptCount'
    >
  >,
): AggregateProjection {
  if (recipients.length === 0) {
    return {
      state: CommunicationCampaignState.DRAFT,
      accepted: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
      unknown: 0,
    };
  }

  const delivered = recipients.filter(
    (item) => item.deliveryState === CommunicationDeliveryState.DELIVERED,
  ).length;
  const accepted = recipients.filter(
    (item) =>
      item.deliveryState === CommunicationDeliveryState.ACCEPTED ||
      item.deliveryState === CommunicationDeliveryState.DELIVERED,
  ).length;
  const failed = recipients.filter(
    (item) => item.deliveryState === CommunicationDeliveryState.FAILED,
  ).length;
  const skippedRows = recipients.filter(
    (item) => item.deliveryState === CommunicationDeliveryState.SKIPPED,
  );
  const unknown = recipients.filter(
    (item) => item.deliveryState === CommunicationDeliveryState.UNKNOWN,
  ).length;
  const terminal = recipients.filter((item) => item.terminalAt !== null).length;
  let state: CommunicationCampaignState;
  if (unknown > 0) {
    state = CommunicationCampaignState.UNRESOLVED;
  } else if (terminal < recipients.length) {
    const allReady = recipients.every(
      (item) =>
        item.deliveryState === CommunicationDeliveryState.NOT_SENT &&
        item.attemptCount === 0,
    );
    state = allReady
      ? CommunicationCampaignState.READY
      : CommunicationCampaignState.RUNNING;
  } else if (accepted === recipients.length) {
    state = CommunicationCampaignState.COMPLETED;
  } else if (failed === recipients.length) {
    state = CommunicationCampaignState.FAILED;
  } else if (skippedRows.length === recipients.length) {
    const reasons = new Set(skippedRows.map((item) => item.terminalReasonCode));
    if (reasons.size === 1 && reasons.has('CAMPAIGN_CANCELLED')) {
      state = CommunicationCampaignState.CANCELLED;
    } else if (reasons.size === 1 && reasons.has('CAMPAIGN_EXPIRED')) {
      state = CommunicationCampaignState.EXPIRED;
    } else {
      state = CommunicationCampaignState.SKIPPED;
    }
  } else {
    state = CommunicationCampaignState.PARTIAL;
  }

  return {
    state,
    accepted,
    delivered,
    failed,
    skipped: skippedRows.length,
    unknown,
  };
}

export interface CommunicationDeliveryKernelOptions {
  identitySecret: string;
  payloadEncryptionSecret: string;
  now?: () => Date;
  executionLeaseMs?: number;
  reconciliationLeaseMs?: number;
}

export class CommunicationDeliveryKernel {
  private readonly identity: CommunicationDeliveryIdentity;
  private readonly registry: CommunicationCapabilityRegistry;
  private readonly now: () => Date;
  private readonly executionLeaseMs: number;
  private readonly reconciliationLeaseMs: number;
  private duplicateDeliveriesCollapsed = 0;

  constructor(
    private readonly prisma: PrismaClient,
    options: CommunicationDeliveryKernelOptions,
    registry = new CommunicationCapabilityRegistry(),
  ) {
    this.identity = new CommunicationDeliveryIdentity(
      options.identitySecret,
      options.payloadEncryptionSecret,
    );
    this.registry = registry;
    this.now = options.now ?? (() => new Date());
    this.executionLeaseMs = options.executionLeaseMs ?? 30_000;
    this.reconciliationLeaseMs = options.reconciliationLeaseMs ?? 30_000;
  }

  async createEnvelope(
    input: CreateCommunicationEnvelopeV1,
  ): Promise<MarketingCampaign & { recipients: MarketingCampaignRecipient[] }> {
    const normalized = this.normalizeEnvelope(input);
    const now = this.now();

    for (let databaseAttempt = 0; databaseAttempt < 3; databaseAttempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const execution = await tx.actionExecution.findUnique({
              where: {
                id_tenantId: {
                  id: input.actionExecutionId,
                  tenantId: input.tenantId,
                },
              },
            });
            if (!execution) {
              throw new CommunicationContractError(
                'ACTION_EXECUTION_NOT_FOUND',
                'Tenant-scoped ActionExecution does not exist',
              );
            }
            this.assertExecutionAllowsDelivery(execution);

            const campaignIdentity = this.identity.campaignIdentity({
              tenantId: input.tenantId,
              actionIdentityFingerprint: execution.identityFingerprint,
              callerKey: normalized.campaignIdempotencyKey,
              scope: input.scope,
              channel: normalized.channel,
              contentIdentityHash: normalized.contentIdentityHash,
            });
            const duplicate = await tx.marketingCampaign.findFirst({
              where: {
                tenantId: input.tenantId,
                OR: [
                  { actionExecutionId: execution.id },
                  { idempotencyKey: campaignIdentity },
                ],
              },
              include: { recipients: true },
            });
            if (duplicate) {
              if (duplicate.idempotencyKey !== campaignIdentity) {
                throw new CommunicationConflictError(
                  'ACTION_EXECUTION_ENVELOPE_CONFLICT',
                  'ActionExecution is already linked to another communication envelope',
                );
              }
              this.duplicateDeliveriesCollapsed += normalized.recipients.length;
              return duplicate;
            }

            if (input.scope === 'BULK') {
              const audience = await tx.marketingAudience.findUnique({
                where: {
                  id_tenantId: {
                    id: normalized.audienceId!,
                    tenantId: input.tenantId,
                  },
                },
              });
              if (!audience) {
                throw new CommunicationContractError(
                  'AUDIENCE_NOT_FOUND',
                  'Tenant-scoped audience does not exist',
                );
              }
              if (audience.snapshotHash !== normalized.audienceSnapshotHash) {
                throw new CommunicationConflictError(
                  'AUDIENCE_SNAPSHOT_MISMATCH',
                  'Communication envelope does not match the immutable audience snapshot',
                );
              }
            }

            const capability = this.registry.get(input.capabilityKey);
            const payloadRetentionUntil = new Date(
              now.getTime() + capability.payloadRetentionMs,
            );
            const auditRetentionUntil = new Date(
              now.getTime() + capability.auditRetentionMs,
            );
            const campaignId = randomUUID();
            const recipientRows = normalized.recipients.map((recipient) => {
              const recipientRefHash = this.identity.hashOpaqueRef(
                input.tenantId,
                recipient.recipientKind,
                recipient.recipientRef,
              );
              const idempotencyKey = this.identity.deliveryIdentity({
                identityVersion: 1,
                tenantId: input.tenantId,
                actionIdentityFingerprint: execution.identityFingerprint,
                campaignIdempotencyKey: campaignIdentity,
                recipientKind: recipient.recipientKind,
                recipientRefHash,
                channel: normalized.channel,
                contentIdentityHash: normalized.contentIdentityHash,
              });
              const skipped = recipient.eligibility.decision !== 'ALLOW';
              return {
                id: randomUUID(),
                tenantId: input.tenantId,
                campaignId,
                externalClientId: recipientRefHash,
                internalUserId: recipient.internalUserId,
                idempotencyKey,
                status: deliveryStatus(
                  skipped
                    ? CommunicationDeliveryState.SKIPPED
                    : CommunicationDeliveryState.NOT_SENT,
                ),
                updatedAt: now,
                lifecycleVersion: 1,
                identityVersion: 1,
                recipientKind: recipient.recipientKind,
                recipientRefHash,
                contentIdentityHash: normalized.contentIdentityHash,
                deliveryState: skipped
                  ? CommunicationDeliveryState.SKIPPED
                  : CommunicationDeliveryState.NOT_SENT,
                externalDispatchState: ExternalDispatchState.NOT_CROSSED,
                reconciliationState: ActionReconciliationState.NOT_REQUIRED,
                eligibilityBasis: recipient.eligibility.basis,
                eligibilityDecision: recipient.eligibility.decision,
                eligibilityPolicyVersion: recipient.eligibility.policyVersion,
                eligibilityEvidenceRef: recipient.eligibility.evidenceRef,
                eligibilityEvidenceHash: recipient.eligibility.evidenceHash,
                eligibilityCheckedAt: recipient.eligibility.checkedAt,
                consentEvidenceId: recipient.consentEvidenceId,
                terminalAt: skipped ? now : null,
                terminalReasonCode: skipped
                  ? (recipient.eligibility.reasonCode ??
                    `ELIGIBILITY_${recipient.eligibility.decision}`)
                  : null,
                payloadRetentionUntil,
                auditRetentionUntil,
              } satisfies Prisma.MarketingCampaignRecipientCreateManyInput;
            });
            const initialAggregate = projectCommunicationAggregate(
              recipientRows.map((row) => ({
                deliveryState: row.deliveryState,
                terminalAt: row.terminalAt,
                terminalReasonCode: row.terminalReasonCode,
                attemptCount: 0,
              })),
            );

            await tx.marketingCampaign.create({
              data: {
                id: campaignId,
                tenantId: input.tenantId,
                createdByUserId: input.createdByUserId,
                confirmedByUserId: input.confirmedByUserId,
                audienceId: normalized.audienceId,
                channel: normalized.channel,
                status: initialAggregate.state,
                message: '',
                recipientUserIdsJson: [],
                recipientCount: recipientRows.length,
                sentCount: 0,
                idempotencyKey: campaignIdentity,
                expiresAt: input.expiresAt,
                provider: capability.key,
                audienceSnapshotHash: normalized.audienceSnapshotHash ?? '',
                messageSnapshotHash: normalized.contentIdentityHash,
                queuedAt: now,
                acceptedCount: initialAggregate.accepted,
                failedCount: initialAggregate.failed,
                skippedCount: initialAggregate.skipped,
                unknownCount: initialAggregate.unknown,
                lifecycleVersion: 1,
                scope:
                  input.scope === 'SINGLE'
                    ? CommunicationScope.SINGLE
                    : CommunicationScope.BULK,
                actionExecutionId: execution.id,
                aggregateState: initialAggregate.state,
                contentRef: normalized.contentRef,
                deliveryCapabilityKey: capability.key,
                deliveryCapabilityVersion: capability.version,
                retryPolicyKey: capability.retry.key,
                retryPolicyVersion: capability.retry.version,
                reconciliationPolicyKey: capability.reconciliation.key,
                reconciliationPolicyVersion: capability.reconciliation.version,
                payloadRetentionUntil,
                auditRetentionUntil,
              },
            });
            await tx.marketingCampaignRecipient.createMany({
              data: recipientRows,
            });
            return tx.marketingCampaign.findUniqueOrThrow({
              where: {
                id_tenantId: { id: campaignId, tenantId: input.tenantId },
              },
              include: { recipients: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isSerializationConflict(error) && databaseAttempt < 2) continue;
        if (isUniqueConflict(error)) {
          const execution = await this.prisma.actionExecution.findUnique({
            where: {
              id_tenantId: {
                id: input.actionExecutionId,
                tenantId: input.tenantId,
              },
            },
          });
          if (execution) {
            const identity = this.identity.campaignIdentity({
              tenantId: input.tenantId,
              actionIdentityFingerprint: execution.identityFingerprint,
              callerKey: normalized.campaignIdempotencyKey,
              scope: input.scope,
              channel: normalized.channel,
              contentIdentityHash: normalized.contentIdentityHash,
            });
            const existing = await this.prisma.marketingCampaign.findFirst({
              where: { tenantId: input.tenantId, idempotencyKey: identity },
              include: { recipients: true },
            });
            if (existing) {
              this.duplicateDeliveriesCollapsed += normalized.recipients.length;
              return existing;
            }
          }
        }
        throw error;
      }
    }
    throw new CommunicationConflictError(
      'SERIALIZATION_RETRY_EXHAUSTED',
      'Could not serialize communication envelope creation',
    );
  }

  async claimNext(input: {
    tenantId: string;
    workerId: string;
    campaignId?: string;
  }): Promise<CommunicationDeliveryClaimV1 | null> {
    const now = this.now();
    const workerId = assertCode(input.workerId, 'workerId');
    return this.prisma.$transaction(async (tx) => {
      const campaignFilter = input.campaignId
        ? Prisma.sql`AND r."campaignId" = ${input.campaignId}`
        : Prisma.empty;
      const rows = await tx.$queryRaw<ClaimedRecipientRow[]>(Prisma.sql`
        SELECT r."id", r."campaignId"
        FROM "MarketingCampaignRecipient" r
        INNER JOIN "MarketingCampaign" c
          ON c."id" = r."campaignId" AND c."tenantId" = r."tenantId"
        INNER JOIN "ActionExecution" e
          ON e."id" = c."actionExecutionId" AND e."tenantId" = c."tenantId"
        WHERE r."tenantId" = ${input.tenantId}
          ${campaignFilter}
          AND r."lifecycleVersion" = 1
          AND r."deliveryState" = 'NOT_SENT'
          AND r."externalDispatchState" = 'NOT_CROSSED'
          AND r."reconciliationState" IN ('NOT_REQUIRED', 'RESOLVED')
          AND r."terminalAt" IS NULL
          AND r."eligibilityDecision" = 'ALLOW'
          AND (r."nextAttemptAt" IS NULL OR r."nextAttemptAt" <= ${now})
          AND (r."leaseExpiresAt" IS NULL OR r."leaseExpiresAt" < ${now})
          AND c."lifecycleVersion" = 1
          AND c."expiresAt" > ${now}
          AND c."aggregateState" IN ('READY', 'RUNNING')
          AND e."dryRun" = false
          AND e."policyDecision" = 'ALLOW'
          AND e."approvalDecision" IN ('NOT_REQUIRED', 'APPROVED')
          AND e."state" IN ('READY', 'EXECUTING', 'SUCCEEDED')
        ORDER BY r."createdAt" ASC, r."id" ASC
        FOR UPDATE OF r SKIP LOCKED
        LIMIT 1
      `);
      const candidate = rows[0];
      if (!candidate) return null;

      const campaign = await tx.marketingCampaign.findUniqueOrThrow({
        where: {
          id_tenantId: {
            id: candidate.campaignId,
            tenantId: input.tenantId,
          },
        },
      });
      const recipient = await tx.marketingCampaignRecipient.findUniqueOrThrow({
        where: {
          id_tenantId_campaignId: {
            id: candidate.id,
            tenantId: input.tenantId,
            campaignId: candidate.campaignId,
          },
        },
      });
      const capability = this.capabilityFor(campaign);
      const attemptNumber = await this.nextAttemptNumber(tx, recipient);
      const leaseToken = randomBytes(32).toString('base64url');
      const leaseTokenHash = this.identity.leaseTokenHash({
        tenantId: input.tenantId,
        recipientId: recipient.id,
        leaseToken,
      });
      const providerRequestIdentityHash = this.identity.providerRequestIdentity(
        {
          tenantId: input.tenantId,
          deliveryIdentity: recipient.idempotencyKey,
          capabilityKey: capability.key,
          capabilityVersion: capability.version,
        },
      );
      const attempt = await tx.marketingDeliveryAttempt.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          campaignId: campaign.id,
          recipientId: recipient.id,
          batchKey: this.identity.safeHash('maya.communication-batch/1', {
            tenantId: input.tenantId,
            campaignId: campaign.id,
          }),
          attemptNumber,
          status: ActionAttemptState.STARTED,
          lifecycleVersion: 1,
          kind: ActionAttemptKind.EXECUTION,
          state: ActionAttemptState.STARTED,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
          providerRequestIdentityHash,
          providerIdempotencyKeyHash: capability.providerIdempotencySupported
            ? providerRequestIdentityHash
            : null,
          reconciliationRequired: false,
          payloadRetentionUntil: campaign.payloadRetentionUntil,
        },
      });
      const claimResult = await tx.marketingCampaignRecipient.updateMany({
        where: {
          id: recipient.id,
          tenantId: input.tenantId,
          campaignId: campaign.id,
          lifecycleVersion: 1,
          revision: recipient.revision,
          deliveryState: CommunicationDeliveryState.NOT_SENT,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
          terminalAt: null,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        data: {
          attemptCount: { increment: 1 },
          leaseOwner: workerId,
          leaseTokenHash,
          leaseExpiresAt: new Date(now.getTime() + this.executionLeaseMs),
          nextAttemptAt: null,
          updatedAt: now,
          revision: { increment: 1 },
        },
      });
      if (claimResult.count !== 1) {
        throw new CommunicationClaimError(
          'RECIPIENT_CLAIM_LOST',
          'Recipient changed before the lease could be committed',
        );
      }
      const claimed = await tx.marketingCampaignRecipient.findUniqueOrThrow({
        where: {
          id_tenantId_campaignId: {
            id: recipient.id,
            tenantId: input.tenantId,
            campaignId: campaign.id,
          },
        },
      });
      await tx.marketingCampaign.update({
        where: {
          id_tenantId: { id: campaign.id, tenantId: input.tenantId },
        },
        data: {
          aggregateState: CommunicationCampaignState.RUNNING,
          status: CommunicationCampaignState.RUNNING,
          startedAt: campaign.startedAt ?? now,
          revision: { increment: 1 },
        },
      });
      return { campaign, recipient: claimed, attempt, leaseToken };
    });
  }

  async markDispatchBoundary(
    input: OwnedCommunicationAttemptV1,
  ): Promise<CommunicationDispatchBoundaryV1> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockOwnedAttempt(tx, input);
      if (
        locked.attempt.kind !== ActionAttemptKind.EXECUTION ||
        locked.attempt.externalDispatchState !==
          ExternalDispatchState.NOT_CROSSED
      ) {
        throw new CommunicationClaimError(
          'DISPATCH_BOUNDARY_INVALID',
          'Only an open pre-dispatch execution attempt may cross the boundary',
        );
      }
      const recipient = await this.updateOwnedRecipient(tx, input, {
        externalDispatchState: ExternalDispatchState.MAY_HAVE_CROSSED,
        dispatchedAt: now,
        updatedAt: now,
        revision: { increment: 1 },
      });
      const attempt = await this.updateOwnedAttempt(tx, input, {
        externalDispatchState: ExternalDispatchState.MAY_HAVE_CROSSED,
        dispatchedAt: now,
      });
      return { recipient, attempt };
    });
  }

  async finalizeAccepted(
    input: OwnedCommunicationAttemptV1 & {
      outcomeCode: string;
      providerReference?: string;
    },
  ): Promise<MarketingCampaignRecipient> {
    return this.finalizeKnownSuccess(
      input,
      CommunicationDeliveryState.ACCEPTED,
    );
  }

  async finalizeDelivered(
    input: OwnedCommunicationAttemptV1 & {
      outcomeCode: string;
      providerReference?: string;
    },
  ): Promise<MarketingCampaignRecipient> {
    return this.finalizeKnownSuccess(
      input,
      CommunicationDeliveryState.DELIVERED,
    );
  }

  async finalizeDeterministicReject(
    input: OwnedCommunicationAttemptV1 & {
      outcomeCode: string;
      errorCode: string;
    },
  ): Promise<MarketingCampaignRecipient> {
    const now = this.now();
    assertCode(input.outcomeCode, 'outcomeCode');
    assertCode(input.errorCode, 'errorCode');
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockOwnedAttempt(tx, input);
      this.assertExecutionAttempt(locked.attempt);
      if (
        locked.attempt.externalDispatchState !==
        ExternalDispatchState.MAY_HAVE_CROSSED
      ) {
        throw new CommunicationClaimError(
          'REJECT_WITHOUT_DISPATCH',
          'A provider rejection requires a crossed dispatch boundary',
        );
      }
      await this.updateOwnedAttempt(tx, input, {
        status: ActionAttemptState.FAILED,
        state: ActionAttemptState.FAILED,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
        errorCode: input.errorCode,
        outcomeCode: input.outcomeCode,
        retryDecisionCode: 'DETERMINISTIC_REJECT_NO_RETRY',
        reconciliationRequired: false,
        responseReceivedAt: now,
        completedAt: now,
      });
      const recipient = await this.updateOwnedRecipient(tx, input, {
        status: deliveryStatus(CommunicationDeliveryState.FAILED),
        deliveryState: CommunicationDeliveryState.FAILED,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
        reconciliationState: ActionReconciliationState.NOT_REQUIRED,
        failedAt: now,
        responseReceivedAt: now,
        terminalAt: now,
        terminalReasonCode: input.errorCode,
        providerStatus: input.outcomeCode,
        lastErrorCode: input.errorCode,
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        updatedAt: now,
        revision: { increment: 1 },
      });
      await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
      return recipient;
    });
  }

  async finalizePreDispatchFailure(
    input: OwnedCommunicationAttemptV1 & {
      outcomeCode: string;
      errorCode: string;
    },
  ): Promise<MarketingCampaignRecipient> {
    const now = this.now();
    assertCode(input.outcomeCode, 'outcomeCode');
    assertCode(input.errorCode, 'errorCode');
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockOwnedAttempt(tx, input);
      this.assertExecutionAttempt(locked.attempt);
      if (
        locked.attempt.externalDispatchState !==
        ExternalDispatchState.NOT_CROSSED
      ) {
        throw new CommunicationClaimError(
          'PRE_DISPATCH_FAILURE_AFTER_BOUNDARY',
          'A crossed dispatch may not be downgraded to a safe failure',
        );
      }
      const capability = this.capabilityFor(locked.campaign);
      const executionAttempts = await tx.marketingDeliveryAttempt.count({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          recipientId: input.recipientId,
          lifecycleVersion: 1,
          kind: ActionAttemptKind.EXECUTION,
        },
      });
      const retryAllowed =
        capability.retry.retryablePreDispatchErrors.has(input.errorCode) &&
        executionAttempts < capability.retry.maxExecutionAttempts &&
        locked.campaign.expiresAt > now;
      const backoff = retryAllowed
        ? (capability.retry.backoffMs[executionAttempts - 1] ?? 0)
        : 0;
      await this.updateOwnedAttempt(tx, input, {
        status: ActionAttemptState.FAILED,
        state: ActionAttemptState.FAILED,
        errorCode: input.errorCode,
        outcomeCode: input.outcomeCode,
        retryDecisionCode: retryAllowed
          ? 'SAFE_PRE_DISPATCH_RETRY'
          : 'TERMINAL_NO_RETRY',
        reconciliationRequired: false,
        completedAt: now,
      });
      const recipient = await this.updateOwnedRecipient(
        tx,
        input,
        retryAllowed
          ? {
              status: deliveryStatus(CommunicationDeliveryState.NOT_SENT),
              deliveryState: CommunicationDeliveryState.NOT_SENT,
              externalDispatchState: ExternalDispatchState.NOT_CROSSED,
              reconciliationState: ActionReconciliationState.NOT_REQUIRED,
              lastErrorCode: input.errorCode,
              nextAttemptAt: new Date(now.getTime() + backoff),
              leaseOwner: null,
              leaseTokenHash: null,
              leaseExpiresAt: null,
              updatedAt: now,
              revision: { increment: 1 },
            }
          : {
              status: deliveryStatus(CommunicationDeliveryState.FAILED),
              deliveryState: CommunicationDeliveryState.FAILED,
              externalDispatchState: ExternalDispatchState.NOT_CROSSED,
              reconciliationState: ActionReconciliationState.NOT_REQUIRED,
              failedAt: now,
              terminalAt: now,
              terminalReasonCode: input.errorCode,
              lastErrorCode: input.errorCode,
              nextAttemptAt: null,
              leaseOwner: null,
              leaseTokenHash: null,
              leaseExpiresAt: null,
              updatedAt: now,
              revision: { increment: 1 },
            },
      );
      await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
      return recipient;
    });
  }

  async finalizeUnknown(
    input: OwnedCommunicationAttemptV1 & {
      outcomeCode: string;
      errorCode: string;
    },
  ): Promise<MarketingCampaignRecipient> {
    const now = this.now();
    assertCode(input.outcomeCode, 'outcomeCode');
    assertCode(input.errorCode, 'errorCode');
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockOwnedAttempt(tx, input);
      this.assertExecutionAttempt(locked.attempt);
      if (
        locked.attempt.externalDispatchState !==
        ExternalDispatchState.MAY_HAVE_CROSSED
      ) {
        throw new CommunicationClaimError(
          'UNKNOWN_WITHOUT_DISPATCH_BOUNDARY',
          'UNKNOWN requires a durable may-have-crossed marker',
        );
      }
      const capability = this.capabilityFor(locked.campaign);
      const reconciliationState = capability.reconciliationSupported
        ? ActionReconciliationState.REQUIRED
        : ActionReconciliationState.MANUAL_REQUIRED;
      await this.updateOwnedAttempt(tx, input, {
        status: ActionAttemptState.UNKNOWN,
        state: ActionAttemptState.UNKNOWN,
        outcomeCode: input.outcomeCode,
        errorCode: input.errorCode,
        retryDecisionCode: 'RECONCILIATION_REQUIRED_NO_BLIND_RETRY',
        reconciliationRequired: true,
        completedAt: now,
      });
      const recipient = await this.updateOwnedRecipient(tx, input, {
        status: deliveryStatus(CommunicationDeliveryState.UNKNOWN),
        deliveryState: CommunicationDeliveryState.UNKNOWN,
        externalDispatchState: ExternalDispatchState.MAY_HAVE_CROSSED,
        reconciliationState,
        unknownAt: now,
        lastErrorCode: input.errorCode,
        nextAttemptAt: null,
        terminalAt: null,
        terminalReasonCode: null,
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: now,
        revision: { increment: 1 },
      });
      await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
      return recipient;
    });
  }

  async claimReconciliation(input: {
    tenantId: string;
    campaignId: string;
    recipientId: string;
    workerId: string;
  }): Promise<CommunicationDeliveryClaimV1> {
    const now = this.now();
    const workerId = assertCode(input.workerId, 'workerId');
    return this.prisma.$transaction(async (tx) => {
      const recipient = await this.lockRecipient(
        tx,
        input.tenantId,
        input.campaignId,
        input.recipientId,
      );
      if (
        !new Set<CommunicationDeliveryState>([
          CommunicationDeliveryState.UNKNOWN,
          CommunicationDeliveryState.ACCEPTED,
        ]).has(recipient.deliveryState!) ||
        recipient.reconciliationState !== ActionReconciliationState.REQUIRED
      ) {
        throw new CommunicationClaimError(
          'RECONCILIATION_NOT_REQUIRED',
          'Recipient is not eligible for reconciliation',
        );
      }
      if (recipient.leaseExpiresAt && recipient.leaseExpiresAt >= now) {
        throw new CommunicationClaimError(
          'RECIPIENT_ALREADY_CLAIMED',
          'Recipient reconciliation is already claimed',
        );
      }
      const campaign = await tx.marketingCampaign.findUniqueOrThrow({
        where: {
          id_tenantId: {
            id: input.campaignId,
            tenantId: input.tenantId,
          },
        },
      });
      const capability = this.capabilityFor(campaign);
      if (!capability.reconciliationSupported) {
        throw new CommunicationClaimError(
          'PROVIDER_RECONCILIATION_UNSUPPORTED',
          'Provider capability requires manual resolution',
        );
      }
      const attemptNumber = await this.nextAttemptNumber(tx, recipient);
      const leaseToken = randomBytes(32).toString('base64url');
      const leaseTokenHash = this.identity.leaseTokenHash({
        tenantId: input.tenantId,
        recipientId: recipient.id,
        leaseToken,
      });
      const attempt = await tx.marketingDeliveryAttempt.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          recipientId: input.recipientId,
          batchKey: this.identity.safeHash(
            'maya.communication-reconciliation-batch/1',
            { tenantId: input.tenantId, campaignId: input.campaignId },
          ),
          attemptNumber,
          status: ActionAttemptState.STARTED,
          lifecycleVersion: 1,
          kind: ActionAttemptKind.RECONCILIATION,
          state: ActionAttemptState.STARTED,
          externalDispatchState: ExternalDispatchState.NOT_APPLICABLE,
          reconciliationRequired: true,
          payloadRetentionUntil: campaign.payloadRetentionUntil,
        },
      });
      const claimResult = await tx.marketingCampaignRecipient.updateMany({
        where: {
          id: recipient.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          lifecycleVersion: 1,
          revision: recipient.revision,
          reconciliationState: ActionReconciliationState.REQUIRED,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        data: {
          attemptCount: { increment: 1 },
          reconciliationState: ActionReconciliationState.IN_PROGRESS,
          leaseOwner: workerId,
          leaseTokenHash,
          leaseExpiresAt: new Date(now.getTime() + this.reconciliationLeaseMs),
          updatedAt: now,
          revision: { increment: 1 },
        },
      });
      if (claimResult.count !== 1) {
        throw new CommunicationClaimError(
          'RECONCILIATION_CLAIM_LOST',
          'Recipient changed before the reconciliation lease could be committed',
        );
      }
      const claimed = await tx.marketingCampaignRecipient.findUniqueOrThrow({
        where: {
          id_tenantId_campaignId: {
            id: recipient.id,
            tenantId: input.tenantId,
            campaignId: input.campaignId,
          },
        },
      });
      return { campaign, recipient: claimed, attempt, leaseToken };
    });
  }

  async finalizeReconciliation(
    input: OwnedCommunicationAttemptV1 & {
      outcome: CommunicationReconciliationOutcome;
      providerReference?: string;
      outcomeCode?: string;
    },
  ): Promise<MarketingCampaignRecipient> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockOwnedAttempt(tx, input);
      if (
        locked.attempt.kind !== ActionAttemptKind.RECONCILIATION ||
        locked.attempt.externalDispatchState !==
          ExternalDispatchState.NOT_APPLICABLE
      ) {
        throw new CommunicationClaimError(
          'RECONCILIATION_ATTEMPT_REQUIRED',
          'An owned reconciliation attempt is required',
        );
      }
      const capability = this.capabilityFor(locked.campaign);
      const providerFields = this.providerReferenceFields(
        capability.providerReferenceReturned,
        input.providerReference,
      );
      const outcomeCode = input.outcomeCode
        ? assertCode(input.outcomeCode, 'outcomeCode')
        : input.outcome;

      if (input.outcome === 'STILL_UNKNOWN') {
        const reconciliationCount = await tx.marketingDeliveryAttempt.count({
          where: {
            tenantId: input.tenantId,
            campaignId: input.campaignId,
            recipientId: input.recipientId,
            lifecycleVersion: 1,
            kind: ActionAttemptKind.RECONCILIATION,
          },
        });
        const manual =
          reconciliationCount >=
          capability.reconciliation.maxInconclusiveAttempts;
        await this.updateOwnedAttempt(tx, input, {
          status: ActionAttemptState.SUCCEEDED,
          state: ActionAttemptState.SUCCEEDED,
          outcomeCode,
          retryDecisionCode: manual
            ? 'MANUAL_REVIEW_REQUIRED'
            : 'RECONCILIATION_REQUIRED',
          reconciliationRequired: true,
          completedAt: now,
          ...providerFields,
        });
        const recipient = await this.updateOwnedRecipient(tx, input, {
          status: deliveryStatus(CommunicationDeliveryState.UNKNOWN),
          deliveryState: CommunicationDeliveryState.UNKNOWN,
          externalDispatchState: ExternalDispatchState.MAY_HAVE_CROSSED,
          reconciliationState: manual
            ? ActionReconciliationState.MANUAL_REQUIRED
            : ActionReconciliationState.REQUIRED,
          unknownAt: locked.recipient.unknownAt ?? now,
          nextAttemptAt: null,
          terminalAt: null,
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          updatedAt: now,
          revision: { increment: 1 },
        });
        await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
        return recipient;
      }

      if (
        input.outcome === 'PROVEN_NOT_SENT' &&
        !capability.proofOfNonDeliverySupported
      ) {
        throw new CommunicationClaimError(
          'PROOF_OF_NON_DELIVERY_UNSUPPORTED',
          'Provider cannot prove that dispatch did not happen',
        );
      }

      const executionAttempts = await tx.marketingDeliveryAttempt.count({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          recipientId: input.recipientId,
          lifecycleVersion: 1,
          kind: ActionAttemptKind.EXECUTION,
        },
      });
      const canRetryProvenNotSent =
        input.outcome === 'PROVEN_NOT_SENT' &&
        executionAttempts < capability.retry.maxExecutionAttempts &&
        locked.campaign.expiresAt > now;
      const delivered = input.outcome === 'PROVEN_DELIVERED';
      const accepted = input.outcome === 'PROVEN_ACCEPTED';
      const failed = input.outcome === 'PROVEN_FAILED';
      const terminalAccepted = accepted && capability.acceptedIsTerminal;
      let deliveryState: CommunicationDeliveryState;
      if (delivered) {
        deliveryState = CommunicationDeliveryState.DELIVERED;
      } else if (accepted) {
        deliveryState = CommunicationDeliveryState.ACCEPTED;
      } else if (failed) {
        deliveryState = CommunicationDeliveryState.FAILED;
      } else if (canRetryProvenNotSent) {
        deliveryState = CommunicationDeliveryState.NOT_SENT;
      } else {
        deliveryState = CommunicationDeliveryState.FAILED;
      }
      const terminalProvenNotSent =
        input.outcome === 'PROVEN_NOT_SENT' && !canRetryProvenNotSent;
      const terminal =
        delivered || failed || terminalAccepted || terminalProvenNotSent;
      const reconciliationState =
        accepted && !terminalAccepted
          ? ActionReconciliationState.REQUIRED
          : ActionReconciliationState.RESOLVED;

      await this.updateOwnedAttempt(tx, input, {
        status: ActionAttemptState.SUCCEEDED,
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode,
        retryDecisionCode: canRetryProvenNotSent
          ? 'PROVEN_NOT_SENT_SAFE_RETRY'
          : 'RECONCILIATION_RESOLVED',
        reconciliationRequired: accepted && !terminalAccepted,
        responseReceivedAt: now,
        completedAt: now,
        ...providerFields,
      });
      const recipient = await this.updateOwnedRecipient(tx, input, {
        status: deliveryStatus(deliveryState),
        deliveryState,
        externalDispatchState: canRetryProvenNotSent
          ? ExternalDispatchState.NOT_CROSSED
          : ExternalDispatchState.ACKNOWLEDGED,
        reconciliationState,
        acceptedAt: accepted ? now : locked.recipient.acceptedAt,
        deliveredAt: delivered ? now : locked.recipient.deliveredAt,
        failedAt:
          deliveryState === CommunicationDeliveryState.FAILED
            ? now
            : locked.recipient.failedAt,
        unknownAt: null,
        terminalAt: terminal ? now : null,
        terminalReasonCode: terminal
          ? failed
            ? 'RECONCILED_FAILED'
            : !canRetryProvenNotSent && input.outcome === 'PROVEN_NOT_SENT'
              ? 'RETRY_BUDGET_EXHAUSTED'
              : outcomeCode
          : null,
        nextAttemptAt: canRetryProvenNotSent ? now : null,
        responseReceivedAt: now,
        providerMessageId: providerFields.providerReferenceHash,
        providerStatus: outcomeCode,
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: now,
        revision: { increment: 1 },
      });
      await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
      return recipient;
    });
  }

  async recoverExpiredClaim(input: {
    tenantId: string;
    campaignId: string;
    recipientId: string;
    asOf?: Date;
  }): Promise<MarketingCampaignRecipient> {
    const now = input.asOf ?? this.now();
    return this.prisma.$transaction(async (tx) => {
      const recipient = await this.lockRecipient(
        tx,
        input.tenantId,
        input.campaignId,
        input.recipientId,
      );
      if (!recipient.leaseExpiresAt || recipient.leaseExpiresAt >= now) {
        throw new CommunicationClaimError(
          'LEASE_NOT_EXPIRED',
          'Recipient lease has not expired',
        );
      }
      const attempt = await tx.marketingDeliveryAttempt.findFirst({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          recipientId: input.recipientId,
          lifecycleVersion: 1,
          state: ActionAttemptState.STARTED,
        },
        orderBy: { attemptNumber: 'desc' },
      });
      if (!attempt) {
        throw new CommunicationClaimError(
          'OPEN_ATTEMPT_MISSING',
          'Expired recipient claim has no open durable attempt',
        );
      }
      const campaign = await tx.marketingCampaign.findUniqueOrThrow({
        where: {
          id_tenantId: {
            id: input.campaignId,
            tenantId: input.tenantId,
          },
        },
      });
      const capability = this.capabilityFor(campaign);

      if (attempt.kind === ActionAttemptKind.RECONCILIATION) {
        const attemptResult = await tx.marketingDeliveryAttempt.updateMany({
          where: {
            id: attempt.id,
            tenantId: input.tenantId,
            campaignId: input.campaignId,
            recipientId: input.recipientId,
            lifecycleVersion: 1,
            state: ActionAttemptState.STARTED,
          },
          data: {
            status: ActionAttemptState.FAILED,
            state: ActionAttemptState.FAILED,
            outcomeCode: 'RECONCILIATION_WORKER_LOST',
            errorCode: 'RECONCILIATION_LEASE_EXPIRED',
            retryDecisionCode: 'RECONCILIATION_REQUIRED',
            reconciliationRequired: true,
            completedAt: now,
          },
        });
        this.assertSingleMutation(
          attemptResult.count,
          'RECOVERY_ATTEMPT_CHANGED',
          'Reconciliation attempt changed before recovery completed',
        );
        const recipientResult = await tx.marketingCampaignRecipient.updateMany({
          where: {
            id: recipient.id,
            tenantId: input.tenantId,
            campaignId: input.campaignId,
            lifecycleVersion: 1,
            revision: recipient.revision,
            leaseExpiresAt: { lt: now },
          },
          data: {
            reconciliationState: capability.reconciliationSupported
              ? ActionReconciliationState.REQUIRED
              : ActionReconciliationState.MANUAL_REQUIRED,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            updatedAt: now,
            revision: { increment: 1 },
          },
        });
        this.assertSingleMutation(
          recipientResult.count,
          'RECOVERY_RECIPIENT_CHANGED',
          'Recipient changed before reconciliation recovery completed',
        );
        const recovered = await tx.marketingCampaignRecipient.findUniqueOrThrow(
          {
            where: {
              id_tenantId_campaignId: {
                id: recipient.id,
                tenantId: input.tenantId,
                campaignId: input.campaignId,
              },
            },
          },
        );
        await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
        return recovered;
      }

      if (
        attempt.externalDispatchState === ExternalDispatchState.MAY_HAVE_CROSSED
      ) {
        const attemptResult = await tx.marketingDeliveryAttempt.updateMany({
          where: {
            id: attempt.id,
            tenantId: input.tenantId,
            campaignId: input.campaignId,
            recipientId: input.recipientId,
            lifecycleVersion: 1,
            state: ActionAttemptState.STARTED,
          },
          data: {
            status: ActionAttemptState.UNKNOWN,
            state: ActionAttemptState.UNKNOWN,
            outcomeCode: 'WORKER_LOST_AFTER_DISPATCH',
            errorCode: 'worker_lease_expired',
            retryDecisionCode: 'RECONCILIATION_REQUIRED_NO_BLIND_RETRY',
            reconciliationRequired: true,
            completedAt: now,
          },
        });
        this.assertSingleMutation(
          attemptResult.count,
          'RECOVERY_ATTEMPT_CHANGED',
          'Execution attempt changed before UNKNOWN recovery completed',
        );
        const recipientResult = await tx.marketingCampaignRecipient.updateMany({
          where: {
            id: recipient.id,
            tenantId: input.tenantId,
            campaignId: input.campaignId,
            lifecycleVersion: 1,
            revision: recipient.revision,
            leaseExpiresAt: { lt: now },
          },
          data: {
            status: deliveryStatus(CommunicationDeliveryState.UNKNOWN),
            deliveryState: CommunicationDeliveryState.UNKNOWN,
            externalDispatchState: ExternalDispatchState.MAY_HAVE_CROSSED,
            reconciliationState: capability.reconciliationSupported
              ? ActionReconciliationState.REQUIRED
              : ActionReconciliationState.MANUAL_REQUIRED,
            unknownAt: now,
            nextAttemptAt: null,
            terminalAt: null,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            updatedAt: now,
            revision: { increment: 1 },
          },
        });
        this.assertSingleMutation(
          recipientResult.count,
          'RECOVERY_RECIPIENT_CHANGED',
          'Recipient changed before UNKNOWN recovery completed',
        );
        const unknown = await tx.marketingCampaignRecipient.findUniqueOrThrow({
          where: {
            id_tenantId_campaignId: {
              id: recipient.id,
              tenantId: input.tenantId,
              campaignId: input.campaignId,
            },
          },
        });
        await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
        return unknown;
      }

      const executionAttempts = await tx.marketingDeliveryAttempt.count({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          recipientId: input.recipientId,
          lifecycleVersion: 1,
          kind: ActionAttemptKind.EXECUTION,
        },
      });
      const retryAllowed =
        executionAttempts < capability.retry.maxExecutionAttempts &&
        campaign.expiresAt > now;
      const attemptResult = await tx.marketingDeliveryAttempt.updateMany({
        where: {
          id: attempt.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          recipientId: input.recipientId,
          lifecycleVersion: 1,
          state: ActionAttemptState.STARTED,
        },
        data: {
          status: ActionAttemptState.FAILED,
          state: ActionAttemptState.FAILED,
          outcomeCode: 'WORKER_LOST_BEFORE_DISPATCH',
          errorCode: 'worker_lease_expired',
          retryDecisionCode: retryAllowed
            ? 'SAFE_PRE_DISPATCH_RECLAIM'
            : 'TERMINAL_NO_RETRY',
          reconciliationRequired: false,
          completedAt: now,
        },
      });
      this.assertSingleMutation(
        attemptResult.count,
        'RECOVERY_ATTEMPT_CHANGED',
        'Execution attempt changed before pre-dispatch recovery completed',
      );
      const recipientResult = await tx.marketingCampaignRecipient.updateMany({
        where: {
          id: recipient.id,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          lifecycleVersion: 1,
          revision: recipient.revision,
          leaseExpiresAt: { lt: now },
        },
        data: retryAllowed
          ? {
              status: deliveryStatus(CommunicationDeliveryState.NOT_SENT),
              deliveryState: CommunicationDeliveryState.NOT_SENT,
              externalDispatchState: ExternalDispatchState.NOT_CROSSED,
              reconciliationState: ActionReconciliationState.NOT_REQUIRED,
              nextAttemptAt: now,
              leaseOwner: null,
              leaseTokenHash: null,
              leaseExpiresAt: null,
              updatedAt: now,
              revision: { increment: 1 },
            }
          : {
              status: deliveryStatus(CommunicationDeliveryState.FAILED),
              deliveryState: CommunicationDeliveryState.FAILED,
              externalDispatchState: ExternalDispatchState.NOT_CROSSED,
              reconciliationState: ActionReconciliationState.NOT_REQUIRED,
              failedAt: now,
              terminalAt: now,
              terminalReasonCode: 'WORKER_LOST_RETRY_BUDGET_EXHAUSTED',
              nextAttemptAt: null,
              leaseOwner: null,
              leaseTokenHash: null,
              leaseExpiresAt: null,
              updatedAt: now,
              revision: { increment: 1 },
            },
      });
      this.assertSingleMutation(
        recipientResult.count,
        'RECOVERY_RECIPIENT_CHANGED',
        'Recipient changed before pre-dispatch recovery completed',
      );
      const recovered = await tx.marketingCampaignRecipient.findUniqueOrThrow({
        where: {
          id_tenantId_campaignId: {
            id: recipient.id,
            tenantId: input.tenantId,
            campaignId: input.campaignId,
          },
        },
      });
      await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
      return recovered;
    });
  }

  async expireCampaign(input: {
    tenantId: string;
    campaignId: string;
    asOf?: Date;
  }): Promise<MarketingCampaign> {
    const now = input.asOf ?? this.now();
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.marketingCampaign.findUnique({
        where: {
          id_tenantId: {
            id: input.campaignId,
            tenantId: input.tenantId,
          },
        },
      });
      if (!campaign || campaign.lifecycleVersion !== 1) {
        throw new CommunicationContractError(
          'CAMPAIGN_NOT_FOUND',
          'Lifecycle-v1 campaign does not exist',
        );
      }
      if (campaign.expiresAt > now) {
        throw new CommunicationContractError(
          'CAMPAIGN_NOT_EXPIRED',
          'Campaign has not expired',
        );
      }
      await tx.marketingCampaignRecipient.updateMany({
        where: {
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          lifecycleVersion: 1,
          deliveryState: CommunicationDeliveryState.NOT_SENT,
          leaseOwner: null,
        },
        data: {
          status: deliveryStatus(CommunicationDeliveryState.SKIPPED),
          deliveryState: CommunicationDeliveryState.SKIPPED,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
          reconciliationState: ActionReconciliationState.NOT_REQUIRED,
          terminalAt: now,
          terminalReasonCode: 'CAMPAIGN_EXPIRED',
          nextAttemptAt: null,
          updatedAt: now,
          revision: { increment: 1 },
        },
      });
      return this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
    });
  }

  async audit(input: { tenantId: string; campaignId: string }) {
    const campaign = await this.prisma.marketingCampaign.findUnique({
      where: {
        id_tenantId: {
          id: input.campaignId,
          tenantId: input.tenantId,
        },
      },
      include: {
        recipients: {
          include: { deliveryAttempts: { orderBy: { attemptNumber: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
        actionExecution: { select: { state: true } },
      },
    });
    if (!campaign) {
      throw new CommunicationContractError(
        'CAMPAIGN_NOT_FOUND',
        'Tenant-scoped campaign does not exist',
      );
    }
    return campaign;
  }

  async metrics(tenantId: string): Promise<CommunicationDeliveryMetricsV1> {
    const [campaigns, recipients, attempts, grouped] = await Promise.all([
      this.prisma.marketingCampaign.count({
        where: { tenantId, lifecycleVersion: 1 },
      }),
      this.prisma.marketingCampaignRecipient.count({
        where: { tenantId, lifecycleVersion: 1 },
      }),
      this.prisma.marketingDeliveryAttempt.count({
        where: { tenantId, lifecycleVersion: 1 },
      }),
      this.prisma.marketingCampaignRecipient.groupBy({
        by: ['deliveryState'],
        where: { tenantId, lifecycleVersion: 1 },
        _count: true,
      }),
    ]);
    const count = (state: CommunicationDeliveryState) =>
      grouped.find((item) => item.deliveryState === state)?._count ?? 0;
    return {
      campaigns,
      recipients,
      notSent: count(CommunicationDeliveryState.NOT_SENT),
      accepted: count(CommunicationDeliveryState.ACCEPTED),
      delivered: count(CommunicationDeliveryState.DELIVERED),
      failed: count(CommunicationDeliveryState.FAILED),
      unknown: count(CommunicationDeliveryState.UNKNOWN),
      skipped: count(CommunicationDeliveryState.SKIPPED),
      attempts,
      duplicateDeliveriesCollapsed: this.duplicateDeliveriesCollapsed,
      externalMessagesSent: 0,
    };
  }

  private normalizeEnvelope(input: CreateCommunicationEnvelopeV1) {
    if (input.contract !== COMMUNICATION_ENVELOPE_CONTRACT) {
      throw new CommunicationContractError(
        'CONTRACT_VERSION_UNSUPPORTED',
        'Unsupported communication envelope contract',
      );
    }
    assertCode(input.tenantId, 'tenantId');
    assertCode(input.actionExecutionId, 'actionExecutionId');
    const channel = assertCode(input.channel, 'channel');
    const campaignIdempotencyKey = assertCode(
      input.campaignIdempotencyKey,
      'campaignIdempotencyKey',
    );
    const contentRef = assertCode(input.contentRef, 'contentRef');
    const contentIdentityHash = assertHash(
      input.contentIdentityHash,
      'contentIdentityHash',
    );
    this.registry.get(input.capabilityKey);
    if (
      !Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt <= this.now()
    ) {
      throw new CommunicationContractError(
        'INVALID_EXPIRY',
        'Communication expiry must be in the future',
      );
    }
    if (input.recipients.length === 0) {
      throw new CommunicationContractError(
        'RECIPIENTS_REQUIRED',
        'At least one recipient is required',
      );
    }
    if (input.scope === 'SINGLE' && input.recipients.length !== 1) {
      throw new CommunicationContractError(
        'SINGLE_SCOPE_CARDINALITY',
        'SINGLE communication must contain exactly one recipient',
      );
    }
    let audienceId: string | undefined;
    let audienceSnapshotHash: string | undefined;
    if (input.scope === 'BULK') {
      if (!input.audienceId || !input.audienceSnapshotHash) {
        throw new CommunicationContractError(
          'BULK_AUDIENCE_REQUIRED',
          'BULK communication requires a durable audience snapshot',
        );
      }
      audienceId = assertCode(input.audienceId, 'audienceId');
      audienceSnapshotHash = assertHash(
        input.audienceSnapshotHash,
        'audienceSnapshotHash',
      );
    } else if (input.audienceId || input.audienceSnapshotHash) {
      throw new CommunicationContractError(
        'SINGLE_AUDIENCE_FORBIDDEN',
        'SINGLE communication may not reference a bulk audience',
      );
    }
    const unique = new Map<string, CommunicationRecipientV1>();
    for (const recipient of input.recipients) {
      const recipientKind = assertCode(
        recipient.recipientKind,
        'recipientKind',
      );
      if (!recipient.recipientRef.trim()) {
        throw new CommunicationContractError(
          'RECIPIENT_REF_REQUIRED',
          'Recipient reference is required',
        );
      }
      assertCode(recipient.eligibility.basis, 'eligibilityBasis');
      assertCode(recipient.eligibility.evidenceRef, 'eligibilityEvidenceRef');
      assertHash(recipient.eligibility.evidenceHash, 'eligibilityEvidenceHash');
      if (recipient.eligibility.policyVersion < 1) {
        throw new CommunicationContractError(
          'ELIGIBILITY_POLICY_VERSION_INVALID',
          'Eligibility policy version must be positive',
        );
      }
      const refHash = this.identity.hashOpaqueRef(
        input.tenantId,
        recipientKind,
        recipient.recipientRef,
      );
      const key = `${recipientKind}:${refHash}`;
      if (unique.has(key)) this.duplicateDeliveriesCollapsed += 1;
      unique.set(key, { ...recipient, recipientKind });
    }
    return {
      channel,
      campaignIdempotencyKey,
      contentRef,
      contentIdentityHash,
      audienceId,
      audienceSnapshotHash,
      recipients: [...unique.values()],
    };
  }

  private assertExecutionAllowsDelivery(execution: {
    dryRun: boolean;
    policyDecision: ActionPolicyDecision;
    approvalDecision: ActionApprovalDecision;
    state: ActionExecutionState;
    notExecutedReasonCode: string | null;
  }): void {
    const shadowPlanOnly =
      execution.dryRun &&
      execution.policyDecision === ActionPolicyDecision.SHADOW_ONLY &&
      execution.approvalDecision === ActionApprovalDecision.NOT_REQUIRED &&
      execution.state === ActionExecutionState.NOT_EXECUTED &&
      execution.notExecutedReasonCode === 'shadow_only';
    if (shadowPlanOnly) return;
    if (
      execution.dryRun ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      !new Set<ActionApprovalDecision>([
        ActionApprovalDecision.NOT_REQUIRED,
        ActionApprovalDecision.APPROVED,
      ]).has(execution.approvalDecision) ||
      !ACTION_STATES_ALLOWED_TO_DELIVER.has(execution.state)
    ) {
      throw new CommunicationContractError(
        'ACTION_EXECUTION_NOT_AUTHORIZED',
        'ActionExecution does not authorize communication delivery',
      );
    }
  }

  private capabilityFor(campaign: MarketingCampaign) {
    if (
      campaign.lifecycleVersion !== 1 ||
      !campaign.deliveryCapabilityKey ||
      !campaign.deliveryCapabilityVersion
    ) {
      throw new CommunicationContractError(
        'CAMPAIGN_LIFECYCLE_UNSUPPORTED',
        'Only lifecycle-v1 campaigns are supported',
      );
    }
    const capability = this.registry.get(campaign.deliveryCapabilityKey);
    if (capability.version !== campaign.deliveryCapabilityVersion) {
      throw new CommunicationConflictError(
        'CAPABILITY_VERSION_MISMATCH',
        'Persisted capability version is no longer registered',
      );
    }
    return capability;
  }

  private async finalizeKnownSuccess(
    input: OwnedCommunicationAttemptV1 & {
      outcomeCode: string;
      providerReference?: string;
    },
    deliveryState: 'ACCEPTED' | 'DELIVERED',
  ): Promise<MarketingCampaignRecipient> {
    const now = this.now();
    assertCode(input.outcomeCode, 'outcomeCode');
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockOwnedAttempt(tx, input);
      this.assertExecutionAttempt(locked.attempt);
      if (
        locked.attempt.externalDispatchState !==
        ExternalDispatchState.MAY_HAVE_CROSSED
      ) {
        throw new CommunicationClaimError(
          'SUCCESS_WITHOUT_DISPATCH',
          'Known provider success requires a crossed dispatch boundary',
        );
      }
      const capability = this.capabilityFor(locked.campaign);
      const providerFields = this.providerReferenceFields(
        capability.providerReferenceReturned,
        input.providerReference,
      );
      const terminal =
        deliveryState === CommunicationDeliveryState.DELIVERED ||
        capability.acceptedIsTerminal;
      const reconciliationRequired =
        deliveryState === CommunicationDeliveryState.ACCEPTED && !terminal;
      await this.updateOwnedAttempt(tx, input, {
        status: ActionAttemptState.SUCCEEDED,
        state: ActionAttemptState.SUCCEEDED,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
        providerResponseCode: input.outcomeCode,
        outcomeCode: input.outcomeCode,
        retryDecisionCode: reconciliationRequired
          ? 'RECONCILIATION_REQUIRED'
          : 'TERMINAL_SUCCESS',
        reconciliationRequired,
        responseReceivedAt: now,
        completedAt: now,
        ...providerFields,
      });
      const recipient = await this.updateOwnedRecipient(tx, input, {
        status: deliveryStatus(deliveryState),
        deliveryState,
        externalDispatchState: ExternalDispatchState.ACKNOWLEDGED,
        reconciliationState: reconciliationRequired
          ? ActionReconciliationState.REQUIRED
          : ActionReconciliationState.NOT_REQUIRED,
        acceptedAt:
          deliveryState === CommunicationDeliveryState.ACCEPTED ? now : null,
        deliveredAt:
          deliveryState === CommunicationDeliveryState.DELIVERED ? now : null,
        responseReceivedAt: now,
        terminalAt: terminal ? now : null,
        terminalReasonCode: terminal ? input.outcomeCode : null,
        providerMessageId: providerFields.providerReferenceHash,
        providerStatus: input.outcomeCode,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        updatedAt: now,
        revision: { increment: 1 },
      });
      await this.refreshAggregate(tx, input.tenantId, input.campaignId, now);
      return recipient;
    });
  }

  private providerReferenceFields(
    providerReferenceSupported: boolean,
    providerReference?: string,
  ): {
    providerReferenceEncrypted?: string;
    providerReferenceHash?: string;
  } {
    if (!providerReference) return {};
    if (!providerReferenceSupported) {
      throw new CommunicationContractError(
        'PROVIDER_REFERENCE_UNSUPPORTED',
        'Capability does not declare a provider reference',
      );
    }
    return {
      providerReferenceEncrypted:
        this.identity.encryptProviderReference(providerReference),
      providerReferenceHash: this.identity.safeHash(
        'maya.communication-provider-reference/1',
        providerReference,
      ),
    };
  }

  private assertExecutionAttempt(attempt: MarketingDeliveryAttempt): void {
    if (
      attempt.lifecycleVersion !== 1 ||
      attempt.kind !== ActionAttemptKind.EXECUTION ||
      attempt.state !== ActionAttemptState.STARTED
    ) {
      throw new CommunicationClaimError(
        'EXECUTION_ATTEMPT_REQUIRED',
        'An open lifecycle-v1 execution attempt is required',
      );
    }
  }

  private assertSingleMutation(
    count: number,
    code: string,
    message: string,
  ): void {
    if (count !== 1) {
      throw new CommunicationClaimError(code, message);
    }
  }

  private async lockOwnedAttempt(
    tx: TransactionClient,
    input: OwnedCommunicationAttemptV1,
  ): Promise<LockedAttempt> {
    const recipient = await this.lockRecipient(
      tx,
      input.tenantId,
      input.campaignId,
      input.recipientId,
    );
    const expectedHash = this.identity.leaseTokenHash({
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      leaseToken: input.leaseToken,
    });
    if (
      recipient.leaseTokenHash !== expectedHash ||
      !recipient.leaseExpiresAt ||
      recipient.leaseExpiresAt < this.now()
    ) {
      throw new CommunicationLeaseError(
        'LEASE_NOT_OWNED',
        'Recipient lease is missing, expired, or belongs to another worker',
      );
    }
    if (recipient.revision !== input.recipientRevision) {
      throw new CommunicationLeaseError(
        'STALE_RECIPIENT_REVISION',
        'Recipient changed after this worker acquired its lease context',
      );
    }
    const attempt = await tx.marketingDeliveryAttempt.findFirst({
      where: {
        id: input.attemptId,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        recipientId: input.recipientId,
        lifecycleVersion: 1,
        state: ActionAttemptState.STARTED,
      },
    });
    if (!attempt) {
      throw new CommunicationClaimError(
        'OPEN_ATTEMPT_NOT_FOUND',
        'Owned open delivery attempt does not exist',
      );
    }
    const campaign = await tx.marketingCampaign.findUniqueOrThrow({
      where: {
        id_tenantId: {
          id: input.campaignId,
          tenantId: input.tenantId,
        },
      },
    });
    return { campaign, recipient, attempt };
  }

  private async updateOwnedRecipient(
    tx: TransactionClient,
    input: OwnedCommunicationAttemptV1,
    data: Prisma.MarketingCampaignRecipientUpdateManyMutationInput,
  ): Promise<MarketingCampaignRecipient> {
    const expectedHash = this.identity.leaseTokenHash({
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      leaseToken: input.leaseToken,
    });
    const result = await tx.marketingCampaignRecipient.updateMany({
      where: {
        id: input.recipientId,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        lifecycleVersion: 1,
        revision: input.recipientRevision,
        leaseTokenHash: expectedHash,
        leaseExpiresAt: { gte: this.now() },
      },
      data,
    });
    if (result.count !== 1) {
      throw new CommunicationLeaseError(
        'OWNED_RECIPIENT_UPDATE_LOST',
        'Recipient lease or revision changed before the transition committed',
      );
    }
    return tx.marketingCampaignRecipient.findUniqueOrThrow({
      where: {
        id_tenantId_campaignId: {
          id: input.recipientId,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
        },
      },
    });
  }

  private async updateOwnedAttempt(
    tx: TransactionClient,
    input: OwnedCommunicationAttemptV1,
    data: Prisma.MarketingDeliveryAttemptUpdateManyMutationInput,
  ): Promise<MarketingDeliveryAttempt> {
    const result = await tx.marketingDeliveryAttempt.updateMany({
      where: {
        id: input.attemptId,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        recipientId: input.recipientId,
        lifecycleVersion: 1,
        state: ActionAttemptState.STARTED,
      },
      data,
    });
    if (result.count !== 1) {
      throw new CommunicationClaimError(
        'OPEN_ATTEMPT_UPDATE_LOST',
        'Delivery attempt is no longer open or tenant-owned',
      );
    }
    const attempt = await tx.marketingDeliveryAttempt.findFirst({
      where: {
        id: input.attemptId,
        tenantId: input.tenantId,
        campaignId: input.campaignId,
        recipientId: input.recipientId,
        lifecycleVersion: 1,
      },
    });
    if (!attempt) {
      throw new CommunicationClaimError(
        'ATTEMPT_NOT_FOUND_AFTER_UPDATE',
        'Tenant-scoped delivery attempt disappeared after update',
      );
    }
    return attempt;
  }

  private async lockRecipient(
    tx: TransactionClient,
    tenantId: string,
    campaignId: string,
    recipientId: string,
  ): Promise<MarketingCampaignRecipient> {
    const rows = await tx.$queryRaw<MarketingCampaignRecipient[]>(Prisma.sql`
      SELECT * FROM "MarketingCampaignRecipient"
      WHERE "id" = ${recipientId}
        AND "tenantId" = ${tenantId}
        AND "campaignId" = ${campaignId}
        AND "lifecycleVersion" = 1
      FOR UPDATE
    `);
    const recipient = rows[0];
    if (!recipient) {
      throw new CommunicationClaimError(
        'RECIPIENT_NOT_FOUND',
        'Tenant-scoped lifecycle-v1 recipient does not exist',
      );
    }
    return recipient;
  }

  private async nextAttemptNumber(
    tx: TransactionClient,
    recipient: MarketingCampaignRecipient,
  ): Promise<number> {
    const latest = await tx.marketingDeliveryAttempt.findFirst({
      where: {
        tenantId: recipient.tenantId,
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
      },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    return (latest?.attemptNumber ?? 0) + 1;
  }

  private async refreshAggregate(
    tx: TransactionClient,
    tenantId: string,
    campaignId: string,
    now: Date,
  ): Promise<MarketingCampaign> {
    const recipients = await tx.marketingCampaignRecipient.findMany({
      where: { tenantId, campaignId, lifecycleVersion: 1 },
      select: {
        deliveryState: true,
        terminalAt: true,
        terminalReasonCode: true,
        attemptCount: true,
      },
    });
    const aggregate = projectCommunicationAggregate(recipients);
    const terminal = TERMINAL_CAMPAIGN_STATES.has(aggregate.state);
    return tx.marketingCampaign.update({
      where: { id_tenantId: { id: campaignId, tenantId } },
      data: {
        status: aggregate.state,
        aggregateState: aggregate.state,
        recipientCount: recipients.length,
        sentCount: aggregate.accepted,
        acceptedCount: aggregate.accepted,
        failedCount: aggregate.failed,
        skippedCount: aggregate.skipped,
        unknownCount: aggregate.unknown,
        completedAt: terminal ? now : null,
        cancelledAt:
          aggregate.state === CommunicationCampaignState.CANCELLED ? now : null,
        revision: { increment: 1 },
      },
    });
  }
}
