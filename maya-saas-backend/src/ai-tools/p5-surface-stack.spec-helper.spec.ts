import { measurementReaderDouble } from '../../test/helpers/measurement-reader';
/**
 * Стенд пользовательских поверхностей MAYA.
 *
 * 🔴 Cycle 04 P5. Проверять текст и карточки на выдуманных объектах нельзя:
 * весь смысл пакета в том, что числа приходят из канонического владельца.
 * Стенд поднимает настоящую цепочку — журнал провайдера → аналитика →
 * `BusinessStateService` → инструмент AI → карточка, — и подменяет только
 * границы: базу и провайдера.
 *
 * Файл назван `.spec.ts` намеренно: так он не попадает в сборку.
 */
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { AttendanceFactsService } from '../business-facts/attendance-facts.service';
import { BusinessStateService } from '../business-state/business-state.service';
import { CalendarSource, UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { CustomersService } from '../customers/customers.service';
import type { ExpensesService } from '../expenses/expenses.service';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { StaffService } from '../staff/staff.service';

export const PERIOD = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
};
export const TENANT_ID = 'tenant-p5';

export const visit = (
  id: string,
  staff: string,
  price: number | null,
  status = 'completed',
  startAt = '2026-08-10T09:00:00.000Z',
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
  startAt: new Date('2026-08-10T09:00:00.000Z'),
  endAt: new Date('2026-08-10T10:00:00.000Z'),
  status,
  totalPriceKopecks: price,
  currency: 'RUB',
});

export const FINANCE = (overrides: Record<string, unknown> = {}) => ({
  source: 'external_crm',
  provider: 'yclients',
  verified: true,
  period: { from: '2026-08-01', to: '2026-08-31' },
  revenue: {
    status: 'available',
    verified: true,
    total: { currency: 'RUB', amount_kopecks: 5_000_000 },
    transaction_count: 20,
    by_account: [
      {
        name: 'Наличные',
        is_cash: true,
        currency: 'RUB',
        amount_kopecks: 2_000_000,
      },
      {
        name: 'Безнал',
        is_cash: false,
        currency: 'RUB',
        amount_kopecks: 3_000_000,
      },
    ],
    by_staff: [
      { staff_id: 'crm-1', currency: 'RUB', amount_kopecks: 3_000_000 },
    ],
    by_service: [],
    staff_attribution_status: 'partial',
    staff_attribution_coverage_percent: 60,
  },
  payroll: {
    status: 'available',
    verified: true,
    accrued_total: { currency: 'RUB', amount_kopecks: 1_500_000 },
    paid_total: { currency: 'RUB', amount_kopecks: 0 },
    balance_total: { currency: 'RUB', amount_kopecks: 1_500_000 },
    staff: [
      {
        staff_id: 'crm-1',
        name: 'Илья',
        status: 'available',
        verified: true,
        accrued: { currency: 'RUB', amount_kopecks: 1_500_000 },
        paid: { currency: 'RUB', amount_kopecks: 0 },
        balance: { currency: 'RUB', amount_kopecks: 1_500_000 },
      },
    ],
  },
  warnings: [],
  ...overrides,
});

export type StackOptions = {
  source?: 'crm' | 'internal';
  visits?: unknown[];
  internalRows?: unknown[];
  completeness?: 'complete' | 'truncated';
  finance?: unknown;
  attendanceGroups?: Array<{
    attendance: string | null;
    _count: { _all: number };
  }>;
  reconciled?: boolean;
  links?: Array<{ externalId: string; staffId: string }>;
};

export function buildSurfaceStack(options: StackOptions = {}) {
  const external = (options.source ?? 'crm') === 'crm';
  const visits = options.visits ?? [];
  const crmService = {
    getJournal: jest.fn().mockResolvedValue({
      calendar_source: 'external',
      completeness: options.completeness ?? 'complete',
      timezone: 'Europe/Moscow',
      range: PERIOD,
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
        .mockResolvedValue([{ id: 'prov-1', displayName: 'Мастер' }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'prov-1', displayName: 'Мастер' }),
    },
    crmStaffAccess: {
      findFirst: jest.fn().mockResolvedValue({
        externalStaffId: 'crm-1',
        encryptedDisplayName: 'Илья',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    staff: { findMany: jest.fn().mockResolvedValue([]) },
    reconciliationRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reconciled
            ? { finishedAt: new Date('2026-09-01T00:00:00.000Z') }
            : null,
        ),
    },
    expensePeriodDeclaration: { findUnique: jest.fn().mockResolvedValue(null) },
    dashboardPreference: { findMany: jest.fn().mockResolvedValue([]) },
    branch: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
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
  const businessState = new BusinessStateService(analytics, prisma);
  const handler = new AiToolHandlerService(
    crmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    analytics,
    {} as ExpensesService,
    prisma,
    {} as CustomersService,
    {} as StaffService,
    businessState,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    measurementReaderDouble(),
  );

  return {
    prisma,
    crmService,
    tenantContext,
    analytics,
    businessState,
    handler,
  };
}

/** Ответ инструмента ровно тот, что уезжает в текст и карточку. */
export async function businessEvidence(
  options: StackOptions,
  role: UserRole = UserRole.TENANT_OWNER,
) {
  const stack = buildSurfaceStack(options);
  return stack.tenantContext.runAsSystemTenant(TENANT_ID, () =>
    stack.handler.execute(
      'analytics.business.query',
      {
        tenantId: TENANT_ID,
        userId: 'user-1',
        role,
        branchId: null,
      } as never,
      {
        period: 'custom',
        from: PERIOD.from,
        to: PERIOD.to,
        comparison: 'none',
      },
      'idem-1',
    ),
  );
}

export async function employeeEvidence(options: StackOptions) {
  const stack = buildSurfaceStack(options);
  return stack.tenantContext.runAsSystemTenant(TENANT_ID, () =>
    stack.handler.execute(
      'analytics.employee.query',
      {
        tenantId: TENANT_ID,
        userId: 'user-1',
        role: UserRole.STAFF,
        branchId: null,
      } as never,
      {
        period: 'custom',
        from: PERIOD.from,
        to: PERIOD.to,
        comparison: 'none',
      },
      'idem-2',
    ),
  );
}

describe('стенд пользовательских поверхностей', () => {
  it('поднимает настоящую цепочку до ответа инструмента', async () => {
    const evidence = (await businessEvidence({
      visits: [visit('a', 'crm-1', 2500)],
      finance: FINANCE(),
    })) as Record<string, unknown>;

    expect(
      (evidence.metrics as Record<string, unknown>).revenue_amount_kopecks,
    ).toBeNull();
    expect(evidence.measurement).toMatchObject({
      contract: 'c7.measurement.read/1',
    });
    expect(
      (evidence.metrics as Record<string, unknown>).booked_value_amount_kopecks,
    ).toBe(250_000);
  });
});
