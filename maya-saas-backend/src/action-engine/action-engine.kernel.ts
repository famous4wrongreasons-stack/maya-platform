import { randomBytes, randomUUID } from 'node:crypto';

import {
  ActionApprovalDecision,
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  AgentTaskLifecycleStatus,
  ExternalDispatchState,
  MembershipStatus,
  OpportunityLifecycleStatus,
  Prisma,
  type ActionAttempt,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ACTION_EXECUTION_RESULT_CONTRACT,
  type ActionExecutionAuditV1,
  type ActionKernelMetricsV1,
  type ApprovalResolution,
  type Chapter5IntentContextV1,
  type ExecutionClaimV1,
  type ExecutionResultV1,
  type FinalizeExecutionInputV1,
  type FinalizeFailureInputV1,
  type FinalizeReconciliationInputV1,
  type InitialDecisionV1,
  type NormalizedActionExecutionV1,
  type RegisteredActionCapabilityV1,
  type TrustedActionExecutionRequestV1,
} from './action-engine.contract';
import {
  ActionClaimError,
  ActionConflictError,
  ActionContractError,
  ActionEngineError,
  ActionLeaseError,
} from './action-engine.errors';
import {
  ActionIdentityService,
  stableActionJson,
} from './action-engine.identity';
import {
  ActionCapabilityRegistry,
  normalizeOpaqueRef,
} from './action-engine.registry';

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const APPROVER_ROLES = new Set([
  'platform_owner',
  'platform_admin',
  'tenant_owner',
  'business_owner',
  'administrator',
  'tenant_admin',
]);

function assertCode(value: string, label: string): string {
  if (!CODE_PATTERN.test(value)) {
    throw new ActionContractError(`${label} must be a stable code`);
  }
  return value;
}

function canonicalRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(stableActionJson(value)) as Record<string, unknown>;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(stableActionJson(value)) as Prisma.InputJsonValue;
}

function stringList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') return {};
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

function isTerminal(state: ActionExecutionState): boolean {
  return (
    state === ActionExecutionState.SUCCEEDED ||
    state === ActionExecutionState.FAILED ||
    state === ActionExecutionState.NOT_EXECUTED
  );
}

export interface ActionEngineKernelOptions {
  identitySecret: string;
  payloadEncryptionSecret: string;
  now?: () => Date;
  executionLeaseMs?: number;
  reconciliationLeaseMs?: number;
}

interface SourceValidation {
  current: boolean;
  reasonCode?: string;
}

