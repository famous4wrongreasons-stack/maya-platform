/**
 * Общий стенд сводок: настоящая аналитика + настоящий канонический владелец.
 *
 * 🔴 Мокать здесь состояние бизнеса нельзя. Весь смысл P4 в том, что числа в
 * тексте отчёта приезжают из канонического владельца, а не собираются рядом.
 * Стенд поднимает НАСТОЯЩУЮ цепочку — журнал провайдера → аналитика →
 * `BusinessStateService` → факты → текст, — и подменяет только границы:
 * базу и провайдера.
 *
 * Файл назван `.spec.ts` намеренно: так он не попадает в сборку (там `jest`
 * нет). Собственная проверка внизу следит, что стенд не сломался молча.
 */
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AttendanceFactsService } from '../business-facts/attendance-facts.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { CalendarSource } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';

export const RANGE = {
  from: '2026-08-12T21:00:00.000Z',
  to: '2026-08-13T20:59:59.999Z',
};
export const LOCAL_DATE = '2026-08-13';
export const TENANT = {
  id: 'tenant-brief',
  slug: 'barber-brief',
  name: 'Барбершоп',
  defaultTimezone: 'Europe/Moscow',
};

export const visit = (
  id: string,
  staff: string,
  price: number | null,
  status = 'completed',
  startAt = '2026-08-13T09:00:00.000Z',
  attendance: string | null = 'arrived',
) => ({
  id,
  client: { id: `c-${id}`, name: 'Клиент' },
  provider: { id: staff, name: staff === 'crm-1' ? 'Илья' : 'Стас' },
  branch: null,
  service_ids: ['svc-1'],
  services: [
    {
      id: 'svc-1',
      name: 'Стрижка',
      price: price ?? 0,
      duration_minutes: 60,
      currency: 'RUB',
    },
  ],
  start_at: startAt,
  end_at: startAt,
  status,
  attendance,
  notes: null,
  total_price: price,
  currency: 'RUB',
});

export const internalRow = (
  id: string,
  staff: string,
  price: number | null,
  status = 'completed',
) => ({
  id,
  clientId: `c-${id}`,
  branchId: null,
  staffExternalId: staff,
  startAt: new Date('2026-08-13T09:00:00.000Z'),
  endAt: new Date('2026-08-13T10:00:00.000Z'),
  status,
  totalPriceKopecks: price,
  currency: 'RUB',
});

export const FINANCE_FULL = {
  source: 'external_crm',
  provider: 'yclients',
  verified: true,
  period: { from: '2026-08-13', to: '2026-08-13' },
  revenue: {
    status: 'available',
    verified: true,
    total: { currency: 'RUB', amount_kopecks: 1_250_000 },
    transaction_count: 5,
    by_account: [
      {
        name: 'Наличные',
        is_cash: true,
        currency: 'RUB',
        amount_kopecks: 500_000,
      },
      {
        name: 'Безнал',
        is_cash: false,
        currency: 'RUB',
        amount_kopecks: 700_000,
      },
      /**
       * 🔴 Счёт, про который провайдер НЕ сказал, наличные это или нет.
       * Контракт такое допускает, и старый отчёт терял эти деньги молча:
       * «наличные + карта» получались меньше выручки, а разницу никто не
       * называл.
       */
      {
        name: 'Сертификат',
        is_cash: null,
        currency: 'RUB',
        amount_kopecks: 50_000,
      },
    ],
    by_staff: [
      { staff_id: 'crm-1', currency: 'RUB', amount_kopecks: 800_000 },
      { staff_id: 'crm-2', currency: 'RUB', amount_kopecks: 450_000 },
    ],
    by_service: [],
    staff_attribution_status: 'available',
    staff_attribution_coverage_percent: 100,
  },
  payroll: {
    status: 'available',
    verified: true,
    accrued_total: { currency: 'RUB', amount_kopecks: 400_000 },
    paid_total: { currency: 'RUB', amount_kopecks: 0 },
    balance_total: { currency: 'RUB', amount_kopecks: 400_000 },
    staff: [
      {
        staff_id: 'crm-1',
        name: 'Илья',
        status: 'available',
        verified: true,
        accrued: { currency: 'RUB', amount_kopecks: 250_000 },
        paid: { currency: 'RUB', amount_kopecks: 0 },
        balance: { currency: 'RUB', amount_kopecks: 250_000 },
      },
      {
        staff_id: 'crm-2',
        name: 'Стас',
        status: 'available',
        verified: true,
        accrued: { currency: 'RUB', amount_kopecks: 150_000 },
        paid: { currency: 'RUB', amount_kopecks: 0 },
        balance: { currency: 'RUB', amount_kopecks: 150_000 },
      },
    ],
  },
  warnings: [],
};

export type StackOptions = {
  source?: 'crm' | 'internal';
  visits?: unknown[];
  internalRows?: unknown[];
  completeness?: 'complete' | 'truncated';
  finance?: unknown;
  links?: Array<{ externalId: string; staffId: string }>;
  attendanceGroups?: Array<{
    attendance: string | null;
    _count: { _all: number };
  }>;
  reconciled?: boolean;
  /** Получатели личных сводок: userId → внешний id календаря. */
  masters?: Array<{ userId: string; externalStaffId: string }>;
  internalMasters?: Array<{ userId: string; id: string }>;
};

