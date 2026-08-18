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

describe('🔴 Cycle 04 P0 — сводки признаются в неполноте источника', () => {
  const overview = (status?: 'complete' | 'incomplete') => ({
    appointments: {
      total: 3,
      active: 3,
      scheduled: 3,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      booked_minutes: 180,
    },
    ...(status
      ? { completeness: { appointments: { status, reason: null } } }
      : {}),
  });

  it('полный источник: ноль отмен остаётся нулём и лишних слов нет', () => {
    const brief = composeMorningBrief({
      localDate: '2026-08-18',
      overview: overview('complete'),
    });

    expect(brief.bodyText).toContain('отменено 0');
    expect(brief.bodyText).not.toMatch(/не целиком/);
    expect(brief.payload.appointments_source_complete).toBe(true);
  });

  it('🔴 усечённый источник: «отменено 0» больше не выдаётся за измерение', () => {
    const brief = composeMorningBrief({
      localDate: '2026-08-18',
      overview: overview('incomplete'),
    });

    expect(brief.bodyText).toMatch(/прочитан НЕ целиком/);
    expect(brief.bodyText).toMatch(/не измерено/);
    expect(brief.payload.appointments_source_complete).toBe(false);
  });

  it('🔴 то же и в вечернем отчёте, и в брифе мастера', () => {
    const daily = composeDailyReport({
      localDate: '2026-08-18',
      overview: overview('incomplete'),
      finance: null,
    });
    const master = composeMasterMorningBrief({
      localDate: '2026-08-18',
      overview: overview('incomplete'),
      masterName: 'Илья',
    });

    expect(daily.bodyText).toMatch(/прочитан НЕ целиком/);
    expect(master.bodyText).toMatch(/прочитан НЕ целиком/);
    expect(daily.payload.appointments_source_complete).toBe(false);
    expect(master.payload.appointments_source_complete).toBe(false);
  });

  it('источник без блока полноты считается полным — старые вызовы не ломаются', () => {
    const brief = composeMorningBrief({
      localDate: '2026-08-18',
      overview: overview(),
    });

    expect(brief.payload.appointments_source_complete).toBe(true);
    expect(brief.bodyText).not.toMatch(/не целиком/);
  });
});
