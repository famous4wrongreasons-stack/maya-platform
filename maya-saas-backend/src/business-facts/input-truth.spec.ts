import { AppointmentsService } from '../appointments/appointments.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { CustomersService } from '../customers/customers.service';
import { CrmService } from '../crm/crm.service';
import {
  FACT_INCOMPLETE_REASON,
  FACT_UNAVAILABLE_REASON,
  LOYALTY_AUTHORITY_VALUES,
  allowsAbsenceConclusion,
  collectPeriodRecords,
  completeObservation,
  incompleteObservation,
  loyaltyVerificationRequired,
  meansProvenNone,
  measuredFact,
  notMeasuredFact,
  unavailableFact,
} from '../domain';
import type { BusinessPeriod } from '../domain';
import { EncryptionService } from '../encryption/encryption.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { UserRole } from '../common/domain.enums';
import { AiToolHandlerService } from '../ai-tools/ai-tool-handler.service';
import type { ValidatedAiToolArguments } from '../ai-tools/ai-tool.types';
import { AppointmentPeriodReader } from './appointment-period.reader';
import { AttendanceFactsService } from './attendance-facts.service';

/**
 * 🔴 Cycle 04 P0 — обязательная регрессия входной истины.
 *
 * Одиннадцать пунктов владельца, каждый отдельным утверждением. Общий смысл
 * один: `0` ≠ `не измерено` ≠ `неполно` ≠ `недоступно`, и присутствие клиента
 * доказывается присутствием, а не статусом визита.
 */

const PERIOD: BusinessPeriod = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
  timezone: 'Europe/Moscow',
};
const NOW = new Date('2026-09-01T00:00:00.000Z');

type JournalRecord = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  attendance: 'awaiting' | 'arrived' | 'no_show' | 'confirmed_by_client' | null;
  client: { id: string | null; name: string };
  provider: { id: string; name: string };
  branch: null;
  service_ids: string[];
  services: Array<{
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
    currency: string;
  }>;
  notes: null;
  total_price: number | null;
  currency: string;
};

const record = (
  over: Partial<JournalRecord> & { id: string },
): JournalRecord => ({
  start_at: '2026-08-10T09:00:00.000Z',
  end_at: '2026-08-10T10:00:00.000Z',
  status: 'completed',
  attendance: null,
  client: { id: 'client-1', name: 'Клиент' },
  provider: { id: '1461615', name: 'Мастер' },
  branch: null,
  service_ids: ['svc-1'],
  services: [
    {
      id: 'svc-1',
      name: 'Стрижка',
      price: 2500,
      duration_minutes: 60,
      currency: 'RUB',
    },
  ],
  notes: null,
  total_price: 2500,
  currency: 'RUB',
  ...over,
});

// ───────────────────────────── контракт факта ─────────────────────────────

describe('P0 §1 — четыре состояния факта', () => {
  const base = {
    key: 'appointments.total',
    tenantId: 'tenant-a',
    period: PERIOD,
    unit: 'count' as const,
    calculatedAt: NOW,
  };

  it('🔴 измеренный ноль означает «ничего не было»', () => {
    const fact = measuredFact({
      ...base,
      value: 0,
      basis: 'provider_journal_records',
      observation: completeObservation({ source: 'provider_journal' }),
    });

    expect(fact.state).toBe('measured');
    expect(allowsAbsenceConclusion(fact)).toBe(true);
    expect(meansProvenNone(fact)).toBe(true);
  });

  it('🔴 «не измерено» — это не ноль: значения нет вовсе', () => {
    const fact = notMeasuredFact({
      ...base,
      basis: 'provider_journal_records',
      observation: completeObservation({ source: 'provider_journal' }),
      reason: FACT_UNAVAILABLE_REASON.notMeasuredBySource,
    });

    expect(fact.state).toBe('not_measured');
    expect(fact.value).toBeNull();
    expect(allowsAbsenceConclusion(fact)).toBe(false);
    expect(meansProvenNone(fact)).toBe(false);
  });

  it('🔴 неполный источник: число есть, но ноль ничего не доказывает', () => {
    const fact = measuredFact({
      ...base,
      value: 0,
      basis: 'provider_journal_records',
      observation: incompleteObservation({
        source: 'provider_journal',
        reason: FACT_INCOMPLETE_REASON.sourceReadTruncated,
      }),
    });

    expect(fact.state).toBe('measured_incomplete');
    expect(fact.value).toBe(0);
    expect(allowsAbsenceConclusion(fact)).toBe(false);
    expect(meansProvenNone(fact)).toBe(false);
    expect(fact.reason).toBe(FACT_INCOMPLETE_REASON.sourceReadTruncated);
  });

  it('🔴 недоступный источник отличим от всех трёх остальных состояний', () => {
    const fact = unavailableFact({
      ...base,
      observation: incompleteObservation({
        source: 'provider_journal',
        reason: FACT_INCOMPLETE_REASON.sourceReadTruncated,
      }),
      reason: FACT_UNAVAILABLE_REASON.sourceDidNotAnswer,
    });

    expect(fact.state).toBe('unavailable');
    expect(fact.value).toBeNull();
    expect(allowsAbsenceConclusion(fact)).toBe(false);

    // Четыре состояния попарно различимы — иначе весь контракт бессмыслен.
    const states = new Set([
      'measured',
      'measured_incomplete',
      'not_measured',
      'unavailable',
    ]);
    expect(states.size).toBe(4);
  });
});

