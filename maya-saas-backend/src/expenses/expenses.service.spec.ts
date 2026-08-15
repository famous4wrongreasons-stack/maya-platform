import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { ExpensesService } from './expenses.service';

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
      overrides.findFirst ?? jest.fn().mockResolvedValue(null);
    const declarationFindFirst =
      overrides.declarationFindFirst ?? jest.fn().mockResolvedValue(null);
    const declarationFindUnique =
      overrides.declarationFindUnique ?? jest.fn().mockResolvedValue(null);
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
      ),
    };
  };

  it('writes tenant, actor and branch fences with encrypted notes', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.create('tenant-a', 'owner-a', {
        category: 'rent',
        amountKopecks: 150_000,
        occurredAt: '2026-07-10T10:00:00.000Z',
        branchId: 'branch-a',
        note: 'July rent',
      }),
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
      idempotencyKey: null,
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
    expect(setup.declarationDeleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        periodFromDay: { lte: '2026-07-10' },
        periodToDay: { gte: '2026-07-10' },
      },
    });
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
      update: {
        declaredById: 'owner-a',
        idempotencyKey: 'declaration-key',
      },
    });
    expect(result).toMatchObject({
      tenant_id: 'tenant-a',
      period_from_day: '2026-07-01',
      period_to_day: '2026-07-31',
      declared_complete: true,
    });
    expect(setup.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'expense.period_declared_complete',
        entityId: 'declaration-a',
      }),
    );
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

  it('still accepts payroll from the CRM import path', async () => {
    const setup = createService();

    await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
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
    );

    expect(setup.getCreatedData()).toMatchObject({
      category: 'payroll',
      source: 'crm',
      externalId: 'yclients-777',
    });
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
