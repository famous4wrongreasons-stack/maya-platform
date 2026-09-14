import { randomUUID } from 'node:crypto';

import {
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
  CanonicalActionIngressService,
  ActionEngineKernel,
  P4_07_EXECUTABLE_CAPABILITIES,
  type P407ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  expenseLedgerSnapshotHash,
  expensePeriodDeclarationIdentityHash,
  p407Hash,
} from './expense-canonical-shadow.service';

export class P407ExpenseExecutionError extends Error {}

export interface P407ExecutionValue {
  actionClass: P407ActionClass;
  actionExecutionId: string;
  expenseId?: string;
  declarationId?: string;
  declarationEpoch?: number;
  deletionIdentityHash?: string;
  declarationIdentityHash?: string;
  invalidatedDeclarationIds: string[];
  expenseCreates: number;
  expenseDeletes: number;
  declarationCreates: number;
  unknownApplicable: false;
  providerWrites: 0;
}

const ACTION_BY_CAPABILITY = new Map<string, P407ActionClass>([
  [P4_07_EXECUTABLE_CAPABILITIES.create, 'create_expense'],
  [P4_07_EXECUTABLE_CAPABILITIES.delete, 'delete_expense'],
  [P4_07_EXECUTABLE_CAPABILITIES.declare, 'declare_expense_period_complete'],
]);

type Tx = Prisma.TransactionClient;

