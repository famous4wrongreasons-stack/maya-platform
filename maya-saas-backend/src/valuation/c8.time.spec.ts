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

describe('C8 two-calendar-month deadline from the proven visit', () => {
  it.each([
    {
      label: 'non-leap month-end clamp',
      at: '2025-12-31T12:34:56.789Z',
      timezone: 'UTC',
      deadline: '2026-02-28T12:34:56.789Z',
      sixtyDays: '2026-03-01T12:34:56.789Z',
    },
    {
      label: 'leap month-end clamp',
      at: '2023-12-31T12:34:56.789Z',
      timezone: 'UTC',
      deadline: '2024-02-29T12:34:56.789Z',
      sixtyDays: '2024-02-29T12:34:56.789Z',
    },
    {
      label: 'New York spring DST at an unambiguous local noon',
      at: '2026-01-15T17:34:56.789Z',
      timezone: 'America/New_York',
      deadline: '2026-03-15T16:34:56.789Z',
      sixtyDays: '2026-03-16T17:34:56.789Z',
    },
    {
      label: 'New York fall DST at an unambiguous local noon',
      at: '2026-09-15T16:34:56.789Z',
      timezone: 'America/New_York',
      deadline: '2026-11-15T17:34:56.789Z',
      sixtyDays: '2026-11-14T16:34:56.789Z',
    },
  ])('$label preserves wall time, seconds and milliseconds', (sample) => {
    const at = new Date(sample.at);
    expect(
      c8ShiftWindow(
        at,
        { unit: 'calendar_month', count: 2 },
        sample.timezone,
        1,
      ).toISOString(),
    ).toBe(sample.deadline);
    expect(
      c8ShiftWindow(
        at,
        { unit: 'day', count: 60 },
        sample.timezone,
        1,
      ).toISOString(),
    ).toBe(sample.sixtyDays);
    expect(at.toISOString()).toBe(sample.at);
  });

  it('does not substitute a backwards two-month cutoff for the clamped forward deadline', () => {
    const visit = new Date('2025-12-31T12:34:56.789Z');
    const deadline = c8ShiftWindow(
      visit,
      { unit: 'calendar_month', count: 2 },
      'UTC',
      1,
    );
    const backwards = c8ShiftWindow(
      deadline,
      { unit: 'calendar_month', count: 2 },
      'UTC',
      -1,
    );
    expect(deadline.toISOString()).toBe('2026-02-28T12:34:56.789Z');
    expect(backwards.toISOString()).toBe('2025-12-28T12:34:56.789Z');
    expect(backwards.getTime()).not.toBe(visit.getTime());
  });
});
