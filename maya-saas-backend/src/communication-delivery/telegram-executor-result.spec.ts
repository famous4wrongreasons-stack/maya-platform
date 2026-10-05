import {
  telegramExecutorRejected,
  telegramMessageReference,
} from './telegram-executor-result';

describe('single Telegram executor authoritative results', () => {
  it.each(['privacy', 'package2'] as const)(
    '%s rejects only an explicit matching executor refusal',
    (executor) => {
      expect(
        telegramExecutorRejected(400, { error: 'invalid_request' }, executor),
      ).toBe(true);
      for (const status of [200, 403, 404, 408, 429, 500, 502, 504])
        expect(
          telegramExecutorRejected(
            status,
            { error: 'invalid_request' },
            executor,
          ),
        ).toBe(false);
      for (const body of [
        null,
        [],
        {},
        { error: 'proxy_timeout' },
        { error: 'invalid_request', message_id: '123' },
      ])
        expect(telegramExecutorRejected(400, body, executor)).toBe(false);
    },
  );
  it('does not import bulk-only rejection evidence into a different executor', () => {
    expect(
      telegramExecutorRejected(400, { error: 'B35_TELEGRAM_REJECTED' }, 'bulk'),
    ).toBe(true);
    expect(
      telegramExecutorRejected(
        400,
        { error: 'B35_TELEGRAM_REJECTED' },
        'package2',
      ),
    ).toBe(false);
    expect(
      telegramExecutorRejected(400, { error: 'invalid_buttons' }, 'privacy'),
    ).toBe(false);
    expect(
      telegramExecutorRejected(400, { error: 'invalid_buttons' }, 'package2'),
    ).toBe(true);
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { message_id: -1 },
    { message_id: 'timeout' },
    { message_id: 1.5 },
    { message_id: Number.MAX_SAFE_INTEGER + 1 },
    { message_id: '123', error: 'ambiguous' },
  ])('does not fabricate a provider reference from %j', (body) => {
    expect(telegramMessageReference(body)).toBeNull();
  });
  it.each([123, '123'])(
    'preserves canonical provider reference %j',
    (message_id) => {
      expect(telegramMessageReference({ message_id })).toBe('123');
    },
  );
});
