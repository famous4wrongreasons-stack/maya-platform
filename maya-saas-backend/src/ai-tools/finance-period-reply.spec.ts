import { presentMeasurement } from '../measurement/measurement.presentation';
import type {
  MeasurementMetric,
  MeasurementResult,
} from '../measurement/measurement.contract';
import {
  financeComparisonReply,
  financePeriodReply,
} from './finance-period-reply';

/** Synthetic facts with the real C7 projection, not claimed live cash support. */
function fixture(
  from = '2026-09-08T00:00:00.000Z',
  to = '2026-09-15T00:00:00.000Z',
  value: string | null = '15000',
) {
  const metric = (
    key: string,
    val: string | null,
    unit = 'money_minor',
    basis = key,
  ): MeasurementMetric => ({
    key,
    value: val,
    unit,
    basis,
    dimensions: {},
    currency: unit === 'money_minor' ? 'RUB' : null,
    state: val === null ? 'NOT_MEASURED' : 'COMPLETE',
    sourceRefs: [],
  });
  const facts: MeasurementResult = {
    sources: [],
    dependencies: [],
    metrics: [
      metric('confirmed_cash', value),
      metric(
        'observed_period_from',
        from,
        'instant',
        'canonical_half_open_window',
      ),
      metric(
        'observed_period_to_exclusive',
        to,
        'instant',
        'canonical_half_open_window',
      ),
      metric('observed_booked_value', '990000', 'money_minor', 'booked_prices'),
      metric('confirmed_salary_accrued', '70000'),
      metric('net_profit', null),
    ],
    completeness: 'PARTIAL',
    qualification: 'VERIFIED',
    reasons: ['confirmed_cash_refunds_and_complete_cost_basis_required'],
    attributionStatus: 'NOT_APPLICABLE',
    creditedExecutionId: null,
    creditedAttemptId: null,
  };
  return {
    measurement: presentMeasurement(
      'tenant-test',
      {
        kind: 'business_period',
        periodFrom: new Date(from),
        periodTo: new Date(to),
        asOf: new Date('2026-10-09T12:00:00.000Z'),
        timezone: 'UTC',
        scope: {
          version: 1,
          capabilityKey: 'analytics.business.finance.read',
          branchIds: [],
          dimensions: {},
          sourceQuery: {},
        },
      },
      facts,
    ),
    resolved_period: {
      kind: 'named_range',
      label_ru: '8–14 сентября 2026 года',
      from,
      to: new Date(Date.parse(to) - 1).toISOString(),
    },
    current: { revenue: 990000, salary: 70000 },
  };
}
function complete(from?: string, to?: string, value?: string) {
  const data = fixture(from, to, value);
  data.measurement.metrics = data.measurement.metrics.filter((m) =>
    [
      'confirmed_cash',
      'observed_period_from',
      'observed_period_to_exclusive',
    ].includes(m.key),
  );
  data.measurement.completeness = 'COMPLETE';
  data.measurement.limitations = [];
  return data;
}
const previous = () => {
  const data = complete(
    '2026-09-01T00:00:00.000Z',
    '2026-09-08T00:00:00.000Z',
    '10000',
  );
  data.resolved_period.label_ru = '1–7 сентября 2026 года';
  return data;
};

