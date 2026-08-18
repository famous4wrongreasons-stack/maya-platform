import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/domain.enums';
import LEGACY_GOLDEN from './__fixtures__/legacy-business-state.json';
import LEGACY_EMPLOYEE_MARKER from './__fixtures__/legacy-employee-state.json';
import {
  BusinessStateService,
  type StaffDisclosure,
  type StaffIdentityRow,
} from './business-state.service';

/**
 * 🔴 Cycle 04 P1 — доказательство эквивалентности с БОЕВОЙ реализацией.
 *
 * Эталон в `__fixtures__/legacy-business-state.json` снят с коммита, который в
 * этот момент работал в проде (`9ce6ef6f`), прогоном ТОЙ САМОЙ реализации на
 * тех же входах. Это не «ожидания, записанные с текущего поведения»: файл
 * получен из другого дерева, до переноса, и переписать его вместе с правкой
 * нельзя случайно.
 *
 * Сравниваются БИЗНЕС-поля, а не презентация. `resolved_period`, человеческие
 * подписи периода и форма полезной нагрузки инструмента — работа слоя, который
 * разговаривает; их совпадения никто не обещал и обещать не должен.
 *
 * Файл остаётся храповиком навсегда: любое расхождение канонического владельца
 * с тем, что отвечал бой, становится упавшим тестом, а не сюрпризом владельца.
 */

const PERIOD = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
};
const PREVIOUS = {
  from: '2026-07-01T00:00:00.000Z',
  to: '2026-07-31T23:59:59.999Z',
};

type Overview = Record<string, unknown>;

const overview = (over: {
  source?: 'crm' | 'maya';
  total?: number;
  cancelled?: number;
  completed?: number;
  revenueKopecks?: number | null;
  bookedKopecks?: number;
  completeness?: 'complete' | 'incomplete';
  notObserved?: number;
  cohorts?: 'available' | 'unavailable';
  staff?: Array<{ id: string; name: string | null; appointments: number }>;
}): Overview => {
  const source = over.source ?? 'crm';
  const total = over.total ?? 10;
  const cancelled = over.cancelled ?? 2;
  const completed = over.completed ?? 6;
  const cohortsAvailable = (over.cohorts ?? 'available') === 'available';
  return {
    data_source: source,
    period: { from: PERIOD.from, to: PERIOD.to, timezone: 'Europe/Moscow' },
    appointments: {
      total,
      active: total - cancelled,
      scheduled: Math.max(0, total - cancelled - completed),
      completed,
      cancelled,
      no_show: 0,
      cancellation_rate_percent: total === 0 ? 0 : (cancelled / total) * 100,
      unique_clients: 5,
      repeat_clients_in_period: 1,
      repeat_client_rate_percent: 20,
      identified_client_visits: 9,
      clients_returning: cohortsAvailable ? 2 : null,
      clients_new: cohortsAvailable ? 3 : null,
      returning_share_percent: cohortsAvailable ? 40 : null,
      cohort_lookback_days: 90,
      cohort_status: cohortsAvailable ? 'available' : 'unavailable',
      cohort_unavailable_reason: cohortsAvailable
        ? null
        : 'period_window_read_was_truncated',
      booked_minutes: 600,
    },
    revenue: [
      { currency: 'RUB', amount_kopecks: over.bookedKopecks ?? 250_000 },
    ],
    expenses: [],
    net: [],
    revenue_basis: 'booked_prices',
    net_status: 'unavailable',
    net_unavailable_reason: 'not_in_operational_overview',
    average_ticket: [{ currency: 'RUB', amount_kopecks: 25_000 }],
    daily: [],
    staff: (over.staff ?? [{ id: 'st-1', name: 'Илья', appointments: 4 }]).map(
      (row) => ({
        staff_external_id: row.id,
        staff_id: null,
        name: row.name,
        total: row.appointments,
        appointments: row.appointments,
        scheduled: 1,
        completed: row.appointments - 1,
        cancelled: 0,
        no_show: 0,
        cancellation_rate_percent: 0,
        unique_clients: 2,
        repeat_clients_in_period: 0,
        revenue: [{ currency: 'RUB', amount_kopecks: 100_000 }],
        booked_minutes: 240,
        services: [{ name: 'Стрижка', appointments: row.appointments }],
      }),
    ),
    services: [
      {
        service_external_id: 'svc-1',
        name: 'Стрижка',
        appointments: 7,
        booked_value: [{ currency: 'RUB', amount_kopecks: 175_000 }],
      },
    ],
    completeness: {
      appointments: {
        source: 'provider_journal',
        status: over.completeness ?? 'complete',
        reason:
          (over.completeness ?? 'complete') === 'incomplete'
            ? 'source_read_truncated'
            : null,
        observed_through: '2026-09-01T00:00:00.000Z',
        out_of_period_discarded: 0,
      },
      attendance: {
        source: 'canonical_mirror',
        status: (over.notObserved ?? 0) > 0 ? 'incomplete' : 'complete',
        reason:
          (over.notObserved ?? 0) > 0
            ? 'attendance_was_not_observed_for_every_record_of_the_period'
            : null,
        observed_through: '2026-09-01T00:00:00.000Z',
      },
    },
    attendance: {
      state: (over.notObserved ?? 0) > 0 ? 'measured_incomplete' : 'measured',
      arrived: completed,
      no_show: 0,
      awaiting: 0,
      not_observed: over.notObserved ?? 0,
      records: total,
      facts: [],
    },
    data_quality: {
      priced_appointments: total,
      active_appointments: total - cancelled,
      unidentified_client_appointments: 0,
      revenue_coverage: 1,
      note: null,
    },
  };
};

