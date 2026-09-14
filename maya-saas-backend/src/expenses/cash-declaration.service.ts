import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type ActionExecution } from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { attachExistingInvocationReceipt } from '../action-engine/action-invocation-receipt.context';
import {
  CASH_CAPABILITIES,
  CASH_DECLARATION_CONTRACT,
  CASH_ROLES,
  cashCallerId,
  cashCommand,
  cashHash,
  cashLocalDay,
  makeCashIntent,
  normalizeCashIntent,
  type CashCommand,
  type CashIntent,
  type CashOperation,
} from '../action-engine/cash-declaration.contract';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Human observation owner. Existing kernel admission/claim/finalization are the
 * complete execution lifecycle; this adapter never writes Expense or a provider. */
@Injectable()
export class CashDeclarationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}
  private async actor(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    branchId?: string,
  ) {
    const m = await tx.membership.findUnique({
      where: { userId_tenantId: { tenantId, userId } },
      include: {
        user: { select: { status: true } },
        tenant: { select: { status: true, defaultTimezone: true } },
      },
    });
    if (
      !m ||
      m.status !== 'active' ||
      m.user.status !== 'active' ||
      m.tenant.status !== 'active' ||
      !CASH_ROLES.has(m.role) ||
      (branchId && m.branchId && m.branchId !== branchId)
    )
      throw new ForbiddenException(
        'Current exact cash declaration membership required',
      );
    return m;
  }
  private async branch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
  ) {
    const branch = await tx.branch.findUnique({
      where: { id_tenantId: { tenantId, id: branchId } },
    });
    if (!branch) throw new NotFoundException('Exact canonical branch required');
    return branch;
  }
  private current(
    tx: Prisma.TransactionClient,
    tenantId: string,
    command: Pick<CashCommand, 'branchId' | 'businessDay'>,
  ) {
    return tx.cashDeclaration.findFirst({
      where: {
        tenantId,
        branchId: command.branchId,
        businessDay: command.businessDay,
      },
      orderBy: { revision: 'desc' },
    });
  }
  private async assertPredecessor(
    tx: Prisma.TransactionClient,
    tenantId: string,
    command: CashCommand,
  ) {
    const current = await this.current(tx, tenantId, command);
    if (
      (current?.revision ?? 0) !== command.expectedRevision ||
      (current?.id ?? null) !== command.previousDeclarationId
    )
      throw new ConflictException('CASH_ALREADY_DECLARED_OR_STALE_REVISION');
    return current;
  }
  private receipt(execution: ActionExecution, commandHash: string) {
    const receipt = execution.safeResultSummaryJson;
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt) ||
      receipt.commandHash !== commandHash
    )
      throw new ConflictException('IDEMPOTENCY_CONFLICT');
    return receipt;
  }
  async submit(
    tenantId: string,
    userId: string,
    operation: CashOperation,
    value: unknown,
    key: unknown,
  ) {
    this.context.assertTenantId(tenantId);
    const command = cashCommand(operation, value),
      callerId = cashCallerId(key),
      commandHash = cashHash('maya.cash-command/1', command);
    const actor = await canonicalUtcTransaction(
      this.prisma,
      (tx) => this.actor(tx, tenantId, userId, command.branchId),
      { readOnly: true },
    );
    await this.entitlements.assertFeature(tenantId, 'expenses.core');
    const sourceRef =
      'cash-intent:' +
      cashHash('maya.cash-caller/1', { tenantId, userId, operation, callerId });
    const find = () =>
      this.prisma.actionExecution.findFirst({
        where: {
          tenantId,
          actorUserId: userId,
          capability: CASH_CAPABILITIES[operation],
          sourceRef,
        },
      });
    const restore = async (existing: ActionExecution) => {
      await attachExistingInvocationReceipt(existing);
      if (existing.state === 'SUCCEEDED')
        return this.receipt(existing, commandHash);
      const input = normalizeCashIntent(
        operation,
        await this.kernel.readTrustedNormalizedInput(tenantId, existing.id),
      );
      if (input.commandHash !== commandHash)
        throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return this.execute(existing, input);
    };
    const existing = await find();
    if (existing) return restore(existing);
    try {
      if (Date.parse(command.countedAt) > Date.now())
        throw new ConflictException('Observation cannot be in the future');
      await canonicalUtcTransaction(
        this.prisma,
        async (tx) => {
          const branch = await this.branch(tx, tenantId, command.branchId);
          if (
            command.timezone !==
            (branch.timezone || actor.tenant.defaultTimezone)
          )
            throw new ConflictException('Confirmed branch timezone is stale');
          await this.assertPredecessor(tx, tenantId, command);
        },
        { readOnly: true },
      );
      const input = makeCashIntent(
        tenantId,
        actor,
        operation,
        callerId,
        command,
      );
      const request: TrustedActionExecutionRequestV1 = {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId,
        capability: CASH_CAPABILITIES[operation],
        source: {
          type: 'authenticated_request',
          sourceRef,
          actorUserId: userId,
          occurrenceScope: `cash:${command.branchId}:${command.businessDay}:r${command.expectedRevision + 1}`,
        },
        targetRef: input.targetRef,
        input,
        evidenceRefs: [`cash-intent:${input.intentHash}`],
        callerIdempotency: {
          scope: `cash-declaration.${operation}`,
          key: sourceRef,
        },
      };
      if ((await this.ingress.preview(request)).policyDecision !== 'ALLOW')
        throw new ForbiddenException('Cash declaration policy denied');
      return await this.execute(
        await this.ingress.createExecution(request),
        input,
      );
    } catch (error) {
      const winner = await find();
      if (winner) return restore(winner);
      throw error;
    }
  }
  private async execute(
    execution: ActionExecution,
    input: CashIntent,
  ): Promise<Prisma.JsonObject> {
    if (execution.state === 'SUCCEEDED')
      return this.receipt(execution, input.commandHash);
    if (execution.state !== 'READY')
      throw new ConflictException(
        `Cash execution ${execution.state} requires existing canonical resolution`,
      );
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const result = await canonicalUtcTransaction(
          this.prisma,
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`r14/${execution.tenantId}/${input.semanticCommand.branchId}/${input.semanticCommand.businessDay}`},0))::text`,
            );
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM "ActionExecution" WHERE id=${execution.id} AND "tenantId"=${execution.tenantId} FOR UPDATE`,
            );
            const locked = await tx.actionExecution.findUniqueOrThrow({
              where: {
                id_tenantId: { id: execution.id, tenantId: execution.tenantId },
              },
            });
            if (locked.state === 'SUCCEEDED')
              return this.receipt(locked, input.commandHash);
            if (locked.state !== 'READY')
              throw new ConflictException(
                `Cash execution ${locked.state} requires existing canonical resolution`,
              );
            const actor = await this.actor(
              tx,
              execution.tenantId,
              execution.actorUserId!,
              input.semanticCommand.branchId,
            );
            if (
              actor.id !== input.actorMembershipId ||
              actor.role !== input.actorRole
            )
              throw new ForbiddenException(
                'Cash actor changed after admission',
              );
            await this.branch(
              tx,
              execution.tenantId,
              input.semanticCommand.branchId,
            );
            try {
              await this.assertPredecessor(
                tx,
                execution.tenantId,
                input.semanticCommand,
              );
            } catch (error) {
              if (!(error instanceof ConflictException)) throw error;
              const rejected = await this.kernel.claimExecution(
                {
                  tenantId: execution.tenantId,
                  executionId: execution.id,
                  workerId: 'cash-declaration.local',
                },
                tx,
              );
              await this.kernel.finalizeDefinitiveFailure(
                {
                  tenantId: execution.tenantId,
                  executionId: execution.id,
                  attemptId: rejected.attempt.id,
                  leaseToken: rejected.leaseToken,
                  outcomeCode: 'cash_stale_revision',
                  errorClass: 'cash_stale_revision',
                },
                tx,
              );
              return {
                canonicalRejection: 'CASH_ALREADY_DECLARED_OR_STALE_REVISION',
              };
            }
            const claim = await this.kernel.claimExecution(
              {
                tenantId: execution.tenantId,
                executionId: execution.id,
                workerId: 'cash-declaration.local',
              },
              tx,
            );
            const command = input.semanticCommand;
            const declaration = await tx.cashDeclaration.create({
              data: {
                id: randomUUID(),
                tenantId: execution.tenantId,
                branchId: command.branchId,
                businessDay: command.businessDay,
                timezone: command.timezone,
                countedAt: new Date(command.countedAt),
                currency: 'RUB',
                countedCashKopecks: command.countedCashKopecks,
                declarationKind: command.declarationKind,
                revision: command.expectedRevision + 1,
                previousDeclarationId: command.previousDeclarationId,
                actionExecutionId: execution.id,
                declaredByUserId: execution.actorUserId!,
                declaredByMembershipId: actor.id,
                contractVersion: 1,
                intentHash: input.intentHash,
                encryptedReason:
                  command.reason === null
                    ? null
                    : this.encryption.encrypt(command.reason),
                createdAt: this.clock(),
              },
            });
            await tx.actionTargetMutation.create({
              data: {
                tenantId: execution.tenantId,
                actionExecutionId: execution.id,
                mutationKey: `cash-r${declaration.revision}`,
                targetKind: 'cash_declaration',
                targetRef: input.targetRef,
                mutationKind: execution.actionClass,
                targetGeneration: declaration.revision - 1,
                beforeStateHash: command.previousDeclarationId
                  ? cashHash('maya.cash-predecessor/1', {
                      id: command.previousDeclarationId,
                      revision: command.expectedRevision,
                    })
                  : null,
                afterStateHash: input.intentHash,
              },
            });
            const result = {
              contract: CASH_DECLARATION_CONTRACT,
              actionExecutionId: execution.id,
              declarationId: declaration.id,
              revision: declaration.revision,
              kind: declaration.declarationKind,
              commandHash: input.commandHash,
              intentHash: input.intentHash,
              providerWrites: 0,
              expenseWrites: 0,
              reconciled: false,
            };
            await this.kernel.finalizeSuccess(
              {
                tenantId: execution.tenantId,
                executionId: execution.id,
                attemptId: claim.attempt.id,
                leaseToken: claim.leaseToken,
                outcomeCode: 'cash_observation_committed',
                safeResult: result,
              },
              tx,
            );
            return result;
          },
        );
        if ('canonicalRejection' in result && result.canonicalRejection)
          throw new ConflictException(result.canonicalRejection);
        return result;
      } catch (error) {
        if (isPostgresSerializationConflict(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new ConflictException('Cash transaction could not serialize');
  }
  async branches(tenantId: string, userId: string) {
    this.context.assertTenantId(tenantId);
    await this.entitlements.assertFeature(tenantId, 'expenses.core');
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const actor = await this.actor(tx, tenantId, userId);
        const branches = await tx.branch.findMany({
          where: {
            tenantId,
            ...(actor.branchId ? { id: actor.branchId } : {}),
          },
          orderBy: { id: 'asc' },
          select: { id: true, name: true, timezone: true },
        });
        return {
          tenantId,
          userId,
          branches: branches.map((b) => ({
            ...b,
            timezone: b.timezone || actor.tenant.defaultTimezone,
          })),
        };
      },
      { readOnly: true },
    );
  }
  async read(
    tenantId: string,
    userId: string,
    branchId: string,
    businessDay: string,
  ) {
    this.context.assertTenantId(tenantId);
    await this.entitlements.assertFeature(tenantId, 'expenses.core');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(businessDay) ||
      cashLocalDay(businessDay + 'T12:00:00.000Z', 'UTC') !== businessDay
    )
      throw new ConflictException('Exact cash business day required');
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        await this.actor(tx, tenantId, userId, branchId);
        const branch = await this.branch(tx, tenantId, branchId);
        const rows = await tx.cashDeclaration.findMany({
          where: { tenantId, branchId, businessDay },
          orderBy: { revision: 'desc' },
        });
        return {
          contract: CASH_DECLARATION_CONTRACT,
          tenantId,
          branch: { id: branch.id, name: branch.name },
          businessDay,
          readOnly: true,
          reconciled: false,
          state:
            rows[0]?.declarationKind === 'COUNT'
              ? 'DECLARED'
              : rows[0]
                ? 'WITHDRAWN'
                : 'UNAVAILABLE',
          revisions: rows.map((row) => ({
            id: row.id,
            revision: row.revision,
            previousDeclarationId: row.previousDeclarationId,
            kind: row.declarationKind,
            countedCashKopecks: row.countedCashKopecks,
            currency: row.currency,
            countedAt: row.countedAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            timezone: row.timezone,
            declaredByUserId: row.declaredByUserId,
            declaredByMembershipId: row.declaredByMembershipId,
            actionExecutionId: row.actionExecutionId,
            reason: row.encryptedReason
              ? this.encryption.decrypt(row.encryptedReason)
              : null,
          })),
        };
      },
      { readOnly: true },
    );
  }
}