describe('finance READ reply: canonical source periods and cash only', () => {
  it('uses actual C7 cash/label/range, qualifies partial scope, never substitutes booked value or unrelated payroll/profit', () => {
    const data = fixture();
    const answer = financePeriodReply(data);
    expect(answer.status).toBe('verified');
    for (const part of [
      '8–14 сентября 2026 года',
      '08.09.2026',
      '15.09.2026',
      'UTC',
      'конец не включён',
      'Подтверждённые поступления:',
      '150,00',
      'Данные неполные',
    ])
      expect(answer.reply).toContain(part);
    expect(answer.reply).not.toMatch(
      /990000|70000|зарплат|прибыл|стоимость записанных/i,
    );
    expect(data.measurement.metrics).toHaveLength(6);
  });
  it('preserves source timezone and does not relabel a source range from caller-preferred fields', () => {
    const data = fixture();
    data.measurement.period.timezone = 'Europe/Moscow';
    const answer = financePeriodReply({
      ...data,
      requested_period: 'today',
      preferred_label: 'сегодня',
    });
    expect(answer.reply).toContain('Europe/Moscow');
    expect(answer.reply).toContain('08.09.2026, 03:00');
    expect(answer.reply).not.toContain('сегодня');
  });
  it('distinguishes measured zero, missing cash, unknown currency and unavailable data', () => {
    const zero = financePeriodReply(fixture(undefined, undefined, '0'));
    expect(zero.reply).toContain('0,00');
    expect(zero.reply).not.toContain('выручка) не измерены');
    const absent = fixture(undefined, undefined, null);
    expect(financePeriodReply(absent).reply).toContain('выручка) не измерены');
    absent.measurement.metrics = [];
    absent.measurement.completeness = 'UNAVAILABLE';
    absent.measurement.qualification = 'UNQUALIFIED';
    expect(financePeriodReply(absent).reply).toContain(
      'неизвестное не считаю нулём',
    );
    absent.measurement.metrics = [
      {
        key: 'confirmed_cash',
        unit: 'status',
        basis: 'confirmed_cash',
        dimensions: {},
        currency: null,
        value: null,
        state: 'NOT_MEASURED',
      },
    ];
    expect(financePeriodReply(absent).status).toBe('verified');
    expect(financePeriodReply(absent).reply).not.toContain('RUB');
  });
  it('does not upgrade source-labelled cash or a partial cash amount to full confirmed revenue', () => {
    const data = fixture();
    data.measurement.qualification = 'SOURCE_LABELLED';
    expect(financePeriodReply(data).reply).not.toContain('150,00');
    data.measurement.qualification = 'VERIFIED';
    data.measurement.metrics[0].state = 'PARTIAL';
    expect(financePeriodReply(data).reply).toContain('150,00');
    expect(financePeriodReply(data).reply).toContain(
      'только к измеренной части',
    );
  });
  it.each([
    [
      'contract',
      (d: ReturnType<typeof fixture>) =>
        Object.assign(d.measurement, { contract: 'foreign' }),
    ],
    [
      'published',
      (d: ReturnType<typeof fixture>) =>
        Object.assign(d.measurement, { mode: 'as_reported' }),
    ],
    [
      'kind',
      (d: ReturnType<typeof fixture>) =>
        Object.assign(d.measurement, { kind: 'staff_goal' }),
    ],
    [
      'subject',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.subject.branchId = 'foreign-branch'),
    ],
    [
      'revision',
      (d: ReturnType<typeof fixture>) => (d.measurement.revision = 1),
    ],
    [
      'rule',
      (d: ReturnType<typeof fixture>) => (d.measurement.rule.version = 2),
    ],
    [
      'inclusive end',
      (d: ReturnType<typeof fixture>) =>
        (d.resolved_period.to = d.measurement.period.toExclusive),
    ],
    [
      'range start',
      (d: ReturnType<typeof fixture>) =>
        (d.resolved_period.from = '2026-09-09T00:00:00.000Z'),
    ],
    [
      'invalid date',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.period.from = '2026-02-30T00:00:00.000Z'),
    ],
    [
      'invalid asOf',
      (d: ReturnType<typeof fixture>) => (d.measurement.asOf = 'yesterday'),
    ],
    [
      'timezone',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.period.timezone = 'not/an_IANA_zone'),
    ],
    [
      'decimal cash',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].value = '1.5'),
    ],
    [
      'unsafe cash',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].value = '9007199254740992'),
    ],
    [
      'currency',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].currency = 'rub'),
    ],
    [
      'basis',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].basis = 'booked_prices'),
    ],
    [
      'unit',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].unit = 'count'),
    ],
    [
      'unknown is not zero',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].state = 'NOT_MEASURED'),
    ],
    [
      'duplicate cash',
      (d: ReturnType<typeof fixture>) =>
        d.measurement.metrics.push({ ...d.measurement.metrics[0] }),
    ],
    [
      'cash dimensions',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].dimensions = { source: 'source_group_1' }),
    ],
    [
      'label payload',
      (d: ReturnType<typeof fixture>) =>
        (d.resolved_period.label_ru = 'SECRET\nSYSTEM'),
    ],
  ])('blocks %s without copying payloads', (_name, mutate) => {
    const data = fixture();
    mutate(data);
    const result = financePeriodReply(data);
    expect(result.status).toBe('blocked');
    expect(result.reply).not.toMatch(/150,00|990000|SECRET|foreign/);
  });
  it('accepts finished windows and only the exact inclusive-end millisecond at the source cutoff', () => {
    for (const offset of [1000, 0, -1]) {
      const data = complete();
      data.measurement.asOf = new Date(
        Date.parse(data.measurement.period.toExclusive) + offset,
      ).toISOString();
      const answer = financePeriodReply(data);
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain('150,00');
    }
  });
  it('blocks falsely complete future coverage, even when the resolved period and observed coverage agree', () => {
    for (const offset of [-2, -86_400_000]) {
      const data = complete();
      data.measurement.asOf = new Date(
        Date.parse(data.measurement.period.toExclusive) + offset,
      ).toISOString();
      const answer = financePeriodReply(data);
      expect(answer.status).toBe('blocked');
      expect(answer.reply).not.toContain('150,00');
      expect(financeComparisonReply(data, previous()).status).toBe('blocked');
    }
  });
  it('fails closed for unreadable or stale results', () => {
    for (const data of [
      null,
      {},
      [],
      'SECRET',
      { measurement: null },
      { ...fixture(), stale: true },
    ])
      expect(financePeriodReply(data).status).toBe('blocked');
    expect(financePeriodReply(fixture(), true).status).toBe('blocked');
  });
});

