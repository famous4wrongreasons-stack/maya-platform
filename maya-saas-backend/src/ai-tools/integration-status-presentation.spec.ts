import { integrationStatusReply } from './integration-status-presentation';

describe('stored integration status presentation, synthetic source facts', () => {
  const source = {
    configured: true,
    calendar_source: 'external',
    next_action: null,
    connection: {
      provider: 'yclients',
      status: 'active',
      verified: true,
      verified_at: new Date('2026-10-05T08:20:01.123Z'),
      last_checked_at: new Date('2026-10-06T09:30:00.000Z'),
      last_sync_at: '2026-10-06T09:29:00Z',
    },
  };
  it('presents Date and JSON dates as last-known observations, never live health', () => {
    const output = integrationStatusReply(source);
    expect(output.status).toBe('verified');
    expect(output.reply).toContain(
      'Сохранённый статус интеграции YCLIENTS: активна',
    );
    expect(output.reply).toContain('06.10.2026, 09:30 (UTC)');
    expect(output.reply).toContain('06.10.2026, 09:29 (UTC)');
    expect(output.reply).toContain(
      '05.10.2026, 08:20:01,123 (UTC); это историческая отметка',
    );
    expect(output.reply).toContain('Текущая доступность CRM не подтверждена');
    expect(output.reply).toContain(
      'Следующий шаг в сохранённом статусе не указан',
    );
    expect(integrationStatusReply(JSON.parse(JSON.stringify(source)))).toEqual(
      output,
    );
  });
  it.each([
    [
      'pending_activation',
      'activate',
      'ожидает активации',
      'активировать интеграцию',
    ],
    ['inactive', 'reconnect', 'неактивна', 'переподключить CRM'],
    ['error', 'reconnect', 'ошибка подключения', 'переподключить CRM'],
  ])(
    'keeps historical verification separate from %s and copies only its source next action',
    (status, next, label, action) => {
      const output = integrationStatusReply({
        ...source,
        next_action: next,
        connection: { ...source.connection, status },
      });
      expect(output.reply).toContain(label);
      expect(output.reply).toContain('историческая отметка');
      expect(output.reply).toContain(
        `Следующий шаг из сохранённого статуса: ${action}`,
      );
    },
  );
  it.each([null, undefined, 'UNKNOWN', 'PRIVATE_RAW_ERROR'])(
    'never infers reconnect from error with next_action %s',
    (next_action) => {
      const output = integrationStatusReply({
        ...source,
        next_action,
        connection: { ...source.connection, status: 'error' },
      });
      expect(output.reply).not.toMatch(
        /переподключить|PRIVATE_RAW_ERROR|UNKNOWN/,
      );
    },
  );
  it('renders a source-owned connect hint only for a known unconfigured state', () => {
    const output = integrationStatusReply({
      configured: false,
      calendar_source: 'external',
      connection: null,
      next_action: 'connect',
    });
    expect(output.reply).toContain('не настроена');
    expect(output.reply).toContain('подключить CRM');
    expect(output.reply).not.toContain('синхронизация');
  });
  it.each([
    null,
    {},
    { configured: 'false' },
    { ...source, connection: null },
    { ...source, connection: { status: 'UNKNOWN' } },
    { ...source, configured: false },
  ])(
    'does not turn incomplete status into health or a recovery instruction: %j',
    (value) => {
      const output = integrationStatusReply(value);
      expect(output.status).toBe('blocked');
      expect(output.reply).not.toMatch(/активна|переподключить|UNKNOWN/);
    },
  );
  it.each([
    null,
    undefined,
    0,
    'UNKNOWN',
    '2026-02-30T10:00:00.000Z',
    '2026-10-05',
    'next week',
    new Date(NaN),
  ])('does not invent a date from %s', (date) => {
    const output = integrationStatusReply({
      ...source,
      connection: {
        ...source.connection,
        last_checked_at: date,
        last_sync_at: date,
        verified_at: date,
      },
    });
    expect(output.reply).toContain(
      'Последняя сохранённая проверка: дата недоступна',
    );
    expect(output.reply).toContain(
      'Последняя сохранённая синхронизация: дата недоступна',
    );
    expect(output.reply).not.toMatch(
      /\d{2}\.\d{2}\.\d{4}|UNKNOWN|Invalid Date|next week/,
    );
  });
  it.each([true, false])(
    'blocks a next action for outer/payload stale evidence: outer=%s',
    (outer) => {
      const output = integrationStatusReply(
        { ...source, stale: !outer, next_action: 'reconnect' },
        outer,
      );
      expect(output.status).toBe('blocked');
      expect(output.reply).toContain('Источник помечен как устаревший');
      expect(output.reply).not.toContain('переподключить CRM');
    },
  );
  it('does not echo arbitrary provider, errors, settings or credentials', () => {
    const output = integrationStatusReply({
      ...source,
      connection: {
        ...source.connection,
        provider: 'PRIVATE_PROVIDER',
        last_error_code: 'PRIVATE_ERROR',
        settings: { token: 'PRIVATE_TOKEN' },
      },
    });
    expect(output.reply).toContain('статус интеграции CRM');
    expect(output.reply).not.toContain('PRIVATE');
  });
});