const finance = (revenueKopecks: number | null) =>
  revenueKopecks === null
    ? null
    : {
        source: 'external_crm',
        provider: 'yclients',
        verified: true,
        period: { from: PERIOD.from, to: PERIOD.to, timezone: 'Europe/Moscow' },
        revenue: {
          status: 'available',
          verified: true,
          basis: 'provider_transactions',
          total: { currency: 'RUB', amount_kopecks: revenueKopecks },
          transaction_count: 12,
          discarded: { negative_count: 0, zero_count: 0, untyped_count: 0 },
          by_staff: [
            {
              staff_external_id: 'st-1',
              amount: { currency: 'RUB', amount_kopecks: 90_000 },
              transaction_count: 5,
            },
          ],
          by_service: [],
          staff_attribution_status: 'available',
          staff_attribution_coverage_percent: 100,
          service_attribution_status: 'unavailable',
        },
        payroll: {
          status: 'available',
          verified: true,
          accrued_total: { currency: 'RUB', amount_kopecks: 60_000 },
          paid_total: null,
          balance_total: null,
          staff: [
            {
              staff_id: 'st-1',
              status: 'available',
              verified: true,
              accrued: { currency: 'RUB', amount_kopecks: 60_000 },
              paid: null,
            },
          ],
        },
        warnings: [],
      };

interface Scenario {
  name: string;
  role: UserRole;
  current: Overview;
  previous?: Overview | null;
  finance: number | null | 'throws';
  calendarSource: 'external' | 'internal';
}

const SCENARIOS: Scenario[] = [
  {
    name: 'полные данные CRM, текущий период',
    role: UserRole.TENANT_OWNER,
    current: overview({}),
    finance: 500_000,
    calendarSource: 'external',
  },
  {
    name: 'полные данные CRM со сравнением прошлого периода',
    role: UserRole.TENANT_OWNER,
    current: overview({}),
    previous: overview({ total: 8, cancelled: 1, completed: 5 }),
    finance: 500_000,
    calendarSource: 'external',
  },
  {
    name: 'неполное чтение журнала',
    role: UserRole.TENANT_OWNER,
    current: overview({ completeness: 'incomplete', cohorts: 'unavailable' }),
    finance: 500_000,
    calendarSource: 'external',
  },
  {
    name: 'прошлый период прочитан неполно, текущий полностью',
    role: UserRole.TENANT_OWNER,
    current: overview({}),
    previous: overview({ completeness: 'incomplete', cohorts: 'unavailable' }),
    finance: 500_000,
    calendarSource: 'external',
  },
  {
    name: 'деньги недоступны: источник не ответил',
    role: UserRole.TENANT_OWNER,
    current: overview({}),
    finance: 'throws',
    calendarSource: 'external',
  },
  {
    name: 'измеренный ноль: записей за период не было',
    role: UserRole.TENANT_OWNER,
    current: overview({ total: 0, cancelled: 0, completed: 0 }),
    finance: 0,
    calendarSource: 'external',
  },
  {
    name: 'присутствие не наблюдалось — метрика не публикуется',
    role: UserRole.TENANT_OWNER,
    current: overview({ notObserved: 4 }),
    finance: 500_000,
    calendarSource: 'external',
  },
  {
    name: 'внутренний календарь',
    role: UserRole.TENANT_OWNER,
    current: overview({ source: 'maya' }),
    finance: null,
    calendarSource: 'internal',
  },
  {
    // 🔴 Роль выбрана та, у которой права на имена ДЕЙСТВИТЕЛЬНО нет.
    // Первая версия сценария называлась так же, но брала MANAGER — а он в
    // списке допущенных к именам. Тест носил правильное имя и проверял не то;
    // нашла это состязательная проверка, а не я.
    name: 'роль без права на имена мастеров',
    role: UserRole.PROVIDER,
    current: overview({}),
    finance: 500_000,
    calendarSource: 'external',
  },
  {
    name: 'роль без права на деньги',
    role: UserRole.MANAGER,
    current: overview({}),
    finance: 500_000,
    calendarSource: 'external',
  },
];

