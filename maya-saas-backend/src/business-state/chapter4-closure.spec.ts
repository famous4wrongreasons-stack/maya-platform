import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessStateService } from './business-state.service';

/**
 * 🔴 Финальная сверка главы 4. Две последние дыры в самом каноне.
 *
 * Первая: в режиме внешней CRM операционный обзор гасит денежные поля, и
 * `expenses` уезжал пустым массивом БЕЗ причины — рядом с `net`, у которого
 * причина была. Пустота без основания читается как «расходов не было».
 *
 * Вторая: строки мастеров пересчитывали `total` собственной формулой, а
 * скрытые по решению вызывающего корзины (`scheduled`/`completed`/`no_show`)
 * превращались в измеренный на вид ноль.
 */

const PERIOD = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-31T23:59:59.999Z',
};

/**
 * Обзор в том виде, в каком его отдаёт агрегация при СКРЫТЫХ операционных
 * корзинах: `total`, `scheduled`, `completed` и `no_show` отсутствуют вовсе.
 */
const overviewWithoutBuckets = () => ({
  data_source: 'crm',
  appointments: { total: 10, active: 9, cancelled: 1, unique_clients: 7 },
  revenue: [{ currency: 'RUB', amount_kopecks: 500_000 }],
  revenue_basis: 'booked_prices',
  net: [],
  net_status: 'unavailable',
  net_unavailable_reason: 'profit_is_calculated_only_from_till_confirmed_cash',
  expenses: [{ currency: 'RUB', amount_kopecks: 100_000 }],
  average_ticket: [],
  daily: [],
  staff: [
    {
      staff_external_id: 'staff-1',
      name: 'Мастер',
      appointments: 4,
      cancelled: 1,
      cancellation_rate_percent: 20,
      unique_clients: 3,
      repeat_clients_in_period: 1,
      revenue: [],
      booked_minutes: 240,
      services: [],
    },
  ],
  services: [],
  completeness: {
    appointments: {
      source: 'provider_journal',
      status: 'complete',
      reason: null,
    },
  },
});

function createState(overview: Record<string, unknown>) {
  const analytics = {
    getBusinessOverview: jest.fn().mockResolvedValue(overview),
    getBusinessFinance: jest.fn().mockResolvedValue(null),
    getBusinessProfitability: jest.fn(),
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
  return new BusinessStateService(analytics, prisma);
}

const read = (service: BusinessStateService, operationalDetail: boolean) =>
  service.business({
    tenantId: 'tenant-a',
    period: PERIOD,
    comparisonMode: 'none',
    comparisonPeriod: null,
    financeAllowed: true,
    bookedValueAllowed: true,
    operationalDetail,
    retryOnFailure: false,
    disclose: () => ({ names: new Map(), allowedExternalIds: null }),
  });

describe('Глава 4 — закрывающие правки канона', () => {
  it('явно названный будущий период назван будущим', async () => {
    const service = createState(overviewWithoutBuckets());
    const future = await service.business({
      tenantId: 'tenant-a',
      period: {
        from: '2027-08-01T00:00:00.000Z',
        to: '2027-08-31T23:59:59.999Z',
      },
      comparisonMode: 'none',
      comparisonPeriod: null,
      financeAllowed: true,
      bookedValueAllowed: true,
      operationalDetail: true,
      retryOnFailure: false,
      disclose: () => ({ names: new Map(), allowedExternalIds: null }),
    });
    // 🔴 Резолвер больше не подменяет будущий период прошлым; значит ответ
    // обязан сказать, что в нём ничего ещё не происходило.
    expect(
      (future.limitations as Array<{ key: string }>).map((item) => item.key),
    ).toContain('period_has_not_started');

    const past = await read(createState(overviewWithoutBuckets()), true);
    expect(
      (past.limitations as Array<{ key: string }>).map((item) => item.key),
    ).not.toContain('period_has_not_started');
  });

  it('пустые расходы денежной ветки несут основание, а не молчат', async () => {
    const state = await read(createState(overviewWithoutBuckets()), true);
    const current = state.current;
    expect(current.expenses).toEqual([]);
    // Ровно то же обещание, что у соседнего `net`: пустота названа.
    expect(current.expenses_status).toBe('unavailable');
    expect(String(current.expenses_unavailable_reason)).toContain(
      'profitability_path',
    );
  });

  it('скрытая корзина мастера остаётся неизвестной, а не нулём', async () => {
    const state = await read(createState(overviewWithoutBuckets()), true);
    const rows = (
      state.current as { staff_summary: Array<Record<string, unknown>> }
    ).staff_summary;
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Агрегация этих полей не публиковала — значит их никто не измерял.
    expect(row.no_show).toBeNull();
    expect(row.scheduled).toBeNull();
    expect(row.completed).toBeNull();
    // 🔴 И итог не пересчитывается второй формулой из записей и отмен:
    // это было второе вычисление того же числа внутри самого канона.
    expect(row.total).toBeNull();
    // Измеренные поля при этом на месте.
    expect(row.appointments).toBe(4);
    expect(row.cancelled).toBe(1);
  });

  it('опубликованные корзины проходят как есть', async () => {
    const overview = overviewWithoutBuckets();
    overview.staff = [
      {
        ...overview.staff[0],
        total: 5,
        scheduled: 1,
        completed: 3,
        no_show: 0,
      },
    ] as never;
    const state = await read(createState(overview), true);
    const row = (
      state.current as { staff_summary: Array<Record<string, unknown>> }
    ).staff_summary[0];
    expect(row.total).toBe(5);
    expect(row.scheduled).toBe(1);
    expect(row.completed).toBe(3);
    // Измеренный ноль остаётся нулём: неявок не было, и это факт.
    expect(row.no_show).toBe(0);
  });
});
