import { C9Agents } from './c9.agents';
import { C9Orchestrator } from './c9.orchestrator';
import { C9Object, c9Hash } from './c9.contract';
import {
  biReportStatement,
  isExplicitFinancialReportRequest,
  parseExplicitFinancialReportRequest,
  financialReportMonthMatches,
} from './c9.bi-presentation';

const metric = (
  key = 'observed_booked_value',
  currency: string | null = 'RUB',
  value: string | null = '12345',
) => ({
  key,
  dimensions: {},
  unit: 'money_minor',
  basis: 'observed_booked',
  currency,
  state: 'PARTIAL',
  value,
});
function fact(): C9Object {
  return {
    capability: 'c7.measurement.read',
    evidenceHandle: 'h_' + 'a'.repeat(64),
    sourceContract: 'c7.measurement.read/1',
    mode: 'as_reported',
    revision: 2,
    kind: 'business_period',
    asOf: '2035-05-10T08:00:00.000Z',
    period: {
      from: '2035-05-01T00:00:00.000Z',
      toExclusive: '2035-05-10T08:00:00.000Z',
      timezone: 'UTC',
    },
    rule: { key: 'c7.business-period', version: 1 },
    completeness: 'PARTIAL',
    qualification: 'VERIFIED',
    attribution: 'NOT_APPLICABLE',
    metrics: [metric()],
    limitations: ['cash_unavailable'],
  };
}
function fixture() {
  const turn = {
    turn: { turnId: 'turn', conversationId: 'conversation' },
    intentHash: 'b'.repeat(64),
  };
  const root = { id: 'run', state: 'DRAFT' };
  const refs = [{ id: 'source' }];
  const projection = {
    contract: 'C9Context@1',
    trusted: { domain: 'BUSINESS_INTELLIGENCE', scopeHash: 'c'.repeat(64) },
    facts: [fact()],
  };
  const receipt: { id: string; state: string; resultJson: unknown } = {
    id: 'work',
    state: 'RESERVED',
    resultJson: null,
  };
  const store = { conversationReadRun: jest.fn().mockResolvedValue(root) };
  const bi = {
    select: jest.fn().mockResolvedValue(refs),
    authorize: jest.fn().mockResolvedValue({}),
  };
  const context = {
    build: jest.fn().mockImplementation(() =>
      Promise.resolve({
        context: projection,
        handles: {
          keys: () =>
            new Set(projection.facts.map((f) => String(f.evidenceHandle))),
        },
      }),
    ),
  };
  const lease = { runId: 'run', workId: 'work', generation: 1, token: 'token' };
  const work = {
    reserve: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...receipt })),
    claim: jest.fn().mockResolvedValue(lease),
    hold: jest.fn().mockResolvedValue(undefined),
    settle: jest.fn().mockImplementation((_: unknown, result: unknown) => {
      receipt.state = 'SETTLED';
      receipt.resultJson = result;
      return Promise.resolve({ ...receipt });
    }),
  };
  const create = () =>
    new C9Orchestrator(
      store as never,
      context as never,
      work as never,
      new C9Agents(),
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      bi as never,
    );
  return {
    turn,
    root,
    refs,
    projection,
    receipt,
    store,
    bi,
    context,
    work,
    create,
  };
}

