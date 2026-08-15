import {
  composeDailyReport,
  composeMasterMorningBrief,
  composeMorningBrief,
} from './owner-reports.composers';

describe('owner-reports composers', () => {
  it('builds a morning brief with booked load', () => {
    const result = composeMorningBrief({
      localDate: '2026-08-08',
      overview: {
        appointments: { active: 14, booked_minutes: 420 },
        revenue: [{ amount_kopecks: 3_510_000 }],
        average_ticket: [{ amount_kopecks: 250_000 }],
        staff: [
          { name: 'Александр', appointments: 1 },
          { name: 'Стас', appointments: 0 },
          { name: 'Илья', appointments: 5 },
        ],
      },
    });
    expect(result.title).toContain('08.08');
    expect(result.bodyText).toContain('14 записей');
    expect(result.bodyText).toContain('Недозагружены');
    expect(result.payload.booked).toBe(14);
  });

  it('builds a private morning plan for a linked master', () => {
    const result = composeMasterMorningBrief({
      localDate: '2026-08-08',
      masterName: 'Илья',
      overview: {
        appointments: {
          total: 7,
          active: 6,
          scheduled: 5,
          completed: 1,
          cancelled: 1,
          no_show: 0,
          booked_minutes: 360,
        },
      },
    });

    expect(result.title).toContain('08.08');
    expect(result.bodyText).toContain('Доброе утро, Илья');
    expect(result.bodyText).toContain('Записей: 7');
    expect(result.bodyText).toContain('Совет MAYA');
    expect(result.payload.kind).toBe('master_morning_brief');
  });

  it('builds an evening cash/card report', () => {
    const result = composeDailyReport({
      localDate: '2026-08-07',
      overview: { appointments: { active: 19 } },
      finance: {
        revenue: {
          total: { amount_kopecks: 4_150_000 },
          by_account: [
            { name: 'Наличные', is_cash: true, amount_kopecks: 1_690_000 },
            { name: 'Карта', is_cash: false, amount_kopecks: 2_460_000 },
          ],
        },
        payroll: {
          status: 'available',
          accrued_total: { amount_kopecks: 1_538_000 },
          staff: [
            { name: 'Илья', accrued: { amount_kopecks: 1_248_000 } },
            { name: 'Алексей', accrued: { amount_kopecks: 290_000 } },
          ],
        },
      },
    });
    expect(result.title).toBe('Отчёт за 07.08');
    expect(result.bodyText).toContain('Наличные');
    expect(result.bodyText).toContain('Карта');
    expect(result.bodyText).toContain('Илья');
    expect(result.payload.revenue_total_kopecks).toBe(4_150_000);
  });
});
