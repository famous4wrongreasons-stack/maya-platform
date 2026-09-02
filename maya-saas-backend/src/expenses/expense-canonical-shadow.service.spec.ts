import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ExpenseCanonicalShadowService } from './expense-canonical-shadow.service';

const expense = {
  id: 'expense-1',
  tenantId: 'tenant-a',
  actionExecutionId: 'creation-execution-1',
  branchId: '11111111-1111-4111-8111-111111111111',
  category: 'rent',
  amountKopecks: 125_000,
  currency: 'RUB',
  occurredAt: new Date('2026-08-10T10:00:00.000Z'),
  source: 'http-expenses.create',
  externalId: null,
};

function harness(role = 'tenant_owner') {
  const planShadow = jest.fn((request: TrustedActionExecutionRequestV1) =>
    Promise.resolve({ id: `shadow-${request.capability}` } as ActionExecution),
  );
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ defaultCurrency: 'RUB' }),
    },
    membership: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'membership-1', role, status: 'active' }),
    },
    branch: {
      findUnique: jest.fn().mockResolvedValue({ id: expense.branchId }),
    },
    expense: {
      findFirst: jest.fn().mockResolvedValue(expense),
      findMany: jest.fn().mockResolvedValue([expense]),
    },
  };
  const tenantContext = new TenantContextService();
  const service = new ExpenseCanonicalShadowService(
    { planShadow } as unknown as ActionEngineRuntimeService,
    prisma as unknown as PrismaService,
    tenantContext,
    { encrypt: (value: string) => `encrypted:${value}` } as EncryptionService,
  );
  return { service, planShadow, prisma, tenantContext };
}

const createDto = () => ({
  initiator: 'http' as const,
  source_intent_ref: 'request:create:1',
  category: 'rent',
  amount_kopecks: 125_000,
  currency: 'RUB',
  occurred_at: '2026-08-10T10:00:00.000Z',
  branch_id: expense.branchId,
  note: 'encrypted before canonical persistence',
});

