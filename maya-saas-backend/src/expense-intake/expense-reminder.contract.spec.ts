import {
  expenseHash,
  EXPENSE_REMINDER_CONTRACT,
  EXPENSE_REMINDER_TYPE,
  normalizeExpenseReminder,
  reminderSlotKey,
} from './expense-reminder.contract';
function fixture() {
  const p = {
    contract: EXPENSE_REMINDER_CONTRACT,
    tenantId: 'tenant-a',
    reminderType: EXPENSE_REMINDER_TYPE,
    contractVersion: 1,
    periodStartLocalDate: '2026-09-07',
    periodEndLocalDate: '2026-09-13',
    timezone: 'Europe/Moscow',
    periodStartAt: '2026-09-06T21:00:00.000Z',
    periodEndExclusiveAt: '2026-09-13T21:00:00.000Z',
    expiresAt: '2026-09-20T21:00:00.000Z',
    content: { title: 'Report', bodyText: 'Fixed\ncontent', version: 1 },
    slots: [] as Record<string, unknown>[],
  };
  for (const userId of ['user-b', 'user-a']) {
    const key = reminderSlotKey(p, userId, 'auth-' + userId);
    p.slots.push({
      userId,
      membershipId: 'member-' + userId,
      authIdentityId: 'auth-' + userId,
      role: 'tenant_owner',
      telegramId: userId === 'user-a' ? '111' : '222',
      channel: 'telegram',
      slotKey: key,
      executionRef: 'expense-reminder:' + key,
    });
  }
  return p;
}
describe('R13 immutable normalized expense reminder plan', () => {
  it('normalizes only declared content and deterministic slot ordering', () => {
    const p = fixture(),
      normalized = normalizeExpenseReminder(p);
    const reordered = {
      ...p,
      content: { version: 1, title: ' Report ', bodyText: 'Fixed\r\ncontent' },
      slots: [...p.slots].reverse(),
    };
    expect(normalizeExpenseReminder(reordered)).toEqual(normalized);
    expect(
      expenseHash(
        EXPENSE_REMINDER_CONTRACT,
        normalizeExpenseReminder(reordered),
      ),
    ).toEqual(expenseHash(EXPENSE_REMINDER_CONTRACT, normalized));
  });
  it('rejects undeclared transport metadata, raw authority and malformed scopes', () => {
    for (const mutant of [
      (p) => ({ ...p, transport: 'random' }),
      (p) => ({ ...p, tenantId: 1 }),
      (p) => ({ ...p, content: { ...p.content, raw: 'x' } }),
      (p) => ({ ...p, slots: [{ ...p.slots[0], chat_id: '111' }] }),
      (p) => ({ ...p, slots: [{ ...p.slots[0], userId: { id: 'user-b' } }] }),
      (p) => ({ ...p, slots: [p.slots[0], p.slots[0]] }),
      (p) => ({ ...p, slots: [{ ...p.slots[0], channel: 'apns' }] }),
      (p) => ({ ...p, expiresAt: '2026-09-21T00:00:00Z' }),
    ] as Array<(p: ReturnType<typeof fixture>) => unknown>)
      expect(() => normalizeExpenseReminder(mutant(fixture()))).toThrow();
  });
  it('binds each meaningful intent dimension', () => {
    const p = normalizeExpenseReminder(fixture()),
      hash = expenseHash(EXPENSE_REMINDER_CONTRACT, p);
    for (const value of [
      { ...p, content: { ...p.content, bodyText: 'Other' } },
      { ...p, slots: p.slots.slice(1) },
    ])
      expect(
        expenseHash(EXPENSE_REMINDER_CONTRACT, normalizeExpenseReminder(value)),
      ).not.toEqual(hash);
  });
});
