import { ConflictException, Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  type ActionExecution,
  type AiToolExecution,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { TrustedActionExecutionRequestV1 } from '../action-engine/action-engine.contract';
import { ActionEngineKernel } from '../action-engine/action-engine.kernel';
import { stableActionJson } from '../action-engine/action-engine.identity';
import { withActionInvocationReceipt } from '../action-engine/action-invocation-receipt.context';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AiToolPrincipal,
  ValidatedAiToolArguments,
} from './ai-tool.types';

export const AI_CANONICAL_RECEIPT_CONTRACT = 'maya.ai-canonical-receipt/1';

interface ReceiptBinding {
  executionId: string;
  capability: string;
  identityFingerprint: string;
  normalizedInputHash: string;
  routeKey: string;
  request: TrustedActionExecutionRequestV1 | null;
}

/** Encrypted compatibility data, never an action/attempt lifecycle. Canonical
 * state is read fresh; no FAILED/UNKNOWN decision is authoritative here. */
export interface AiCanonicalReceipt {
  contract: typeof AI_CANONICAL_RECEIPT_CONTRACT;
  inputHash: string;
  arguments: ValidatedAiToolArguments;
  bindings: ReceiptBinding[];
  /** Fences receipt appends to the live invocation that attached its first slot.
   * Not an action claim/lease; replay can only observe existing canonical IDs. */
  admissionToken?: string;
  /** Only the awaited handler returning and its result being saved sets this.
   * A successful prefix of canonical actions cannot infer tool completion. */
  settled?: true;
  result?: unknown;
}

export interface AiReceiptInvocation {
  id: string;
  principal: AiToolPrincipal;
  toolName: string;
  inputHash: string;
  idempotencyKey: string;
}