export class P407ExpenseExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<P407ExecutionValue> {
    const expected = ACTION_BY_CAPABILITY.get(request.capability);
    if (!expected)
      throw new P407ExpenseExecutionError('P4-07 capability is not registered');
    const execution = await this.canonicalExecution(request);
    if (execution.actionClass !== expected)
      throw new P407ExpenseExecutionError('P4-07 action class mismatch');
    if (execution.state === ActionExecutionState.SUCCEEDED)
      return this.restore(execution);
    if (execution.state === ActionExecutionState.PENDING_APPROVAL)
      throw new P407ExpenseExecutionError('ACTION_APPROVAL_REQUIRED');
    if (execution.state !== ActionExecutionState.READY)
      throw new P407ExpenseExecutionError(
        `Execution cannot run from ${execution.state}`,
      );

    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${execution.tenantId}:expense-ledger`}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "ActionExecution" WHERE id = ${execution.id} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED)
        return this.restore(locked);
      this.assertExecutable(locked, expected);
      const input = await this.readInput(locked);
      await this.assertActor(tx, locked, input);
      const attemptId = await this.begin(tx, locked);
      const value =
        expected === 'create_expense'
          ? await this.create(tx, locked, input)
          : expected === 'delete_expense'
            ? await this.remove(tx, locked, input)
            : await this.declare(tx, locked, input);
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  private async create(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ): Promise<P407ExecutionValue> {
    const branchId = this.nullableText(input.branchId);
    if (branchId) await this.assertBranch(tx, execution.tenantId, branchId);
    const occurredAt = this.instant(input.occurredAt);
    const expense = await tx.expense.create({
      data: {
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        branchId,
        branchTenantId: branchId ? execution.tenantId : null,
        createdById: execution.actorUserId,
        createdByTenantId: execution.actorUserId ? execution.tenantId : null,
        category: this.text(input.category),
        amountKopecks: this.integer(input.amountKopecks),
        currency: this.text(input.currency),
        occurredAt,
        encryptedNote: this.nullableText(input.encryptedNote),
        // P4-07 currently converges the authenticated manual-entry family.
        // The exact HTTP/AI namespace remains bound in ActionExecution input;
        // the domain row keeps the established reporting source vocabulary.
        source: 'manual',
        externalId: null,
        idempotencyKey: this.text(input.intentIdentityHash),
      },
    });
    const invalidated = await this.invalidate(
      tx,
      execution,
      this.text(input.occurredDay),
      'create',
    );
    await this.audit(tx, execution, 'expense.created.canonical', expense.id, {
      category: expense.category,
      amount_kopecks: expense.amountKopecks,
      currency: expense.currency,
      occurred_day: this.text(input.occurredDay),
      action_execution_id: execution.id,
      invalidated_declaration_ids: invalidated,
    });
    return {
      actionClass: 'create_expense',
      actionExecutionId: execution.id,
      expenseId: expense.id,
      invalidatedDeclarationIds: invalidated,
      expenseCreates: 1,
      expenseDeletes: 0,
      declarationCreates: 0,
      unknownApplicable: false,
      providerWrites: 0,
    };
  }

  private async remove(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ): Promise<P407ExecutionValue> {
    const expenseId = this.text(input.expenseId);
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "Expense" WHERE id = ${expenseId} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
    );
    if (rows.length !== 1)
      throw new P407ExpenseExecutionError(
        'Exact expense is absent without committed deletion evidence',
      );
    const expense = await tx.expense.findUniqueOrThrow({
      where: { id_tenantId: { id: expenseId, tenantId: execution.tenantId } },
    });
    this.assertExpenseFacts(expense, input);
    await tx.expense.delete({
      where: { id_tenantId: { id: expense.id, tenantId: execution.tenantId } },
    });
    const invalidated = await this.invalidate(
      tx,
      execution,
      this.text(input.occurredDay),
      'delete',
    );
    await this.audit(tx, execution, 'expense.deleted.canonical', expense.id, {
      category: expense.category,
      amount_kopecks: expense.amountKopecks,
      currency: expense.currency,
      occurred_at: expense.occurredAt.toISOString(),
      branch_id: expense.branchId,
      source: expense.source,
      creation_action_execution_id: expense.actionExecutionId,
      deletion_identity_hash: this.text(input.deletionIdentityHash),
      invalidated_declaration_ids: invalidated,
    });
    return {
      actionClass: 'delete_expense',
      actionExecutionId: execution.id,
      expenseId: expense.id,
      deletionIdentityHash: this.text(input.deletionIdentityHash),
      invalidatedDeclarationIds: invalidated,
      expenseCreates: 0,
      expenseDeletes: 1,
      declarationCreates: 0,
      unknownApplicable: false,
      providerWrites: 0,
    };
  }

  private async declare(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ): Promise<P407ExecutionValue> {
    const from = this.text(input.periodFromDay);
    const to = this.text(input.periodToDay);
    const rows = await tx.expense.findMany({
      where: {
        tenantId: execution.tenantId,
        occurredAt: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T23:59:59.999Z`),
        },
      },
      orderBy: { id: 'asc' },
    });
    const actual = expenseLedgerSnapshotHash(
      execution.tenantId,
      from,
      to,
      rows,
    );
    if (actual !== input.ledgerSnapshotHash)
      throw new P407ExpenseExecutionError(
        'Expense ledger changed after declaration planning',
      );
    const declarationEpoch = await this.currentDeclarationEpoch(
      tx,
      execution.tenantId,
      from,
      to,
    );
    if (declarationEpoch !== this.epoch(input.declarationEpoch))
      throw new P407ExpenseExecutionError(
        'Expense declaration epoch changed after planning',
      );
    const declarationIdentityHash = expensePeriodDeclarationIdentityHash(
      execution.tenantId,
      from,
      to,
      declarationEpoch,
      actual,
    );
    if (declarationIdentityHash !== input.declarationIdentityHash)
      throw new P407ExpenseExecutionError(
        'Expense declaration identity is stale or forged',
      );
    const existing = await tx.expensePeriodDeclaration.findUnique({
      where: {
        tenantId_periodFromDay_periodToDay: {
          tenantId: execution.tenantId,
          periodFromDay: from,
          periodToDay: to,
        },
      },
    });
    if (
      existing &&
      (existing.actionExecutionId !== execution.id ||
        existing.declarationEpoch !== declarationEpoch)
    )
      throw new P407ExpenseExecutionError(
        'Expense period has a conflicting current declaration',
      );
    const declaration =
      existing ??
      (await tx.expensePeriodDeclaration.create({
        data: {
          tenantId: execution.tenantId,
          actionExecutionId: execution.id,
          declaredById: execution.actorUserId,
          periodFromDay: from,
          periodToDay: to,
          declarationEpoch,
          idempotencyKey: declarationIdentityHash,
        },
      }));
    await this.audit(
      tx,
      execution,
      'expense.period_declared_complete.canonical',
      declaration.id,
      {
        period_from_day: from,
        period_to_day: to,
        ledger_snapshot_hash: actual,
        declaration_epoch: declarationEpoch,
        action_execution_id: execution.id,
      },
    );
    return {
      actionClass: 'declare_expense_period_complete',
      actionExecutionId: execution.id,
      declarationId: declaration.id,
      declarationEpoch,
      declarationIdentityHash,
      invalidatedDeclarationIds: [],
      expenseCreates: 0,
      expenseDeletes: 0,
      declarationCreates: existing ? 0 : 1,
      unknownApplicable: false,
      providerWrites: 0,
    };
  }

  private async invalidate(
    tx: Tx,
    execution: ActionExecution,
    day: string,
    cause: 'create' | 'delete',
  ) {
    const rows = await tx.expensePeriodDeclaration.findMany({
      where: {
        tenantId: execution.tenantId,
        periodFromDay: { lte: day },
        periodToDay: { gte: day },
      },
      select: {
        id: true,
        periodFromDay: true,
        periodToDay: true,
        declarationEpoch: true,
        actionExecutionId: true,
      },
    });
    for (const row of rows) {
      if (row.declarationEpoch === null || !row.actionExecutionId)
        throw new P407ExpenseExecutionError(
          'Historical expense declaration requires explicit correlation before mutation',
        );
      await tx.expensePeriodDeclarationInvalidation.create({
        data: {
          id: randomUUID(),
          tenantId: execution.tenantId,
          periodFromDay: row.periodFromDay,
          periodToDay: row.periodToDay,
          invalidatedDeclarationId: row.id,
          invalidatedDeclarationActionExecutionId: row.actionExecutionId,
          invalidationActionExecutionId: execution.id,
          previousDeclarationEpoch: row.declarationEpoch,
          nextDeclarationEpoch: row.declarationEpoch + 1,
          reasonCode: `expense_ledger_changed:${cause}`,
        },
      });
      const deleted = await tx.expensePeriodDeclaration.deleteMany({
        where: { id: row.id, tenantId: execution.tenantId },
      });
      if (deleted.count !== 1)
        throw new P407ExpenseExecutionError(
          'Exact expense declaration disappeared during invalidation',
        );
      await this.audit(
        tx,
        execution,
        'expense.period_declaration_invalidated.canonical',
        row.id,
        {
          period_from_day: row.periodFromDay,
          period_to_day: row.periodToDay,
          reason: `expense_ledger_changed:${cause}`,
          action_execution_id: execution.id,
          previous_declaration_epoch: row.declarationEpoch,
          next_declaration_epoch: row.declarationEpoch + 1,
        },
      );
    }
    return rows.map((row) => row.id).sort();
  }

  private async currentDeclarationEpoch(
    tx: Tx,
    tenantId: string,
    periodFromDay: string,
    periodToDay: string,
  ): Promise<number> {
    const latest = await tx.expensePeriodDeclarationInvalidation.findFirst({
      where: { tenantId, periodFromDay, periodToDay },
      orderBy: { nextDeclarationEpoch: 'desc' },
      select: { nextDeclarationEpoch: true },
    });
    return latest?.nextDeclarationEpoch ?? 0;
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
        executorKey: 'expenses.canonical-ledger',
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
        leaseOwner: `expenses-local:${execution.id}`,
        leaseTokenHash: `local-transaction:${execution.id}`,
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
    value: P407ExecutionValue,
  ) {
    const now = this.now();
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: value as unknown as Prisma.InputJsonValue,
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
        safeResultSummaryJson: value as unknown as Prisma.InputJsonValue,
        finalizedAt: now,
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private async assertActor(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (!execution.actorUserId)
      throw new P407ExpenseExecutionError('Expense actor is required');
    const membership = await tx.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: execution.actorUserId,
          tenantId: execution.tenantId,
        },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.id !== input.actorMembershipId ||
      membership.role !== input.actorRole
    )
      throw new P407ExpenseExecutionError('Expense actor authority changed');
  }

  private assertExecutable(
    execution: ActionExecution,
    expected: P407ActionClass,
  ) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.dryRun ||
      execution.actionClass !== expected ||
      !execution.capability.endsWith('.execute.v1')
    )
      throw new P407ExpenseExecutionError(
        'Execution is not an approved canonical local expense action',
      );
  }

  private async readInput(
    execution: ActionExecution,
  ): Promise<Record<string, unknown>> {
    return this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
  }

  private restore(execution: ActionExecution): P407ExecutionValue {
    const value = execution.safeResultSummaryJson;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new P407ExpenseExecutionError(
        'Committed expense result is unavailable',
      );
    return value as unknown as P407ExecutionValue;
  }

  private async assertBranch(tx: Tx, tenantId: string, branchId: string) {
    const row = await tx.branch.findUnique({
      where: { id_tenantId: { id: branchId, tenantId } },
      select: { id: true },
    });
    if (!row)
      throw new P407ExpenseExecutionError(
        'Expense branch is outside the tenant',
      );
  }

  private assertExpenseFacts(
    expense: {
      id: string;
      tenantId: string;
      actionExecutionId: string | null;
      branchId: string | null;
      category: string;
      amountKopecks: number;
      currency: string;
      occurredAt: Date;
      source: string;
      externalId: string | null;
    },
    input: Record<string, unknown>,
  ) {
    const creationIdentity =
      expense.actionExecutionId ??
      p407Hash([
        'p4-07.legacy-expense-fact.v1',
        expense.tenantId,
        expense.id,
        expense.category,
        String(expense.amountKopecks),
        expense.currency,
        expense.occurredAt.toISOString(),
        expense.source,
        expense.externalId ?? '',
      ]);
    if (
      creationIdentity !== input.creationIdentityHash ||
      expense.branchId !== input.branchId ||
      expense.category !== input.category ||
      expense.amountKopecks !== input.amountKopecks ||
      expense.currency !== input.currency ||
      expense.occurredAt.toISOString() !== input.occurredAt
    )
      throw new P407ExpenseExecutionError(
        'Expense changed after delete planning',
      );
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
        entityType: action.startsWith('expense.period')
          ? 'expense_period_declaration'
          : 'expense',
        entityId,
        metadataJson: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : '';
        const databaseCode =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          typeof error.meta?.code === 'string'
            ? error.meta.code
            : '';
        if (
          (code === 'P2034' ||
            databaseCode === '40001' ||
            (code === 'P2010' &&
              /40001|serializ|write conflict/i.test(message))) &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new P407ExpenseExecutionError(
      'Expense transaction could not serialize',
    );
  }

  private async canonicalExecution(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionExecution> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.ingress.createExecution(request);
      } catch (error) {
        const databaseCode =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          typeof error.meta?.code === 'string'
            ? error.meta.code
            : '';
        if (
          (databaseCode === '40001' ||
            (error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2010' &&
              /40001|serializ|write conflict/i.test(error.message))) &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new P407ExpenseExecutionError(
      'Canonical execution claim could not serialize',
    );
  }

  private text(value: unknown) {
    if (typeof value !== 'string' || !value)
      throw new P407ExpenseExecutionError(
        'Canonical expense string is missing',
      );
    return value;
  }
  private nullableText(value: unknown) {
    if (value === null || value === undefined) return null;
    return this.text(value);
  }
  private integer(value: unknown) {
    if (!Number.isSafeInteger(value))
      throw new P407ExpenseExecutionError(
        'Canonical expense integer is missing',
      );
    return value as number;
  }
  private epoch(value: unknown) {
    const epoch = this.integer(value);
    if (epoch < 0 || epoch > 2_147_483_647)
      throw new P407ExpenseExecutionError(
        'Canonical declaration epoch is invalid',
      );
    return epoch;
  }
  private instant(value: unknown) {
    const date = new Date(this.text(value));
    if (Number.isNaN(date.getTime()))
      throw new P407ExpenseExecutionError(
        'Canonical expense instant is invalid',
      );
    return date;
  }
}
