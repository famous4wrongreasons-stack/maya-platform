import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  EXPENSE_CREATE_POLICY_PROFILE,
  EXPENSE_CREATE_SHADOW_CAPABILITY,
  EXPENSE_DELETE_POLICY_PROFILE,
  EXPENSE_DELETE_SHADOW_CAPABILITY,
  EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
  EXPENSE_PERIOD_DECLARE_SHADOW_CAPABILITY,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  CreateExpenseShadowDto,
  DeclareExpensePeriodShadowDto,
  DeleteExpenseShadowDto,
} from './dto/expense-shadow.dto';
import { MANUAL_EXPENSE_CATEGORY_SLUGS } from './expense-category';

const MANAGERS = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'accountant',
]);
const OWNERS = new Set(['tenant_owner', 'business_owner']);

type ExpenseFacts = {
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
};

export function p407Hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url');
}

export function expenseLedgerSnapshotHash(
  tenantId: string,
  fromDay: string,
  toDay: string,
  rows: readonly ExpenseFacts[],
): string {
  const facts = [...rows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) =>
      [
        row.id,
        row.actionExecutionId ?? 'legacy',
        row.branchId ?? 'tenant',
        row.category,
        String(row.amountKopecks),
        row.currency,
        row.occurredAt.toISOString(),
        row.source,
        row.externalId ?? '',
      ].join('|'),
    );
  return p407Hash([
    'p4-07.expense-ledger-snapshot.v1',
    tenantId,
    fromDay,
    toDay,
    ...facts,
  ]);
}

export interface ExpenseShadowResult {
  actionClass:
    'create_expense' | 'delete_expense' | 'declare_expense_period_complete';
  outcome: 'planned' | 'shadow_disabled';
  actionExecutionId: string | null;
  shadowDivergences: number;
  intendedMutation: Record<string, unknown> | null;
  expensesCreated: 0;
  expensesDeleted: 0;
  declarationsCreated: 0;
  declarationsInvalidated: 0;
  valueMutations: 0;
  providerWrites: 0;
}