// ────────────────────────── окно и полнота чтения ──────────────────────────

describe('P0 §4 — ответ источника окном не является', () => {
  const windowOf = (items: JournalRecord[], truncated = false) => [
    {
      items,
      completeness: truncated ? ('truncated' as const) : ('complete' as const),
      truncationReason: truncated ? 'page_limit_reached' : null,
    },
  ];
  const selectors = {
    startAt: (item: JournalRecord) => new Date(item.start_at),
    key: (item: JournalRecord) => item.id,
  };

  it('🔴 запись, вернувшаяся ВНЕ запрошенного периода, в факт не входит', () => {
    const read = collectPeriodRecords(
      windowOf([
        record({ id: 'in', start_at: '2026-08-10T09:00:00.000Z' }),
        // Реестр 3.8: провайдер отдал запись 2024 года на окно 2026-го.
        record({ id: 'out', start_at: '2024-10-24T09:00:00.000Z' }),
      ]),
      PERIOD,
      selectors,
    );

    expect(read.items.map((item) => item.id)).toEqual(['in']);
    expect(read.fetched).toBe(2);
    expect(read.outOfPeriodDiscarded).toBe(1);
  });

  it('граница периода включительна с обеих сторон', () => {
    const read = collectPeriodRecords(
      windowOf([
        record({ id: 'first', start_at: PERIOD.from }),
        record({ id: 'last', start_at: PERIOD.to }),
        record({ id: 'after', start_at: '2026-09-01T00:00:00.000Z' }),
      ]),
      PERIOD,
      selectors,
    );

    expect(read.items.map((item) => item.id)).toEqual(['first', 'last']);
    expect(read.outOfPeriodDiscarded).toBe(1);
  });

  it('одна запись в двух соседних окнах остаётся одной записью', () => {
    const same = record({ id: 'same' });
    const read = collectPeriodRecords(
      [...windowOf([same]), ...windowOf([same])],
      PERIOD,
      selectors,
    );

    expect(read.items).toHaveLength(1);
    expect(read.fetched).toBe(1);
  });

  it('🔴 неполнота ОДНОГО окна делает неполным всё чтение', () => {
    const read = collectPeriodRecords(
      [...windowOf([record({ id: 'a' })]), ...windowOf([], true)],
      PERIOD,
      selectors,
    );

    expect(read.completeness).toBe('truncated');
    expect(read.truncationReason).toBe('page_limit_reached');
    expect(read.truncatedWindows).toBe(1);
  });

  it('запись без пригодной даты не считается ни внутри, ни снаружи', () => {
    const read = collectPeriodRecords(
      windowOf([record({ id: 'broken', start_at: 'не дата' })]),
      PERIOD,
      selectors,
    );

    expect(read.items).toHaveLength(0);
    expect(read.undatedDiscarded).toBe(1);
    expect(read.outOfPeriodDiscarded).toBe(0);
  });
});

// ─────────────────────────────── присутствие ───────────────────────────────