describe('explicit BI published snapshot explanation', () => {
  const month = { kind: 'calendar_month', year: 2035, month: 5 } as const;
  it.each([
    ['Покажи опубликованные показатели за октябрь 2026 года.', 2026, 10],
    ['Объясни опубликованный финансовый отчёт за май 2035!', 2035, 5],
    ['Покажи опубликованные показатели за декабрь 2034 года', 2034, 12],
  ])(
    'parses an explicit published month without clock inference: %s',
    (text, year, selected) => {
      expect(parseExplicitFinancialReportRequest(String(text))).toEqual({
        kind: 'calendar_month',
        year,
        month: selected,
      });
    },
  );
  it.each([
    'Покажи показатели за октябрь 2026 года',
    'Покажи опубликованные показатели за октябрь',
    'Покажи опубликованные показатели за октябрь 2026 года филиала Центр',
    'Покажи опубликованные показатели за октябрь 2026 года и отправь всем',
    'Каждый месяц покажи опубликованные показатели за октябрь 2026 года',
    'Покажи опубликованные показатели за октябрь 2026 и сентябрь 2026',
    'Покажи опубликованные показатели за 13 2026 года',
  ])(
    'does not turn another scope into an explicit whole-tenant snapshot: %s',
    (text) => {
      expect(parseExplicitFinancialReportRequest(text)).toBeNull();
    },
  );
  it.each([
    ['UTC', '2035-05-01T00:00:00.000Z', '2035-06-01T00:00:00.000Z', true],
    [
      'Asia/Novosibirsk',
      '2035-04-30T17:00:00.000Z',
      '2035-05-31T17:00:00.000Z',
      true,
    ],
    [
      'Asia/Novosibirsk',
      '2035-05-01T00:00:00.000Z',
      '2035-06-01T00:00:00.000Z',
      false,
    ],
    ['UTC', '2035-05-01T00:00:00.001Z', '2035-06-01T00:00:00.000Z', false],
    ['UTC', '2035-05-01T00:00:00.000Z', '2035-05-10T00:00:00.000Z', false],
    [
      'bad-timezone',
      '2035-05-01T00:00:00.000Z',
      '2035-06-01T00:00:00.000Z',
      null,
    ],
    ['UTC', '2035-04-31T00:00:00.000Z', '2035-06-01T00:00:00.000Z', null],
  ])(
    'matches exact source month in %s at %s',
    (timezone, from, toExclusive, expected) => {
      expect(
        financialReportMonthMatches({ timezone, from, toExclusive }, month),
      ).toBe(expected);
    },
  );
  it('handles a DST offset change and the calendar year rollover', () => {
    expect(
      financialReportMonthMatches(
        {
          timezone: 'Europe/Berlin',
          from: '2026-03-01T23:00:00Z',
          toExclusive: '2026-03-31T22:00:00Z',
        },
        { kind: 'calendar_month', year: 2026, month: 3 },
      ),
    ).toBe(false);
    expect(
      financialReportMonthMatches(
        {
          timezone: 'Europe/Berlin',
          from: '2026-02-28T23:00:00Z',
          toExclusive: '2026-03-31T22:00:00Z',
        },
        { kind: 'calendar_month', year: 2026, month: 3 },
      ),
    ).toBe(true);
    expect(
      financialReportMonthMatches(
        {
          timezone: 'UTC',
          from: '2034-12-01T00:00:00Z',
          toExclusive: '2035-01-01T00:00:00Z',
        },
        { kind: 'calendar_month', year: 2034, month: 12 },
      ),
    ).toBe(true);
  });
  it('binds and presents the requested month through the same persisted C7 snapshot and source timezone', async () => {
    const f = fixture();
    f.projection.facts[0].period = {
      from: '2035-05-01T00:00:00Z',
      toExclusive: '2035-06-01T00:00:00Z',
      timezone: 'UTC',
    };
    const first = await f.create().explainFinancialReport(f.turn, month);
    const replay = await f.create().explainFinancialReport(f.turn, month);
    expect(f.bi.select).toHaveBeenCalledWith('run', month);
    expect(first.reply).toContain('за май 2035 года');
    expect(first.reply).toContain('часовом поясе источника');
    expect(first.reply).toContain('123,45');
    expect(first.analysis).toMatchObject({
      requestedPeriod: month,
      mode: 'as_reported',
      noSideEffects: true,
    });
    expect(replay.coordination.replayed).toBe(true);
    expect(f.work.claim).toHaveBeenCalledTimes(1);
    expect(f.work.reserve).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        inputHash: c9Hash('bi-report-request/1', [f.turn.intentHash, month]),
      }),
    );
    expect(f.receipt.resultJson).toMatchObject({
      requestedPeriod: month,
      sourceDigest: c9Hash('bi-report-source/1', [f.refs, month]),
    });
    await expect(
      f.create().explainFinancialReport(f.turn, { ...month, month: 6 }),
    ).rejects.toThrow('c9_source_read_receipt');
    expect(f.work.claim).toHaveBeenCalledTimes(1);
  });
  it('refuses a same-reference snapshot whose period does not match, before settlement or exposure', async () => {
    const f = fixture();
    await expect(
      f.create().explainFinancialReport(f.turn, month),
    ).rejects.toThrow('c9_source_read_receipt');
    expect(f.work.settle).not.toHaveBeenCalled();
    expect(f.work.hold).toHaveBeenCalledTimes(1);
  });
  it('rechecks exact period on replay and does not substitute an available different period', async () => {
    const f = fixture();
    f.projection.facts[0].period = {
      from: '2035-05-01T00:00:00Z',
      toExclusive: '2035-06-01T00:00:00Z',
      timezone: 'UTC',
    };
    await f.create().explainFinancialReport(f.turn, month);
    f.projection.facts[0].period = {
      from: '2035-06-01T00:00:00Z',
      toExclusive: '2035-07-01T00:00:00Z',
      timezone: 'UTC',
    };
    await expect(
      f.create().explainFinancialReport(f.turn, month),
    ).rejects.toThrow('c9_source_read_receipt');
    expect(f.work.claim).toHaveBeenCalledTimes(1);
  });
  it('preserves a missing-month receipt and names the requested period without zero financial claims', async () => {
    const f = fixture();
    f.projection.facts = [];
    f.bi.select.mockResolvedValue([]);
    const result = await f.create().explainFinancialReport(f.turn, month);
    expect(result.reply).toContain('за май 2035 года');
    expect(result.reply).toContain('не означает нулевую выручку');
    expect(result.analysis).toMatchObject({
      outcome: 'UNAVAILABLE',
      requestedPeriod: month,
    });
    expect(f.receipt.resultJson).toMatchObject({
      requestedPeriod: month,
      sourceCount: 0,
    });
  });
  it.each([
    'Объясни последний опубликованный финансовый отчёт',
    'Покажи последний опубликованный финансовый отчет!',
  ])('admits only exact explicit command: %s', (text) =>
    expect(isExplicitFinancialReportRequest(text)).toBe(true),
  );
  it.each([
    'Каждый день покажи последний опубликованный финансовый отчёт',
    'Объясни последний опубликованный финансовый отчёт и отправь всем',
    'Объясни последний опубликованный финансовый отчёт филиала',
    'Почему просела выручка?',
    'Объясни текущий финансовый отчёт',
  ])('does not broaden this narrow entry: %s', (text) =>
    expect(isExplicitFinancialReportRequest(text)).toBe(false),
  );
  it('explains exact C7 money, date, period and missingness without proposals, new arithmetic or causal claims', async () => {
    const f = fixture();
    const r = await f.create().explainFinancialReport(f.turn);
    expect(r.reply).toContain('123,45');
    expect(r.reply).toContain('Стоимость записанных услуг');
    expect(r.reply).toContain('01.05.2035, 00:00');
    expect(r.reply).toContain('конец не включён; UTC');
    expect(r.reply).toContain('\n\n');
    expect(r.reply).toContain('Чистую прибыль не подтверждаю');
    expect(r.reply).toContain('Причина изменения выручки не установлена');
    expect(r.analysis).toMatchObject({
      mode: 'as_reported',
      outcome: 'PARTIAL',
      executionAuthority: false,
      agent: { agent_id: 'BUSINESS_INTELLIGENCE', proposed_action_intents: [] },
    });
    expect(r.coordination.current).toBe(false);
    expect(f.work.reserve).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        evidenceRefs: f.refs,
        reservation: expect.objectContaining({
          modelCalls: 0,
          costMicros: '0',
          zeroCostEvidenceRef: 'local:c7.measurement.read:no-provider-charge',
        }) as unknown,
      }),
    );
    expect(f.receipt.resultJson).toEqual({
      contract: 'maya.c9-bi-report-receipt/1',
      sourceDigest: c9Hash('bi-report-source/1', [f.refs]),
      mode: 'as_reported',
      sourceCount: 1,
    });
    expect(JSON.stringify(f.receipt.resultJson)).not.toContain('12345');
  });
  it('new orchestrator instance reads the same receipt without redispatch and reauthorizes before exposure', async () => {
    const f = fixture();
    await f.create().explainFinancialReport(f.turn);
    const r = await f.create().explainFinancialReport(f.turn);
    expect(r.coordination.replayed).toBe(true);
    expect(f.work.claim).toHaveBeenCalledTimes(1);
    expect(f.work.settle).toHaveBeenCalledTimes(1);
    expect(f.bi.authorize).toHaveBeenCalledTimes(2);
    expect(f.context.build).toHaveBeenCalledTimes(3);
    expect(r.reply).toContain('новая версия не выбиралась');
  });
  it.each(['DISPATCHED', 'HELD_UNKNOWN', 'CANCELLED'])(
    'does not retry %s work',
    async (state) => {
      const f = fixture();
      f.receipt.state = state;
      await expect(f.create().explainFinancialReport(f.turn)).rejects.toThrow(
        'c9_read_work_in_progress_or_unknown',
      );
      expect(f.work.claim).not.toHaveBeenCalled();
      expect(f.context.build).not.toHaveBeenCalled();
    },
  );
  it.each(['source_expired', 'source_missing', 'source_reader_authority'])(
    'never substitutes a saved snapshot on %s',
    async (reason) => {
      const f = fixture();
      await f.create().explainFinancialReport(f.turn);
      f.context.build.mockRejectedValue(new Error(reason));
      await expect(f.create().explainFinancialReport(f.turn)).rejects.toThrow(
        reason,
      );
      expect(f.work.claim).toHaveBeenCalledTimes(1);
    },
  );
  it('current permission revocation after settlement denies the response', async () => {
    const f = fixture();
    f.bi.authorize.mockRejectedValue(new Error('revoked'));
    await expect(f.create().explainFinancialReport(f.turn)).rejects.toThrow(
      'revoked',
    );
    expect(f.work.settle).toHaveBeenCalledTimes(1);
  });
  it('a read failure is held once without redispatch', async () => {
    const f = fixture();
    f.context.build.mockRejectedValue(new Error('unavailable'));
    await expect(f.create().explainFinancialReport(f.turn)).rejects.toThrow(
      'unavailable',
    );
    expect(f.work.hold).toHaveBeenCalledTimes(1);
    expect(f.work.settle).not.toHaveBeenCalled();
  });
  it('empty selection stays unavailable, never zero revenue', async () => {
    const f = fixture();
    f.projection.facts = [];
    f.bi.select.mockResolvedValue([]);
    const r = await f.create().explainFinancialReport(f.turn);
    expect(r.analysis.outcome).toBe('UNAVAILABLE');
    expect(r.reply).toContain('не означает нулевую выручку');
  });
  it('keeps mandatory qualifiers and a guaranteed display marker with many currencies and 20 source reasons', async () => {
    const f = fixture();
    const report = f.projection.facts[0];
    report.metrics = [
      'RUB',
      'USD',
      'EUR',
      'GBP',
      'CHF',
      'JPY',
      'CNY',
      'AUD',
    ].flatMap((currency) => [
      metric('observed_booked_value', currency, '12345'),
      metric('observed_expenses', currency, '10000'),
      metric('confirmed_cash', currency, null),
      metric('confirmed_refunds', currency, null),
      metric('net_profit', currency, null),
    ]);
    report.limitations = Array.from(
      { length: 20 },
      (_, i) => 'source_reason_' + i,
    );
    const r = await f.create().explainFinancialReport(f.turn);
    const findings = r.analysis.agent.findings as C9Object[];
    expect(findings).toHaveLength(1);
    expect(String(findings[0].statement).length).toBeLessThanOrEqual(800);
    expect(r.reply).toContain('Данные на 10.05.2035, 08:00 (UTC)');
    expect(r.reply).toContain('Данные неполные');
    expect(r.reply).toContain('Чистую прибыль не подтверждаю');
    expect(r.reply).toContain('без пересчёта текущего состояния');
    expect(r.reply).toContain('Причина изменения выручки не установлена');
    expect(r.reply).toContain('Показана часть показателей');
    expect(r.analysis.agent.limitations).toContain('financial_display_bound');
  });
  it('formats source period in its timezone while retaining the exact asOf in evidence', async () => {
    const f = fixture();
    const source = f.projection.facts[0];
    source.period = {
      from: '2035-04-30T21:00:00.000Z',
      toExclusive: '2035-05-09T21:00:00.000Z',
      timezone: 'Europe/Moscow',
    };
    const r = await f.create().explainFinancialReport(f.turn);
    expect(r.reply).toContain(
      '01.05.2035, 00:00 GMT+3 — 10.05.2035, 00:00 GMT+3',
    );
    expect(r.reply).toContain('Europe/Moscow');
    expect(r.analysis.agent.facts_used).toEqual([
      expect.objectContaining({ as_of: source.asOf }),
    ]);
  });
  it('empty replay reports only the stored search result, never a fabricated snapshot or link', async () => {
    const f = fixture();
    f.projection.facts = [];
    f.bi.select.mockResolvedValue([]);
    const first = await f.create().explainFinancialReport(f.turn);
    const replay = await f.create().explainFinancialReport(f.turn);
    expect(first.reply).toContain('Проверено наличие');
    expect(replay.reply).toContain('новый поиск не выполнялся');
    for (const r of [first, replay]) {
      expect(r.reply).not.toContain('ссылка на источник');
      expect(r.reply).not.toContain('Проверен последний доступный');
      expect(r.reply).not.toContain(
        'Повторно открыт тот же опубликованный снимок',
      );
      expect(r.reply).toContain('без найденного снимка');
    }
  });
  it('rejects changed receipt evidence rather than accepting new financial values', async () => {
    const f = fixture();
    await f.create().explainFinancialReport(f.turn);
    f.receipt.resultJson = {
      contract: 'maya.c9-bi-report-receipt/1',
      sourceDigest: 'different',
    };
    await expect(f.create().explainFinancialReport(f.turn)).rejects.toThrow(
      'c9_source_read_receipt',
    );
  });
  it.each([null, '', 'not-money'])(
    'missing or malformed amount %s is not zero',
    (value) => {
      const f = fact();
      f.metrics = [metric('confirmed_cash', 'RUB', value)];
      expect(biReportStatement(f)).toContain(
        'Подтверждённые поступления: не измерено',
      );
    },
  );
  it('keeps currencies separate and refuses unqualified live payloads', () => {
    const f = fact();
    f.metrics = [
      metric('observed_booked_value', 'RUB', '10000'),
      metric('observed_booked_value', 'USD', '20000'),
    ];
    const statement = biReportStatement(f);
    expect(statement).toContain('100,00');
    expect(statement).toContain('200,00');
    expect(statement).not.toContain('300,00');
    f.metrics = [metric('confirmed_cash', null, '10000')];
    expect(biReportStatement(f)).toContain('не измерено');
    f.mode = 'live';
    expect(biReportStatement(f)).not.toContain('100,00');
  });
});
