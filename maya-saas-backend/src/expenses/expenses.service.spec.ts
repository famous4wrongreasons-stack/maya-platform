import { ForbiddenException } from '@nestjs/common';

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
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
  };

  const createService = () => {
    const tenantContext = new TenantContextService();
    let createdData: Record<string, unknown> | null = null;
    let listTenantId: string | null = null;
    const expenseCreate = jest.fn((args: { data: Record<string, unknown> }) => {
      createdData = args.data;
      return Promise.resolve(expense);
    });
    const expenseFindMany = jest.fn((args: { where: { tenantId: string } }) => {
      listTenantId = args.where.tenantId;
      return Promise.resolve([expense]);
    });
    const assertBranchBelongsToTenantMock = jest
      .fn()
      .mockResolvedValue(undefined);
    const prisma = {
      expense: {
        create: expenseCreate,
        findMany: expenseFindMany,
        findFirst: jest.fn().mockResolvedValue(expense),
        delete: jest.fn().mockResolvedValue(expense),
      },
    } as unknown as PrismaService;
    const tenantsService = {
      assertBranchBelongsToTenant: assertBranchBelongsToTenantMock,
    } as unknown as TenantsService;
    const encryptionService = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    } as unknown as EncryptionService;
    const auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;

    return {
      tenantContext,
      prisma,
      expenseCreate,
      expenseFindMany,
      tenantsService,
      encryptionService,
      auditLogService,
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
    });
    expect(result).toMatchObject({
      id: 'expense-a',
      tenant_id: 'tenant-a',
      note: 'July rent',
    });
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