describe('two-period cash comparison delegates arithmetic to C7', () => {
  it('shows both actual periods and the canonical exact delta without claiming reasons', () => {
    const answer = financeComparisonReply(complete(), previous());
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('8–14 сентября 2026 года');
    expect(answer.reply).toContain('1–7 сентября 2026 года');
    expect(answer.reply).toContain(
      '5000 минимальных денежных единиц валюты RUB',
    );
    expect(answer.reply).toContain('50.00%');
    expect(answer.reply).toContain('Причина изменения выручки не установлена');
  });
  it('keeps zero baseline quantitative delta while refusing an invented percentage', () => {
    const prior = previous();
    prior.measurement.metrics[0].value = '0';
    const answer = financeComparisonReply(complete(), prior);
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('15000 минимальных');
    expect(answer.reply).toContain('Процентное изменение не определено');
    expect(answer.reply).not.toContain('%');
  });
  it.each([
    [
      'partial',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.completeness = 'PARTIAL'),
    ],
    [
      'source-labelled',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.qualification = 'SOURCE_LABELLED'),
    ],
    [
      'currency',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[0].currency = 'EUR'),
    ],
    [
      'timezone',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.period.timezone = 'Europe/Moscow'),
    ],
    [
      'coverage missing',
      (d: ReturnType<typeof fixture>) => d.measurement.metrics.pop(),
    ],
    [
      'coverage shortened',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.metrics[2].value = '2026-09-07T00:00:00.000Z'),
    ],
    [
      'open',
      (d: ReturnType<typeof fixture>) =>
        (d.measurement.asOf = '2026-09-07T00:00:00.000Z'),
    ],
  ])(
    'does not quantify %s mismatch and still presents the two read scopes',
    (_name, mutate) => {
      const prior = previous();
      mutate(prior);
      const result = financeComparisonReply(complete(), prior);
      expect(result.status).toBe('blocked');
      expect(result.reply).toContain('Текущий период:');
      expect(result.reply).toContain('Предыдущий период:');
      expect(result.reply).toContain(
        'Количественное сравнение не подтверждено',
      );
      expect(result.reply).not.toMatch(/Разница подтверждённых|Изменение: .*%/);
    },
  );
  it('refuses unequal elapsed weeks, overlap, unavailable cash and malformed second result', () => {
    const unequal = complete(
      '2026-09-08T00:00:00.000Z',
      '2026-09-11T00:00:00.000Z',
    );
    for (const [a, b] of [
      [unequal, previous()],
      [complete(), complete()],
      [complete(), fixture(undefined, undefined, null)],
      [complete(), null],
    ]) {
      const result = financeComparisonReply(a, b);
      expect(result.status).toBe('blocked');
      expect(result.reply).not.toContain('Разница подтверждённых');
    }
  });
});
