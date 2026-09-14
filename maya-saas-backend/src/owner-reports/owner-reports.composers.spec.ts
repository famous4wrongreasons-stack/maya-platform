import {
  composeDailyReport,
  composeMasterMorningBrief,
  composeMorningBrief,
} from './owner-reports.composers';
import type { BriefFacts, MasterBriefFacts } from './owner-reports.facts';

/**
 * Факты собираются вручную: композитор — чистая функция над уже посчитанным.
 * Проверка того, что эти факты правильно ДОСТАЮТСЯ из канонического состояния,
 * живёт отдельно, в `owner-reports.migration.spec.ts`.
 */
const facts = (overrides: Partial<BriefFacts> = {}): BriefFacts => ({
  localDate: '2026-08-08',
  source: 'crm',
  sourceComplete: true,
  incompleteReason: null,
  counts: {
    total: 14,
    scheduled: 10,
    completed: 3,
    cancelled: 1,
    bookedMinutes: 420,
  },
  attendance: {
    arrived: null,
    noShow: null,
    measured: false,
    unavailableReason: null,
  },
  bookedValue: {
    amountKopecks: 3_510_000,
    averageKopecks: 250_000,
    basis: 'booked_prices',
    unavailableReason: null,
  },
  revenue: {
    amountKopecks: null,
    basis: 'unavailable',
    cashKopecks: null,
    cashlessKopecks: null,
    unclassifiedKopecks: null,
  },
  payroll: { status: null, accruedTotalKopecks: null, rows: [] },
  staff: [
    { name: 'Александр', appointments: 1, bookedMinutes: 60 },
    { name: 'Стас', appointments: 0, bookedMinutes: 0 },
    { name: 'Илья', appointments: 5, bookedMinutes: 300 },
  ],
  ...overrides,
});

const masterFacts = (
  overrides: Partial<MasterBriefFacts> = {},
): MasterBriefFacts => ({
  localDate: '2026-08-08',
  masterName: 'Илья',
  presence: 'in_period',
  sourceComplete: true,
  incompleteReason: null,
  counts: {
    total: 7,
    scheduled: 5,
    completed: 1,
    cancelled: 1,
    bookedMinutes: 360,
  },
  attendance: { noShow: null, measured: false, unavailableReason: null },
  ...overrides,
});

describe('owner-reports composers', () => {
  it('builds a morning brief with booked load', () => {
    const result = composeMorningBrief({ facts: facts() });

    expect(result.title).toContain('08.08');
    expect(result.bodyText).toContain('14 записей');
    expect(result.bodyText).toContain('Недозагружены');
    expect(result.payload.booked).toBe(14);
  });

  it('builds a private morning plan for a linked master', () => {
    const result = composeMasterMorningBrief({ facts: masterFacts() });

    expect(result.title).toContain('08.08');
    expect(result.bodyText).toContain('Доброе утро, Илья');
    expect(result.bodyText).toContain('Записей: 7');
    expect(result.bodyText).toContain('Совет MAYA');
    expect(result.payload.kind).toBe('master_morning_brief');
  });

  it('builds an evening cash/card report', () => {
    const result = composeDailyReport({
      facts: facts({
        localDate: '2026-08-07',
        counts: {
          total: 19,
          scheduled: 4,
          completed: 15,
          cancelled: 0,
          bookedMinutes: 900,
        },
        revenue: {
          amountKopecks: 4_150_000,
          basis: 'provider_transactions',
          cashKopecks: 1_690_000,
          cashlessKopecks: 2_460_000,
          unclassifiedKopecks: 0,
        },
        payroll: {
          status: 'available',
          accruedTotalKopecks: 1_538_000,
          rows: [
            { name: 'Илья', accruedKopecks: 1_248_000, measured: true },
            { name: 'Алексей', accruedKopecks: 290_000, measured: true },
          ],
        },
      }),
    });

    expect(result.title).toBe('Отчёт за 07.08');
    expect(result.bodyText).toContain('Наличные');
    expect(result.bodyText).toContain('Карта');
    expect(result.bodyText).toContain('Илья');
    expect(result.payload.revenue_total_kopecks).toBe(4_150_000);
  });
});

describe('🔴 Cycle 04 P0 — сводки признаются в неполноте источника', () => {
  const truncated = {
    sourceComplete: false,
    incompleteReason: 'source_read_truncated',
  };

  it('полный источник: ноль отмен остаётся нулём и лишних слов нет', () => {
    const brief = composeMorningBrief({
      facts: facts({
        localDate: '2026-08-18',
        counts: {
          total: 3,
          scheduled: 3,
          completed: 0,
          cancelled: 0,
          bookedMinutes: 180,
        },
      }),
    });

    expect(brief.bodyText).toContain('отменено 0');
    expect(brief.bodyText).not.toMatch(/не целиком/);
    expect(brief.payload.appointments_source_complete).toBe(true);
  });

  it('🔴 усечённый источник: «отменено 0» больше не выдаётся за измерение', () => {
    const brief = composeMorningBrief({
      facts: facts({
        localDate: '2026-08-18',
        ...truncated,
        counts: {
          total: 3,
          scheduled: 3,
          completed: 0,
          cancelled: 0,
          bookedMinutes: 180,
        },
      }),
    });

    expect(brief.bodyText).toMatch(/прочитан НЕ целиком/);
    expect(brief.payload.appointments_source_complete).toBe(false);
    expect(brief.payload.appointments_incomplete_reason).toBe(
      'source_read_truncated',
    );
  });

  it('🔴 то же и в вечернем отчёте, и в брифе мастера', () => {
    const daily = composeDailyReport({
      facts: facts({ localDate: '2026-08-18', ...truncated }),
    });
    const master = composeMasterMorningBrief({
      facts: masterFacts({ localDate: '2026-08-18', ...truncated }),
    });

    expect(daily.bodyText).toMatch(/прочитан НЕ целиком/);
    expect(master.bodyText).toMatch(/прочитан НЕ целиком/);
    expect(daily.payload.appointments_source_complete).toBe(false);
    expect(master.payload.appointments_source_complete).toBe(false);
  });

  it('🔴 неизмеренное число называется словами, а не печатается нулём', () => {
    const brief = composeMorningBrief({
      facts: facts({
        ...truncated,
        counts: {
          total: null,
          scheduled: null,
          completed: null,
          cancelled: null,
          bookedMinutes: null,
        },
      }),
    });

    expect(brief.bodyText).toMatch(/не измерено/);
    expect(brief.bodyText).not.toMatch(/отменено 0/);
    expect(brief.payload.booked).toBeNull();
    expect(brief.payload.cancelled).toBeNull();
  });
});