export class ActionEngineKernel {
  private readonly identity: ActionIdentityService;
  private readonly registry: ActionCapabilityRegistry;
  private readonly now: () => Date;
  private readonly executionLeaseMs: number;
  private readonly reconciliationLeaseMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    options: ActionEngineKernelOptions,
    registry = new ActionCapabilityRegistry(),
  ) {
    this.identity = new ActionIdentityService(
      options.identitySecret,
      options.payloadEncryptionSecret,
    );
    this.registry = registry;
    this.now = options.now ?? (() => new Date());
    this.executionLeaseMs = options.executionLeaseMs ?? 30_000;
    this.reconciliationLeaseMs = options.reconciliationLeaseMs ?? 30_000;
  }

  async createFromChapter5Intent(
    context: Chapter5IntentContextV1,
  ): Promise<ActionExecution> {
    const { intent } = context;
    if (!context.trustedProjection || intent.tenantId !== context.tenantId) {
      throw new ActionContractError(
        'Chapter 5 intent tenant context is invalid',
      );
    }
    if (intent.dryRun !== true || intent.state !== 'proposed') {
      throw new ActionContractError(
        'Chapter 5 intent is not a shadow proposal',
      );
    }
    this.registry.assertActionClass(intent.capability, intent.actionClass);
    const definition = this.registry.get(intent.capability);
    if (definition.policyDecision !== ActionPolicyDecision.SHADOW_ONLY) {
      throw new ActionContractError(
        'Chapter 5 adapter accepts only registered shadow capabilities',
      );
    }
    const task = await this.prisma.agentTask.findUnique({
      where: {
        tenantId_taskFingerprint: {
          tenantId: context.tenantId,
          taskFingerprint: intent.source.taskId,
        },
      },
    });
    if (!task) {
      throw new ActionContractError('Durable Chapter 5 AgentTask is missing');
    }
    const targetRef = intent.targetRef;
    if (!targetRef) {
      throw new ActionContractError('Chapter 5 intent target is missing');
    }
    return this.createExecution({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: context.tenantId,
      capability: intent.capability,
      source: {
        type: 'agent_task',
        occurrenceScope: task.taskFingerprint,
        sourceRef: task.id,
        agentTaskId: task.id,
      },
      targetRef,
      input: intent.arguments,
      evidenceRefs: intent.evidenceRefs,
      intentExpiresAt: intent.expiresAt
        ? new Date(intent.expiresAt)
        : undefined,
    });
  }

  async createExecution(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionExecution> {
    const normalized = this.normalizeRequest(request);
    const now = this.now();

    for (let databaseAttempt = 0; databaseAttempt < 3; databaseAttempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const source = await this.validateSource(
              tx,
              request,
              normalized.capability,
              now,
            );
            const duplicate = await this.findDuplicate(tx, request, normalized);
            if (duplicate) return duplicate;

            const executionId = randomUUID();
            const initial = this.initialDecision(
              normalized.capability,
              request.intentExpiresAt,
              source,
              now,
            );
            const approval = this.initialApproval(
              normalized.capability,
              normalized.normalizedInputHash,
              initial,
              now,
            );
            const finalizedAt =
              initial.state === ActionExecutionState.NOT_EXECUTED ? now : null;
            const payloadRetentionUntil = new Date(
              now.getTime() + normalized.capability.payloadRetentionMs,
            );
            const auditRetentionUntil = new Date(
              now.getTime() + normalized.capability.auditRetentionMs,
            );

            return tx.actionExecution.create({
              data: {
                id: executionId,
                tenantId: request.tenantId,
                identityVersion: normalized.capability.identityVersion,
                identityFingerprint: normalized.identityFingerprint,
                idempotencyScope: normalized.idempotencyScope,
                requestIdempotencyKeyHash: normalized.requestIdempotencyKeyHash,
                sourceType: request.source.type,
                sourceRef:
                  request.source.type === 'agent_task'
                    ? request.source.agentTaskId
                    : request.source.sourceRef,
                agentTaskId: request.source.agentTaskId,
                actorUserId: request.source.actorUserId,
                actionClass: normalized.capability.actionClass,
                capability: normalized.capability.capability,
                capabilityVersion: normalized.capability.capabilityVersion,
                targetKind: normalized.capability.targetKind,
                targetRef: normalized.targetRef,
                normalizedInputContract:
                  normalized.capability.normalizedInputContract,
                normalizedInputHash: normalized.normalizedInputHash,
                normalizedInputEncrypted:
                  this.identity.encryptNormalizedPayload(
                    normalized.normalizedInputCanonical,
                  ),
                evidenceRefsJson: jsonInput(request.evidenceRefs),
                intentExpiresAt: request.intentExpiresAt,
                dryRun:
                  normalized.capability.policyDecision ===
                  ActionPolicyDecision.SHADOW_ONLY,
                riskProfileVersion: normalized.capability.riskProfileVersion,
                riskFacetsJson: jsonInput(normalized.capability.riskFacets),
                policyKey: normalized.capability.policyKey,
                policyVersion: normalized.capability.policyVersion,
                policyDecision: initial.policyDecision,
                autonomyLevel: normalized.capability.autonomyLevel,
                policyDecidedBy: 'trusted_capability_registry',
                approvalRequirement: normalized.capability.approvalRequirement,
                ...approval,
                state: initial.state,
                notExecutedReasonCode: initial.notExecutedReasonCode,
                retryPolicyKey: normalized.capability.retry.key,
                retryPolicyVersion: normalized.capability.retry.version,
                maxExecutionAttempts:
                  normalized.capability.retry.maxExecutionAttempts,
                executionAttemptCount: 0,
                reconciliationPolicyKey:
                  normalized.capability.reconciliation.key,
                reconciliationPolicyVersion:
                  normalized.capability.reconciliation.version,
                reconciliationState: ActionReconciliationState.NOT_REQUIRED,
                revision: 0,
                transportIdentityVersion:
                  normalized.capability.transportIdentityVersion,
                transportIdempotencyKey: this.identity.transportIdempotencyKey({
                  executionId,
                  capability: normalized.capability.capability,
                  transportIdentityVersion:
                    normalized.capability.transportIdentityVersion,
                }),
                finalizedAt,
                payloadRetentionUntil,
                auditRetentionUntil,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isUniqueConflict(error)) {
          return this.resolveDuplicate(request, normalized);
        }
        if (isSerializationConflict(error) && databaseAttempt < 2) {
          continue;
        }
        throw error;
      }
    }
    throw new ActionConflictError('Database claim could not be serialized');
  }

  async decideApproval(input: {
    tenantId: string;
    executionId: string;
    approverUserId: string;
    decision: ApprovalResolution;
  }): Promise<ActionExecution> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.lockExecution(
        tx,
        input.tenantId,
        input.executionId,
      );
      if (
        execution.state !== ActionExecutionState.PENDING_APPROVAL ||
        execution.approvalDecision !== ActionApprovalDecision.PENDING ||
        execution.approvalRequirement !== 'REQUIRED'
      ) {
        throw new ActionClaimError(
          'APPROVAL_NOT_PENDING',
          'Execution is not waiting for approval',
        );
      }
      if (!execution.approvalExpiresAt || execution.approvalExpiresAt <= now) {
        return tx.actionExecution.update({
          where: {
            id_tenantId: { id: execution.id, tenantId: input.tenantId },
          },
          data: {
            approvalDecision: ActionApprovalDecision.EXPIRED,
            approvalDecidedAt: now,
            state: ActionExecutionState.NOT_EXECUTED,
            notExecutedReasonCode: 'approval_expired',
            finalizedAt: now,
            revision: { increment: 1 },
          },
        });
      }
      const approver = await tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: input.approverUserId,
            tenantId: input.tenantId,
          },
        },
      });
      if (
        !approver ||
        approver.status !== MembershipStatus.active ||
        !APPROVER_ROLES.has(approver.role)
      ) {
        throw new ActionClaimError(
          'APPROVER_NOT_AUTHORIZED',
          'Approver does not hold an active authorized membership',
        );
      }
      if (input.decision === ActionApprovalDecision.APPROVED) {
        return tx.actionExecution.update({
          where: {
            id_tenantId: { id: execution.id, tenantId: input.tenantId },
          },
          data: {
            approvalDecision: ActionApprovalDecision.APPROVED,
            approvalDecidedAt: now,
            approvalDecidedByUserId: input.approverUserId,
            state: ActionExecutionState.READY,
            revision: { increment: 1 },
          },
        });
      }
      return tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: {
          approvalDecision: ActionApprovalDecision.REJECTED,
          approvalDecidedAt: now,
          approvalDecidedByUserId: input.approverUserId,
          state: ActionExecutionState.NOT_EXECUTED,
          notExecutedReasonCode: 'approval_rejected',
          finalizedAt: now,
          revision: { increment: 1 },
        },
      });
    });
  }

  async claimExecution(input: {
    tenantId: string;
    executionId: string;
    workerId: string;
  }): Promise<ExecutionClaimV1> {
    const now = this.now();
    const workerId = assertCode(input.workerId, 'workerId');
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.lockExecution(
        tx,
        input.tenantId,
        input.executionId,
      );
      if (execution.state !== ActionExecutionState.READY) {
        throw new ActionClaimError(
          isTerminal(execution.state)
            ? 'EXECUTION_TERMINAL'
            : 'EXECUTION_NOT_READY',
          `Execution cannot be claimed from ${execution.state}`,
        );
      }
      const capability = this.definitionForExecution(execution);
      if (capability.policyDecision !== ActionPolicyDecision.ALLOW) {
        throw new ActionClaimError(
          'EXECUTION_POLICY_FORBIDS_CLAIM',
          'Trusted policy does not allow execution',
        );
      }
      await this.assertExecutionCurrent(tx, execution, capability, now);
      if (
        execution.nextExecutionAttemptAt &&
        execution.nextExecutionAttemptAt > now
      ) {
        throw new ActionClaimError(
          'EXECUTION_BACKOFF_ACTIVE',
          'Capability retry backoff is still active',
        );
      }
      if (execution.executionAttemptCount >= execution.maxExecutionAttempts) {
        throw new ActionClaimError(
          'EXECUTION_ATTEMPTS_EXHAUSTED',
          'Capability execution-attempt budget is exhausted',
        );
      }
      const attemptNumber = await this.nextAttemptNumber(tx, execution);
      const leaseToken = randomBytes(32).toString('base64url');
      const leaseTokenHash = this.identity.leaseTokenHash({
        tenantId: input.tenantId,
        executionId: execution.id,
        leaseToken,
      });
      const attempt = await tx.actionAttempt.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          actionExecutionId: execution.id,
          attemptNumber,
          kind: ActionAttemptKind.EXECUTION,
          state: ActionAttemptState.STARTED,
          executorKey: capability.executorKey,
          executorVersion: capability.executorVersion,
          externalDispatchState: ExternalDispatchState.NOT_CROSSED,
          providerRequestIdentityHash: execution.transportIdempotencyKey,
        },
      });
      const claimed = await tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: {
          state: ActionExecutionState.EXECUTING,
          executionAttemptCount: { increment: 1 },
          firstAttemptedAt: execution.firstAttemptedAt ?? now,
          leaseOwner: workerId,
          leaseTokenHash,
          leaseExpiresAt: new Date(now.getTime() + this.executionLeaseMs),
          nextExecutionAttemptAt: null,
          reconciliationState: ActionReconciliationState.NOT_REQUIRED,
          revision: { increment: 1 },
        },
      });
      return { execution: claimed, attempt, leaseToken };
    });
  }

  async markDispatchMayHaveCrossed(input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    leaseToken: string;
  }): Promise<ActionAttempt> {
    return this.updateDispatch(input, ExternalDispatchState.MAY_HAVE_CROSSED);
  }

  async markDispatchAcknowledged(input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    leaseToken: string;
  }): Promise<ActionAttempt> {
    return this.updateDispatch(input, ExternalDispatchState.ACKNOWLEDGED);
  }

  async finalizeSuccess(
    input: FinalizeExecutionInputV1,
  ): Promise<ExecutionResultV1> {
    const now = this.now();
    const outcomeCode = assertCode(input.outcomeCode, 'outcomeCode');
    return this.prisma.$transaction(async (tx) => {
      const { execution, attempt } = await this.lockOwnedAttempt(tx, input);
      const attemptData: Prisma.ActionAttemptUpdateInput = {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode,
        finishedAt: now,
        reconciliationRequired: false,
      };
      if (input.safeResult) {
        attemptData.safeResultJson = jsonInput(
          canonicalRecord(input.safeResult),
        );
      }
      await tx.actionAttempt.update({
        where: { id_tenantId: { id: attempt.id, tenantId: input.tenantId } },
        data: attemptData,
      });
      const executionData: Prisma.ActionExecutionUpdateInput = {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: outcomeCode,
        finalizedAt: now,
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      };
      if (input.safeResult) {
        executionData.safeResultSummaryJson = jsonInput(
          canonicalRecord(input.safeResult),
        );
      }
      const updated = await tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: executionData,
      });
      return this.result(updated);
    });
  }

  async finalizeDefinitiveFailure(
    input: FinalizeFailureInputV1,
  ): Promise<ExecutionResultV1> {
    const now = this.now();
    const outcomeCode = assertCode(input.outcomeCode, 'outcomeCode');
    const errorClass = assertCode(input.errorClass, 'errorClass');
    return this.prisma.$transaction(async (tx) => {
      const { execution, attempt } = await this.lockOwnedAttempt(tx, input);
      const capability = this.definitionForExecution(execution);
      const retryAllowed =
        attempt.externalDispatchState === ExternalDispatchState.NOT_CROSSED &&
        capability.retry.retryablePreDispatchErrors.has(errorClass) &&
        execution.executionAttemptCount < execution.maxExecutionAttempts &&
        (await this.isExecutionCurrent(tx, execution, capability, now));
      const attemptData: Prisma.ActionAttemptUpdateInput = {
        state: ActionAttemptState.FAILED,
        outcomeCode,
        errorClass,
        retryDecisionCode: retryAllowed
          ? 'SAFE_RETRY_ALLOWED'
          : 'TERMINAL_NO_RETRY',
        finishedAt: now,
      };
      if (input.safeResult) {
        attemptData.safeResultJson = jsonInput(
          canonicalRecord(input.safeResult),
        );
      }
      await tx.actionAttempt.update({
        where: { id_tenantId: { id: attempt.id, tenantId: input.tenantId } },
        data: attemptData,
      });
      if (retryAllowed) {
        const backoff =
          capability.retry.backoffMs[execution.executionAttemptCount - 1] ?? 0;
        const ready = await tx.actionExecution.update({
          where: {
            id_tenantId: { id: execution.id, tenantId: input.tenantId },
          },
          data: {
            state: ActionExecutionState.READY,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            nextExecutionAttemptAt: new Date(now.getTime() + backoff),
            revision: { increment: 1 },
          },
        });
        return this.result(ready);
      }
      const failed = await tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: {
          state: ActionExecutionState.FAILED,
          finalOutcomeCode: outcomeCode,
          finalizedAt: now,
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      return this.result(failed);
    });
  }

  async finalizeUnknown(
    input: FinalizeFailureInputV1,
  ): Promise<ExecutionResultV1> {
    const now = this.now();
    const outcomeCode = assertCode(input.outcomeCode, 'outcomeCode');
    const errorClass = assertCode(input.errorClass, 'errorClass');
    return this.prisma.$transaction(async (tx) => {
      const { execution, attempt } = await this.lockOwnedAttempt(tx, input);
      if (
        attempt.externalDispatchState !==
          ExternalDispatchState.MAY_HAVE_CROSSED &&
        attempt.externalDispatchState !== ExternalDispatchState.ACKNOWLEDGED
      ) {
        throw new ActionClaimError(
          'UNKNOWN_WITHOUT_DISPATCH_BOUNDARY',
          'UNKNOWN requires proof that dispatch may have crossed the boundary',
        );
      }
      const attemptData: Prisma.ActionAttemptUpdateInput = {
        state: ActionAttemptState.UNKNOWN,
        outcomeCode,
        errorClass,
        retryDecisionCode: 'RECONCILIATION_REQUIRED',
        reconciliationRequired: true,
        finishedAt: now,
      };
      if (input.safeResult) {
        attemptData.safeResultJson = jsonInput(
          canonicalRecord(input.safeResult),
        );
      }
      await tx.actionAttempt.update({
        where: { id_tenantId: { id: attempt.id, tenantId: input.tenantId } },
        data: attemptData,
      });
      const unknown = await tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: {
          state: ActionExecutionState.UNKNOWN,
          reconciliationState: ActionReconciliationState.REQUIRED,
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      return this.result(unknown);
    });
  }

  async claimReconciliation(input: {
    tenantId: string;
    executionId: string;
    workerId: string;
  }): Promise<ExecutionClaimV1> {
    const now = this.now();
    const workerId = assertCode(input.workerId, 'workerId');
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.lockExecution(
        tx,
        input.tenantId,
        input.executionId,
      );
      if (
        execution.state !== ActionExecutionState.UNKNOWN ||
        execution.reconciliationState !== ActionReconciliationState.REQUIRED
      ) {
        throw new ActionClaimError(
          'RECONCILIATION_NOT_REQUIRED',
          'Execution is not eligible for reconciliation',
        );
      }
      const capability = this.definitionForExecution(execution);
      const attemptNumber = await this.nextAttemptNumber(tx, execution);
      const leaseToken = randomBytes(32).toString('base64url');
      const leaseTokenHash = this.identity.leaseTokenHash({
        tenantId: input.tenantId,
        executionId: execution.id,
        leaseToken,
      });
      const attempt = await tx.actionAttempt.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          actionExecutionId: execution.id,
          attemptNumber,
          kind: ActionAttemptKind.RECONCILIATION,
          state: ActionAttemptState.STARTED,
          executorKey: `${capability.executorKey}.reconciler`,
          executorVersion: capability.executorVersion,
          externalDispatchState: ExternalDispatchState.NOT_APPLICABLE,
        },
      });
      const claimed = await tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: {
          reconciliationState: ActionReconciliationState.IN_PROGRESS,
          leaseOwner: workerId,
          leaseTokenHash,
          leaseExpiresAt: new Date(now.getTime() + this.reconciliationLeaseMs),
          revision: { increment: 1 },
        },
      });
      return { execution: claimed, attempt, leaseToken };
    });
  }

  async finalizeReconciliation(
    input: FinalizeReconciliationInputV1,
  ): Promise<ExecutionResultV1> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const { execution, attempt } = await this.lockOwnedAttempt(
        tx,
        input,
        ActionExecutionState.UNKNOWN,
        ActionAttemptKind.RECONCILIATION,
      );
      const capability = this.definitionForExecution(execution);
      const safeResult = input.safeResult
        ? canonicalRecord(input.safeResult)
        : undefined;
      if (input.outcome === 'STILL_UNKNOWN') {
        const count = await tx.actionAttempt.count({
          where: {
            tenantId: input.tenantId,
            actionExecutionId: execution.id,
            kind: ActionAttemptKind.RECONCILIATION,
          },
        });
        const manual =
          count >= capability.reconciliation.maxInconclusiveAttempts;
        const attemptData: Prisma.ActionAttemptUpdateInput = {
          state: ActionAttemptState.UNKNOWN,
          outcomeCode: 'STILL_UNKNOWN',
          retryDecisionCode: manual
            ? 'MANUAL_REVIEW_REQUIRED'
            : 'RECONCILIATION_REQUIRED',
          reconciliationRequired: true,
          finishedAt: now,
        };
        if (safeResult) attemptData.safeResultJson = jsonInput(safeResult);
        await tx.actionAttempt.update({
          where: {
            id_tenantId: { id: attempt.id, tenantId: input.tenantId },
          },
          data: attemptData,
        });
        const unknown = await tx.actionExecution.update({
          where: {
            id_tenantId: { id: execution.id, tenantId: input.tenantId },
          },
          data: {
            reconciliationState: manual
              ? ActionReconciliationState.MANUAL_REQUIRED
              : ActionReconciliationState.REQUIRED,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            revision: { increment: 1 },
          },
        });
        return this.result(unknown);
      }

      const current = await this.isExecutionCurrent(
        tx,
        execution,
        capability,
        now,
      );
      const canRetryAfterNonExecution =
        input.outcome === 'PROVEN_NOT_EXECUTED' &&
        capability.reconciliation.retryAfterProvenNonExecution &&
        execution.executionAttemptCount < execution.maxExecutionAttempts &&
        current;
      const retryDecisionCode = canRetryAfterNonExecution
        ? 'SAFE_RETRY_ALLOWED'
        : input.outcome === 'PROVEN_NOT_EXECUTED'
          ? 'NO_RETRY_ALLOWED'
          : 'RECONCILIATION_RESOLVED';
      const attemptData: Prisma.ActionAttemptUpdateInput = {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: input.outcome,
        retryDecisionCode,
        reconciliationRequired: false,
        finishedAt: now,
      };
      if (safeResult) attemptData.safeResultJson = jsonInput(safeResult);
      await tx.actionAttempt.update({
        where: { id_tenantId: { id: attempt.id, tenantId: input.tenantId } },
        data: attemptData,
      });

      let state: ActionExecutionState;
      let finalOutcomeCode: string | null = null;
      let notExecutedReasonCode: string | null = null;
      let finalizedAt: Date | null = now;
      if (input.outcome === 'PROVEN_SUCCEEDED') {
        state = ActionExecutionState.SUCCEEDED;
        finalOutcomeCode = 'reconciled_succeeded';
      } else if (input.outcome === 'PROVEN_FAILED') {
        state = ActionExecutionState.FAILED;
        finalOutcomeCode = 'reconciled_failed';
      } else if (canRetryAfterNonExecution) {
        state = ActionExecutionState.READY;
        finalizedAt = null;
      } else {
        state = ActionExecutionState.NOT_EXECUTED;
        notExecutedReasonCode = current
          ? 'reconciled_not_executed_no_retry'
          : 'reconciled_not_executed_stale';
      }
      const executionData: Prisma.ActionExecutionUpdateInput = {
        state,
        reconciliationState: ActionReconciliationState.RESOLVED,
        finalOutcomeCode,
        notExecutedReasonCode,
        finalizedAt,
        nextExecutionAttemptAt:
          state === ActionExecutionState.READY ? now : null,
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      };
      if (safeResult) {
        executionData.safeResultSummaryJson = jsonInput(safeResult);
      }
      const updated = await tx.actionExecution.update({
        where: { id_tenantId: { id: execution.id, tenantId: input.tenantId } },
        data: executionData,
      });
      return this.result(updated);
    });
  }

  async recoverExpiredClaim(input: {
    tenantId: string;
    executionId: string;
    asOf?: Date;
  }): Promise<ActionExecution> {
    const now = input.asOf ?? this.now();
    return this.prisma.$transaction(async (tx) => {
      const execution = await this.lockExecution(
        tx,
        input.tenantId,
        input.executionId,
      );
      if (!execution.leaseExpiresAt || execution.leaseExpiresAt >= now) {
        throw new ActionClaimError(
          'LEASE_NOT_EXPIRED',
          'Execution lease has not expired',
        );
      }
      const attempt = await tx.actionAttempt.findFirst({
        where: {
          tenantId: input.tenantId,
          actionExecutionId: execution.id,
          state: ActionAttemptState.STARTED,
        },
        orderBy: { attemptNumber: 'desc' },
      });
      if (!attempt) {
        throw new ActionClaimError(
          'OPEN_ATTEMPT_MISSING',
          'Expired claim has no open durable attempt',
        );
      }
      if (execution.state === ActionExecutionState.EXECUTING) {
        if (
          attempt.externalDispatchState ===
            ExternalDispatchState.MAY_HAVE_CROSSED ||
          attempt.externalDispatchState === ExternalDispatchState.ACKNOWLEDGED
        ) {
          await tx.actionAttempt.update({
            where: {
              id_tenantId: { id: attempt.id, tenantId: input.tenantId },
            },
            data: {
              state: ActionAttemptState.UNKNOWN,
              outcomeCode: 'worker_lost_after_dispatch',
              errorClass: 'worker_lease_expired',
              retryDecisionCode: 'RECONCILIATION_REQUIRED',
              reconciliationRequired: true,
              finishedAt: now,
            },
          });
          return tx.actionExecution.update({
            where: {
              id_tenantId: { id: execution.id, tenantId: input.tenantId },
            },
            data: {
              state: ActionExecutionState.UNKNOWN,
              reconciliationState: ActionReconciliationState.REQUIRED,
              leaseOwner: null,
              leaseTokenHash: null,
              leaseExpiresAt: null,
              revision: { increment: 1 },
            },
          });
        }
        const capability = this.definitionForExecution(execution);
        const canRetry =
          attempt.externalDispatchState === ExternalDispatchState.NOT_CROSSED &&
          execution.executionAttemptCount < execution.maxExecutionAttempts &&
          (await this.isExecutionCurrent(tx, execution, capability, now));
        await tx.actionAttempt.update({
          where: {
            id_tenantId: { id: attempt.id, tenantId: input.tenantId },
          },
          data: {
            state: ActionAttemptState.FAILED,
            outcomeCode: 'worker_lost_before_dispatch',
            errorClass: 'worker_lease_expired',
            retryDecisionCode: canRetry
              ? 'SAFE_RETRY_ALLOWED'
              : 'TERMINAL_NO_RETRY',
            finishedAt: now,
          },
        });
        return tx.actionExecution.update({
          where: {
            id_tenantId: { id: execution.id, tenantId: input.tenantId },
          },
          data: canRetry
            ? {
                state: ActionExecutionState.READY,
                leaseOwner: null,
                leaseTokenHash: null,
                leaseExpiresAt: null,
                nextExecutionAttemptAt: now,
                revision: { increment: 1 },
              }
            : {
                state: ActionExecutionState.FAILED,
                finalOutcomeCode: 'worker_lost_before_dispatch_no_retry',
                finalizedAt: now,
                leaseOwner: null,
                leaseTokenHash: null,
                leaseExpiresAt: null,
                revision: { increment: 1 },
              },
        });
      }
      if (
        execution.state === ActionExecutionState.UNKNOWN &&
        execution.reconciliationState ===
          ActionReconciliationState.IN_PROGRESS &&
        attempt.kind === ActionAttemptKind.RECONCILIATION
      ) {
        const capability = this.definitionForExecution(execution);
        const count = await tx.actionAttempt.count({
          where: {
            tenantId: input.tenantId,
            actionExecutionId: execution.id,
            kind: ActionAttemptKind.RECONCILIATION,
          },
        });
        const manual =
          count >= capability.reconciliation.maxInconclusiveAttempts;
        await tx.actionAttempt.update({
          where: {
            id_tenantId: { id: attempt.id, tenantId: input.tenantId },
          },
          data: {
            state: ActionAttemptState.UNKNOWN,
            outcomeCode: 'reconciliation_worker_lost',
            errorClass: 'worker_lease_expired',
            retryDecisionCode: manual
              ? 'MANUAL_REVIEW_REQUIRED'
              : 'RECONCILIATION_REQUIRED',
            reconciliationRequired: true,
            finishedAt: now,
          },
        });
        return tx.actionExecution.update({
          where: {
            id_tenantId: { id: execution.id, tenantId: input.tenantId },
          },
          data: {
            reconciliationState: manual
              ? ActionReconciliationState.MANUAL_REQUIRED
              : ActionReconciliationState.REQUIRED,
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            revision: { increment: 1 },
          },
        });
      }
      throw new ActionClaimError(
        'EXPIRED_CLAIM_STATE_INVALID',
        'Execution is not in a recoverable claimed state',
      );
    });
  }

  async getAudit(
    tenantId: string,
    executionId: string,
  ): Promise<ActionExecutionAuditV1> {
    const execution = await this.prisma.actionExecution.findUnique({
      where: { id_tenantId: { id: executionId, tenantId } },
    });
    if (!execution) {
      throw new ActionClaimError(
        'EXECUTION_NOT_FOUND',
        'Execution was not found',
      );
    }
    const attempts = await this.prisma.actionAttempt.findMany({
      where: { tenantId, actionExecutionId: executionId },
      orderBy: { attemptNumber: 'asc' },
    });
    return { execution, attempts };
  }

  async readTrustedNormalizedInput(
    tenantId: string,
    executionId: string,
  ): Promise<Record<string, unknown>> {
    const execution = await this.prisma.actionExecution.findUnique({
      where: { id_tenantId: { id: executionId, tenantId } },
    });
    if (!execution) {
      throw new ActionClaimError(
        'EXECUTION_NOT_FOUND',
        'Execution was not found',
      );
    }
    const capability = this.definitionForExecution(execution);
    if (
      execution.normalizedInputContract !== capability.normalizedInputContract
    ) {
      throw new ActionContractError(
        'Stored action input contract does not match the registry snapshot',
      );
    }
    if (!execution.normalizedInputEncrypted) {
      throw new ActionContractError(
        'Stored action input is unavailable after retention cleanup',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(
        this.identity.decryptNormalizedPayload(
          execution.normalizedInputEncrypted,
        ),
      ) as unknown;
    } catch (error) {
      if (error instanceof ActionEngineError) throw error;
      throw new ActionContractError('Stored action input cannot be decoded');
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new ActionContractError('Stored action input is not an object');
    }
    const normalized = canonicalRecord(parsed as Record<string, unknown>);
    const hash = this.identity.normalizedInputHash(
      capability.normalizedInputContract,
      normalized,
    );
    if (hash !== execution.normalizedInputHash) {
      throw new ActionContractError('Stored action input hash is invalid');
    }
    return normalized;
  }

  async recordAttemptContext(input: {
    tenantId: string;
    executionId: string;
    attemptId: string;
    leaseToken: string;
    context: Record<string, unknown>;
  }): Promise<ActionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const { attempt } = await this.lockOwnedAttempt(tx, input);
      if (attempt.kind !== ActionAttemptKind.EXECUTION) {
        throw new ActionClaimError(
          'ATTEMPT_KIND_INVALID',
          'Pre-dispatch context belongs only to an execution attempt',
        );
      }
      if (attempt.externalDispatchState !== ExternalDispatchState.NOT_CROSSED) {
        throw new ActionClaimError(
          'DISPATCH_ALREADY_CROSSED',
          'Pre-dispatch context must be recorded before provider dispatch',
        );
      }
      const existing = jsonRecord(attempt.safeResultJson);
      return tx.actionAttempt.update({
        where: { id_tenantId: { id: attempt.id, tenantId: input.tenantId } },
        data: {
          safeResultJson: jsonInput({
            ...existing,
            preDispatch: canonicalRecord(input.context),
          }),
        },
      });
    });
  }

  async readLatestPreDispatchContext(
    tenantId: string,
    executionId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const execution = await this.prisma.actionExecution.findUnique({
      where: { id_tenantId: { id: executionId, tenantId } },
      select: { id: true },
    });
    if (!execution) {
      throw new ActionClaimError(
        'EXECUTION_NOT_FOUND',
        'Execution was not found',
      );
    }
    const attempt = await this.prisma.actionAttempt.findFirst({
      where: {
        tenantId,
        actionExecutionId: executionId,
        kind: ActionAttemptKind.EXECUTION,
      },
      orderBy: { attemptNumber: 'desc' },
      select: { safeResultJson: true },
    });
    const context = jsonRecord(attempt?.safeResultJson ?? null).preDispatch;
    if (!context || Array.isArray(context) || typeof context !== 'object') {
      return undefined;
    }
    return canonicalRecord(context as Record<string, unknown>);
  }

  async metrics(tenantId?: string): Promise<ActionKernelMetricsV1> {
    const where: Prisma.ActionExecutionWhereInput = tenantId
      ? { tenantId }
      : {};
    const [total, active, unknown, succeeded, failed, notExecuted, attempts] =
      await Promise.all([
        this.prisma.actionExecution.count({ where }),
        this.prisma.actionExecution.count({
          where: {
            ...where,
            state: {
              in: [
                ActionExecutionState.PENDING_APPROVAL,
                ActionExecutionState.READY,
                ActionExecutionState.EXECUTING,
              ],
            },
          },
        }),
        this.prisma.actionExecution.count({
          where: { ...where, state: ActionExecutionState.UNKNOWN },
        }),
        this.prisma.actionExecution.count({
          where: { ...where, state: ActionExecutionState.SUCCEEDED },
        }),
        this.prisma.actionExecution.count({
          where: { ...where, state: ActionExecutionState.FAILED },
        }),
        this.prisma.actionExecution.count({
          where: { ...where, state: ActionExecutionState.NOT_EXECUTED },
        }),
        this.prisma.actionAttempt.count({
          where: tenantId ? { tenantId } : {},
        }),
      ]);
    return {
      total,
      active,
      unknown,
      succeeded,
      failed,
      notExecuted,
      attempts,
      externalSideEffects: 0,
    };
  }

  private normalizeRequest(
    request: TrustedActionExecutionRequestV1,
  ): NormalizedActionExecutionV1 {
    if (request.contract !== ACTION_EXECUTION_REQUEST_CONTRACT) {
      throw new ActionContractError(
        'Execution request contract is unsupported',
      );
    }
    normalizeOpaqueRef(request.tenantId, 'tenantId');
    const capability = this.registry.get(request.capability);
    if (!capability.allowedSourceTypes.includes(request.source.type)) {
      throw new ActionContractError(
        'Source type is not allowed for capability',
      );
    }
    if (
      request.source.type === 'agent_task' &&
      (!request.source.agentTaskId ||
        request.source.sourceRef !== request.source.agentTaskId)
    ) {
      throw new ActionContractError(
        'AgentTask source must bind sourceRef to durable task id',
      );
    }
    if (
      request.source.type !== 'agent_task' &&
      request.source.agentTaskId !== undefined
    ) {
      throw new ActionContractError(
        'Non-AgentTask source cannot supply an AgentTask id',
      );
    }
    const occurrenceScope = normalizeOpaqueRef(
      request.source.occurrenceScope,
      'occurrenceScope',
    );
    const targetRef = normalizeOpaqueRef(request.targetRef, 'targetRef');
    const evidenceRefs = request.evidenceRefs.map((value) =>
      normalizeOpaqueRef(value, 'evidenceRef'),
    );
    if (new Set(evidenceRefs).size !== evidenceRefs.length) {
      throw new ActionContractError('Evidence references must be unique');
    }
    const normalizedInput = canonicalRecord(
      capability.normalizeInput(request.input),
    );
    const normalizedInputCanonical = stableActionJson(normalizedInput);
    const normalizedInputHash = this.identity.normalizedInputHash(
      capability.normalizedInputContract,
      normalizedInput,
    );
    let idempotencyScope: string | undefined;
    let requestIdempotencyKeyHash: string | undefined;
    if (request.callerIdempotency) {
      idempotencyScope = normalizeOpaqueRef(
        request.callerIdempotency.scope,
        'idempotencyScope',
      );
      if (!request.callerIdempotency.key.trim()) {
        throw new ActionContractError('Caller idempotency key is blank');
      }
      requestIdempotencyKeyHash = this.identity.callerIdempotencyHash({
        tenantId: request.tenantId,
        scope: idempotencyScope,
        key: request.callerIdempotency.key,
      });
    }
    const identityFingerprint = this.identity.logicalIdentity({
      tenantId: request.tenantId,
      identityVersion: capability.identityVersion,
      actionClass: capability.actionClass,
      capability: capability.capability,
      capabilityVersion: capability.capabilityVersion,
      targetKind: capability.targetKind,
      targetRef,
      normalizedInputHash,
      occurrenceScope,
    });
    return {
      capability,
      targetRef,
      normalizedInput,
      normalizedInputCanonical,
      normalizedInputHash,
      identityFingerprint,
      idempotencyScope,
      requestIdempotencyKeyHash,
    };
  }

  private initialDecision(
    capability: RegisteredActionCapabilityV1,
    intentExpiresAt: Date | undefined,
    source: SourceValidation,
    now: Date,
  ): InitialDecisionV1 {
    if (intentExpiresAt && intentExpiresAt <= now) {
      return {
        policyDecision: capability.policyDecision,
        approvalDecision:
          capability.approvalRequirement === 'REQUIRED'
            ? ActionApprovalDecision.EXPIRED
            : ActionApprovalDecision.NOT_REQUIRED,
        state: ActionExecutionState.NOT_EXECUTED,
        notExecutedReasonCode: 'intent_expired',
      };
    }
    if (!source.current) {
      return {
        policyDecision: capability.policyDecision,
        approvalDecision:
          capability.approvalRequirement === 'REQUIRED'
            ? ActionApprovalDecision.EXPIRED
            : ActionApprovalDecision.NOT_REQUIRED,
        state: ActionExecutionState.NOT_EXECUTED,
        notExecutedReasonCode: source.reasonCode ?? 'source_not_current',
      };
    }
    if (capability.policyDecision === ActionPolicyDecision.DENY) {
      return {
        policyDecision: ActionPolicyDecision.DENY,
        approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
        state: ActionExecutionState.NOT_EXECUTED,
        notExecutedReasonCode: 'policy_denied',
      };
    }
    if (capability.policyDecision === ActionPolicyDecision.SHADOW_ONLY) {
      return {
        policyDecision: ActionPolicyDecision.SHADOW_ONLY,
        approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
        state: ActionExecutionState.NOT_EXECUTED,
        notExecutedReasonCode: 'shadow_only',
      };
    }
    if (capability.approvalRequirement === 'REQUIRED') {
      return {
        policyDecision: ActionPolicyDecision.ALLOW,
        approvalDecision: ActionApprovalDecision.PENDING,
        state: ActionExecutionState.PENDING_APPROVAL,
      };
    }
    return {
      policyDecision: ActionPolicyDecision.ALLOW,
      approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
      state: ActionExecutionState.READY,
    };
  }

  private initialApproval(
    capability: RegisteredActionCapabilityV1,
    normalizedInputHash: string,
    decision: InitialDecisionV1,
    now: Date,
  ): Pick<
    Prisma.ActionExecutionUncheckedCreateInput,
    | 'approvalDecision'
    | 'approvalInputHash'
    | 'approvalRequestedAt'
    | 'approvalExpiresAt'
    | 'approvalDecidedAt'
  > {
    if (capability.approvalRequirement === 'NONE') {
      return {
        approvalDecision: ActionApprovalDecision.NOT_REQUIRED,
        approvalInputHash: null,
        approvalRequestedAt: null,
        approvalExpiresAt: null,
        approvalDecidedAt: null,
      };
    }
    if (decision.approvalDecision === ActionApprovalDecision.EXPIRED) {
      return {
        approvalDecision: ActionApprovalDecision.EXPIRED,
        approvalInputHash: normalizedInputHash,
        approvalRequestedAt: new Date(now.getTime() - 1),
        approvalExpiresAt: now,
        approvalDecidedAt: now,
      };
    }
    return {
      approvalDecision: ActionApprovalDecision.PENDING,
      approvalInputHash: normalizedInputHash,
      approvalRequestedAt: now,
      approvalExpiresAt: new Date(
        now.getTime() + (capability.approvalTtlMs ?? 15 * 60 * 1_000),
      ),
      approvalDecidedAt: null,
    };
  }

  private async validateSource(
    tx: Prisma.TransactionClient,
    request: TrustedActionExecutionRequestV1,
    capability: RegisteredActionCapabilityV1,
    now: Date,
  ): Promise<SourceValidation> {
    if (request.source.actorUserId) {
      const actor = await tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: request.source.actorUserId,
            tenantId: request.tenantId,
          },
        },
      });
      if (!actor || actor.status !== MembershipStatus.active) {
        throw new ActionContractError(
          'Actor membership is missing or inactive',
        );
      }
    }
    if (request.source.type !== 'agent_task') return { current: true };
    const task = await tx.agentTask.findUnique({
      where: {
        id_tenantId: {
          id: request.source.agentTaskId as string,
          tenantId: request.tenantId,
        },
      },
      include: { opportunity: true },
    });
    if (!task) {
      throw new ActionContractError('AgentTask is missing or cross-tenant');
    }
    if (
      !stringList(task.allowedActionClasses).includes(capability.actionClass)
    ) {
      throw new ActionContractError(
        'AgentTask does not allow the registered action class',
      );
    }
    if (
      task.status !== AgentTaskLifecycleStatus.current ||
      task.expiresAt <= now
    ) {
      return { current: false, reasonCode: 'agent_task_not_current' };
    }
    if (
      task.opportunity.status !== OpportunityLifecycleStatus.active ||
      task.opportunity.expiresAt <= now
    ) {
      return { current: false, reasonCode: 'opportunity_not_current' };
    }
    return { current: true };
  }

  private async findDuplicate(
    tx: Pick<Prisma.TransactionClient, 'actionExecution'>,
    request: TrustedActionExecutionRequestV1,
    normalized: NormalizedActionExecutionV1,
  ): Promise<ActionExecution | null> {
    if (normalized.requestIdempotencyKeyHash && normalized.idempotencyScope) {
      const byCallerKey = await tx.actionExecution.findUnique({
        where: {
          tenantId_idempotencyScope_requestIdempotencyKeyHash: {
            tenantId: request.tenantId,
            idempotencyScope: normalized.idempotencyScope,
            requestIdempotencyKeyHash: normalized.requestIdempotencyKeyHash,
          },
        },
      });
      if (byCallerKey) {
        this.assertDuplicateEquivalent(byCallerKey, normalized);
        return byCallerKey;
      }
    }
    const byIdentity = await tx.actionExecution.findUnique({
      where: {
        tenantId_identityFingerprint: {
          tenantId: request.tenantId,
          identityFingerprint: normalized.identityFingerprint,
        },
      },
    });
    if (byIdentity) this.assertDuplicateEquivalent(byIdentity, normalized);
    return byIdentity;
  }

  private async resolveDuplicate(
    request: TrustedActionExecutionRequestV1,
    normalized: NormalizedActionExecutionV1,
  ): Promise<ActionExecution> {
    const duplicate = await this.findDuplicate(
      this.prisma,
      request,
      normalized,
    );
    if (!duplicate) {
      throw new ActionConflictError(
        'A unique action identity conflicted without a readable execution',
      );
    }
    return duplicate;
  }

  private assertDuplicateEquivalent(
    execution: ActionExecution,
    normalized: NormalizedActionExecutionV1,
  ): void {
    if (
      execution.normalizedInputHash !== normalized.normalizedInputHash ||
      execution.capability !== normalized.capability.capability ||
      execution.actionClass !== normalized.capability.actionClass ||
      execution.targetRef !== normalized.targetRef
    ) {
      throw new ActionConflictError(
        'Caller idempotency key was reused with a changed normalized action',
      );
    }
  }

  private definitionForExecution(
    execution: ActionExecution,
  ): RegisteredActionCapabilityV1 {
    const capability = this.registry.get(execution.capability);
    if (
      capability.capabilityVersion !== execution.capabilityVersion ||
      capability.actionClass !== execution.actionClass ||
      capability.retry.key !== execution.retryPolicyKey ||
      capability.retry.version !== execution.retryPolicyVersion ||
      capability.reconciliation.key !== execution.reconciliationPolicyKey ||
      capability.reconciliation.version !==
        execution.reconciliationPolicyVersion ||
      capability.executorKey === 'shadow.none'
    ) {
      throw new ActionClaimError(
        'CAPABILITY_SNAPSHOT_MISMATCH',
        'Execution does not match the active trusted capability contract',
      );
    }
    return capability;
  }

  private async isExecutionCurrent(
    tx: Prisma.TransactionClient,
    execution: ActionExecution,
    capability: RegisteredActionCapabilityV1,
    now: Date,
  ): Promise<boolean> {
    if (execution.intentExpiresAt && execution.intentExpiresAt <= now)
      return false;
    if (
      execution.approvalRequirement === 'REQUIRED' &&
      (!execution.approvalExpiresAt || execution.approvalExpiresAt <= now)
    ) {
      return false;
    }
    if (execution.sourceType !== 'agent_task') return true;
    if (!execution.agentTaskId) return false;
    const task = await tx.agentTask.findUnique({
      where: {
        id_tenantId: {
          id: execution.agentTaskId,
          tenantId: execution.tenantId,
        },
      },
      include: { opportunity: true },
    });
    return Boolean(
      task &&
      task.status === AgentTaskLifecycleStatus.current &&
      task.expiresAt > now &&
      task.opportunity.status === OpportunityLifecycleStatus.active &&
      task.opportunity.expiresAt > now &&
      stringList(task.allowedActionClasses).includes(capability.actionClass),
    );
  }

  private async assertExecutionCurrent(
    tx: Prisma.TransactionClient,
    execution: ActionExecution,
    capability: RegisteredActionCapabilityV1,
    now: Date,
  ): Promise<void> {
    if (!(await this.isExecutionCurrent(tx, execution, capability, now))) {
      throw new ActionClaimError(
        'EXECUTION_SOURCE_NOT_CURRENT',
        'Execution source, intent, policy, or approval is no longer current',
      );
    }
  }

  private async lockExecution(
    tx: Prisma.TransactionClient,
    tenantId: string,
    executionId: string,
  ): Promise<ActionExecution> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ActionExecution"
      WHERE "id" = ${executionId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new ActionClaimError(
        'EXECUTION_NOT_FOUND',
        'Execution was not found',
      );
    }
    return tx.actionExecution.findUniqueOrThrow({
      where: { id_tenantId: { id: executionId, tenantId } },
    });
  }

  private async nextAttemptNumber(
    tx: Prisma.TransactionClient,
    execution: ActionExecution,
  ): Promise<number> {
    const aggregate = await tx.actionAttempt.aggregate({
      where: {
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
      },
      _max: { attemptNumber: true },
    });
    return (aggregate._max.attemptNumber ?? 0) + 1;
  }

  private async lockOwnedAttempt(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      executionId: string;
      attemptId: string;
      leaseToken: string;
    },
    expectedExecutionState: ActionExecutionState = ActionExecutionState.EXECUTING,
    expectedAttemptKind: ActionAttemptKind = ActionAttemptKind.EXECUTION,
  ): Promise<{ execution: ActionExecution; attempt: ActionAttempt }> {
    const execution = await this.lockExecution(
      tx,
      input.tenantId,
      input.executionId,
    );
    if (execution.state !== expectedExecutionState) {
      throw new ActionClaimError(
        'EXECUTION_STATE_CHANGED',
        `Execution is ${execution.state}, expected ${expectedExecutionState}`,
      );
    }
    const expectedHash = this.identity.leaseTokenHash({
      tenantId: input.tenantId,
      executionId: execution.id,
      leaseToken: input.leaseToken,
    });
    if (
      !execution.leaseTokenHash ||
      execution.leaseTokenHash !== expectedHash ||
      !execution.leaseExpiresAt ||
      execution.leaseExpiresAt <= this.now()
    ) {
      throw new ActionLeaseError(
        'Worker lease is missing, expired, or invalid',
      );
    }
    const attempt = await tx.actionAttempt.findUnique({
      where: {
        id_tenantId: { id: input.attemptId, tenantId: input.tenantId },
      },
    });
    if (
      !attempt ||
      attempt.actionExecutionId !== execution.id ||
      attempt.kind !== expectedAttemptKind ||
      attempt.state !== ActionAttemptState.STARTED
    ) {
      throw new ActionClaimError(
        'OPEN_ATTEMPT_INVALID',
        'Open attempt does not belong to this lease and execution',
      );
    }
    return { execution, attempt };
  }

  private async updateDispatch(
    input: {
      tenantId: string;
      executionId: string;
      attemptId: string;
      leaseToken: string;
    },
    next: ExternalDispatchState,
  ): Promise<ActionAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const { attempt } = await this.lockOwnedAttempt(tx, input);
      if (
        next === ExternalDispatchState.ACKNOWLEDGED &&
        attempt.externalDispatchState === ExternalDispatchState.NOT_CROSSED
      ) {
        throw new ActionClaimError(
          'DISPATCH_BOUNDARY_NOT_RECORDED',
          'MAY_HAVE_CROSSED must be durable before provider acknowledgement',
        );
      }
      return tx.actionAttempt.update({
        where: { id_tenantId: { id: attempt.id, tenantId: input.tenantId } },
        data: { externalDispatchState: next },
      });
    });
  }

  private result(execution: ActionExecution): ExecutionResultV1 {
    const safeResult = execution.safeResultSummaryJson;
    return {
      contract: ACTION_EXECUTION_RESULT_CONTRACT,
      executionId: execution.id,
      state: execution.state,
      ...(execution.finalOutcomeCode
        ? { outcomeCode: execution.finalOutcomeCode }
        : {}),
      ...(safeResult &&
      typeof safeResult === 'object' &&
      !Array.isArray(safeResult)
        ? { safeResult }
        : {}),
    };
  }
}

export function isActionEngineError(
  error: unknown,
): error is ActionEngineError {
  return error instanceof ActionEngineError;
}