describe('ExpenseCanonicalShadowService', () => {
  const previous = process.env.MAYA_EXPENSE_CANONICAL_SHADOW_ENABLED;
  beforeEach(() => {
    process.env.MAYA_EXPENSE_CANONICAL_SHADOW_ENABLED = 'true';
  });
  afterAll(() => {
    if (previous === undefined)
      delete process.env.MAYA_EXPENSE_CANONICAL_SHADOW_ENABLED;
    else process.env.MAYA_EXPENSE_CANONICAL_SHADOW_ENABLED = previous;
  });

  it('plans server-derived create with no expense/declaration/value write', async () => {
    const h = harness();
    const result = await h.tenantContext.runAsSystemTenant('tenant-a', () =>
      h.service.planCreate('tenant-a', 'owner-1', createDto()),
    );
    expect(result).toMatchObject({
      actionClass: 'create_expense',
      outcome: 'planned',
      shadowDivergences: 0,
      expensesCreated: 0,
      declarationsInvalidated: 0,
      valueMutations: 0,
      providerWrites: 0,
    });
    expect(h.planShadow.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'expenses.create.shadow.v1',
      source: { type: 'authenticated_request', actorUserId: 'owner-1' },
      input: {
        amountKopecks: 125_000,
        currency: 'RUB',
        category: 'rent',
        encryptedNote: 'encrypted:encrypted before canonical persistence',
        expenseWritePerformed: false,
      },
    });
  });

  it('converges create retry and restart on one logical identity', async () => {
    const a = harness();
    const b = harness();
    const first = await a.tenantContext.runAsSystemTenant('tenant-a', () =>
      a.service.planCreate('tenant-a', 'owner-1', createDto()),
    );
    await a.tenantContext.runAsSystemTenant('tenant-a', () =>
      a.service.planCreate('tenant-a', 'owner-1', createDto()),
    );
    await b.tenantContext.runAsSystemTenant('tenant-a', () =>
      b.service.planCreate('tenant-a', 'owner-1', createDto()),
    );
    expect(a.planShadow.mock.calls[1][0]).toEqual(
      a.planShadow.mock.calls[0][0],
    );
    expect(b.planShadow.mock.calls[0][0].callerIdempotency).toEqual(
      a.planShadow.mock.calls[0][0].callerIdempotency,
    );
    expect(first.shadowDivergences).toBe(0);
  });

  it('rejects forged currency, payroll and cross-tenant branch before planning', async () => {
    for (const mutate of [
      () => ({ ...createDto(), currency: 'USD' }),
      () => ({ ...createDto(), category: 'payroll' }),
    ]) {
      const h = harness();
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          h.service.planCreate('tenant-a', 'owner-1', mutate()),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.planShadow).not.toHaveBeenCalled();
    }
    const h = harness();
    h.prisma.branch.findUnique.mockResolvedValue(null);
    await expect(
      h.tenantContext.runAsSystemTenant('tenant-a', () =>
        h.service.planCreate('tenant-a', 'owner-1', createDto()),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive or forged actor authority', async () => {
    const h = harness('customer');
    await expect(
      h.tenantContext.runAsSystemTenant('tenant-a', () =>
        h.service.planCreate('tenant-a', 'customer-1', createDto()),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.planShadow).not.toHaveBeenCalled();
  });

  it('plans exact audit-preserving physical delete with deterministic identity', async () => {
    const h = harness();
    const dto = {
      initiator: 'http' as const,
      source_intent_ref: 'request:delete:1',
      expense_id: 'expense-1',
    };
    const first = await h.tenantContext.runAsSystemTenant('tenant-a', () =>
      h.service.planDelete('tenant-a', 'owner-1', dto),
    );
    await h.tenantContext.runAsSystemTenant('tenant-a', () =>
      h.service.planDelete('tenant-a', 'owner-1', dto),
    );
    expect(first).toMatchObject({
      actionClass: 'delete_expense',
      expensesDeleted: 0,
      declarationsInvalidated: 0,
      valueMutations: 0,
    });
    expect(h.planShadow.mock.calls[1][0]).toEqual(
      h.planShadow.mock.calls[0][0],
    );
    expect(h.planShadow.mock.calls[0][0].input).toMatchObject({
      expenseId: 'expense-1',
      creationIdentityHash: 'creation-execution-1',
      reasonCode: 'actor_requested_delete',
      expenseDeletePerformed: false,
    });
  });

  it('fails closed when exact delete target is absent or cross-tenant', async () => {
    const h = harness();
    h.prisma.expense.findFirst.mockResolvedValue(null);
    await expect(
      h.tenantContext.runAsSystemTenant('tenant-a', () =>
        h.service.planDelete('tenant-a', 'owner-1', {
          initiator: 'http',
          source_intent_ref: 'delete:missing',
          expense_id: 'missing',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.prisma.expense.findFirst).toHaveBeenCalledWith({
      where: { id: 'missing', tenantId: 'tenant-a' },
    });
    expect(h.planShadow).not.toHaveBeenCalled();
  });

  it('plans exact whole-tenant period declaration from a complete ledger snapshot', async () => {
    const h = harness();
    const result = await h.tenantContext.runAsSystemTenant('tenant-a', () =>
      h.service.planDeclare('tenant-a', 'owner-1', {
        initiator: 'ai_tool',
        source_intent_ref: 'ai:declare:1',
        period_from_day: '2026-08-01',
        period_to_day: '2026-08-31',
      }),
    );
    expect(result).toMatchObject({
      actionClass: 'declare_expense_period_complete',
      declarationsCreated: 0,
      valueMutations: 0,
    });
    expect(h.planShadow.mock.calls[0][0]).toMatchObject({
      capability: 'expenses.period-declare.shadow.v1',
      source: { type: 'legacy_bridge' },
      input: {
        branchScope: 'whole_tenant',
        actorRole: 'tenant_owner',
        declarationWritePerformed: false,
      },
    });
  });

  it('converges duplicate declaration initiators and restart on snapshot identity', async () => {
    const a = harness();
    const b = harness();
    const dto = {
      initiator: 'http' as const,
      source_intent_ref: 'declare:1',
      period_from_day: '2026-08-01',
      period_to_day: '2026-08-31',
    };
    await a.tenantContext.runAsSystemTenant('tenant-a', () =>
      a.service.planDeclare('tenant-a', 'owner-1', dto),
    );
    await b.tenantContext.runAsSystemTenant('tenant-a', () =>
      b.service.planDeclare('tenant-a', 'owner-1', dto),
    );
    expect(b.planShadow.mock.calls[0][0].callerIdempotency).toEqual(
      a.planShadow.mock.calls[0][0].callerIdempotency,
    );
  });

  it('restricts declaration to owner authority and bounded canonical dates', async () => {
    const nonOwner = harness('accountant');
    await expect(
      nonOwner.tenantContext.runAsSystemTenant('tenant-a', () =>
        nonOwner.service.planDeclare('tenant-a', 'accountant-1', {
          initiator: 'http',
          source_intent_ref: 'declare:1',
          period_from_day: '2026-08-01',
          period_to_day: '2026-08-31',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const h = harness();
    await expect(
      h.tenantContext.runAsSystemTenant('tenant-a', () =>
        h.service.planDeclare('tenant-a', 'owner-1', {
          initiator: 'http',
          source_intent_ref: 'declare:bad',
          period_from_day: '2026-08-31',
          period_to_day: '2026-08-01',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps every shadow physically non-executable', async () => {
    const h = harness();
    await h.tenantContext.runAsSystemTenant('tenant-a', async () => {
      await h.service.planCreate('tenant-a', 'owner-1', createDto());
      await h.service.planDelete('tenant-a', 'owner-1', {
        initiator: 'http',
        source_intent_ref: 'delete:1',
        expense_id: 'expense-1',
      });
      await h.service.planDeclare('tenant-a', 'owner-1', {
        initiator: 'http',
        source_intent_ref: 'declare:1',
        period_from_day: '2026-08-01',
        period_to_day: '2026-08-31',
      });
    });
    for (const [request] of h.planShadow.mock.calls) {
      expect(request.input).toEqual(expect.objectContaining({}));
      expect(request.capability).toMatch(/\.shadow\.v1$/);
    }
    expect(h.prisma.expense.findMany).toHaveBeenCalledTimes(1);
  });
});