/** Роли, которым видны имена мастеров. Копия правила вызывающего слоя. */
const NAMED_STAFF_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.ACCOUNTANT,
]);
const FINANCE_ROLES = new Set<UserRole>([
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
]);

/** Та же нумерация тёзок, что и в слое, который отвечает владельцу. */
const discloseFor =
  (role: UserRole) =>
  (rows: StaffIdentityRow[]): StaffDisclosure => {
    if (!NAMED_STAFF_ROLES.has(role)) {
      return { names: new Map(), allowedExternalIds: new Set<string>() };
    }
    const names = new Map<string, string | null>();
    for (const row of rows) {
      if (!names.get(row.externalId)) names.set(row.externalId, row.name);
    }
    const ordered = [...names.keys()].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    const seen = new Map<string, number>();
    const resolved = new Map<string, string>();
    let unnamed = 0;
    for (const externalId of ordered) {
      const raw = names.get(externalId);
      if (typeof raw === 'string' && raw.trim() !== '') {
        const base = raw.trim();
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        resolved.set(externalId, count === 1 ? base : `${base} (${count})`);
      } else {
        unnamed += 1;
        resolved.set(externalId, `Мастер ${unnamed}`);
      }
    }
    return { names: resolved, allowedExternalIds: null };
  };

const buildFixture = (scenario: Scenario) => {
  const getBusinessOperationalOverview = jest
    .fn()
    .mockImplementation((_tenantId: string, query: { from: string }) =>
      Promise.resolve(
        query.from === PREVIOUS.from
          ? (scenario.previous ?? scenario.current)
          : scenario.current,
      ),
    );
  const getBusinessFinance = jest
    .fn()
    .mockImplementation(() =>
      scenario.finance === 'throws'
        ? Promise.reject(new Error('crm finance unavailable'))
        : Promise.resolve(finance(scenario.finance)),
    );
  const analytics = {
    getBusinessOperationalOverview,
    getBusinessFinance,
    getStaffFinance: jest.fn().mockResolvedValue(null),
  } as unknown as OperationsAnalyticsService;
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        calendarSource: scenario.calendarSource,
        defaultTimezone: 'Europe/Moscow',
      }),
    },
    branch: { findFirst: jest.fn() },
  } as unknown as PrismaService;
  return { analytics, prisma };
};

/** Что отвечала боевая реализация до переноса. Снято с коммита `9ce6ef6f`. */
const legacyResult = (scenario: Scenario): Record<string, unknown> => {
  const golden = (LEGACY_GOLDEN as Record<string, Record<string, unknown>>)[
    scenario.name
  ];
  if (!golden) {
    throw new Error(`нет эталона для сценария: ${scenario.name}`);
  }
  return golden;
};

const canonicalResult = async (scenario: Scenario, withPrevious: boolean) => {
  const { analytics, prisma } = buildFixture(scenario);
  const service = new BusinessStateService(analytics, prisma);
  return service.business({
    tenantId: `tenant-${scenario.name}`,
    period: { from: PERIOD.from, to: PERIOD.to },
    comparisonMode: withPrevious ? 'previous_period' : 'none',
    comparisonPeriod: withPrevious
      ? { from: PREVIOUS.from, to: PREVIOUS.to }
      : null,
    financeAllowed: FINANCE_ROLES.has(scenario.role),
    disclose: discloseFor(scenario.role),
  });
};