@Injectable()
export class AiToolReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Optional() private readonly kernel?: ActionEngineKernel,
  ) {}

  initial(inputHash: string, args: ValidatedAiToolArguments): string {
    return this.encrypt({
      contract: AI_CANONICAL_RECEIPT_CONTRACT,
      inputHash,
      arguments: args,
      bindings: [],
    });
  }

  read(value: string | null): AiCanonicalReceipt | null {
    if (!value) return null;
    const decoded: unknown = JSON.parse(this.encryption.decrypt(value));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
      return null;
    const receipt = decoded as AiCanonicalReceipt;
    if (receipt.contract !== AI_CANONICAL_RECEIPT_CONTRACT) return null;
    if (
      typeof receipt.inputHash !== 'string' ||
      !receipt.arguments ||
      !Array.isArray(receipt.bindings)
    )
      this.conflict('ai_tool_receipt_invalid');
    return receipt;
  }

  async run<T>(
    invocation: AiReceiptInvocation,
    work: (args: ValidatedAiToolArguments) => Promise<T>,
  ): Promise<T> {
    const row = await this.row(invocation, this.prisma);
    const envelope = this.requireEnvelope(row, invocation);
    // A restarted invocation may observe/resume only its admitted set. It
    // cannot acquire a new logical delivery/action because mutable data changed.
    const resumed = envelope.bindings.length > 0;
    const admissionToken = randomUUID();
    return withActionInvocationReceipt(
      {
        admit: (request, persist, transaction) =>
          this.transaction(transaction, async (tx) => {
            const current = await this.locked(invocation, tx);
            const receipt = this.requireEnvelope(current, invocation);
            this.assertRequestPrincipal(invocation, request);
            const routeKey = this.routeKey(request);
            const binding = receipt.bindings.find(
              (item) => item.routeKey === routeKey,
            );
            if (binding) {
              const existing = await this.boundExecution(
                invocation,
                binding,
                tx,
              );
              // Keep mutable before-state and intent exactly as admitted. Policy
              // revalidation and effect claims still belong to the existing owner.
              if (binding.request && existing.state === 'READY') {
                const original = await this.restoreRequest(
                  binding.request,
                  existing,
                );
                const admitted = await persist(original, tx);
                if (admitted.id !== existing.id)
                  this.conflict('ai_tool_canonical_receipt_mismatch');
                return admitted;
              }
              return existing;
            }
            if (
              resumed ||
              receipt.settled ||
              (receipt.bindings.length > 0 &&
                receipt.admissionToken !== admissionToken)
            )
              this.conflict('ai_tool_canonical_plan_changed');
            await this.assertPreviousResolved(invocation, receipt, tx);
            const execution = await persist(request, tx);
            this.assertExecutionPrincipal(invocation, execution);
            receipt.admissionToken = admissionToken;
            this.append(receipt, execution, routeKey, request);
            await this.save(invocation, receipt, tx);
            // Returning from this awaited transaction is the first point where an
            // owner may start its effect. Failed/ambiguous commit permits no dispatch.
            return execution;
          }),
        observe: (execution) =>
          this.transaction(undefined, async (tx) => {
            const current = await this.locked(invocation, tx);
            const receipt = this.requireEnvelope(current, invocation);
            this.assertExecutionPrincipal(invocation, execution);
            const binding = receipt.bindings.find(
              (item) => item.executionId === execution.id,
            );
            if (binding) {
              await this.boundExecution(invocation, binding, tx);
              return;
            }
            if (
              resumed ||
              receipt.settled ||
              (receipt.bindings.length > 0 &&
                receipt.admissionToken !== admissionToken)
            )
              this.conflict('ai_tool_canonical_plan_changed');
            await this.assertPreviousResolved(invocation, receipt, tx);
            receipt.admissionToken = admissionToken;
            this.append(receipt, execution, `existing:${execution.id}`, null);
            await this.save(invocation, receipt, tx);
          }),
      },
      () => work(envelope.arguments),
    );
  }

  async project(
    invocation: AiReceiptInvocation,
    options?: {
      result?: unknown;
      hasResult?: boolean;
      errorCode?: string;
      handlerSettled?: boolean;
    },
  ) {
    return this.transaction(undefined, async (tx) => {
      const row = await this.locked(invocation, tx);
      const receipt = this.requireEnvelope(row, invocation);
      const executions = await Promise.all(
        receipt.bindings.map((binding) =>
          this.boundExecution(invocation, binding, tx),
        ),
      );
      const allSucceeded =
        executions.length > 0 &&
        executions.every((execution) => execution.state === 'SUCCEEDED');
      if (allSucceeded && options?.hasResult && options.handlerSettled) {
        receipt.result = options.result;
        receipt.settled = true;
      }
      const completed = allSucceeded && receipt.settled === true;
      const incomplete = allSucceeded && !completed;
      const terminalFailure = executions.find(
        (execution) =>
          execution.state === 'FAILED' || execution.state === 'NOT_EXECUTED',
      );
      const unknown = executions.some(
        (execution) => execution.state === 'UNKNOWN',
      );
      const unresolved = executions.some(
        (execution) =>
          !['SUCCEEDED', 'FAILED', 'NOT_EXECUTED'].includes(execution.state),
      );
      const notAdmitted = executions.length === 0 && options?.handlerSettled;
      const status = completed
        ? 'completed'
        : unknown || incomplete
          ? 'unknown'
          : unresolved
            ? 'executing'
            : terminalFailure
              ? 'failed'
              : notAdmitted
                ? 'not_executed'
                : 'executing';
      // Presentation failure cannot erase a canonical success. Save a result
      // only when all associated canonical actions have proved success.
      const errorCode =
        terminalFailure?.finalOutcomeCode ??
        terminalFailure?.notExecutedReasonCode ??
        (unknown
          ? 'ai_tool_outcome_unknown'
          : incomplete
            ? 'ai_tool_continuation_unconfirmed'
            : completed
              ? null
              : (options?.errorCode ??
                (notAdmitted
                  ? 'ai_tool_canonical_action_not_admitted'
                  : null)));
      const completedAt =
        completed || (!unresolved && terminalFailure) || notAdmitted
          ? new Date()
          : null;
      const compatibilityStatus =
        status === 'unknown'
          ? 'executing'
          : status === 'not_executed'
            ? 'failed'
            : status;
      await tx.aiToolExecution.update({
        where: { id: invocation.id },
        data: {
          encryptedResult: this.encrypt(receipt),
          status: compatibilityStatus,
          errorCode,
          completedAt,
        },
      });
      if (row.approvalRequestId) {
        await tx.aiApprovalRequest.update({
          where: {
            id_tenantId: {
              id: row.approvalRequestId,
              tenantId: invocation.principal.tenantId,
            },
          },
          data: {
            status: compatibilityStatus,
            errorCode,
            executedAt: completed ? completedAt : null,
          },
        });
      }
      return {
        status,
        execution_id: row.id,
        tool_name: row.toolName,
        result: completed
          ? (receipt.result ?? {
              canonical_actions: executions.map((execution) =>
                this.safeReceipt(execution),
              ),
            })
          : undefined,
        canonical_actions: executions.map((execution) =>
          this.safeReceipt(execution),
        ),
        ...(incomplete
          ? { continuation: 'manual_required', invocation_completed: false }
          : {}),
        ...(errorCode ? { error: { code: errorCode } } : {}),
      };
    });
  }

  async inspect(invocation: AiReceiptInvocation) {
    const row = await this.row(invocation, this.prisma);
    const receipt = this.requireEnvelope(row, invocation);
    const executions = await Promise.all(
      receipt.bindings.map((binding) =>
        this.boundExecution(invocation, binding, this.prisma),
      ),
    );
    return { receipt, executions };
  }

  private async assertPreviousResolved(
    invocation: AiReceiptInvocation,
    receipt: AiCanonicalReceipt,
    tx: Prisma.TransactionClient,
  ) {
    for (const binding of receipt.bindings) {
      if (
        (await this.boundExecution(invocation, binding, tx)).state !==
        'SUCCEEDED'
      )
        this.conflict('ai_tool_previous_canonical_action_unresolved');
    }
  }

  private safeReceipt(execution: ActionExecution) {
    return {
      contract: 'maya.action-execution-result/1',
      executionId: execution.id,
      state: execution.state,
      outcomeCode:
        execution.finalOutcomeCode ?? execution.notExecutedReasonCode ?? null,
      reconciliationState: execution.reconciliationState,
      safeResult: execution.safeResultSummaryJson,
    };
  }

  private append(
    receipt: AiCanonicalReceipt,
    execution: ActionExecution,
    routeKey: string,
    request: TrustedActionExecutionRequestV1 | null,
  ) {
    const previous = receipt.bindings.find(
      (item) => item.executionId === execution.id,
    );
    if (previous) return;
    if (receipt.bindings.length >= 32)
      this.conflict('ai_tool_canonical_receipt_limit');
    receipt.bindings.push({
      executionId: execution.id,
      capability: execution.capability,
      identityFingerprint: execution.identityFingerprint,
      normalizedInputHash: execution.normalizedInputHash,
      routeKey,
      request: request ? { ...request, input: null } : null,
    });
  }

  private assertRequestPrincipal(
    invocation: AiReceiptInvocation,
    request: TrustedActionExecutionRequestV1,
  ) {
    if (
      request.tenantId !== invocation.principal.tenantId ||
      (request.source.actorUserId &&
        request.source.actorUserId !== invocation.principal.userId)
    )
      this.conflict('ai_tool_canonical_principal_mismatch');
  }

  private assertExecutionPrincipal(
    invocation: AiReceiptInvocation,
    execution: ActionExecution,
  ) {
    if (
      execution.tenantId !== invocation.principal.tenantId ||
      (execution.actorUserId &&
        execution.actorUserId !== invocation.principal.userId)
    )
      this.conflict('ai_tool_canonical_principal_mismatch');
  }

  private routeKey(request: TrustedActionExecutionRequestV1): string {
    return createHash('sha256')
      .update(
        stableActionJson({
          capability: request.capability,
          tenantId: request.tenantId,
          source: request.source,
          targetRef: request.targetRef,
          callerIdempotency: request.callerIdempotency ?? null,
        }),
      )
      .digest('hex');
  }

  private async restoreRequest(
    request: TrustedActionExecutionRequestV1,
    execution: ActionExecution,
  ): Promise<TrustedActionExecutionRequestV1> {
    if (!this.kernel)
      this.conflict('ai_tool_canonical_payload_reader_unavailable');
    // Canonical payload retention remains authoritative: do not retain a second
    // provider/normalized-input copy in the compatibility result column.
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    return {
      ...request,
      input,
      ...(request.intentExpiresAt
        ? { intentExpiresAt: new Date(request.intentExpiresAt) }
        : {}),
    };
  }

  private async boundExecution(
    invocation: AiReceiptInvocation,
    binding: ReceiptBinding,
    db: Pick<Prisma.TransactionClient, 'actionExecution'>,
  ) {
    const execution = await db.actionExecution.findUnique({
      where: {
        id_tenantId: {
          id: binding.executionId,
          tenantId: invocation.principal.tenantId,
        },
      },
    });
    if (
      !execution ||
      execution.capability !== binding.capability ||
      execution.identityFingerprint !== binding.identityFingerprint ||
      execution.normalizedInputHash !== binding.normalizedInputHash
    )
      this.conflict('ai_tool_canonical_receipt_unavailable');
    this.assertExecutionPrincipal(invocation, execution);
    return execution;
  }

  private async row(
    invocation: AiReceiptInvocation,
    db: Pick<Prisma.TransactionClient, 'aiToolExecution'>,
  ): Promise<AiToolExecution> {
    const row = await db.aiToolExecution.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: invocation.principal.tenantId,
          idempotencyKey: invocation.idempotencyKey,
        },
      },
    });
    if (
      !row ||
      row.id !== invocation.id ||
      row.actorUserId !== invocation.principal.userId ||
      row.toolName !== invocation.toolName ||
      row.surface !== invocation.principal.surface ||
      row.inputHash !== invocation.inputHash
    )
      this.conflict('ai_tool_idempotency_conflict');
    return row;
  }

  private async locked(
    invocation: AiReceiptInvocation,
    tx: Prisma.TransactionClient,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "AiToolExecution" WHERE id = ${invocation.id} AND "tenantId" = ${invocation.principal.tenantId} FOR UPDATE`,
    );
    return this.row(invocation, tx);
  }

  private requireEnvelope(
    row: AiToolExecution,
    invocation: AiReceiptInvocation,
  ): AiCanonicalReceipt {
    const receipt = this.read(row.encryptedResult);
    if (!receipt || receipt.inputHash !== invocation.inputHash)
      this.conflict('ai_tool_historical_receipt_unavailable');
    return receipt;
  }

  private async save(
    invocation: AiReceiptInvocation,
    receipt: AiCanonicalReceipt,
    tx: Prisma.TransactionClient,
  ) {
    await tx.aiToolExecution.update({
      where: { id: invocation.id },
      data: { encryptedResult: this.encrypt(receipt) },
    });
  }

  private encrypt(receipt: AiCanonicalReceipt): string {
    return this.encryption.encrypt(JSON.stringify(receipt));
  }

  private transaction<T>(
    tx: Prisma.TransactionClient | undefined,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return tx ? work(tx) : this.prisma.$transaction(work);
  }

  private conflict(code: string): never {
    throw new ConflictException({
      message: 'Canonical AI action receipt cannot be used.',
      error: { code },
    });
  }
}
