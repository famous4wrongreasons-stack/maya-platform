import { c8ShiftWindow } from './c8.time';
describe('C8 explicit window semantics', () => {
  it('elapsed day and tenant calendar month stay distinct', () => {
    const at = new Date('2026-03-31T12:34:56.789Z');
    expect(
      c8ShiftWindow(
        at,
        { unit: 'calendar_month', count: 1 },
        'Europe/Moscow',
        -1,
      ).toISOString(),
    ).toBe('2026-02-28T12:34:56.789Z');
    expect(
      c8ShiftWindow(
        at,
        { unit: 'day', count: 1 },
        'Europe/Moscow',
        -1,
      ).toISOString(),
    ).toBe('2026-03-30T12:34:56.789Z');
  });
  it('calendar shift observes timezone DST; no universal dormant window', () => {
    const at = new Date('2026-02-28T17:00:00.000Z');
    expect(
      c8ShiftWindow(
        at,
        { unit: 'calendar_month', count: 1 },
        'America/New_York',
        1,
      ).toISOString(),
    ).toBe('2026-03-28T16:00:00.000Z');
    expect(() => c8ShiftWindow(at, {}, 'UTC', 1)).toThrow();
  });
});