describe('🔴 P1 §9 — legacy против канонического владельца', () => {
  for (const scenario of SCENARIOS) {
    const withPrevious = Boolean(scenario.previous);

    it(`${scenario.name}: бизнес-поля совпадают`, async () => {
      const legacy = legacyResult(scenario);
      const canonical = await canonicalResult(scenario, withPrevious);

      expect(canonical.verified).toEqual(legacy.verified);
      expect(canonical.financeVerified).toEqual(legacy.finance_verified);
      expect(canonical.source).toEqual(legacy.source);
      expect(canonical.metrics).toEqual(legacy.metrics);
      expect(canonical.changes).toEqual(legacy.changes);
      expect(canonical.serviceChanges).toEqual(legacy.service_changes);
      expect(canonical.staffChanges).toEqual(legacy.staff_changes);
      expect(canonical.availableMetrics).toEqual(legacy.available_metrics);
      expect(canonical.limitations).toEqual(legacy.limitations);
      expect(canonical.unavailableMetrics).toEqual(legacy.unavailable_metrics);
      expect(canonical.comparison.completeness).toEqual(
        legacy.comparison_completeness,
      );
    });

    it(`${scenario.name}: опубликованный срез совпадает`, async () => {
      const legacy = legacyResult(scenario);
      const canonical = await canonicalResult(scenario, withPrevious);

      // Именно здесь живут имена мастеров, деньги по мастерам и гашение по
      // роли: если раскрытие разъедется, разъедется и приватность.
      expect(canonical.current).toEqual(legacy.current);
      expect(canonical.previous).toEqual(legacy.previous);
    });
  }

  it('🔴 роль без права на деньги не получает их ни в одной реализации', async () => {
    const scenario = SCENARIOS[SCENARIOS.length - 1];
    const legacy = legacyResult(scenario);
    const canonical = await canonicalResult(scenario, false);

    expect(legacy.finance_verified).toBe(false);
    expect(canonical.financeVerified).toBe(false);
    expect(canonical.metrics).toEqual(legacy.metrics);
  });

  it('🔴 роль без права на имена не получает их ни в одной реализации', async () => {
    const scenario = SCENARIOS.find(
      (item) => item.name === 'роль без права на имена мастеров',
    );
    if (!scenario) throw new Error('сценарий не найден');
    const withNames = { ...scenario, role: UserRole.TENANT_OWNER };

    const [restricted, allowed] = await Promise.all([
      canonicalResult({ ...scenario, role: UserRole.PROVIDER }, false),
      canonicalResult(withNames, false),
    ]);

    const rows = (state: { current: Record<string, unknown> }) =>
      (state.current.staff_summary as unknown[]) ?? [];
    expect(rows(restricted)).toHaveLength(0);
    expect(rows(allowed).length).toBeGreaterThan(0);
  });
});

/**
 * 🔴 Эквивалентность ЛИЧНОГО среза.
 *
 * Этот файл появился потому, что первая версия переноса потеряла личную
 * метрику `average_booked_value_amount_kopecks`: у мастера свой срез метрик, и
 * я убрал его как «осиротевший». Поймал это не мой сравнительный тест, а
 * существующая спека — то есть моя проверка эквивалентности покрывала бизнес и
 * не покрывала человека. Здесь этот пробел закрыт эталоном, снятым с того же
 * боевого коммита.
 */

const EMP_PERIOD = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
};