export function buildStack(options: StackOptions = {}) {
  const external = (options.source ?? 'crm') === 'crm';
  const visits = options.visits ?? [];
  const crmService = {
    getJournal: jest.fn().mockResolvedValue({
      calendar_source: 'external',
      completeness: options.completeness ?? 'complete',
      timezone: 'Europe/Moscow',
      range: RANGE,
      provider_id: null,
      count: visits.length,
      appointments: external ? visits : [],
    }),
    getFinancialSummary: jest.fn(() =>
      options.finance === 'throw'
        ? Promise.reject(new Error('finance is down'))
        : Promise.resolve(options.finance ?? null),
    ),
    getRevenueSummary: jest.fn().mockResolvedValue(null),
  } as unknown as CrmService;

  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        defaultTimezone: 'Europe/Moscow',
        calendarSource: external
          ? CalendarSource.EXTERNAL
          : CalendarSource.INTERNAL,
      }),
      findMany: jest.fn().mockResolvedValue([TENANT]),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue(options.internalRows ?? []),
      groupBy: jest.fn().mockResolvedValue(options.attendanceGroups ?? []),
    },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    staffProviderLink: {
      findMany: jest.fn().mockResolvedValue(options.links ?? []),
    },
    internalProvider: {
      findMany: jest
        .fn()
        .mockImplementation((args: { select?: Record<string, boolean> }) =>
          Promise.resolve(
            args?.select?.userId
              ? (options.internalMasters ?? [])
              : [{ id: 'prov-1', displayName: 'Мастер Внутренний' }],
          ),
        ),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'prov-1', displayName: 'Мастер Внутренний' }),
    },
    crmStaffAccess: {
      findFirst: jest.fn().mockResolvedValue({
        externalStaffId: 'crm-1',
        encryptedDisplayName: 'Илья',
      }),
      findMany: jest.fn().mockResolvedValue(options.masters ?? []),
    },
    membership: {
      findUnique: jest
        .fn()
        .mockImplementation(
          (args: { where: { userId_tenantId: { userId: string } } }) =>
            Promise.resolve({
              id:
                args.where.userId_tenantId.userId === 'owner-user'
                  ? 'owner-member'
                  : 'master-member-' +
                    (options.masters ?? []).findIndex(
                      (m) => m.userId === args.where.userId_tenantId.userId,
                    ),
              role:
                args.where.userId_tenantId.userId === 'owner-user'
                  ? 'tenant_owner'
                  : 'staff',
              status: 'active',
              user: { status: 'active' },
            }),
        ),
      findMany: jest
        .fn()
        .mockImplementation((args: { where?: { role?: { in?: string[] } } }) =>
          Promise.resolve(
            [
              {
                id: 'owner-member',
                userId: 'owner-user',
                role: 'tenant_owner',
              },
              ...(options.masters ?? []).map((m, index) => ({
                id: 'master-member-' + index,
                userId: m.userId,
                role: 'staff',
              })),
            ].filter(
              (m) =>
                !args?.where?.role?.in || args.where.role.in.includes(m.role),
            ),
          ),
        ),
    },
    dashboardPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    authIdentity: { findMany: jest.fn().mockResolvedValue([]) },
    devicePushToken: { findMany: jest.fn().mockResolvedValue([]) },
    reconciliationRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reconciled
            ? { finishedAt: new Date('2026-08-14T00:00:00.000Z') }
            : null,
        ),
    },
    expensePeriodDeclaration: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  const tenantContext = new TenantContextService();
  const analytics = new OperationsAnalyticsService(
    prisma,
    tenantContext,
    { assertBranchBelongsToTenant: jest.fn() } as unknown as TenantsService,
    crmService,
    {
      encrypt: (value: string) => value,
      decrypt: (value: string) => value,
    } as unknown as EncryptionService,
    new AppointmentPeriodReader(crmService),
    new AttendanceFactsService(prisma, tenantContext),
  );

  return {
    prisma,
    crmService,
    tenantContext,
    analytics,
    businessState: new BusinessStateService(analytics, prisma),
  };
}

describe('стенд сводок', () => {
  it('поднимает настоящую цепочку: журнал → аналитика → канонический владелец', async () => {
    const stack = buildStack({ visits: [visit('a', 'crm-1', 2500)] });

    const state = await stack.tenantContext.runAsSystemTenant(TENANT.id, () =>
      stack.businessState.business({
        tenantId: TENANT.id,
        period: RANGE,
        comparisonMode: 'none',
        comparisonPeriod: null,
        financeAllowed: false,
        bookedValueAllowed: true,
        operationalDetail: false,
        retryOnFailure: false,
        disclose: (rows) => ({
          names: new Map(rows.map((row) => [row.externalId, row.name ?? ''])),
          allowedExternalIds: null,
        }),
      }),
    );

    expect(state.metrics.appointments_total).toBe(1);
    expect(state.metrics.booked_value_amount_kopecks).toBe(250_000);
  });
});
