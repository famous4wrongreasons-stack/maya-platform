import { measurementReaderDouble } from '../../test/helpers/measurement-reader';
import { canonicalReceiptFixture } from '../../test/fixtures/ai-tool-receipt.fixture';
/**
 * ПРИЁМКА ЖИВЫМИ ВОПРОСАМИ ВЛАДЕЛЬЦА.
 *
 * Настоящие AiCoreService, рантайм, реестр, политика, обработчик, движок
 * аналитики и сервис расходов. Подменены только внешние границы: база,
 * внешняя CRM и провайдер модели. Проверяется не «вызвалась ли функция», а то,
 * что видит человек: какой инструмент выбран, что в результате, проходит ли
 * ответ сторож чисел и понятен ли он без знания схемы данных.
 *
 * Модель здесь ведёт себя как настоящая в двух режимах: либо не отвечает
 * вовсе (провайдер недоступен — тогда текст собирает сервер), либо повторяет
 * собранный сервером ответ, и тот проходит сторожа чисел как ответ модели.
 */
import { BusinessStateService } from '../business-state/business-state.service';
import { CustomersService } from '../customers/customers.service';
import { StaffService } from '../staff/staff.service';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AttendanceFactsService } from '../business-facts/attendance-facts.service';
import { ConfigService } from '@nestjs/config';

import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { DashboardPreferencesService } from '../dashboard-preferences/dashboard-preferences.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ExpensesService } from '../expenses/expenses.service';
import { P407ExpenseCanonicalCutoverService } from '../expenses/p4-07-expense-canonical-cutover.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import type { AiCoreModelDecision, AiCoreModelInput } from './ai-core.types';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

/** «Сегодня» приёмки: 7 августа 2026, чтобы «в июле» был прошедшим месяцем. */
const NOW = new Date('2026-08-07T09:00:00.000Z');

const owner: AuthenticatedUser = {
  userId: 'owner_12345678',
  sessionId: 'session-a',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
  email: 'owner@example.test',
  branchId: null,
  membershipId: 'membership-a',
  membershipStatus: 'active',
};

/** Формы `where`, которыми рантайм ходит в карточки подтверждения. */
interface ApprovalWhere {
  id_tenantId?: { id: string; tenantId: string };
  tenantId_idempotencyKey?: { tenantId: string; idempotencyKey: string };
}

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

