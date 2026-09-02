import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { ExpensesService } from './expenses.service';
import { P407ExpenseCanonicalCutoverService } from './p4-07-expense-canonical-cutover.service';

describe('ExpensesService', () => {
  const expense = {
    id: 'expense-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    category: 'rent',
    amountKopecks: 150_000,
    currency: 'RUB',
    occurredAt: new Date('2026-07-10T10:00:00.000Z'),
    encryptedNote: 'encrypted:July rent',
    source: 'manual',
    externalId: null,
    idempotencyKey: null,
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
  };
  const declaration = {
    id: 'declaration-a',
    tenantId: 'tenant-a',
    declaredById: 'owner-a',
    periodFromDay: '2026-07-01',
    periodToDay: '2026-07-31',
    idempotencyKey: 'declaration-key',
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
  };
  type ExpenseTestRow = Omit<typeof expense, 'idempotencyKey'> & {
    idempotencyKey: string | null;
  };
  type DeclarationTestRow = typeof declaration;

  const createService = (
    overrides: {
      findFirst?: jest.Mock;
      create?: jest.Mock;
      findMany?: jest.Mock;
      declarationFindFirst?: jest.Mock;
      declarationFindUnique?: jest.Mock;
      declarationUpsert?: jest.Mock;
      declarationDeleteMany?: jest.Mock;
    } = {},
  ) => {
    const tenantContext = new TenantContextService();
    let createdData: Record<string, unknown> | null = null;
    let listTenantId: string | null = null;
    const expenseCreate =
      overrides.create ??
      jest.fn((args: { data: Record<string, unknown> }) => {
        createdData = args.data;
        return Promise.resolve(expense);
      });
    const expenseFindMany =
      overrides.findMany ??
      jest.fn((args: { where: { tenantId: string } }) => {
        listTenantId = args.where.tenantId;
        return Promise.resolve([expense]);
      });
    const expenseFindFirst =
      overrides.findFirst ??
      jest.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(args.where.id === expense.id ? expense : null),
      );
    const declarationFindFirst =
      overrides.declarationFindFirst ?? jest.fn().mockResolvedValue(null);
    const declarationFindUnique =
      overrides.declarationFindUnique ??
      jest.fn().mockResolvedValue(declaration);
    const declarationUpsert =
      overrides.declarationUpsert ?? jest.fn().mockResolvedValue(declaration);
    const declarationDeleteMany =
      overrides.declarationDeleteMany ??
      jest.fn().mockResolvedValue({ count: 0 });
    const assertBranchBelongsToTenantMock = jest
      .fn()
      .mockResolvedValue(undefined);
    const prisma = {
      expense: {
        create: expenseCreate,
        findMany: expenseFindMany,
        findFirst: expenseFindFirst,
        delete: jest.fn().mockResolvedValue(expense),
      },
      expensePeriodDeclaration: {
        findFirst: declarationFindFirst,
        findUnique: declarationFindUnique,
        upsert: declarationUpsert,
        deleteMany: declarationDeleteMany,
      },
    } as unknown as PrismaService;
    const tenantsService = {
      assertBranchBelongsToTenant: assertBranchBelongsToTenantMock,
    } as unknown as TenantsService;
    const encryptionService = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    } as unknown as EncryptionService;
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const auditLogService = { log: auditLog } as unknown as AuditLogService;
    const canonicalCutover = {
      create: jest.fn(
        async (
          tenantId: string,
          actorUserId: string,
          dto: {
            category: string;
            amountKopecks: number;
            currency?: string;
            occurredAt: string;
            branchId?: string;
            note?: string;
          },
          invocation: { sourceIntentRef: string },
        ) => {
          const existing = (await expenseFindFirst({
            where: {
              tenantId,
              idempotencyKey: invocation.sourceIntentRef,
            },
          })) as unknown as ExpenseTestRow | null;
          let row = existing;
          if (!row) {
            try {
              await expenseCreate({
                data: {
                  tenantId,
                  branchId: dto.branchId ?? null,
                  branchTenantId: dto.branchId ? tenantId : null,
                  createdById: actorUserId,
                  createdByTenantId: tenantId,
                  category: dto.category,
                  amountKopecks: dto.amountKopecks,
                  currency: dto.currency ?? 'RUB',
                  occurredAt: new Date(dto.occurredAt),
                  encryptedNote: dto.note
                    ? encryptionService.encrypt(dto.note)
                    : null,
                  source: 'manual',
                  externalId: null,
                  idempotencyKey: invocation.sourceIntentRef,
                },
              });
              row = expense;
            } catch (error) {
              if (
                !(await expenseFindFirst({
                  where: {
                    tenantId,
                    idempotencyKey: invocation.sourceIntentRef,
                  },
                }))
              )
                throw error;
              row = expense;
            }
          }
          return {
            actionClass: 'create_expense',
            actionExecutionId: `execution:${invocation.sourceIntentRef}`,
            expenseId: row.id,
            invalidatedDeclarationIds: [],
            expenseCreates: existing ? 0 : 1,
            expenseDeletes: 0,
            declarationCreates: 0,
            unknownApplicable: false,
            providerWrites: 0,
          };
        },
      ),
      declare: jest.fn(
        async (
          tenantId: string,
          actorUserId: string,
          periodFromDay: string,
          periodToDay: string,
          sourceIntentRef: string,
        ) => {
          const row = (await declarationUpsert({
            where: {
              tenantId_periodFromDay_periodToDay: {
                tenantId,
                periodFromDay,
                periodToDay,
              },
            },
            create: {
              tenantId,
              declaredById: actorUserId,
              periodFromDay,
              periodToDay,
              idempotencyKey: sourceIntentRef,
            },
            update: {},
          })) as unknown as DeclarationTestRow;
          return {
            actionClass: 'declare_expense_period_complete',
            actionExecutionId: `execution:${sourceIntentRef}`,
            declarationId: row.id,
            invalidatedDeclarationIds: [],
            expenseCreates: 0,
            expenseDeletes: 0,
            declarationCreates: 1,
            unknownApplicable: false,
            providerWrites: 0,
          };
        },
      ),
    } as unknown as P407ExpenseCanonicalCutoverService;

    return {
      tenantContext,
      prisma,
      expenseCreate,
      expenseFindMany,
      expenseFindFirst,
      declarationFindFirst,
      declarationFindUnique,
      declarationUpsert,
      declarationDeleteMany,
      tenantsService,
      encryptionService,
      auditLogService,
      auditLog,
      assertBranchBelongsToTenantMock,
      getCreatedData: () => createdData,
      getListTenantId: () => listTenantId,
      service: new ExpensesService(
        prisma,
        tenantContext,
        tenantsService,
        encryptionService,
        auditLogService,
        canonicalCutover,
      ),
    };
  };

  it('writes tenant, actor and branch fences with encrypted notes', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.create(
        'tenant-a',
        'owner-a',
        {
          category: 'rent',
          amountKopecks: 150_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
          branchId: 'branch-a',
          note: 'July rent',
        },
        { idempotencyKey: 'request-a' },
      ),
    );

    expect(setup.assertBranchBelongsToTenantMock).toHaveBeenCalledWith(
      'branch-a',
      'tenant-a',
    );
    expect(setup.getCreatedData()).toMatchObject({
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      branchTenantId: 'tenant-a',
      createdById: 'owner-a',
      createdByTenantId: 'tenant-a',
      encryptedNote: 'encrypted:July rent',
      source: 'manual',
      externalId: null,
      idempotencyKey: 'request-a',
    });
    expect(result).toMatchObject({
      id: 'expense-a',
      tenant_id: 'tenant-a',
      note: 'July rent',
      category: 'rent',
      category_kind: 'fixed',
      category_known: true,
      source: 'manual',
    });
    expect(setup.declarationDeleteMany).not.toHaveBeenCalled();
  });

  it('stores an audited declaration that the owner entered every additional expense', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.declarePeriodComplete(
        'tenant-a',
        'owner-a',
        '2026-07-01',
        '2026-07-31',
        'declaration-key',
      ),
    );

    expect(setup.declarationUpsert).toHaveBeenCalledWith({
      where: {
        tenantId_periodFromDay_periodToDay: {
          tenantId: 'tenant-a',
          periodFromDay: '2026-07-01',
          periodToDay: '2026-07-31',
        },
      },
      create: {
        tenantId: 'tenant-a',
        declaredById: 'owner-a',
        periodFromDay: '2026-07-01',
        periodToDay: '2026-07-31',
        idempotencyKey: 'declaration-key',
      },
      update: {},
    });
    expect(result).toMatchObject({
      tenant_id: 'tenant-a',
      period_from_day: '2026-07-01',
      period_to_day: '2026-07-31',
      declared_complete: true,
    });
    expect(setup.auditLog).not.toHaveBeenCalled();
  });

  it('refuses a category outside the dictionary before touching the database', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.create('tenant-a', 'owner-a', {
          category: 'arenda-avgust',
          amountKopecks: 150_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setup.expenseCreate).not.toHaveBeenCalled();
  });

  it('refuses payroll by hand and explains that the CRM already accrues it', async () => {
    const setup = createService();

    const failure = await setup.tenantContext
      .runAsSystemTenant('tenant-a', () =>
        setup.service.create('tenant-a', 'owner-a', {
          category: 'payroll',
          amountKopecks: 6_000_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        }),
      )
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BadRequestException);
    const response = (failure as BadRequestException).getResponse() as {
      message: string;
      error: { code: string; reason: string };
    };
    expect(response.error.code).toBe('expense_category_not_manual');
    expect(response.error.reason).toBe('payroll_is_calculated_by_the_crm');
    expect(response.message).toContain('twice');
    expect(setup.expenseCreate).not.toHaveBeenCalled();
  });

  it('fails closed for the not-yet-converged CRM import writer', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.create(
          'tenant-a',
          'owner-a',
          {
            category: 'payroll',
            amountKopecks: 6_000_000,
            occurredAt: '2026-07-10T10:00:00.000Z',
          },
          { source: 'crm', externalId: 'yclients-777' },
        ),
      ),
    ).rejects.toThrow('no approved P4-07 canonical action contract');
    expect(setup.getCreatedData()).toBeNull();
  });

  it('returns the existing expense instead of a second one for the same key', async () => {
    const stored = {
      ...expense,
      id: 'expense-idem',
      idempotencyKey: 'approval-key',
    };
    const setup = createService({
      findFirst: jest.fn().mockResolvedValue(stored),
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.create(
        'tenant-a',
        'owner-a',
        {
          category: 'rent',
          amountKopecks: 150_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        },
        { idempotencyKey: 'approval-key' },
      ),
    );

    expect(result).toMatchObject({ id: 'expense-idem' });
    expect(setup.expenseCreate).not.toHaveBeenCalled();
  });

  it('survives a race on the same key by returning the row the index kept', async () => {
    const stored = {
      ...expense,
      id: 'expense-raced',
      idempotencyKey: 'approval-key',
    };
    const findFirst = jest
      .fn()
      .mockResolvedValue(stored)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored);
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const setup = createService({ findFirst, create });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.create(
        'tenant-a',
        'owner-a',
        {
          category: 'rent',
          amountKopecks: 150_000,
          occurredAt: '2026-07-10T10:00:00.000Z',
        },
        { idempotencyKey: 'approval-key' },
      ),
    );

    expect(result).toMatchObject({ id: 'expense-raced' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lists only tenant-scoped rows and returns currency totals', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(setup.getListTenantId()).toBe('tenant-a');
    expect(result.totals).toEqual([
      { currency: 'RUB', amount_kopecks: 150_000 },
    ]);
  });

  it('reads a legacy free-text category as other and keeps the original string', async () => {
    const setup = createService({
      findMany: jest
        .fn()
        .mockResolvedValue([{ ...expense, category: 'arenda-avgust' }]),
    });

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.list('tenant-a', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.000Z',
      }),
    );

    expect(result.items[0]).toMatchObject({
      category: 'other',
      category_known: false,
      category_raw: 'arenda-avgust',
      category_kind: 'variable',
    });
  });

  it('rejects a tenant mismatch before reading or writing expenses', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.list('tenant-b', {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-31T23:59:59.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.expenseFindMany).not.toHaveBeenCalled();
    expect(setup.expenseCreate).not.toHaveBeenCalled();
  });
});
