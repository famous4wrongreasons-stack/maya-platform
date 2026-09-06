import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  ActionExecutionState,
  ActionPolicyDecision,
  ActionReconciliationState,
  type ActionExecution,
} from '@prisma/client';

import type {
  ActionExecutionPreviewV1,
  ExecutionResultV1,
  ReconciliationOutcome,
  TrustedActionExecutionRequestV1,
} from './action-engine.contract';
import {
  ActionClaimError,
  ActionContractError,
  ActionExecutionTerminalError,
  ActionExecutionUncertainError,
} from './action-engine.errors';
import { CanonicalActionIngressService } from './action-engine.ingress';
import { ActionEngineKernel } from './action-engine.kernel';

export type ActionRuntimePhase = 'prepare' | 'dispatch';

export interface ActionDispatchSuccess<T> {
  value: T;
  safeResult: Record<string, unknown>;
}

export interface ActionReconciliationDecision {
  outcome: ReconciliationOutcome;
  safeResult?: Record<string, unknown>;
}

export interface ActionFailureClassification {
  kind: 'definitive' | 'unknown';
  outcomeCode: string;
  errorClass: string;
}

export interface ActionRuntimeContextV1 {
  tenantId: string;
  executionId: string;
}

export interface ActionRuntimeHandlers<T> {
  prepare?(
    normalizedInput: Record<string, unknown>,
    context: ActionRuntimeContextV1,
  ): Promise<Record<string, unknown> | undefined>;
  dispatch(
    normalizedInput: Record<string, unknown>,
    transportIdempotencyKey: string,
    context: ActionRuntimeContextV1,
  ): Promise<ActionDispatchSuccess<T>>;
  reconcile(
    normalizedInput: Record<string, unknown>,
    preDispatchContext?: Record<string, unknown>,
    context?: ActionRuntimeContextV1,
  ): Promise<ActionReconciliationDecision>;
  restore(safeResult: Record<string, unknown>): T;
  classifyError(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification;
}

export interface ActionRuntimeReceipt<T> {
  value: T;
  execution: ExecutionResultV1;
}

type ErrorWithExecutionResult = Error & {
  actionExecutionResult?: ExecutionResultV1;
};

export function actionExecutionResultFromError(
  error: unknown,
): ExecutionResultV1 | undefined {
  if (!(error instanceof Error)) return undefined;
  return (error as ErrorWithExecutionResult).actionExecutionResult;
}

const MAX_RUNTIME_TRANSITIONS = 8;
const IN_FLIGHT_POLL_ATTEMPTS = 8;
const IN_FLIGHT_POLL_MS = 50;

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class ActionEngineRuntimeService {
  // Each transport alias still passes canonical ingress. Coalesce only the
  // execution loop after the database has established one durable identity;
  // waiting claims must not occupy the pool needed by its policy recheck.
  private readonly runningExecutions = new Map<
    string,
    Promise<ActionRuntimeReceipt<unknown>>
  >();
  private readonly workerId = `action-runtime:${randomUUID()}`;

  constructor(
    private readonly kernel: ActionEngineKernel,
    private readonly canonicalIngress: CanonicalActionIngressService,
  ) {}

  async execute<T>(
    request: TrustedActionExecutionRequestV1,
    handlers: ActionRuntimeHandlers<T>,
  ): Promise<T> {
    return (await this.executeWithReceipt(request, handlers)).value;
  }

  preview(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionExecutionPreviewV1> {
    return this.canonicalIngress.preview(request);
  }

  /**
   * Persists a policy-denied shadow projection without invoking an executor.
   * Only capabilities that are registered as SHADOW_ONLY can use this path.
   */
  async planShadow(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionExecution> {
    const preview = await this.canonicalIngress.preview(request);
    if (
      preview.policyDecision !== ActionPolicyDecision.SHADOW_ONLY ||
      preview.executorKey !== 'shadow.none' ||
      preview.externalSideEffects !== 0
    ) {
      throw new ActionContractError(
        'planShadow accepts only non-executable SHADOW_ONLY capabilities',
      );
    }
    const execution = await this.canonicalIngress.createExecution(request);
    if (
      !execution.dryRun ||
      execution.policyDecision !== ActionPolicyDecision.SHADOW_ONLY ||
      execution.state !== ActionExecutionState.NOT_EXECUTED ||
      execution.notExecutedReasonCode !== 'shadow_only'
    ) {
      throw new ActionContractError(
        'Shadow ActionExecution did not preserve the non-execution invariant',
      );
    }
    return execution;
  }

  getExecutionResult(
    tenantId: string,
    executionId: string,
  ): Promise<ExecutionResultV1> {
    return this.kernel.getExecutionResult(tenantId, executionId);
  }

  async executeWithReceipt<T>(
    request: TrustedActionExecutionRequestV1,
    handlers: ActionRuntimeHandlers<T>,
  ): Promise<ActionRuntimeReceipt<T>> {
    const execution = await this.canonicalIngress.createExecution(request);
    const key = JSON.stringify([execution.tenantId, execution.id]);
    const running = this.runningExecutions.get(key);
    if (running) {
      const result = await running;
      const current = (
        await this.kernel.getAudit(execution.tenantId, execution.id)
      ).execution;
      return {
        execution: result.execution,
        value: handlers.restore(this.requireSafeResult(current)),
      };
    }
    const operation = this.continueExecution(execution, handlers);
    this.runningExecutions.set(key, operation);
    try {
      return await operation;
    } finally {
      this.runningExecutions.delete(key);
    }
  }

  private async continueExecution<T>(
    execution: ActionExecution,
    handlers: ActionRuntimeHandlers<T>,
  ): Promise<ActionRuntimeReceipt<T>> {
    try {
      for (
        let transition = 0;
        transition < MAX_RUNTIME_TRANSITIONS;
        transition += 1
      ) {
        if (execution.state === ActionExecutionState.SUCCEEDED) {
          return {
            value: handlers.restore(this.requireSafeResult(execution)),
            execution: await this.kernel.getExecutionResult(
              execution.tenantId,
              execution.id,
            ),
          };
        }
        if (execution.state === ActionExecutionState.FAILED) {
          throw new ActionExecutionTerminalError(
            execution.finalOutcomeCode ?? 'ACTION_PREVIOUSLY_FAILED',
            'The logical action previously reached a definitive failure',
          );
        }
        if (execution.state === ActionExecutionState.NOT_EXECUTED) {
          throw new ActionExecutionTerminalError(
            execution.notExecutedReasonCode ?? 'ACTION_NOT_EXECUTED',
            'Action policy or approval did not allow execution',
          );
        }
        if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
          throw new ActionExecutionTerminalError(
            'ACTION_APPROVAL_REQUIRED',
            'Action is waiting for an approval decision',
          );
        }
        if (execution.state === ActionExecutionState.EXECUTING) {
          execution = await this.observeOrRecoverInFlight(execution);
          continue;
        }
        if (execution.state === ActionExecutionState.UNKNOWN) {
          execution = await this.reconcile(execution, handlers);
          continue;
        }
        if (execution.state !== ActionExecutionState.READY) {
          throw new ActionExecutionUncertainError(
            'ACTION_STATE_UNSUPPORTED',
            `Action cannot continue from ${String(execution.state)}`,
          );
        }

        execution = await this.dispatch(execution, handlers);
      }

      throw new ActionExecutionUncertainError(
        'ACTION_TRANSITION_BUDGET_EXHAUSTED',
        'Action did not settle within the runtime transition budget',
      );
    } catch (error) {
      await this.attachExecutionResult(error, execution);
      throw error;
    }
  }

  private async attachExecutionResult(
    error: unknown,
    execution: ActionExecution,
  ): Promise<void> {
    if (!(error instanceof Error)) return;
    try {
      Object.defineProperty(error, 'actionExecutionResult', {
        configurable: true,
        enumerable: false,
        value: await this.kernel.getExecutionResult(
          execution.tenantId,
          execution.id,
        ),
        writable: false,
      });
    } catch {
      // Never replace the original provider/runtime error with a receipt read.
    }
  }

  private async dispatch<T>(
    execution: ActionExecution,
    handlers: ActionRuntimeHandlers<T>,
  ): Promise<ActionExecution> {
    let claim;
    try {
      claim = await this.kernel.claimExecution({
        tenantId: execution.tenantId,
        executionId: execution.id,
        workerId: this.workerId,
      });
    } catch (error) {
      if (
        error instanceof ActionClaimError &&
        (error.code === 'EXECUTION_NOT_READY' ||
          error.code === 'EXECUTION_TERMINAL')
      ) {
        // Another worker won the durable claim between our read and claim.
        // Refreshing lets the normal loop observe/recover that execution
        // without issuing a second provider mutation.
        return (await this.kernel.getAudit(execution.tenantId, execution.id))
          .execution;
      }
      throw error;
    }
    const claimInput = {
      tenantId: execution.tenantId,
      executionId: execution.id,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
    };
    const normalizedInput = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );

    let preDispatchContext: Record<string, unknown> | undefined;
    try {
      preDispatchContext = await handlers.prepare?.(normalizedInput, {
        tenantId: execution.tenantId,
        executionId: execution.id,
      });
      if (preDispatchContext) {
        await this.kernel.recordAttemptContext({
          ...claimInput,
          context: preDispatchContext,
        });
      }
    } catch (error) {
      const failure = handlers.classifyError(error, 'prepare');
      const result = await this.kernel.finalizeDefinitiveFailure({
        ...claimInput,
        outcomeCode: failure.outcomeCode,
        errorClass: failure.errorClass,
      });
      if (result.state === ActionExecutionState.READY) {
        return (await this.kernel.getAudit(execution.tenantId, execution.id))
          .execution;
      }
      throw error;
    }

    await this.kernel.markDispatchMayHaveCrossed(claimInput);
    let dispatched: ActionDispatchSuccess<T>;
    try {
      dispatched = await handlers.dispatch(
        normalizedInput,
        claim.execution.transportIdempotencyKey,
        { tenantId: execution.tenantId, executionId: execution.id },
      );
    } catch (error) {
      const failure = handlers.classifyError(error, 'dispatch');
      if (failure.kind === 'unknown') {
        await this.kernel.finalizeUnknown({
          ...claimInput,
          outcomeCode: failure.outcomeCode,
          errorClass: failure.errorClass,
        });
        return (await this.kernel.getAudit(execution.tenantId, execution.id))
          .execution;
      }

      await this.kernel.markDispatchAcknowledged(claimInput);
      await this.kernel.finalizeDefinitiveFailure({
        ...claimInput,
        outcomeCode: failure.outcomeCode,
        errorClass: failure.errorClass,
      });
      throw error;
    }

    // Persistence errors after a provider acknowledgement are not provider
    // failures. Let restart recovery reconcile them instead of classifying the
    // local error and risking another external dispatch.
    await this.kernel.markDispatchAcknowledged(claimInput);
    await this.kernel.finalizeSuccess({
      ...claimInput,
      outcomeCode: 'provider_applied',
      safeResult: dispatched.safeResult,
    });
    return (await this.kernel.getAudit(execution.tenantId, execution.id))
      .execution;
  }

  private async reconcile<T>(
    execution: ActionExecution,
    handlers: ActionRuntimeHandlers<T>,
  ): Promise<ActionExecution> {
    if (
      execution.reconciliationState ===
      ActionReconciliationState.MANUAL_REQUIRED
    ) {
      throw new ActionExecutionUncertainError(
        'ACTION_RECONCILIATION_MANUAL_REQUIRED',
        'Canonical reads could not resolve the provider outcome',
      );
    }
    if (
      execution.reconciliationState === ActionReconciliationState.IN_PROGRESS
    ) {
      return this.observeOrRecoverInFlight(execution);
    }

    const claim = await this.kernel.claimReconciliation({
      tenantId: execution.tenantId,
      executionId: execution.id,
      workerId: this.workerId,
    });
    const normalizedInput = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    const preDispatchContext = await this.kernel.readLatestPreDispatchContext(
      execution.tenantId,
      execution.id,
    );

    let decision: ActionReconciliationDecision;
    try {
      decision = await handlers.reconcile(normalizedInput, preDispatchContext, {
        tenantId: execution.tenantId,
        executionId: execution.id,
      });
    } catch {
      decision = { outcome: 'STILL_UNKNOWN' };
    }
    await this.kernel.finalizeReconciliation({
      tenantId: execution.tenantId,
      executionId: execution.id,
      attemptId: claim.attempt.id,
      leaseToken: claim.leaseToken,
      outcome: decision.outcome,
      safeResult: decision.safeResult,
    });
    return (await this.kernel.getAudit(execution.tenantId, execution.id))
      .execution;
  }

  private async observeOrRecoverInFlight(
    execution: ActionExecution,
  ): Promise<ActionExecution> {
    if (execution.leaseExpiresAt && execution.leaseExpiresAt <= new Date()) {
      return this.kernel.recoverExpiredClaim({
        tenantId: execution.tenantId,
        executionId: execution.id,
      });
    }
    for (let attempt = 0; attempt < IN_FLIGHT_POLL_ATTEMPTS; attempt += 1) {
      await sleep(IN_FLIGHT_POLL_MS);
      const current = (
        await this.kernel.getAudit(execution.tenantId, execution.id)
      ).execution;
      if (
        current.state !== ActionExecutionState.EXECUTING &&
        current.reconciliationState !== ActionReconciliationState.IN_PROGRESS
      ) {
        return current;
      }
      execution = current;
    }
    throw new ActionExecutionUncertainError(
      'ACTION_ALREADY_IN_PROGRESS',
      'The same logical action is already being processed',
    );
  }

  private requireSafeResult(
    execution: ActionExecution,
  ): Record<string, unknown> {
    const safeResult = jsonRecord(execution.safeResultSummaryJson);
    if (!safeResult) {
      throw new ActionContractError(
        'Successful action is missing its durable safe result',
      );
    }
    return safeResult;
  }
}