interface ExpensePeriodDeclarationRow {
  id: string;
  tenantId: string;
  declaredById: string | null;
  periodFromDay: string;
  periodToDay: string;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const expenseOn = (
  id: string,
  category: string,
  amountKopecks: number,
  occurredAt: string,
  source = 'manual',
): ExpenseRow => ({
  id,
  tenantId: 'tenant-a',
  branchId: null,
  branchTenantId: null,
  createdById: owner.userId,
  createdByTenantId: 'tenant-a',
  category,
  amountKopecks,
  currency: 'RUB',
  occurredAt: new Date(occurredAt),
  encryptedNote: null,
  source,
  externalId: null,
  idempotencyKey: null,
  createdAt: new Date(occurredAt),
  updatedAt: new Date(occurredAt),
});

function journalAppointment(id: string, clientId: string, startAt: string) {
  return {
    id,
    client: { id: clientId, name: 'Клиент' },
    provider: { id: 'staff-1', name: 'Мастер' },
    branch: null,
    service_ids: ['service-a'],
    services: [
      {
        id: 'service-a',
        name: 'Мужская стрижка',
        price: 2_500,
        currency: 'RUB',
      },
    ],
    start_at: startAt,
    end_at: startAt,
    status: 'confirmed',
    notes: null,
    total_price: 2_500,
    currency: 'RUB',
  };
}

/**
 * Журнал салона целиком. `client-old` ходит с мая, `client-new` впервые
 * пришёл в июле, `client-august` — в августе. Значит и у июля, и у августа
 * ровно по одному новому гостю, и стоимость привлечения считается честно.
 */
const JOURNAL = [
  journalAppointment('may-1', 'client-old', '2026-05-20T09:00:00.000Z'),
  journalAppointment('jun-1', 'client-old', '2026-06-10T09:00:00.000Z'),
  journalAppointment('jul-1', 'client-old', '2026-07-10T09:00:00.000Z'),
  journalAppointment('jul-2', 'client-new', '2026-07-12T09:00:00.000Z'),
  journalAppointment('aug-1', 'client-old', '2026-08-03T09:00:00.000Z'),
  journalAppointment('aug-2', 'client-august', '2026-08-05T09:00:00.000Z'),
];

function createHarness(
  options: {
    expenses?: ExpenseRow[];
    payrollAvailable?: boolean;
    declaredPeriods?: Array<{ from: string; to: string }>;
  } = {},
) {
  const store = {
    expenses: [...(options.expenses ?? [])],
    declarations: [] as ExpensePeriodDeclarationRow[],
    approvals: [] as Record<string, any>[],
    executions: [] as Record<string, any>[],
  };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;
  for (const period of options.declaredPeriods ?? []) {
    store.declarations.push({
      id: nextId('declaration'),
      tenantId: 'tenant-a',
      declaredById: owner.userId,
      periodFromDay: period.from,
      periodToDay: period.to,
      idempotencyKey: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  const matches = (row: ExpenseRow, where: Record<string, unknown>) =>
    Object.entries(where).every(
      ([key, value]) =>
        (row as unknown as Record<string, unknown>)[key] === value,
    );

  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultTimezone: 'Europe/Moscow',
        calendarSource: 'external',
      }),
    },
    branch: { findFirst: jest.fn() },
    appointment: { findMany: jest.fn().mockResolvedValue([]) },
    internalProvider: { findFirst: jest.fn(), findMany: jest.fn() },
    crmStaffAccess: { findFirst: jest.fn(), findMany: jest.fn() },
    expense: {
      findMany: jest.fn((args: { where: Record<string, unknown> }) => {
        const where = args.where as {
          occurredAt?: { gte?: Date; lte?: Date };
          [key: string]: unknown;
        };
        const scalars = Object.fromEntries(
          Object.entries(where).filter(([key]) => key !== 'occurredAt'),
        );
        return Promise.resolve(
          store.expenses.filter((row) => {
            if (!matches(row, scalars)) return false;
            const range = where.occurredAt;
            if (!range) return true;
            const at = row.occurredAt.getTime();
            if (range.gte && at < range.gte.getTime()) return false;
            if (range.lte && at > range.lte.getTime()) return false;
            return true;
          }),
        );
      }),
      findFirst: jest.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          store.expenses.find((row) => matches(row, args.where)) ?? null,
        ),
      ),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('expense'),
          createdAt: NOW,
          updatedAt: NOW,
          ...args.data,
        } as unknown as ExpenseRow;
        store.expenses.push(row);
        return Promise.resolve(row);
      }),
    },
    expensePeriodDeclaration: {
      findUnique: jest.fn(
        (args: {
          where: {
            tenantId_periodFromDay_periodToDay: {
              tenantId: string;
              periodFromDay: string;
              periodToDay: string;
            };
          };
        }) => {
          const key = args.where.tenantId_periodFromDay_periodToDay;
          return Promise.resolve(
            store.declarations.find(
              (row) =>
                row.tenantId === key.tenantId &&
                row.periodFromDay === key.periodFromDay &&
                row.periodToDay === key.periodToDay,
            ) ?? null,
          );
        },
      ),
      findFirst: jest.fn((args: { where: Record<string, unknown> }) =>
        Promise.resolve(
          store.declarations.find((row) =>
            Object.entries(args.where).every(
              ([key, value]) =>
                (row as unknown as Record<string, unknown>)[key] === value,
            ),
          ) ?? null,
        ),
      ),
      upsert: jest.fn(
        (args: {
          where: {
            tenantId_periodFromDay_periodToDay: {
              tenantId: string;
              periodFromDay: string;
              periodToDay: string;
            };
          };
          create: Omit<
            ExpensePeriodDeclarationRow,
            'id' | 'createdAt' | 'updatedAt'
          >;
          update: Partial<ExpensePeriodDeclarationRow>;
        }) => {
          const key = args.where.tenantId_periodFromDay_periodToDay;
          const existing = store.declarations.find(
            (row) =>
              row.tenantId === key.tenantId &&
              row.periodFromDay === key.periodFromDay &&
              row.periodToDay === key.periodToDay,
          );
          if (existing) {
            Object.assign(existing, args.update, { updatedAt: NOW });
            return Promise.resolve(existing);
          }
          const row: ExpensePeriodDeclarationRow = {
            id: nextId('declaration'),
            createdAt: NOW,
            updatedAt: NOW,
            ...args.create,
          };
          store.declarations.push(row);
          return Promise.resolve(row);
        },
      ),
      deleteMany: jest.fn(
        (args: {
          where: {
            tenantId: string;
            periodFromDay: { lte: string };
            periodToDay: { gte: string };
          };
        }) => {
          const before = store.declarations.length;
          store.declarations = store.declarations.filter(
            (row) =>
              !(
                row.tenantId === args.where.tenantId &&
                row.periodFromDay <= args.where.periodFromDay.lte &&
                row.periodToDay >= args.where.periodToDay.gte
              ),
          );
          return Promise.resolve({ count: before - store.declarations.length });
        },
      ),
    },
    membership: {
      findUnique: jest.fn(
        (args: { where: { userId_tenantId: { userId: string } } }) =>
          Promise.resolve({
            role: UserRole.TENANT_OWNER,
            status: 'active',
            user: { id: args.where.userId_tenantId.userId, status: 'active' },
          }),
      ),
    },
    aiApprovalRequest: {
      findUnique: jest.fn((args: { where: ApprovalWhere }) => {
        const key = args.where;
        if (key.id_tenantId) {
          return Promise.resolve(
            store.approvals.find((row) => row.id === key.id_tenantId?.id) ??
              null,
          );
        }
        return Promise.resolve(
          store.approvals.find(
            (row) =>
              row.idempotencyKey ===
              key.tenantId_idempotencyKey?.idempotencyKey,
          ) ?? null,
        );
      }),
      findUniqueOrThrow: jest.fn((args: { where: ApprovalWhere }) =>
        Promise.resolve({
          ...store.approvals.find(
            (row) => row.id === args.where.id_tenantId?.id,
          ),
        }),
      ),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('approval'),
          decidedByUserId: null,
          decidedByTenantId: null,
          decidedAt: null,
          executedAt: null,
          errorCode: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...args.data,
        };
        store.approvals.push(row);
        return Promise.resolve({ ...row });
      }),
      updateMany: jest.fn(
        (args: {
          where: {
            id?: string;
            status?: string | { in: string[] };
            expiresAt?: { gt?: Date; lte?: Date };
          };
          data: Record<string, unknown>;
        }) => {
          const where = args.where;
          let count = 0;
          for (const row of store.approvals) {
            if (where.id && row.id !== where.id) continue;
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
            if (
              where.expiresAt?.lte &&
              (row.expiresAt as Date).getTime() > where.expiresAt.lte.getTime()
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
        (args: { where: ApprovalWhere; data: Record<string, unknown> }) => {
          const found = store.approvals.find(
            (row) => row.id === args.where.id_tenantId?.id,
          );
          if (found) Object.assign(found, args.data);
          return Promise.resolve(found ?? {});
        },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiToolExecution: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const row = { id: nextId('execution'), ...args.data };
        store.executions.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn((args: { where: { id: string }; data: object }) => {
        const found = store.executions.find((row) => row.id === args.where.id);
        if (found) Object.assign(found, args.data);
        return Promise.resolve(found ?? {});
      }),
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;

  const tenantContext = new TenantContextService();
  const encryption = {
    encrypt: (value: string) =>
      `enc:${Buffer.from(value, 'utf8').toString('base64url')}`,
    decrypt: (value: string) =>
      Buffer.from(value.slice(4), 'base64url').toString('utf8'),
  } as unknown as EncryptionService;
  const auditLog = {
    log: jest.fn().mockResolvedValue({ id: 'audit-a' }),
  } as unknown as AuditLogService;
  const entitlements = {
    getEffectiveEntitlements: jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      planId: 'max',
      features: {
        'ai.owner': true,
        'analytics.business': true,
        'expenses.core': true,
        booking: true,
        'customers.core': true,
      },
      featureKeys: [],
    }),
    assertFeature: jest.fn().mockResolvedValue(undefined),
  } as unknown as EntitlementsService;

  /**
   * Внешняя CRM: подтверждённая касса июля 1 200 000 ₽ и начисленная
   * зарплата 500 000 ₽. Журнал за сам период отдаёт двух клиентов, а за
   * горизонт когорт до него — только одного: значит один гость новый.
   */
  const getFinancialSummary = jest.fn(() =>
    Promise.resolve({
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: { from: '', to: '' },
      revenue: {
        status: 'available' as const,
        verified: true,
        transaction_count: 240,
        total: {
          currency: 'RUB',
          amount_kopecks: 120_000_000,
          amount_major_units: 1_200_000,
        },
      },
      payroll:
        options.payrollAvailable === false
          ? {
              // Ровно то, что CRM отдаёт на периоде длиннее 31 дня.
              status: 'unavailable' as const,
              verified: false,
              accrued_total: null,
              paid_total: null,
              balance_total: null,
              staff: [],
            }
          : {
              status: 'available' as const,
              verified: true,
              accrued_total: {
                currency: 'RUB',
                amount_kopecks: 50_000_000,
                amount_major_units: 500_000,
              },
              paid_total: {
                currency: 'RUB',
                amount_kopecks: 50_000_000,
                amount_major_units: 500_000,
              },
              balance_total: {
                currency: 'RUB',
                amount_kopecks: 0,
                amount_major_units: 0,
              },
              staff: [],
            },
      warnings: [],
    }),
  );
  // Журнал отвечает ровно тем, что попало в запрошенное окно: когорты и
  // «новых гостей» считает настоящий движок, а не заглушка.
  const getJournal = jest.fn(
    (_tenantId: string, range: { from: string; to: string }) => {
      const from = new Date(range.from).getTime();
      const to = new Date(range.to).getTime();
      const appointments = JOURNAL.filter((item) => {
        const at = new Date(item.start_at).getTime();
        return at >= from && at <= to;
      });
      return Promise.resolve({
        calendar_source: 'external',
        timezone: 'Europe/Moscow',
        range,
        provider_id: null,
        count: appointments.length,
        appointments,
      });
    },
  );
  const crmService = {
    getFinancialSummary,
    getJournal,
    getRevenueSummary: jest.fn(),
  } as unknown as CrmService;

  const analytics = new OperationsAnalyticsService(
    prisma,
    tenantContext,
    { assertBranchBelongsToTenant: jest.fn() } as unknown as TenantsService,
    crmService,
    encryption,
    new AppointmentPeriodReader(crmService),
    new AttendanceFactsService(prisma, tenantContext),
  );
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
        const existing = store.expenses.find(
          (row) =>
            row.tenantId === tenantId &&
            row.idempotencyKey === invocation.sourceIntentRef,
        );
        const row =
          existing ??
          (await prisma.expense.create({
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
              encryptedNote: dto.note ? encryption.encrypt(dto.note) : null,
              source: 'manual',
              externalId: null,
              idempotencyKey: invocation.sourceIntentRef,
            },
          }));
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
        const declaration = await prisma.expensePeriodDeclaration.upsert({
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
        });
        return {
          actionClass: 'declare_expense_period_complete',
          actionExecutionId: `execution:${sourceIntentRef}`,
          declarationId: declaration.id,
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
  const expensesService = new ExpensesService(
    prisma,
    tenantContext,
    { assertBranchBelongsToTenant: jest.fn() } as unknown as TenantsService,
    encryption,
    auditLog,
    canonicalCutover,
  );
  const registry = new AiToolRegistryService();
  const measurementReader = measurementReaderDouble();
  const measurementPeriod = jest.spyOn(measurementReader, 'readPeriod');
  const handler = new AiToolHandlerService(
    crmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    analytics,
    expensesService,
    prisma,
    // Арность конструктора соблюдена: недостающие зависимости раньше молча
    // становились `undefined`, и спека закрепляла обход как норму.
    {} as CustomersService,
    {} as StaffService,
    new BusinessStateService(analytics, prisma),
    // 🔴 Cycle 04 P6. Канонический читатель периода.
    new AppointmentPeriodReader({} as CrmService),
    new ClientRecencyFactsService({} as CrmService),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    measurementReader,
  );
  const runtime = new AiToolRuntimeService(
    prisma,
    tenantContext,
    registry,
    new AiToolPolicyService(tenantContext, entitlements, registry),
    handler,
    encryption,
    auditLog,
    canonicalReceiptFixture(prisma, encryption),
  );

  const decide = jest.fn<
    Promise<AiCoreModelDecision | null>,
    [AiCoreModelInput]
  >();
  const model = { decide } as unknown as AiCoreModelService;
  const service = new AiCoreService(
    {
      get: jest.fn((name: string) =>
        name === 'AI_CORE_MAX_TOOL_STEPS' ? '2' : undefined,
      ),
    } as unknown as ConfigService,
    tenantContext,
    {
      assertTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRateLimitService,
    runtime,
    model,
    auditLog,
    {
      getAssistant: jest.fn().mockResolvedValue({
        config: { enabled_capabilities: ['business_analytics'] },
      }),
      updateAssistant: jest.fn(),
    } as unknown as DashboardPreferencesService,
    {
      tryHandle: jest.fn().mockResolvedValue(null),
    } as unknown as StaffScheduleCommandService,
    new MayaBrainRouterService(),
  );

  let request = 0;
  const askMessages = (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    surface: 'native' | 'web' = 'native',
  ) =>
    tenantContext.runAsSystemTenant('tenant-a', () =>
      service.chat(owner, {
        surface,
        requestId: `request_${(request += 1)}0000000`,
        messages,
      }),
    );
  const ask = (text: string, surface: 'native' | 'web' = 'native') =>
    askMessages([{ role: 'user', content: text }], surface);

  return {
    ask,
    askMessages,
    decide,
    store,
    runtime,
    tenantContext,
    getFinancialSummary,
    getJournal,
    measurementReader,
    measurementPeriod,
    approve: (approvalId: string, payloadHash: string) =>
      tenantContext.runAsSystemTenant('tenant-a', () =>
        runtime.approve(owner, approvalId, { payloadHash }),
      ),
  };
}

/** Модель молчит: провайдер недоступен, текст обязан собрать сервер. */
function silentModel(harness: ReturnType<typeof createHarness>) {
  harness.decide.mockResolvedValue(null);
}

/** Модель повторяет собранный сервером текст — проверяем сторож чисел. */
function echoModel(harness: ReturnType<typeof createHarness>, reply: string) {
  harness.decide.mockImplementation((input: AiCoreModelInput) =>
    Promise.resolve({
      reply: input.toolResults.length > 0 ? reply : 'Смотрю данные.',
      toolCall: null,
      provider: 'deepseek' as const,
      model: 'test-model',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }),
  );
}

describe('ПРИЁМКА: живые денежные вопросы владельца', () => {
  beforeAll(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate'],
    });
  });
  afterAll(() => jest.useRealTimers());

  /**
   * Полная книга расходов и июля, и августа: одинаковые суммы в обоих
   * месяцах. Аренда 120 000 ₽, расходники 30 000 ₽, реклама 40 000 ₽.
   */
  const fullLedger = [
    expenseOn('rent-july', 'rent', 12_000_000, '2026-07-05T09:00:00.000Z'),
    expenseOn(
      'supplies-july',
      'supplies',
      3_000_000,
      '2026-07-06T09:00:00.000Z',
    ),
    expenseOn(
      'marketing-july',
      'marketing',
      4_000_000,
      '2026-07-07T09:00:00.000Z',
    ),
    expenseOn('rent-august', 'rent', 12_000_000, '2026-08-03T09:00:00.000Z'),
    expenseOn(
      'supplies-august',
      'supplies',
      3_000_000,
      '2026-08-04T09:00:00.000Z',
    ),
    expenseOn(
      'marketing-august',
      'marketing',
      4_000_000,
      '2026-08-05T09:00:00.000Z',
    ),
  ];
  const declaredPeriods = [
    { from: '2026-07-01', to: '2026-07-31' },
    { from: '2026-08-01', to: '2026-08-07' },
  ];

  it('«какая была прибыль в июле» — июль целиком, прибыль от кассы', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('какая была прибыль в июле');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'analytics.business.profit',
    ]);
    expect(answer.grounding).toMatchObject({
      domain: 'business_profit',
      status: 'verified',
    });
    // Окно — календарный июль, а не «месяц по сегодня».
    expect(h.measurementPeriod).toHaveBeenCalledWith(
      'tenant-a',
      owner.userId,
      'business_period',
      expect.objectContaining({ from: '2026-06-30T21:00:00.000Z' }),
    );
    // D4: provider totals + declared expenses do not prove confirmed cash/refunds/net.
    expect(answer.reply).toContain('Чистая прибыль: не измерено');
    expect(answer.reply).not.toMatch(/510 000|1 200 000|42,5%/);
    // Понятно без знания схемы: ни имён полей, ни служебных кодов.
    expect(answer.reply).not.toMatch(/net_profit|amount_kopecks|unavailable/);

    // Тот же текст, отданный как ответ модели, проходит сторож чисел.
    const h2 = createHarness({ expenses: fullLedger, declaredPeriods });
    echoModel(h2, answer.reply);
    const viaModel = await h2.ask('какая была прибыль в июле', 'web');
    // Денежный ответ может быть собран сервером: это не деградация,
    // а защита от искажения подтверждённых цифр моделью.
    expect(['deepseek', 'safe_fallback']).toContain(viaModel.source);
    expect(viaModel.reply).toBe(answer.reply);
  });

  it('«я в плюсе?» — тот же инструмент прибыли, а не обзор записей', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('я в плюсе?');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'analytics.business.profit',
    ]);
    expect(answer.reply).toContain('Чистая прибыль');
    expect(answer.reply).toContain('Чистая прибыль: не измерено');
  });

  it('«сколько стоит привести нового клиента» — экономика, а не прайс', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('сколько стоит привести нового клиента');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'analytics.business.profit',
    ]);
    expect(answer.tools_used.map((tool) => tool.name)).not.toContain(
      'catalog.services.read',
    );
    expect(answer.reply).toContain('Стоимость привлечения клиента не измерена');
    expect(answer.reply).toContain('не доказывают');
    expect(answer.reply).not.toContain('40 000 ₽');
  });

  it('«какая прибыль в августе» — месяц ещё идёт, и MAYA это говорит', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('какая прибыль в августе');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'analytics.business.profit',
    ]);
    expect(answer.reply).toContain('Месяц ещё не закончился');
    // Окно начинается с 1 августа по местному времени, а не «месяц назад».
    expect(h.measurementPeriod).toHaveBeenCalledWith(
      'tenant-a',
      owner.userId,
      'business_period',
      expect.objectContaining({ from: '2026-07-31T21:00:00.000Z' }),
    );
  });

  it('«сколько стоит стрижка» по-прежнему уходит в прайс', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('сколько стоит стрижка');

    expect(answer.grounding.domain).toBe('service_catalog');
  });

  it('«сколько стоит стрижка» не отвечает средним чеком и не тащит прибыль', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('сколько стоит стрижка');

    expect(answer.grounding.domain).toBe('service_catalog');
    expect(answer.tools_used.map((tool) => tool.name)).not.toContain(
      'analytics.business.query',
    );
    expect(answer.tools_used.map((tool) => tool.name)).not.toContain(
      'analytics.business.profit',
    );
    expect(answer.reply).not.toMatch(/средний чек|прибыл/i);
  });

  it('прибыль через модель не подменяет выручку и не светит схему', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    h.decide.mockImplementation((input: AiCoreModelInput) => {
      if (input.toolResults?.length) {
        return Promise.resolve({
          provider: 'deepseek',
          model: 'test',
          reply:
            'Чистая прибыль за июль 130 000 ₽ при поступлениях 400 000 ₽. Поле revenue_amount_kopecks подтверждает кассу.',
          toolCall: null,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        } as AiCoreModelDecision);
      }
      return Promise.resolve({
        provider: 'deepseek',
        model: 'test',
        reply: null,
        toolCall: {
          name: 'analytics.business.profit',
          arguments: { period: 'named_month', month: '2026-07' },
        },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      } as AiCoreModelDecision);
    });

    const answer = await h.ask('какая была прибыль в июле');

    expect(answer.reply).not.toContain('revenue_amount_kopecks');
    expect(answer.reply).not.toContain('booked_value');
    expect(answer.reply).not.toMatch(/поле\s+revenue/i);
  });

  it('«сколько ушло на расходники» — разрез по статьям от сервера', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('сколько ушло на расходники в июле');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'expenses.read',
    ]);
    expect(answer.reply).toContain('Расходники — 30 000 ₽');
    expect(answer.reply).toContain('Аренда — 120 000 ₽');
  });

  it('«на что больше всего тратим» — называет статью-лидера', async () => {
    const h = createHarness({ expenses: fullLedger, declaredPeriods });
    silentModel(h);

    const answer = await h.ask('на что больше всего тратим');

    expect(answer.tools_used.map((tool) => tool.name)).toEqual([
      'expenses.read',
    ]);
    expect(answer.reply).toContain('Больше всего — «Аренда»');
  });

  it.each(['запиши аренду 60 тысяч', 'расход: аренда 60 тысяч'])(
    '«%s» — карточка с суммой, датой и статьёй',
    async (command) => {
      const h = createHarness();
      h.decide.mockImplementation((input: AiCoreModelInput) =>
        Promise.resolve({
          reply: 'Подготовила запись расхода.',
          toolCall:
            input.toolResults.length === 0
              ? {
                  name: 'expenses.create',
                  arguments: { category: 'rent', amount_rubles: 60_000 },
                }
              : null,
          provider: 'deepseek' as const,
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }),
      );

      const answer = await h.ask(command);

      expect(answer.action).toMatchObject({ status: 'approval_required' });
      const approval = (answer.action as { approval: Record<string, any> })
        .approval;
      expect(approval.summary).toBe(
        'Записать расход: Аренда — 60 000 ₽ за 07.08.2026.',
      );
      const preview = approval.payload_preview as Record<string, unknown>;
      // Первые три поля карточки — сумма, дата, статья.
      expect(
        Object.keys(preview)
          .filter((key) => key !== 'action')
          .slice(0, 3),
      ).toEqual(['sum', 'date', 'type']);
      expect(preview.sum).toBe('60 000 ₽');
      expect(preview.date).toBe('07.08.2026');
      expect(preview.type).toBe('Аренда');
      // Ничего не записано, пока человек не подтвердил.
      expect(h.store.expenses).toHaveLength(0);

      const executed = (await h.approve(
        approval.id as string,
        approval.payload_hash as string,
      )) as { result: { recorded: boolean; occurred_on: string } };
      expect(executed.result.recorded).toBe(true);
      expect(executed.result.occurred_on).toBe('2026-08-07');
      expect(h.store.expenses).toHaveLength(1);
    },
  );

  it('своё помещение не блокирует расчёт и оставляет другие расходы опциональными', async () => {
    const h = createHarness({
      expenses: [
        expenseOn(
          'marketing-july',
          'marketing',
          4_000_000,
          '2026-07-07T09:00:00.000Z',
        ),
      ],
    });
    silentModel(h);

    const answer = await h.askMessages([
      { role: 'user', content: 'какая была прибыль в июле' },
      {
        role: 'assistant',
        content:
          'Есть ли за этот период дополнительные расходы кроме зарплаты из CRM?',
      },
      {
        role: 'user',
        content: 'У меня своё помещение, я не плачу аренду',
      },
    ]);

    expect(answer.reply).toContain('аренды за этот период нет');
    expect(answer.reply).toContain('не подтверждает полноту');
    expect(answer.reply).not.toContain('Прибыль уже можно считать');
    expect(answer.reply).toContain('Если есть другие расходы');
    expect(answer.tools_used).toEqual([]);
  });

  it.each([
    'У меня нет доп расходов',
    'Дополнительных расходов у меня нет',
    'Кроме зарплаты расходов нет',
    'Больше расходов нет',
  ])(
    'явное «%s» фиксирует декларацию расходов без выдуманной прибыли',
    async (confirmation) => {
      const h = createHarness({
        expenses: [
          expenseOn(
            'marketing-july',
            'marketing',
            4_000_000,
            '2026-07-07T09:00:00.000Z',
          ),
        ],
      });
      silentModel(h);

      const answer = await h.askMessages([
        { role: 'user', content: 'какая была прибыль в июле' },
        {
          role: 'assistant',
          content:
            'Есть ли за этот период дополнительные расходы кроме зарплаты из CRM?',
        },
        { role: 'user', content: confirmation },
      ]);

      expect(answer.tools_used.map((tool) => tool.name)).toEqual([
        'expenses.period.complete',
      ]);
      expect(answer.reply).toContain('Чистая прибыль: не измерено');
      expect(answer.reply).not.toContain('660 000');
      expect(h.store.declarations).toHaveLength(1);
      expect(answer.widget).toBe('business_report');
    },
  );

  it('валовый доход показывается без аренды и не смешивается с чистой прибылью', async () => {
    const h = createHarness({ expenses: [] });
    silentModel(h);

    const answer = await h.ask('какая валовая прибыль в июле');

    expect(answer.reply).toContain('Валовая прибыль не измерена');
    expect(answer.reply).toContain('себестоимость услуг');
    expect(answer.reply).not.toMatch(/1 200 000|не внесена аренда/);
  });

  it('малая аренда допустима после подтверждения владельца', async () => {
    const h = createHarness({
      expenses: [
        expenseOn('rent-july', 'rent', 100, '2026-07-05T09:00:00.000Z'),
      ],
      declaredPeriods: [{ from: '2026-07-01', to: '2026-07-31' }],
    });
    silentModel(h);

    const answer = await h.ask('какая была прибыль в июле');

    expect(answer.reply).toContain('Чистая прибыль: не измерено');
    expect(answer.reply).not.toContain('699 999');
    expect(answer.reply).not.toContain('похоже, внесено не всё');
  });

  it('CRM не отдала расчёт зарплаты — MAYA не советует вносить её руками', async () => {
    const h = createHarness({
      expenses: fullLedger,
      payrollAvailable: false,
      declaredPeriods,
    });
    silentModel(h);

    const answer = await h.ask('какая была прибыль в июле');

    // 🔴 Замкнутый круг: вносить зарплату руками запрещено, поэтому её
    // отсутствие — отдельная причина, а не пункт списка «что внести».
    expect(answer.reply).toContain('Чистая прибыль: не измерено');
    expect(answer.reply).not.toContain('Внесите');
    expect(answer.reply).not.toMatch(/510 000|1 200 000/);
  });
});