const employeeOverview = (over: {
  source?: 'crm' | 'maya';
  total?: number;
  notObserved?: number;
  completeness?: 'complete' | 'incomplete';
}) => {
  const total = over.total ?? 8;
  return {
    data_source: over.source ?? 'crm',
    period: {
      from: EMP_PERIOD.from,
      to: EMP_PERIOD.to,
      timezone: 'Europe/Moscow',
    },
    employee: { provider_id: 'st-1', name: 'Илья' },
    appointments: {
      total,
      active: total,
      scheduled: 2,
      completed: total - 2,
      cancelled: 0,
      no_show: 0,
      cancellation_rate_percent: 0,
      unique_clients: 6,
      repeat_clients_in_period: 2,
      repeat_client_rate_percent: 33.3,
      identified_client_visits: 8,
      clients_returning: 2,
      clients_new: 4,
      returning_share_percent: 33.3,
      cohort_lookback_days: 90,
      cohort_status: 'available',
      cohort_unavailable_reason: null,
      booked_minutes: 480,
    },
    revenue: [{ currency: 'RUB', amount_kopecks: 3_000_000 }],
    expenses: [],
    net: [],
    revenue_basis: 'booked_prices',
    net_status: 'unavailable',
    net_unavailable_reason: 'not_in_operational_overview',
    average_ticket: [{ currency: 'RUB', amount_kopecks: 150_000 }],
    daily: [],
    staff: [
      {
        staff_external_id: 'st-1',
        staff_id: null,
        name: 'Илья',
        total,
        appointments: total,
        scheduled: 2,
        completed: total - 2,
        cancelled: 0,
        no_show: 0,
        cancellation_rate_percent: 0,
        unique_clients: 6,
        repeat_clients_in_period: 2,
        revenue: [{ currency: 'RUB', amount_kopecks: 3_000_000 }],
        booked_minutes: 480,
        services: [{ name: 'Стрижка', appointments: total }],
      },
    ],
    services: [
      {
        service_external_id: 'svc-1',
        name: 'Стрижка',
        appointments: total,
        booked_value: [{ currency: 'RUB', amount_kopecks: 3_000_000 }],
      },
    ],
    completeness: {
      appointments: {
        source: 'provider_journal',
        status: over.completeness ?? 'complete',
        reason:
          (over.completeness ?? 'complete') === 'incomplete'
            ? 'source_read_truncated'
            : null,
        observed_through: '2026-09-01T00:00:00.000Z',
        out_of_period_discarded: 0,
      },
      attendance: {
        source: 'canonical_mirror',
        status: (over.notObserved ?? 0) > 0 ? 'incomplete' : 'complete',
        reason:
          (over.notObserved ?? 0) > 0
            ? 'attendance_was_not_observed_for_every_record_of_the_period'
            : null,
        observed_through: '2026-09-01T00:00:00.000Z',
      },
    },
    attendance: {
      state: (over.notObserved ?? 0) > 0 ? 'measured_incomplete' : 'measured',
      arrived: total - 2,
      no_show: 0,
      awaiting: 0,
      not_observed: over.notObserved ?? 0,
      records: total,
      facts: [],
    },
    data_quality: {},
  };
};

const STAFF_FINANCE = {
  payroll: {
    status: 'available',
    staff: [
      {
        staff_id: 'st-1',
        status: 'available',
        verified: true,
        accrued: { currency: 'RUB', amount_kopecks: 900_000 },
        paid: null,
      },
    ],
  },
  warnings: [],
};

const EMPLOYEE_SCENARIOS: Array<{
  name: string;
  over: {
    source?: 'crm' | 'maya';
    total?: number;
    notObserved?: number;
    completeness?: 'complete' | 'incomplete';
  };
  finance: unknown;
}> = [
  { name: 'мастер: полные данные', over: {}, finance: STAFF_FINANCE },
  {
    name: 'мастер: неполное чтение',
    over: { completeness: 'incomplete' },
    finance: STAFF_FINANCE,
  },
  {
    name: 'мастер: присутствие не наблюдалось',
    over: { notObserved: 3 },
    finance: STAFF_FINANCE,
  },
  { name: 'мастер: расчёт зарплаты недоступен', over: {}, finance: null },
  {
    name: 'мастер: внутренний календарь',
    over: { source: 'maya' },
    finance: null,
  },
];

describe('🔴 P1 §9 — личный срез против боевой реализации', () => {
  for (const scenario of EMPLOYEE_SCENARIOS) {
    it(`${scenario.name}: бизнес-поля совпадают`, async () => {
      const analytics = {
        getEmployeeOperationalOverview: jest
          .fn()
          .mockResolvedValue(employeeOverview(scenario.over)),
        getStaffFinance: jest.fn().mockResolvedValue(scenario.finance),
      } as unknown as OperationsAnalyticsService;
      const prisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            calendarSource:
              scenario.over.source === 'maya' ? 'internal' : 'external',
            defaultTimezone: 'Europe/Moscow',
          }),
        },
      } as unknown as PrismaService;
      const service = new BusinessStateService(analytics, prisma);

      const canonical = await service.employee({
        tenantId: `tenant-${scenario.name}`,
        userId: 'master-1',
        period: { from: EMP_PERIOD.from, to: EMP_PERIOD.to },
        comparisonMode: 'none',
        comparisonPeriod: null,
        nameRows: (rows) =>
          new Map(rows.map((row) => [row.externalId, row.name ?? 'Мастер'])),
      });

      const legacy = (
        LEGACY_EMPLOYEE_MARKER as Record<string, Record<string, unknown>>
      )[scenario.name];
      expect(legacy).toBeDefined();
      expect(canonical.verified).toEqual(legacy.verified);
      expect(canonical.source).toEqual(legacy.source);
      expect(canonical.metrics).toEqual(legacy.metrics);
      expect(canonical.availableMetrics).toEqual(legacy.available_metrics);
      expect(canonical.limitations).toEqual(legacy.limitations);
      expect(canonical.unavailableMetrics).toEqual(legacy.unavailable_metrics);
      expect(canonical.current).toEqual(legacy.current);
      // 🔴 В конверте личного среза `finance_verified` не было и не появится:
      // касса конкретного мастера провайдером не подтверждается.
      expect(legacy.finance_verified).toBeUndefined();
    });
  }
});

