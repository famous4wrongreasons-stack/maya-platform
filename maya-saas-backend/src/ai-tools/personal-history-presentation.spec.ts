import { personalHistoryReply } from './personal-history-presentation';

const item = (patch: Record<string, unknown> = {}) => ({
  id: 'PRIVATE_RECORD_ID',
  client_phone: '+12025550123',
  notes: 'PRIVATE_NOTE',
  start_at: '2026-10-01T22:30:00.000Z',
  is_upcoming: false,
  status: 'completed',
  attendance: 'arrived',
  branch: { name: 'Тестовый филиал', timezone: 'Europe/Moscow' },
  services: [{ name: 'Стрижка' }],
  ...patch,
});
const result = (rows: unknown[] = [item()]) => ({
  history_scope: {
    source: 'maya_canonical',
    enabled: true,
    coverage: 'last_synchronized',
  },
  appointments: rows,
});

describe('private history server presentation', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T12:00:00.000Z')),
  );
  afterEach(() => jest.useRealTimers());
  it('uses the visit branch timezone and exposes no identifiers, contacts or notes', () => {
    const answer = personalHistoryReply(result(), false, 'past');
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('02.10.2026, 01:30');
    expect(answer.reply).toContain('визит состоялся');
    expect(answer.reply).not.toMatch(/PRIVATE|12025550123/);
    expect(answer.reply).toContain('могут отсутствовать');
  });
  it('shows at most five latest saved records, not an all-time visit total', () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      item({
        start_at: `2026-10-0${index + 1}T12:00:00.000Z`,
        services: [{ name: `SERVICE_${index}` }],
      }),
    );
    const answer = personalHistoryReply(result(rows), false, 'past');
    expect(answer.reply).toContain('SERVICE_6');
    expect(answer.reply).toContain('SERVICE_2');
    expect(answer.reply).not.toMatch(/SERVICE_[01]/);
    expect(answer.reply.indexOf('SERVICE_6')).toBeLessThan(
      answer.reply.indexOf('SERVICE_5'),
    );
  });
  it.each([null, 'awaiting', 'confirmed_by_client', 'no_show'])(
    'completion without arrived evidence (%s) is not a last attended visit',
    (attendance) => {
      const answer = personalHistoryReply(
        result([
          item(),
          item({ start_at: '2026-10-10T10:00:00.000Z', attendance }),
          item({ start_at: '2099-01-01T10:00:00.000Z', is_upcoming: true }),
        ]),
        false,
        'last_visit',
      );
      expect(answer.status).toBe('verified');
      expect(answer.reply).toContain('02.10.2026');
      expect(answer.reply).not.toMatch(/10.10.2026|2099/);
    },
  );
  it.each(['canceled', 'no_show'])(
    'does not present a %s row as a last attended visit',
    (status) => {
      const answer = personalHistoryReply(
        result([item({ status })]),
        false,
        'last_visit',
      );
      expect(answer.reply).toContain('пока нет подтверждённых');
      expect(answer.reply).not.toContain('02.10.2026');
    },
  );
  it.each([
    [{ status: 'canceled' }, 'запись отменена'],
    [{ attendance: 'no_show' }, 'отмечена неявка'],
    [{ attendance: null }, 'посещение не подтверждено'],
  ])('keeps the literal recorded outcome %j', (patch, label) => {
    const answer = personalHistoryReply(result([item(patch)]), false, 'past');
    expect(answer.reply).toContain(label);
  });
  it('does not claim there were never any visits from an empty local history', () => {
    const answer = personalHistoryReply(result([]), false, 'past');
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('В сохранённой истории');
    expect(answer.reply).toContain('могут отсутствовать');
    expect(answer.reply).not.toMatch(/не были|никогда|0 визитов/);
  });
  it('refuses disabled history even if rows were supplied', () => {
    const data = result();
    data.history_scope.enabled = false;
    const answer = personalHistoryReply(data, false, 'past');
    expect(answer.status).toBe('blocked');
    expect(answer.reply).toContain('не открыл');
    expect(answer.reply).not.toContain('Стрижка');
  });
  it.each([
    {},
    { source: 'remote', enabled: true, coverage: 'last_synchronized' },
    { source: 'maya_canonical', coverage: 'last_synchronized' },
    {
      source: 'maya_canonical',
      enabled: 'true',
      coverage: 'last_synchronized',
    },
    { source: 'maya_canonical', enabled: true, coverage: 'complete' },
  ])(
    'refuses missing/foreign/unqualified history scope %j',
    (history_scope) => {
      expect(
        personalHistoryReply({ ...result(), history_scope }, false, 'past')
          .status,
      ).toBe('blocked');
    },
  );
  it.each([true, false])(
    'refuses stale outer or inner results (%s)',
    (outer) => {
      expect(
        personalHistoryReply({ ...result(), stale: !outer }, outer, 'past')
          .status,
      ).toBe('blocked');
    },
  );
  it.each([
    { start_at: '2026-02-30T12:00:00.000Z' },
    { start_at: '2026-10-01 12:00' },
    { start_at: new Date(NaN) },
    { branch: { timezone: 'Invalid/Zone' } },
    { branch: null },
    { is_upcoming: 'false' },
    { status: 'fabricated' },
    { attendance: 'paid' },
  ])('fails closed on invalid canonical row %j', (patch) => {
    expect(
      personalHistoryReply(result([item(patch)]), false, 'past').status,
    ).toBe('blocked');
  });
  it('uses only qualified tenant display timezone for a branchless native Date row', () => {
    const answer = personalHistoryReply(
      result([
        item({
          start_at: new Date('2026-10-01T02:30:00.000Z'),
          branch: null,
          timezone_source: 'tenant_default',
          timezone: 'America/New_York',
        }),
      ]),
      false,
      'past',
    );
    expect(answer.status).toBe('verified');
    expect(answer.reply).toContain('30.09.2026, 22:30');
    expect(answer.reply).toContain('филиал не указан');
  });
});
