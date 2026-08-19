import { CustomersService } from '../customers/customers.service';
import { StaffService } from '../staff/staff.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { ForbiddenException } from '@nestjs/common';

import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';

const IDEMPOTENCY_KEY = '2f1c2f52-1e1b-4a2c-9d4f-7f1a8f0a01b2';

/**
 * Расход из чата: путь целиком, от намерения модели до строки в БД.
 *
 * Здесь настоящие рантайм, реестр, политика, обработчик и сервис расходов —
 * подменена только БД. Смысл именно в этом: подтверждение и защита от дубля
 * живут на стыке рантайма и сервиса, и юнит-тест каждого по отдельности этот
 * стык не проверяет.
 */
describe('expenses.create end to end', () => {
  const owner: AuthenticatedUser = {
    userId: 'owner_12345678',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'redacted@example.invalid',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  it('never writes an expense before a human confirms the card', async () => {
    const harness = createHarness();

    const requested = await harness.run(() =>
      harness.runtime.execute(owner, 'expenses.create', {
        arguments: {
          category: 'rent',
          amount_rubles: 60_000,
          occurred_on: '2026-08-07',
          note: 'Аренда за август',
        },
        surface: 'native',
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    );

    expect(requested).toMatchObject({
      status: 'approval_required',
      approval: {
        tool_name: 'expenses.create',
        approval_policy: 'actor',
        risk_tier: 'high_write',
        payload_preview: {
          action: 'create_expense',
          category: 'rent',
          amount_rubles: 60_000,
          amount_kopecks: 6_000_000,
          currency: 'RUB',
        },
      },
    });
    expect(harness.store.expenses).toHaveLength(0);
  });

  it('creates exactly one expense when the same card is confirmed twice', async () => {
    const harness = createHarness();
    const requested = (await harness.run(() =>
      harness.runtime.execute(owner, 'expenses.create', {
        arguments: {
          category: 'rent',
          amount_rubles: 60_000,
          occurred_on: '2026-08-07',
        },
        surface: 'native',
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    )) as { approval: { id: string; payload_hash: string } };

    const first = await harness.run(() =>
      harness.runtime.approve(owner, requested.approval.id, {
        payloadHash: requested.approval.payload_hash,
      }),
    );
    const second = await harness.run(() =>
      harness.runtime.approve(owner, requested.approval.id, {
        payloadHash: requested.approval.payload_hash,
      }),
    );

    expect(first).toMatchObject({
      status: 'completed',
      result: {
        recorded: true,
        category: 'rent',
        amount_kopecks: 6_000_000,
        currency: 'RUB',
        source: 'manual',
      },
    });
    expect(second).toMatchObject({
      status: 'completed',
      replayed: true,
      result: { recorded: true, amount_kopecks: 6_000_000 },
    });
    // Главное: подтвердили дважды — расход один.
    expect(harness.store.expenses).toHaveLength(1);
    expect(harness.store.expenses[0]).toMatchObject({
      tenantId: 'tenant-a',
      category: 'rent',
      amountKopecks: 6_000_000,
      source: 'manual',
      idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  it('refuses payroll by hand at the tool boundary', async () => {
    const harness = createHarness();

    await expect(
      harness.run(() =>
        harness.runtime.execute(owner, 'expenses.create', {
          arguments: { category: 'payroll', amount_rubles: 180_000 },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(harness.store.approvals).toHaveLength(0);
    expect(harness.store.expenses).toHaveLength(0);
  });

  it('keeps the tool away from a role that cannot record money', async () => {
    const harness = createHarness();

    await expect(
      harness.run(() =>
        harness.runtime.execute(
          { ...owner, role: UserRole.PROVIDER },
          'expenses.create',
          {
            arguments: { category: 'rent', amount_rubles: 60_000 },
            surface: 'native',
            idempotencyKey: IDEMPOTENCY_KEY,
          },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.store.approvals).toHaveLength(0);
    expect(harness.store.expenses).toHaveLength(0);
  });

  it('does not expose expense writes to an accountant', async () => {
    const harness = createHarness();
    const accountant = { ...owner, role: UserRole.ACCOUNTANT };

    await expect(
      harness.run(() =>
        harness.runtime.execute(accountant, 'expenses.create', {
          arguments: { category: 'supplies', amount_rubles: 4_500 },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.store.approvals).toHaveLength(0);
    expect(harness.store.expenses).toHaveLength(0);
  });

  it('allows only the requesting owner id to approve the expense', async () => {
    const harness = createHarness();
    const requested = (await harness.run(() =>
      harness.runtime.execute(owner, 'expenses.create', {
        arguments: { category: 'supplies', amount_rubles: 4_500 },
        surface: 'native',
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    )) as { approval: { id: string; payload_hash: string } };
    const anotherOwner = {
      ...owner,
      userId: 'owner_87654321',
      membershipId: 'membership-b',
    };

    await expect(
      harness.run(() =>
        harness.runtime.approve(anotherOwner, requested.approval.id, {
          payloadHash: requested.approval.payload_hash,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.store.expenses).toHaveLength(0);
  });
});

interface ExpenseRow {
  id: string;
  tenantId: string;
  branchId: string | null;
  branchTenantId: string | null;
  createdById: string | null;
  createdByTenantId: string | null;
  category: string;
  amountKopecks: number;
  currency: string;
  occurredAt: Date;
  encryptedNote: string | null;
  source: string;
  externalId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createHarness() {
  const store = {
    expenses: [] as ExpenseRow[],
    approvals: [] as Record<string, unknown>[],
    executions: [] as Record<string, unknown>[],
  };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

  const matchesExpense = (row: ExpenseRow, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([key, value]) =>
        (row as unknown as Record<string, unknown>)[key] === value,
    );

  const prisma = {
    expense: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const now = new Date('2026-08-07T09:00:00.000Z');
        const row = {
          id: nextId('expense'),
          createdAt: now,
          updatedAt: now,
          ...args.data,
        } as unknown as ExpenseRow;
        store.expenses.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          store.expenses.find((row) => matchesExpense(row, args.where)) ?? null,
        ),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
    expensePeriodDeclaration: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        calendarSource: 'external',
        defaultTimezone: 'Europe/Moscow',
      }),
    },
    branch: { findFirst: jest.fn() },
    membership: {
      findUnique: jest.fn(
        (args: {
          where: { userId_tenantId: { userId: string; tenantId: string } };
        }) =>
          Promise.resolve({
            role: UserRole.TENANT_OWNER,
            status: 'active',
            user: { id: args.where.userId_tenantId.userId, status: 'active' },
          }),
      ),
    },
    aiApprovalRequest: {
      findUnique: jest.fn((args: { where: Record<string, unknown> }) => {
        const key = args.where as {
          id_tenantId?: { id: string; tenantId: string };
          tenantId_idempotencyKey?: {
            tenantId: string;
            idempotencyKey: string;
          };
        };
        if (key.id_tenantId) {
          return Promise.resolve(
            store.approvals.find(
              (row) =>
                row.id === key.id_tenantId!.id &&
                row.tenantId === key.id_tenantId!.tenantId,
            ) ?? null,
          );
        }
        return Promise.resolve(
          store.approvals.find(
            (row) =>
              row.tenantId === key.tenantId_idempotencyKey!.tenantId &&
              row.idempotencyKey ===
                key.tenantId_idempotencyKey!.idempotencyKey,
          ) ?? null,
        );
      }),
      findUniqueOrThrow: jest.fn(
        (args: {
          where: { id_tenantId: { id: string; tenantId: string } };
        }) => {
          const found = store.approvals.find(
            (row) => row.id === args.where.id_tenantId.id,
          );
          if (!found) {
            throw new Error('approval not found');
          }
          return Promise.resolve(found);
        },
      ),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: nextId('approval'),
          decidedByUserId: null,
          decidedByTenantId: null,
          decidedAt: null,
          executedAt: null,
          errorCode: null,
          createdAt: now,
          updatedAt: now,
          ...args.data,
        };
        store.approvals.push(row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(
        (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const where = args.where as {
            id?: string;
            tenantId?: string;
            status?: string | { in: string[] };
            expiresAt?: { gt?: Date; lte?: Date };
          };
          let count = 0;
          for (const row of store.approvals) {
            if (where.id && row.id !== where.id) continue;
            if (where.tenantId && row.tenantId !== where.tenantId) continue;
            if (
              typeof where.status === 'string' &&
              row.status !== where.status
            ) {
              continue;
            }
            if (
              where.status &&
              typeof where.status === 'object' &&
              !where.status.in.includes(row.status as string)
            ) {
              continue;
            }
            if (
              where.expiresAt?.gt &&
              (row.expiresAt as Date).getTime() <= where.expiresAt.gt.getTime()
            ) {
              continue;
            }
            Object.assign(row, args.data);
            count += 1;
          }
          return Promise.resolve({ count });
        },
      ),
      update: jest.fn(
        (args: {
          where: { id_tenantId: { id: string } };
          data: Record<string, unknown>;
        }) => {
          const found = store.approvals.find(
            (row) => row.id === args.where.id_tenantId.id,
          );
          if (found) {
            Object.assign(found, args.data);
          }
          return Promise.resolve(found ?? {});
        },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiToolExecution: {
      findUnique: jest.fn((args: { where: Record<string, unknown> }) => {
        const key = args.where as {
          tenantId_idempotencyKey?: {
            tenantId: string;
            idempotencyKey: string;
          };
          approvalRequestId_approvalTenantId?: {
            approvalRequestId: string;
            approvalTenantId: string;
          };
        };
        if (key.tenantId_idempotencyKey) {
          return Promise.resolve(
            store.executions.find(
              (row) =>
                row.tenantId === key.tenantId_idempotencyKey!.tenantId &&
                row.idempotencyKey ===
                  key.tenantId_idempotencyKey!.idempotencyKey,
            ) ?? null,
          );
        }
        return Promise.resolve(
          store.executions.find(
            (row) =>
              row.approvalRequestId ===
              key.approvalRequestId_approvalTenantId!.approvalRequestId,
          ) ?? null,
        );
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('execution'),
          encryptedResult: null,
          errorCode: null,
          completedAt: null,
          ...args.data,
        };
        store.executions.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const found = store.executions.find(
            (row) => row.id === args.where.id,
          );
          if (found) {
            Object.assign(found, args.data);
          }
          return Promise.resolve(found ?? {});
        },
      ),
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;

  const tenantContext = new TenantContextService();
  const encryption = {
    encrypt: jest.fn(
      (value: string) =>
        `encrypted:${Buffer.from(value, 'utf8').toString('base64url')}`,
    ),
    decrypt: jest.fn((value: string) =>
      Buffer.from(value.slice('encrypted:'.length), 'base64url').toString(
        'utf8',
      ),
    ),
  } as unknown as EncryptionService;
  const auditLog = {
    log: jest.fn().mockResolvedValue({ id: 'audit-a' }),
  } as unknown as AuditLogService;
  const entitlements = {
    getEffectiveEntitlements: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      planId: 'max',
      features: { 'ai.owner': true, 'ai.admin': true, 'expenses.core': true },
      featureKeys: ['ai.owner', 'ai.admin', 'expenses.core'],
    }),
    assertFeature: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntitlementsService;
  const tenantsService = {
    assertBranchBelongsToTenant: jest.fn().mockResolvedValue(undefined),
  } as unknown as TenantsService;

  const expensesService = new ExpensesService(
    prisma,
    tenantContext,
    tenantsService,
    encryption,
    auditLog,
  );
  const registry = new AiToolRegistryService();
  const handler = new AiToolHandlerService(
    {} as CrmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    {} as OperationsAnalyticsService,
    expensesService,
    prisma,
    // Арность конструктора соблюдена: недостающие зависимости раньше молча
    // становились `undefined`, и спека закрепляла обход как норму.
    {} as CustomersService,
    {} as StaffService,
    new BusinessStateService({} as OperationsAnalyticsService, prisma),
    // 🔴 Cycle 04 P6. Канонический читатель периода.
    new AppointmentPeriodReader({} as CrmService),
    new ClientRecencyFactsService({} as CrmService),
  );
  const runtime = new AiToolRuntimeService(
    prisma,
    tenantContext,
    registry,
    new AiToolPolicyService(tenantContext, entitlements, registry),
    handler,
    encryption,
    auditLog,
  );

  return {
    runtime,
    store,
    run: <T>(operation: () => Promise<T>) =>
      tenantContext.runAsSystemTenant('tenant-a', operation),
  };
}