describe('🔴 P1 — то, что нашли скептики: боевое поведение сохранено', () => {
  it('🔴 личный срез читается БЕЗ повторной попытки, как и в бою', async () => {
    let calls = 0;
    const analytics = {
      getEmployeeOperationalOverview: jest.fn().mockImplementation(() => {
        calls += 1;
        return Promise.reject(new Error('источник молчит'));
      }),
      getStaffFinance: jest.fn().mockResolvedValue(null),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new BusinessStateService(analytics, prisma);

    await expect(
      service.employee({
        tenantId: 'tenant-retry',
        userId: 'master-1',
        period: { from: PERIOD.from, to: PERIOD.to },
        comparisonMode: 'none',
        comparisonPeriod: null,
        nameRows: () => new Map(),
      }),
    ).rejects.toThrow('источник молчит');
    // Бизнес-срез повторяет один раз, личный — нет. Перенос не имеет права
    // менять число обращений к провайдеру.
    expect(calls).toBe(1);
  });

  it('🔴 бизнес-срез повторяет чтение один раз, как и в бою', async () => {
    let calls = 0;
    const analytics = {
      getBusinessOperationalOverview: jest.fn().mockImplementation(() => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error('первая попытка'))
          : Promise.resolve(overview({}));
      }),
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('нет денег')),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
    } as unknown as PrismaService;
    const service = new BusinessStateService(analytics, prisma);

    const state = await service.business({
      tenantId: 'tenant-retry-business',
      period: { from: PERIOD.from, to: PERIOD.to },
      comparisonMode: 'none',
      comparisonPeriod: null,
      financeAllowed: true,
      disclose: () => ({ names: new Map(), allowedExternalIds: null }),
    });

    expect(calls).toBe(2);
    expect(state.verified).toBe(true);
  });

  it('🔴 составляющие «недоступного» отдаются по отдельности', async () => {
    const canonical = await canonicalResult(SCENARIOS[0], false);

    // Конверты потребителей разные: KPI команды складывает свой порядок и без
    // утверждений уровня салона. Один готовый список сделал бы это невозможным.
    expect(canonical.unavailableParts.neverAvailable.map((e) => e.key)).toEqual(
      ['accounting_net_profit', 'gross_margin', 'marketing_roi'],
    );
    expect(canonical.unavailableMetrics).toEqual([
      ...canonical.unavailableParts.cohorts,
      ...canonical.unavailableParts.attendance,
      ...canonical.unavailableParts.staffMoney,
      ...canonical.unavailableParts.neverAvailable,
    ]);
  });

  it('🔴 в личном срезе утверждений уровня салона нет', async () => {
    const analytics = {
      getEmployeeOperationalOverview: jest.fn().mockResolvedValue({
        ...overview({}),
        employee: { provider_id: 'st-1' },
      }),
      getStaffFinance: jest.fn().mockResolvedValue(null),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new BusinessStateService(analytics, prisma);

    const state = await service.employee({
      tenantId: 'tenant-personal',
      userId: 'master-1',
      period: { from: PERIOD.from, to: PERIOD.to },
      comparisonMode: 'none',
      comparisonPeriod: null,
      nameRows: (rows) =>
        new Map(rows.map((r) => [r.externalId, r.name ?? 'М'])),
    });

    expect(state.unavailableParts.neverAvailable).toEqual([]);
    expect(state.unavailableMetrics.map((e) => e.key)).not.toContain(
      'marketing_roi',
    );
  });
});
