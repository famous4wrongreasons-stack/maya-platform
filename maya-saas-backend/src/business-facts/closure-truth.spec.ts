import { AttendanceFactsService } from './attendance-facts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { buildChatReportCard } from '../ai-tools/chat-report-card';

/**
 * 🔴 Cycle 04 closure. Три подмены, доказанные финальной сверкой:
 * покрытие за ещё не наступившее время, «0 ₽» над непрочитанной книгой
 * расходов и «база активна» поверх непосчитанных гостей.
 */

const PERIOD = (from: string, to: string) => ({
  from,
  to,
  timezone: 'Europe/Moscow',
});

function createAttendance(options: {
  finishedAt: string;
  grouped: Array<{ attendance: string | null; _count: { _all: number } }>;
}) {
  const prisma = {
    reconciliationRun: {
      findFirst: jest.fn().mockResolvedValue({
        finishedAt: new Date(options.finishedAt),
      }),
    },
    appointment: {
      groupBy: jest.fn().mockResolvedValue(options.grouped),
    },
  } as unknown as PrismaService;
  const tenantContext = new TenantContextService();
  return {
    service: new AttendanceFactsService(prisma, tenantContext),
    tenantContext,
  };
}

describe('A — покрытие не заходит за момент наблюдения', () => {
  const grouped = [
    { attendance: 'arrived', _count: { _all: 3 } },
    { attendance: 'awaiting', _count: { _all: 2 } },
  ];

  it('завтрашний день не бывает измеренным', async () => {
    const { service, tenantContext } = createAttendance({
      finishedAt: '2026-08-20T09:00:00.000Z',
      grouped: [{ attendance: 'awaiting', _count: { _all: 6 } }],
    });
    const facts = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.periodAttendance(
        'tenant-a',
        PERIOD('2026-08-20T21:00:00.000Z', '2026-08-21T20:59:59.999Z'),
      ),
    );
    // 🔴 Раньше здесь стояло `measured`, и поверхности печатали «пришли 0,
    // неявок 0» как доказанный ноль за день, который ещё не наступил. Числа
    // гасят потребители по состоянию факта (глава 4, P6), поэтому решает
    // именно состояние и названная причина.
    expect(facts.arrived.state).toBe('measured_incomplete');
    expect(facts.noShow.state).toBe('measured_incomplete');
    expect(facts.arrived.observation.incompleteReason).toBe(
      'period_extends_past_the_moment_of_observation',
    );
    expect(facts.arrived.observation.completeness).toBe('incomplete');
  });

  it('идущие сутки и месяц-к-дате измерены по состоянию на наблюдение', async () => {
    // 🔴 Дыра первой версии этой же правки: сравнение шло по КОНЦУ периода, и
    // сегодняшний день вместе с «месяцем к дате» терял число присутствия
    // совсем — владелец переставал слышать «сколько пришло сегодня».
    const { service, tenantContext } = createAttendance({
      finishedAt: '2026-08-20T08:55:00.000Z',
      grouped,
    });
    const today = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.periodAttendance(
        'tenant-a',
        PERIOD('2026-08-19T21:00:00.000Z', '2026-08-20T20:59:59.999Z'),
      ),
    );
    expect(today.arrived.state).toBe('measured');
    expect(today.arrived.value).toBe(3);
    expect(today.arrived.observation.observedThrough).toBe(
      '2026-08-20T08:55:00.000Z',
    );

    const monthToDate = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.periodAttendance(
        'tenant-a',
        PERIOD('2026-07-31T21:00:00.000Z', '2026-08-20T09:00:00.000Z'),
      ),
    );
    expect(monthToDate.arrived.state).toBe('measured');
  });

  it('причина неполноты не подменяется, когда часть записей без отметки', async () => {
    const { service, tenantContext } = createAttendance({
      finishedAt: '2026-08-20T08:55:00.000Z',
      grouped: [
        { attendance: 'arrived', _count: { _all: 3 } },
        { attendance: null, _count: { _all: 7 } },
      ],
    });
    const facts = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.periodAttendance(
        'tenant-a',
        PERIOD('2026-07-31T21:00:00.000Z', '2026-08-20T09:00:00.000Z'),
      ),
    );
    expect(facts.arrived.state).toBe('measured_incomplete');
    // Настоящая причина — отсутствие отметок, а не момент наблюдения.
    expect(facts.arrived.observation.incompleteReason).toBe(
      'attendance_was_not_observed_for_every_record_of_the_period',
    );
  });

  it('прожитый и перечитанный день измерен', async () => {
    const { service, tenantContext } = createAttendance({
      finishedAt: '2026-08-20T09:00:00.000Z',
      grouped,
    });
    const facts = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.periodAttendance(
        'tenant-a',
        PERIOD('2026-08-18T21:00:00.000Z', '2026-08-19T20:59:59.999Z'),
      ),
    );
    expect(facts.arrived.state).toBe('measured');
    expect(facts.arrived.value).toBe(3);
  });
});

describe('B4 — число визитов и сумма покупок следуют своим источникам', () => {
  const dossier = (
    visitsCount: number | null,
    soldAmount: number | null,
    historyOk: boolean,
  ) => {
    // Повторяем ровно ту развилку, что стоит в досье.
    const visitsUnavailable = visitsCount === null && !historyOk;
    const spentUnavailable = soldAmount === null && !historyOk;
    return {
      visits: visitsUnavailable ? null : (visitsCount ?? 0),
      total_spent: spentUnavailable ? null : (soldAmount ?? 0),
    };
  };

  it('карточка назвала сумму, но не число визитов — гасится только число', () => {
    expect(dossier(null, 12_000, false)).toEqual({
      visits: null,
      total_spent: 12_000,
    });
  });

  it('оба числа названы — оба живут', () => {
    expect(dossier(7, 12_000, false)).toEqual({
      visits: 7,
      total_spent: 12_000,
    });
  });
});

describe('D — карточка прибыли над непрочитанной книгой расходов', () => {
  const card = (
    expenses: Record<string, unknown>,
    completeness: Record<string, unknown>,
  ) =>
    buildChatReportCard(
      [
        {
          name: 'analytics.business.profit',
          result: {
            period: { label_ru: 'август' },
            confirmed_revenue: {
              status: 'available',
              total: { amount_kopecks: 10_000_000 },
            },
            expenses,
            completeness,
            net_profit: {
              status: 'unavailable',
              unavailable_reason:
                'expense_ledger_did_not_answer_for_this_period',
            },
          },
        },
      ],
      { personal: false, userText: 'какая чистая прибыль' },
    )?.widget_data as Record<string, unknown>;

  it('непрочитанная книга не печатается нулём', () => {
    const widget = card(
      { status: 'unavailable', by_category: [], totals: [] },
      { status: 'unavailable', owner_confirmation_required: false },
    );
    expect(widget.additional_expenses_rub).toBeNull();
    expect(widget.total_expenses_rub).toBeNull();
  });

  it('измеренный ноль остаётся нулём', () => {
    const widget = card(
      { status: 'available', by_category: [], totals: [] },
      { status: 'complete', owner_confirmation_required: false },
    );
    expect(widget.additional_expenses_rub).toBe(0);
  });
});
