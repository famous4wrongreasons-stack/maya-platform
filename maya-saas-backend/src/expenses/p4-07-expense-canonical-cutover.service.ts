import { BadRequestException, Injectable } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ActionEngineKernel,
  CanonicalActionIngressService,
  P4_07_EXECUTABLE_CAPABILITIES,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseCanonicalShadowService } from './expense-canonical-shadow.service';
import {
  P407ExpenseExecutableService,
  type P407ExecutionValue,
} from './p4-07-expense-executable.service';

export interface P407CreateInvocation {
  initiator: 'http' | 'ai_tool';
  sourceIntentRef: string;
}

/**
 * Production adapter from the authenticated HTTP/AI initiators to the one
 * canonical local PostgreSQL owner. It derives the exact same request facts
 * as Shadow, records actor confirmation when the trusted initiator boundary
 * already represents that confirmation, and never performs a domain write.
 */
@Injectable()
export class P407ExpenseCanonicalCutoverService {
  constructor(
    private readonly planner: ExpenseCanonicalShadowService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly executor: P407ExpenseExecutableService,
  ) {}

  async create(
    tenantId: string,
    actorUserId: string,
    dto: CreateExpenseDto,
    invocation: P407CreateInvocation,
  ): Promise<P407ExecutionValue> {
    const sourceIntentRef = this.intentRef(invocation.sourceIntentRef);
    const request = await this.planner.buildCreateRequest(
      tenantId,
      actorUserId,
      {
        initiator: invocation.initiator,
        source_intent_ref: sourceIntentRef,
        category: dto.category,
        amount_kopecks: dto.amountKopecks,
        currency: dto.currency,
        occurred_at: dto.occurredAt,
        branch_id: dto.branchId,
        note: dto.note,
      },
      P4_07_EXECUTABLE_CAPABILITIES.create,
    );
    await this.recordActorConfirmation(request, actorUserId);
    return this.executor.execute(request);
  }

  async remove(
    tenantId: string,
    actorUserId: string,
    expenseId: string,
  ): Promise<P407ExecutionValue> {
    const request = await this.planner.buildDeleteRequest(
      tenantId,
      actorUserId,
      {
        initiator: 'http',
        source_intent_ref: `expense-delete:${expenseId}`,
        expense_id: expenseId,
      },
      P4_07_EXECUTABLE_CAPABILITIES.delete,
    );
    await this.recordActorConfirmation(request, actorUserId);
    return this.executor.execute(request);
  }

  async declare(
    tenantId: string,
    actorUserId: string,
    periodFromDay: string,
    periodToDay: string,
    sourceIntentRef: string,
  ): Promise<P407ExecutionValue> {
    const request = await this.planner.buildDeclareRequest(
      tenantId,
      actorUserId,
      {
        initiator: 'ai_tool',
        source_intent_ref: this.intentRef(sourceIntentRef),
        period_from_day: periodFromDay,
        period_to_day: periodToDay,
      },
      P4_07_EXECUTABLE_CAPABILITIES.declare,
    );
    return this.executor.execute(request);
  }

  private async recordActorConfirmation(
    request: TrustedActionExecutionRequestV1,
    actorUserId: string,
  ): Promise<void> {
    let execution = await this.ingress.createExecution(request);
    if (execution.state !== ActionExecutionState.PENDING_APPROVAL) return;
    try {
      await this.kernel.decideApproval({
        tenantId: request.tenantId,
        executionId: execution.id,
        approverUserId: actorUserId,
        decision: 'APPROVED',
      });
    } catch (error) {
      // A duplicate initiator may have approved the same deterministic
      // execution first. Re-read through canonical ingress and accept only a
      // state which can safely execute or restore the committed result.
      execution = await this.ingress.createExecution(request);
      if (
        execution.state !== ActionExecutionState.READY &&
        execution.state !== ActionExecutionState.SUCCEEDED
      ) {
        throw error;
      }
    }
  }

  private intentRef(value: string): string {
    const normalized = value?.trim();
    if (!normalized || normalized.length > 240) {
      throw new BadRequestException(
        'A stable Idempotency-Key is required for this expense action',
      );
    }
    return normalized;
  }
}