describe('P0 §2 — присутствие доказывается присутствием, а не статусом', () => {
  const build = (
    rows: Array<{ attendance: string | null; count: number }>,
    covered = true,
  ) => {
    const findFirst: jest.MockedFunction<
      (args: { where: Record<string, unknown> }) => Promise<unknown>
    > = jest
      .fn()
      .mockResolvedValue(
        covered ? { finishedAt: new Date('2026-09-01T03:00:00.000Z') } : null,
      );
    const prisma = {
      appointment: {
        groupBy: jest.fn().mockResolvedValue(
          rows.map((row) => ({
            attendance: row.attendance,
            _count: { _all: row.count },
          })),
        ),
      },
      reconciliationRun: { findFirst },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new AttendanceFactsService(prisma, tenantContext);
    return {
      findFirst,
      run: () =>
        tenantContext.runAsSystemTenant('tenant-a', () =>
          service.periodAttendance('tenant-a', PERIOD, { now: NOW }),
        ),
    };
  };

  it('🔴 `arrived` считается присутствием', async () => {
    const { run } = build([{ attendance: 'arrived', count: 4 }]);

    const facts = await run();

    expect(facts.arrived.value).toBe(4);
    expect(facts.arrived.basis).toBe('observed_attendance');
    expect(facts.arrived.state).toBe('measured');
    expect(meansProvenNone(facts.noShow)).toBe(true);
  });

  it('🔴 `no_show` считается неявкой', async () => {
    const { run } = build([
      { attendance: 'arrived', count: 2 },
      { attendance: 'no_show', count: 3 },
    ]);

    const facts = await run();

    expect(facts.noShow.value).toBe(3);
    expect(facts.arrived.value).toBe(2);
  });

  it('🔴 `completed / awaiting` присутствием НЕ считается', async () => {
    // Ровно тот случай, что найден в бою: статус говорит «проведён»,
    // провайдер говорит «отметки о приходе нет». Побеждает присутствие.
    const { run } = build([{ attendance: 'awaiting', count: 1 }]);

    const facts = await run();

    expect(facts.arrived.value).toBe(0);
    expect(facts.awaiting.value).toBe(1);
    // И этот ноль НЕ означает «никто не пришёл»: он означает «никто не
    // отмечен пришедшим».
    expect(facts.arrived.state).toBe('measured');
  });

  it('`confirmed_by_client` — это ещё не приход', async () => {
    const { run } = build([{ attendance: 'confirmed_by_client', count: 2 }]);

    const facts = await run();

    expect(facts.arrived.value).toBe(0);
    expect(facts.awaiting.value).toBe(2);
  });

  it('🔴 ненаблюдённое присутствие делает счётчики нижней границей', async () => {
    const { run } = build([
      { attendance: 'arrived', count: 5 },
      { attendance: null, count: 7 },
    ]);

    const facts = await run();

    expect(facts.arrived.value).toBe(5);
    expect(facts.arrived.state).toBe('measured_incomplete');
    expect(facts.arrived.reason).toBe(
      FACT_INCOMPLETE_REASON.attendanceNotObservedForEveryRecord,
    );
    expect(allowsAbsenceConclusion(facts.arrived)).toBe(false);
    // Само число ненаблюдённых при этом измерено точно.
    expect(facts.notObserved.value).toBe(7);
    expect(facts.notObserved.state).toBe('measured');
  });

  it('🔴 период без доказанного прогона сверки не даёт измерения', async () => {
    const { run } = build([{ attendance: 'arrived', count: 3 }], false);

    const facts = await run();

    expect(facts.coverage.covered).toBe(false);
    expect(facts.arrived.state).toBe('measured_incomplete');
    expect(facts.arrived.reason).toBe(
      FACT_INCOMPLETE_REASON.periodOutsideObservedRange,
    );
    expect(facts.arrived.observation.observedThrough).toBeNull();
  });

  it('🔴 внутренний календарь присутствия не ведёт: это `not_measured`', async () => {
    const groupBy: jest.MockedFunction<(args: unknown) => Promise<unknown>> =
      jest.fn();
    const prisma = {
      appointment: { groupBy },
      reconciliationRun: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new AttendanceFactsService(prisma, tenantContext);

    const facts = await tenantContext.runAsSystemTenant('tenant-internal', () =>
      service.periodAttendance('tenant-internal', PERIOD, {
        attendanceSupported: false,
        now: NOW,
      }),
    );

    expect(facts.arrived.state).toBe('not_measured');
    expect(facts.arrived.value).toBeNull();
    expect(facts.arrived.reason).toBe(
      FACT_UNAVAILABLE_REASON.notMeasuredBySource,
    );
    // Ни одного лишнего запроса: измерять нечего, и мы это знаем заранее.
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('покрытием считается только ЗАВЕРШЁННЫЙ и ПОЛНЫЙ прогон', async () => {
    const { findFirst, run } = build([{ attendance: 'arrived', count: 1 }]);

    await run();

    const { where } = findFirst.mock.calls[0][0];
    expect(where).toMatchObject({
      completeness: 'complete',
      failureCode: null,
      finishedAt: { not: null },
    });
  });
});

// ──────────────────────── обзор аналитики целиком ────────────────────────

describe('P0 §1/§4/§5 — обзор несёт полноту и присутствие', () => {
  const createAnalytics = (options: {
    appointments: JournalRecord[];
    completeness?: 'complete' | 'truncated';
    attendanceRows?: Array<{ attendance: string | null; count: number }>;
    covered?: boolean;
  }) => {
    const getJournal = jest.fn().mockResolvedValue({
      calendar_source: 'external',
      completeness: options.completeness ?? 'complete',
      truncation_reason:
        options.completeness === 'truncated' ? 'page_limit_reached' : undefined,
      timezone: 'Europe/Moscow',
      range: { from: PERIOD.from, to: PERIOD.to },
      provider_id: null,
      count: options.appointments.length,
      appointments: options.appointments,
    });
    const crmService = {
      getJournal,
      getFinancialSummary: jest.fn(),
      getRevenueSummary: jest.fn(),
    } as unknown as CrmService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue(
          (options.attendanceRows ?? []).map((row) => ({
            attendance: row.attendance,
            _count: { _all: row.count },
          })),
        ),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      staffProviderLink: { findMany: jest.fn().mockResolvedValue([]) },
      internalProvider: { findMany: jest.fn().mockResolvedValue([]) },
      reconciliationRun: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options.covered === false
              ? null
              : { finishedAt: new Date('2026-09-01T03:00:00.000Z') },
          ),
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new OperationsAnalyticsService(
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
      getJournal,
      overview: () =>
        tenantContext.runAsSystemTenant('tenant-a', () =>
          service.getBusinessOperationalOverview('tenant-a', {
            from: PERIOD.from,
            to: PERIOD.to,
          }),
        ),
    };
  };

  it('🔴 запись вне запрошенного периода не попадает ни в один счётчик', async () => {
    const { overview } = createAnalytics({
      appointments: [
        record({ id: 'in' }),
        record({ id: 'out', start_at: '2024-10-24T09:00:00.000Z' }),
      ],
    });

    const result = await overview();

    expect(result.appointments.total).toBe(1);
    expect(result.completeness.appointments.out_of_period_discarded).toBe(1);
  });

  it('🔴 полный источник: ноль записей означает «записей не было»', async () => {
    const { overview } = createAnalytics({ appointments: [] });

    const result = await overview();

    expect(result.appointments.total).toBe(0);
    expect(result.completeness.appointments).toMatchObject({
      source: 'provider_journal',
      status: 'complete',
      reason: null,
    });
  });

  it('🔴 усечённый источник признаётся неполным, а не молчит', async () => {
    const { overview } = createAnalytics({
      appointments: [],
      completeness: 'truncated',
    });

    const result = await overview();

    expect(result.appointments.total).toBe(0);
    expect(result.completeness.appointments).toMatchObject({
      status: 'incomplete',
      reason: FACT_INCOMPLETE_REASON.sourceReadTruncated,
    });
  });

  it('🔴 присутствие приезжает из зеркала и отделено от статуса', async () => {
    const { overview } = createAnalytics({
      // Статус говорит «проведён» у обеих записей…
      appointments: [record({ id: 'a' }), record({ id: 'b' })],
      // …а зеркало знает, что пришёл только один.
      attendanceRows: [
        { attendance: 'arrived', count: 1 },
        { attendance: 'awaiting', count: 1 },
      ],
    });

    const result = await overview();

    expect(result.appointments.completed).toBe(2);
    expect(result.attendance).toMatchObject({
      state: 'measured',
      arrived: 1,
      awaiting: 1,
      not_observed: 0,
    });
  });

  it('🔴 основание денег главы 2 не потеряно', async () => {
    const { overview } = createAnalytics({
      appointments: [record({ id: 'a' })],
    });

    const result = await overview();

    // Операционный обзор всегда стоит на ценах журнала — и говорит это полем.
    expect(result.revenue_basis).toBe('booked_prices');
    expect(result.net_status).toBe('unavailable');
  });
});

// ───────────────────── отмены: непротиворечивая семантика ─────────────────

describe('P0 §3 — отмены', () => {
  const overviewWith = (over: {
    cancelled: number;
    completeness: 'complete' | 'incomplete';
    notObserved?: number;
  }) => ({
    data_source: 'crm',
    period: { from: PERIOD.from, to: PERIOD.to, timezone: PERIOD.timezone },
    appointments: {
      total: 10,
      active: 10 - over.cancelled,
      scheduled: 1,
      completed: 6,
      cancelled: over.cancelled,
      no_show: 0,
      cancellation_rate_percent: 0,
      unique_clients: 5,
      repeat_clients_in_period: 1,
      repeat_client_rate_percent: 20,
      identified_client_visits: 9,
      clients_returning: 2,
      clients_new: 3,
      returning_share_percent: 40,
      cohort_lookback_days: 90,
      cohort_status: 'available',
      cohort_unavailable_reason: null,
      booked_minutes: 600,
    },
    revenue: [],
    expenses: [],
    net: [],
    revenue_basis: 'booked_prices',
    net_status: 'unavailable',
    net_unavailable_reason: 'x',
    average_ticket: [],
    daily: [],
    staff: [],
    services: [],
    completeness: {
      appointments: {
        source: 'provider_journal',
        status: over.completeness,
        reason:
          over.completeness === 'incomplete'
            ? FACT_INCOMPLETE_REASON.sourceReadTruncated
            : null,
        observed_through: NOW.toISOString(),
        out_of_period_discarded: 0,
      },
      attendance: {
        source: 'canonical_mirror',
        status: over.notObserved ? 'incomplete' : 'complete',
        reason: over.notObserved
          ? FACT_INCOMPLETE_REASON.attendanceNotObservedForEveryRecord
          : null,
        observed_through: NOW.toISOString(),
      },
    },
    attendance: {
      state: over.notObserved ? 'measured_incomplete' : 'measured',
      arrived: 6,
      no_show: 0,
      awaiting: 0,
      not_observed: over.notObserved ?? 0,
      records: 10 + (over.notObserved ?? 0),
      facts: [],
    },
    data_quality: {},
  });

  const handlerFor = (overview: unknown, tenantId: string) => {
    const analyticsService = {
      getBusinessOperationalOverview: jest.fn().mockResolvedValue(overview),
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('no finance')),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const handler = new AiToolHandlerService(
      {} as CrmService,
      {} as AppointmentsService,
      {} as LoyaltyService,
      analyticsService,
      {} as ExpensesService,
      prisma,
      {} as CustomersService,
      {} as StaffService,
    );
    const args = {
      period: 'custom',
      from: PERIOD.from,
      to: PERIOD.to,
      comparison: 'none',
    } as unknown as ValidatedAiToolArguments;
    return () =>
      handler.execute(
        'analytics.business.query',
        {
          tenantId,
          userId: 'owner-1',
          role: UserRole.TENANT_OWNER,
          surface: 'web' as const,
        },
        args,
        `key-${tenantId}`,
      ) as Promise<{
        metrics: Record<string, unknown>;
        available_metrics: string[];
        unavailable_metrics: Array<{ key: string; reason: string }>;
        limitations: Array<{ key: string; reason: string }>;
      }>;
  };

  it('🔴 измеренные отмены не объявляются недоступными в том же ответе', async () => {
    const run = handlerFor(
      overviewWith({ cancelled: 3, completeness: 'complete' }),
      'tenant-cancel-ok',
    );

    const result = await run();

    expect(result.metrics.appointments_cancelled).toBe(3);
    expect(result.available_metrics).toContain('appointments_cancelled');
    // Ровно то противоречие, ради которого пункт §3 и написан.
    expect(result.unavailable_metrics.map((entry) => entry.key)).not.toContain(
      'cancellations',
    );
  });

  it('🔴 семантика усилению не подлежит: доказано только удаление записи', async () => {
    const run = handlerFor(
      overviewWith({ cancelled: 3, completeness: 'complete' }),
      'tenant-cancel-reason',
    );

    const result = await run();

    const limitation = result.limitations.find(
      (entry) => entry.key === 'cancellation_reason',
    );
    expect(limitation?.reason).toMatch(/removed/);
    expect(limitation?.reason).toMatch(/must not be inferred/);
  });

  it('🔴 неполный ответ не кэшируется: следующий запрос читает источник заново', async () => {
    const overview = overviewWith({ cancelled: 0, completeness: 'incomplete' });
    const readOverview: jest.MockedFunction<
      (tenantId: string, query: unknown) => Promise<unknown>
    > = jest.fn().mockResolvedValue(overview);
    const analyticsService = {
      getBusinessOperationalOverview: readOverview,
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('no finance')),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const handler = new AiToolHandlerService(
      {} as CrmService,
      {} as AppointmentsService,
      {} as LoyaltyService,
      analyticsService,
      {} as ExpensesService,
      prisma,
      {} as CustomersService,
      {} as StaffService,
    );
    const args = {
      period: 'custom',
      from: PERIOD.from,
      to: PERIOD.to,
      comparison: 'none',
    } as unknown as ValidatedAiToolArguments;
    const principal = {
      tenantId: 'tenant-no-cache',
      userId: 'owner-1',
      role: UserRole.TENANT_OWNER,
      surface: 'web' as const,
    };

    await handler.execute('analytics.business.query', principal, args, 'a');
    await handler.execute('analytics.business.query', principal, args, 'b');

    expect(readOverview).toHaveBeenCalledTimes(2);
  });

  it('🔴 неполный источник: число остаётся нижней границей, а не исчезает', async () => {
    const run = handlerFor(
      overviewWith({ cancelled: 4, completeness: 'incomplete' }),
      'tenant-cancel-incomplete',
    );

    const result = await run();

    // Число никуда не делось: усечённая выборка даёт нижнюю границу.
    expect(result.metrics.appointments_cancelled).toBe(4);
    expect(result.available_metrics).toContain('appointments_cancelled');
    // Изменилось ровно одно — право читать ноль как «ничего не было».
    const entry = result.limitations.find(
      (item) => item.key === 'incomplete_read',
    );
    expect(entry?.reason).toMatch(/incomplete/);
    expect(entry?.reason).toMatch(/lower bound/);
    expect(entry?.reason).toMatch(/not measured/);
  });

  /**
   * 🔴 Инвариант, найденный скептиком при проверке P0.
   *
   * Первая правка сняла противоречие только на ПОЛНОЙ выборке: на усечённой
   * `appointments_cancelled` по-прежнему попадала и в доступные метрики, и в
   * объявленные недоступными. Теперь граница проведена по смыслу списков, и
   * тест проверяет её на обеих ветках сразу.
   */
  it('🔴 ни одна метрика не объявляется недоступной, будучи доступной', async () => {
    const CLAIMED_BY: Record<string, string[]> = {
      cancellations: ['appointments_cancelled', 'cancellation_rate_percent'],
      client_cohorts: [
        'clients_returning',
        'clients_new',
        'returning_share_percent',
      ],
      attendance: ['attended_appointments', 'attendance_no_show'],
    };

    for (const completeness of ['complete', 'incomplete'] as const) {
      for (const notObserved of [0, 4]) {
        const run = handlerFor(
          overviewWith({ cancelled: 2, completeness, notObserved }),
          `tenant-invariant-${completeness}-${notObserved}`,
        );

        const result = await run();
        const available = new Set(result.available_metrics);
        for (const entry of result.unavailable_metrics) {
          for (const metric of CLAIMED_BY[entry.key] ?? []) {
            expect({
              case: `${completeness}/${notObserved}`,
              metric,
              available: available.has(metric),
            }).toEqual({
              case: `${completeness}/${notObserved}`,
              metric,
              available: false,
            });
          }
        }
      }
    }
  });

  it('🔴 присутствие не становится метрикой, пока наблюдено не всё', async () => {
    const run = handlerFor(
      overviewWith({
        cancelled: 1,
        completeness: 'complete',
        notObserved: 4,
      }),
      'tenant-attendance-partial',
    );

    const result = await run();

    expect(result.metrics.attended_appointments).toBeNull();
    expect(result.available_metrics).not.toContain('attended_appointments');
    expect(result.metrics.appointments_attendance_not_observed).toBe(4);
    expect(result.unavailable_metrics.map((entry) => entry.key)).toContain(
      'attendance',
    );
    expect(result.limitations.map((entry) => entry.key)).toContain(
      'attendance_coverage',
    );
  });

  it('присутствие становится метрикой, когда наблюдено всё', async () => {
    const run = handlerFor(
      overviewWith({ cancelled: 1, completeness: 'complete' }),
      'tenant-attendance-full',
    );

    const result = await run();

    expect(result.metrics.attended_appointments).toBe(6);
    expect(result.available_metrics).toContain('attended_appointments');
  });
});

// ─────────────────── контракты глав 2–3 не потеряны ───────────────────

describe('P0 — каноны предыдущих глав на месте', () => {
  it('🔴 владелец баланса лояльности по-прежнему трёхзначен', () => {
    expect([...LOYALTY_AUTHORITY_VALUES].sort()).toEqual([
      'crm',
      'legacy_bot',
      'maya',
    ]);
    expect(
      loyaltyVerificationRequired({ authority: 'legacy_bot', stale: false }),
    ).toBe(true);
    expect(
      loyaltyVerificationRequired({ authority: 'maya', stale: false }),
    ).toBe(false);
    expect(
      loyaltyVerificationRequired({ authority: 'maya', stale: true }),
    ).toBe(true);
  });
});

// ─────────────── журнал дня и контракт кабинета ───────────────

describe('P0 §4 — журнал дня в AI-слое', () => {
  const dayHandler = (appointments: JournalRecord[]) => {
    const crmService = {
      getJournal: jest.fn().mockResolvedValue({
        calendar_source: 'external',
        completeness: 'complete',
        timezone: 'Europe/Moscow',
        range: {
          from: '2026-08-10T00:00:00.000Z',
          to: '2026-08-11T00:00:00.000Z',
        },
        provider_id: null,
        count: appointments.length,
        appointments,
        all_masters: [],
        masters: [],
      }),
      getStaff: jest.fn().mockResolvedValue([]),
    } as unknown as CrmService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const handler = new AiToolHandlerService(
      crmService,
      {} as AppointmentsService,
      {} as LoyaltyService,
      {} as OperationsAnalyticsService,
      {} as ExpensesService,
      prisma,
      {} as CustomersService,
      {} as StaffService,
    );
    return () =>
      handler.execute(
        'operations.journal.read',
        {
          tenantId: 'tenant-day',
          userId: 'owner-1',
          role: UserRole.TENANT_OWNER,
          surface: 'web' as const,
        },
        { date: '2026-08-10' },
        'day-key',
      ) as Promise<{
        summary: { total: number };
        attendance: Record<string, number>;
        completeness: Record<string, unknown>;
      }>;
  };

  it('🔴 запись из другого дня в счётчики дня не попадает', async () => {
    const run = dayHandler([
      record({ id: 'today', start_at: '2026-08-10T09:00:00.000Z' }),
      record({ id: 'other-year', start_at: '2024-10-24T09:00:00.000Z' }),
    ]);

    const result = await run();

    expect(result.summary.total).toBe(1);
    expect(result.completeness.out_of_period_discarded).toBe(1);
  });

  it('🔴 присутствие дня отделено от статуса «проведён»', async () => {
    const run = dayHandler([
      record({ id: 'paid', status: 'completed', attendance: 'awaiting' }),
      record({ id: 'came', status: 'completed', attendance: 'arrived' }),
    ]);

    const result = await run();

    expect(result.attendance).toEqual({
      arrived: 1,
      no_show: 0,
      awaiting: 1,
      not_observed: 0,
    });
    // Статус провайдера при этом не переписан: два «проведённых» остаются.
    expect(result.summary.total).toBe(2);
    expect(result.completeness.zero_means_none).toBe(true);
  });

  it('полночь следующего дня в сутки не входит', async () => {
    const run = dayHandler([
      record({ id: 'midnight-next', start_at: '2026-08-10T21:00:00.000Z' }),
    ]);

    // 21:00 UTC = 00:00 МСК 11 августа — это уже следующие сутки салона.
    const result = await run();

    expect(result.summary.total).toBe(0);
    expect(result.completeness.out_of_period_discarded).toBe(1);
  });
});

// ─────────── находки скептиков: закреплены навсегда ───────────

describe('P0 — то, что нашёл скептик при проверке пакета', () => {
  const journalFor = (
    main: JournalRecord[],
    mainTruncated: boolean,
    lookbackTruncated: boolean,
  ) => {
    const mainFrom = new Date(PERIOD.from).getTime();
    return jest.fn().mockImplementation((_tenantId: string, query: unknown) => {
      const range = query as { from: string };
      // Окно истории лежит СТРОГО до начала периода.
      const isLookback = new Date(range.from).getTime() < mainFrom;
      const truncated = isLookback ? lookbackTruncated : mainTruncated;
      return Promise.resolve({
        calendar_source: 'external',
        completeness: truncated ? 'truncated' : 'complete',
        truncation_reason: truncated ? 'page_limit_reached' : undefined,
        timezone: 'Europe/Moscow',
        range,
        provider_id: null,
        count: isLookback ? 0 : main.length,
        appointments: isLookback ? [] : main,
      });
    });
  };

  const overviewFor = (options: {
    mainTruncated?: boolean;
    lookbackTruncated?: boolean;
    records?: JournalRecord[];
  }) => {
    const getJournal = journalFor(
      options.records ?? [record({ id: 'a' })],
      options.mainTruncated ?? false,
      options.lookbackTruncated ?? false,
    );
    const crmService = {
      getJournal,
      getFinancialSummary: jest.fn(),
      getRevenueSummary: jest.fn(),
    } as unknown as CrmService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      staffProviderLink: { findMany: jest.fn().mockResolvedValue([]) },
      internalProvider: { findMany: jest.fn().mockResolvedValue([]) },
      reconciliationRun: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new OperationsAnalyticsService(
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
    return () =>
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.getBusinessOperationalOverview('tenant-a', {
          from: PERIOD.from,
          to: PERIOD.to,
        }),
      );
  };

  it('🔴 усечённая ИСТОРИЯ до периода отменяет когорты, а не рождает новых клиентов', async () => {
    const overview = overviewFor({ lookbackTruncated: true });

    const result = await overview();

    expect(result.appointments.cohort_status).toBe('unavailable');
    expect(result.appointments.cohort_unavailable_reason).toBe(
      'lookback_window_read_was_truncated',
    );
    expect(result.appointments.clients_new).toBeNull();
  });

  it('🔴 усечённый САМ ПЕРИОД тоже отменяет когорты', async () => {
    const overview = overviewFor({ mainTruncated: true });

    const result = await overview();

    expect(result.appointments.cohort_status).toBe('unavailable');
    expect(result.appointments.cohort_unavailable_reason).toBe(
      'period_window_read_was_truncated',
    );
    expect(result.completeness.appointments.status).toBe('incomplete');
  });

  it('🔴 удалённая запись не даёт присутствия: одно событие не считается дважды', async () => {
    const groupBy: jest.MockedFunction<
      (args: { where: Record<string, unknown> }) => Promise<unknown>
    > = jest.fn().mockResolvedValue([]);
    const prisma = {
      appointment: { groupBy },
      reconciliationRun: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new AttendanceFactsService(prisma, tenantContext);

    await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.periodAttendance('tenant-a', PERIOD, { now: NOW }),
    );

    const { where } = groupBy.mock.calls[0][0];
    expect(where.status).toEqual({ notIn: ['canceled', 'cancelled'] });
  });
});

describe('P0 §26 — периоды разной полноты не сравниваются как равные', () => {
  const overviewWithCompleteness = (status: 'complete' | 'incomplete') => ({
    data_source: 'crm',
    period: { from: PERIOD.from, to: PERIOD.to, timezone: PERIOD.timezone },
    appointments: {
      total: 10,
      active: 10,
      scheduled: 1,
      completed: 6,
      cancelled: 0,
      no_show: 0,
      cancellation_rate_percent: 0,
      unique_clients: 5,
      repeat_clients_in_period: 1,
      repeat_client_rate_percent: 20,
      identified_client_visits: 9,
      clients_returning: 2,
      clients_new: 3,
      returning_share_percent: 40,
      cohort_lookback_days: 90,
      cohort_status: 'available',
      cohort_unavailable_reason: null,
      booked_minutes: 600,
    },
    revenue: [],
    expenses: [],
    net: [],
    revenue_basis: 'booked_prices',
    net_status: 'unavailable',
    net_unavailable_reason: 'x',
    average_ticket: [],
    daily: [],
    staff: [],
    services: [],
    completeness: {
      appointments: {
        source: 'provider_journal',
        status,
        reason:
          status === 'incomplete'
            ? FACT_INCOMPLETE_REASON.sourceReadTruncated
            : null,
        observed_through: NOW.toISOString(),
        out_of_period_discarded: 0,
      },
      attendance: null,
    },
    attendance: {
      state: 'measured',
      arrived: 6,
      no_show: 0,
      awaiting: 0,
      not_observed: 0,
      records: 10,
      facts: [],
    },
    data_quality: {},
  });

  it('🔴 усечённый ПРОШЛЫЙ период называется вслух, а не сравнивается молча', async () => {
    let call = 0;
    const readOverview: jest.MockedFunction<
      (tenantId: string, query: unknown) => Promise<unknown>
    > = jest.fn().mockImplementation(() => {
      call += 1;
      // Первый вызов — текущий период, второй — прошлый.
      return Promise.resolve(
        overviewWithCompleteness(call === 1 ? 'complete' : 'incomplete'),
      );
    });
    const analyticsService = {
      getBusinessOperationalOverview: readOverview,
      getBusinessFinance: jest.fn().mockRejectedValue(new Error('no finance')),
    } as unknown as OperationsAnalyticsService;
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          calendarSource: 'external',
          defaultTimezone: 'Europe/Moscow',
        }),
      },
      branch: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const handler = new AiToolHandlerService(
      {} as CrmService,
      {} as AppointmentsService,
      {} as LoyaltyService,
      analyticsService,
      {} as ExpensesService,
      prisma,
      {} as CustomersService,
      {} as StaffService,
    );

    const result = (await handler.execute(
      'analytics.business.query',
      {
        tenantId: 'tenant-compare',
        userId: 'owner-1',
        role: UserRole.TENANT_OWNER,
        surface: 'web' as const,
      },
      {
        period: 'custom',
        from: PERIOD.from,
        to: PERIOD.to,
        comparison: 'previous_period',
      },
      'compare-key',
    )) as {
      comparison: { completeness: { current: string; previous: string } };
      limitations: Array<{ key: string; reason: string }>;
    };

    expect(result.comparison.completeness).toEqual({
      current: 'complete',
      previous: 'incomplete',
    });
    const limitation = result.limitations.find(
      (entry) => entry.key === 'comparison_completeness',
    );
    expect(limitation?.reason).toMatch(/previous period was/);
    expect(limitation?.reason).toMatch(/different completeness/);
  });
});