@Injectable()
export class ExpenseCanonicalShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly encryption: EncryptionService,
  ) {}

  async planCreate(
    tenantId: string,
    actorUserId: string,
    dto: CreateExpenseShadowDto,
  ): Promise<ExpenseShadowResult> {
    if (!this.enabled()) return this.disabled('create_expense');
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, MANAGERS);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: scoped },
      select: { defaultCurrency: true },
    });
    const currency = (dto.currency ?? tenant.defaultCurrency).toUpperCase();
    if (currency !== tenant.defaultCurrency || currency !== 'RUB')
      throw new BadRequestException('Expense currency is not allowed');
    if (!MANUAL_EXPENSE_CATEGORY_SLUGS.includes(dto.category))
      throw new BadRequestException(
        'Expense category is not eligible for manual entry',
      );
    const occurredAt = new Date(dto.occurred_at);
    if (Number.isNaN(occurredAt.getTime()))
      throw new BadRequestException('Invalid expense date');
    if (dto.branch_id) await this.assertBranch(scoped, dto.branch_id);
    const sourceNamespace =
      dto.initiator === 'ai_tool'
        ? 'legacy-ai-expenses.create'
        : 'http-expenses.create';
    const intentIdentityHash = p407Hash([
      'p4-07.create-expense.v1',
      scoped,
      sourceNamespace,
      dto.source_intent_ref,
      dto.category,
      String(dto.amount_kopecks),
      currency,
      occurredAt.toISOString().slice(0, 10),
      dto.branch_id ?? 'tenant',
    ]);
    const input = {
      intentIdentityHash,
      branchId: dto.branch_id ?? null,
      category: dto.category,
      amountKopecks: dto.amount_kopecks,
      currency,
      occurredDay: occurredAt.toISOString().slice(0, 10),
      occurredAt: occurredAt.toISOString(),
      sourceNamespace,
      externalRefHash: null,
      encryptedNote: dto.note?.trim()
        ? this.encryption.encrypt(dto.note.trim())
        : null,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      policyProfile: EXPENSE_CREATE_POLICY_PROFILE,
      policySnapshotHash: p407Hash([
        EXPENSE_CREATE_POLICY_PROFILE,
        scoped,
        actor.id,
        actor.role,
        intentIdentityHash,
        'cap:1000000000',
        currency,
      ]),
      approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
      intendedMutation:
        'insert_expense_and_invalidate_overlapping_declarations',
      expenseWritePerformed: false,
      declarationInvalidationPerformed: false,
    };
    const execution = await this.actionEngine.planShadow(
      this.request(
        scoped,
        actorUserId,
        dto,
        EXPENSE_CREATE_SHADOW_CAPABILITY,
        `expense-intent:${intentIdentityHash}`,
        input,
        intentIdentityHash,
      ),
    );
    return this.planned('create_expense', execution.id, {
      model: 'Expense',
      ...input,
    });
  }

  async planDelete(
    tenantId: string,
    actorUserId: string,
    dto: DeleteExpenseShadowDto,
  ): Promise<ExpenseShadowResult> {
    if (!this.enabled()) return this.disabled('delete_expense');
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, MANAGERS);
    const expense = (await this.prisma.expense.findFirst({
      where: { id: dto.expense_id, tenantId: scoped },
    })) as ExpenseFacts | null;
    if (!expense) throw new NotFoundException('Expense not found');
    const sourceNamespace = expense.source;
    const creationIdentityHash =
      expense.actionExecutionId ??
      p407Hash([
        'p4-07.legacy-expense-fact.v1',
        scoped,
        expense.id,
        expense.category,
        String(expense.amountKopecks),
        expense.currency,
        expense.occurredAt.toISOString(),
        expense.source,
        expense.externalId ?? '',
      ]);
    const deletionIdentityHash = p407Hash([
      'p4-07.delete-expense.v1',
      scoped,
      expense.id,
      creationIdentityHash,
    ]);
    const input = {
      expenseId: expense.id,
      creationIdentityHash,
      deletionIdentityHash,
      branchId: expense.branchId,
      category: expense.category,
      amountKopecks: expense.amountKopecks,
      currency: expense.currency,
      occurredDay: expense.occurredAt.toISOString().slice(0, 10),
      occurredAt: expense.occurredAt.toISOString(),
      sourceNamespace,
      externalRefHash: expense.externalId
        ? p407Hash([
            'p4-07.external-ref.v1',
            scoped,
            expense.source,
            expense.externalId,
          ])
        : null,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      policyProfile: EXPENSE_DELETE_POLICY_PROFILE,
      policySnapshotHash: p407Hash([
        EXPENSE_DELETE_POLICY_PROFILE,
        scoped,
        actor.id,
        actor.role,
        deletionIdentityHash,
      ]),
      reasonCode: 'actor_requested_delete',
      approvalRequirement: 'ACTOR_CONFIRMATION_REQUIRED',
      intendedMutation:
        'delete_exact_expense_and_invalidate_overlapping_declarations',
      expenseDeletePerformed: false,
      declarationInvalidationPerformed: false,
    };
    const execution = await this.actionEngine.planShadow(
      this.request(
        scoped,
        actorUserId,
        dto,
        EXPENSE_DELETE_SHADOW_CAPABILITY,
        `expense:${expense.id}`,
        input,
        deletionIdentityHash,
      ),
    );
    return this.planned('delete_expense', execution.id, {
      model: 'Expense',
      ...input,
    });
  }

  async planDeclare(
    tenantId: string,
    actorUserId: string,
    dto: DeclareExpensePeriodShadowDto,
  ): Promise<ExpenseShadowResult> {
    if (!this.enabled())
      return this.disabled('declare_expense_period_complete');
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId, OWNERS);
    this.assertPeriod(dto.period_from_day, dto.period_to_day);
    const rows = (await this.prisma.expense.findMany({
      where: {
        tenantId: scoped,
        occurredAt: {
          gte: new Date(`${dto.period_from_day}T00:00:00.000Z`),
          lte: new Date(`${dto.period_to_day}T23:59:59.999Z`),
        },
      },
      orderBy: { id: 'asc' },
    })) as ExpenseFacts[];
    const ledgerSnapshotHash = expenseLedgerSnapshotHash(
      scoped,
      dto.period_from_day,
      dto.period_to_day,
      rows,
    );
    const declarationIdentityHash = p407Hash([
      'p4-07.declare-expense-period-complete.v1',
      scoped,
      dto.period_from_day,
      dto.period_to_day,
      ledgerSnapshotHash,
    ]);
    const input = {
      periodFromDay: dto.period_from_day,
      periodToDay: dto.period_to_day,
      ledgerSnapshotHash,
      declarationIdentityHash,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      policyProfile: EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
      policySnapshotHash: p407Hash([
        EXPENSE_PERIOD_DECLARE_POLICY_PROFILE,
        scoped,
        actor.id,
        actor.role,
        declarationIdentityHash,
      ]),
      approvalRequirement: 'NONE_EXPLICIT_OWNER_ASSERTION',
      branchScope: 'whole_tenant',
      intendedMutation: 'insert_current_period_declaration',
      declarationWritePerformed: false,
    };
    const execution = await this.actionEngine.planShadow(
      this.request(
        scoped,
        actorUserId,
        dto,
        EXPENSE_PERIOD_DECLARE_SHADOW_CAPABILITY,
        `expense-period:${dto.period_from_day}:${dto.period_to_day}`,
        input,
        declarationIdentityHash,
      ),
    );
    return this.planned('declare_expense_period_complete', execution.id, {
      model: 'ExpensePeriodDeclaration',
      ...input,
    });
  }

  private request(
    tenantId: string,
    actorUserId: string,
    dto: { initiator: 'http' | 'ai_tool'; source_intent_ref: string },
    capability: string,
    targetRef: string,
    input: Record<string, unknown>,
    identity: string,
  ) {
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId,
      capability,
      source: {
        type:
          dto.initiator === 'ai_tool'
            ? ('legacy_bridge' as const)
            : ('authenticated_request' as const),
        occurrenceScope: `p4-07:${identity}`,
        sourceRef: dto.source_intent_ref,
        actorUserId,
      },
      targetRef,
      input,
      evidenceRefs: [`expense-policy:${String(input.policySnapshotHash)}`],
      callerIdempotency: { scope: `p4-07.${capability}`, key: identity },
    };
  }

  private async actor(
    tenantId: string,
    userId: string,
    roles: ReadonlySet<string>,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true, role: true, status: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      !roles.has(membership.role)
    )
      throw new ForbiddenException('Expense actor is not authorized');
    return membership;
  }

  private async assertBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id_tenantId: { id: branchId, tenantId } },
      select: { id: true },
    });
    if (!branch)
      throw new BadRequestException('Expense branch is outside the tenant');
  }

  private assertPeriod(from: string, to: string) {
    const parsedFrom = new Date(`${from}T00:00:00.000Z`);
    const parsedTo = new Date(`${to}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime()) ||
      parsedFrom > parsedTo ||
      parsedTo.getTime() - parsedFrom.getTime() > 365 * 86_400_000
    )
      throw new BadRequestException('Invalid expense declaration period');
  }

  private enabled() {
    return ['1', 'true', 'on', 'yes'].includes(
      String(
        process.env.MAYA_EXPENSE_CANONICAL_SHADOW_ENABLED ?? '',
      ).toLowerCase(),
    );
  }
  private planned(
    actionClass: ExpenseShadowResult['actionClass'],
    executionId: string,
    intendedMutation: Record<string, unknown>,
  ): ExpenseShadowResult {
    return {
      actionClass,
      outcome: 'planned',
      actionExecutionId: executionId,
      shadowDivergences: 0,
      intendedMutation,
      expensesCreated: 0,
      expensesDeleted: 0,
      declarationsCreated: 0,
      declarationsInvalidated: 0,
      valueMutations: 0,
      providerWrites: 0,
    };
  }
  private disabled(
    actionClass: ExpenseShadowResult['actionClass'],
  ): ExpenseShadowResult {
    return {
      actionClass,
      outcome: 'shadow_disabled',
      actionExecutionId: null,
      shadowDivergences: 0,
      intendedMutation: null,
      expensesCreated: 0,
      expensesDeleted: 0,
      declarationsCreated: 0,
      declarationsInvalidated: 0,
      valueMutations: 0,
      providerWrites: 0,
    };
  }
}
