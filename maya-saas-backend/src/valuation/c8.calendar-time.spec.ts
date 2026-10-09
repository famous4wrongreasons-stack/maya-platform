import { c8ShiftWindow } from './c8.time';

// Candidate fail-closed contract: a calendar target must denote exactly one
// instant. These tests do not select an earlier/later fold or shift a gap.
// Transition witnesses were checked through local Intl metadata, separately
// from c8ShiftWindow: no provider, clock override, model or service involved.
type CalendarCase = {
  label: string;
  at: string;
  timezone: string;
  direction: 1 | -1;
};

const unavailable: CalendarCase[] = [
  {
    // Jan 8 02:30 EST -> Mar 8 02:30, skipped between 01:59 and 03:00.
    label: 'New York forward spring gap',
    at: '2026-01-08T07:30:45.123Z',
    timezone: 'America/New_York',
    direction: 1,
  },
  {
    label: 'New York backward spring gap',
    at: '2026-05-08T06:30:45.123Z',
    timezone: 'America/New_York',
    direction: -1,
  },
  {
    // Nov 1 01:30 is both 05:30Z (EDT) and 06:30Z (EST).
    label: 'New York forward fall fold',
    at: '2026-09-01T05:30:45.123Z',
    timezone: 'America/New_York',
    direction: 1,
  },
  {
    label: 'New York backward fall fold',
    at: '2027-01-01T06:30:45.123Z',
    timezone: 'America/New_York',
    direction: -1,
  },
  {
    // Oct 4 jumps from 01:59 +10:30 to 02:30 +11; 02:15 does not exist.
    label: 'Lord Howe thirty-minute spring gap',
    at: '2026-08-03T15:45:45.123Z',
    timezone: 'Australia/Lord_Howe',
    direction: 1,
  },
  {
    // Apr 5 01:45 is Apr 4 14:45Z (+11) and Apr 4 15:15Z (+10:30).
    label: 'Lord Howe thirty-minute fall fold',
    at: '2026-02-04T14:45:45.123Z',
    timezone: 'Australia/Lord_Howe',
    direction: 1,
  },
  {
    // Apia skips all of Dec 30: Dec 30 10:00Z is already Dec 31 00:00.
    label: 'Apia skipped civil day',
    at: '2011-10-30T22:15:45.123Z',
    timezone: 'Pacific/Apia',
    direction: 1,
  },
];

const available: Array<CalendarCase & { expected: string }> = [
  {
    label: 'Paris historical seconds offset preserves local seconds',
    at: '1880-01-01T12:00:45.123Z',
    timezone: 'Europe/Paris',
    direction: 1,
    expected: '1880-03-01T12:00:45.123Z',
  },
  {
    label: 'Gregorian year below 100 does not acquire 1900 years',
    at: '0099-12-31T12:34:56.789Z',
    timezone: 'UTC',
    direction: 1,
    expected: '0100-02-28T12:34:56.789Z',
  },
  {
    label: 'New York forward spring at unique 12:30',
    at: '2026-01-08T17:30:45.123Z',
    timezone: 'America/New_York',
    direction: 1,
    expected: '2026-03-08T16:30:45.123Z',
  },
  {
    label: 'New York backward spring at unique 12:30',
    at: '2026-03-08T16:30:45.123Z',
    timezone: 'America/New_York',
    direction: -1,
    expected: '2026-01-08T17:30:45.123Z',
  },
  {
    label: 'New York fall at unique 12:30',
    at: '2026-09-01T16:30:45.123Z',
    timezone: 'America/New_York',
    direction: 1,
    expected: '2026-11-01T17:30:45.123Z',
  },
  {
    label: 'Lord Howe forward thirty-minute change at unique 12:15',
    at: '2026-08-04T01:45:45.123Z',
    timezone: 'Australia/Lord_Howe',
    direction: 1,
    expected: '2026-10-04T01:15:45.123Z',
  },
  {
    label: 'Lord Howe backward thirty-minute change at unique 12:15',
    at: '2026-10-04T01:15:45.123Z',
    timezone: 'Australia/Lord_Howe',
    direction: -1,
    expected: '2026-08-04T01:45:45.123Z',
  },
  {
    label: 'Apia unique civil day after the skipped date',
    at: '2011-10-31T22:15:45.123Z',
    timezone: 'Pacific/Apia',
    direction: 1,
    expected: '2011-12-30T22:15:45.123Z',
  },
  {
    label: 'forward non-leap month-end clamp',
    at: '2025-12-31T12:34:56.789Z',
    timezone: 'UTC',
    direction: 1,
    expected: '2026-02-28T12:34:56.789Z',
  },
  {
    label: 'backward leap month-end clamp',
    at: '2024-04-30T12:34:56.789Z',
    timezone: 'UTC',
    direction: -1,
    expected: '2024-02-29T12:34:56.789Z',
  },
];

describe('C8 calendar target requires one exact instant', () => {
  it.each([
    {
      at: '0001-01-01T00:00:00.000Z',
      timezone: 'UTC',
      count: 2,
      direction: -1 as const,
    },
    {
      at: '9999-12-01T00:00:00.000Z',
      timezone: 'UTC',
      count: 2,
      direction: 1 as const,
    },
    {
      at: '2026-01-01T00:00:00.000Z',
      timezone: 'Invalid/Zone',
      count: 2,
      direction: 1 as const,
    },
    {
      at: '2026-01-01T00:00:00.000Z',
      timezone: 'UTC',
      count: Number.MAX_SAFE_INTEGER,
      direction: 1 as const,
    },
  ])('refuses unsupported calendar input $at/$timezone/$count', (sample) => {
    expect(() =>
      c8ShiftWindow(
        new Date(sample.at),
        { unit: 'calendar_month', count: sample.count },
        sample.timezone,
        sample.direction,
      ),
    ).toThrow('c8_calendar_instant_unavailable');
  });

  it('cached inverse returns independent dates and preserves each request milliseconds', () => {
    const at = new Date('2026-01-15T12:34:56.123Z');
    const result = c8ShiftWindow(
      at,
      { unit: 'calendar_month', count: 2 },
      'UTC',
      1,
    );
    result.setUTCFullYear(1999);
    at.setUTCMilliseconds(456);
    expect(
      c8ShiftWindow(
        at,
        { unit: 'calendar_month', count: 2 },
        'UTC',
        1,
      ).toISOString(),
    ).toBe('2026-03-15T12:34:56.456Z');
    expect(
      c8ShiftWindow(
        at,
        { unit: 'calendar_month', count: 2 },
        'Europe/Moscow',
        1,
      ).toISOString(),
    ).toBe('2026-03-15T12:34:56.456Z');
  });
  it.each(unavailable)(
    '$label refuses without moving or selecting a target',
    (sample) => {
      const at = new Date(sample.at);
      expect(() =>
        c8ShiftWindow(
          at,
          { unit: 'calendar_month', count: 2 },
          sample.timezone,
          sample.direction,
        ),
      ).toThrow(new Error('c8_calendar_instant_unavailable'));
      expect(at.toISOString()).toBe(sample.at);
    },
  );

  it.each(available)('$label preserves seconds and milliseconds', (sample) => {
    const at = new Date(sample.at);
    expect(
      c8ShiftWindow(
        at,
        { unit: 'calendar_month', count: 2 },
        sample.timezone,
        sample.direction,
      ).toISOString(),
    ).toBe(sample.expected);
    expect(at.toISOString()).toBe(sample.at);
  });

  it.each([
    {
      label: 'spring gap traversed forward',
      at: '2026-03-07T07:30:45.123Z',
      expected: '2026-03-08T07:30:45.123Z',
      direction: 1 as const,
    },
    {
      label: 'fall fold traversed backward',
      at: '2026-11-02T06:30:45.123Z',
      expected: '2026-11-01T06:30:45.123Z',
      direction: -1 as const,
    },
  ])('$label keeps day as exactly 24 elapsed hours', (sample) => {
    const at = new Date(sample.at);
    const shifted = c8ShiftWindow(
      at,
      { unit: 'day', count: 1 },
      'America/New_York',
      sample.direction,
    );
    expect(shifted.toISOString()).toBe(sample.expected);
    expect(shifted.getTime() - at.getTime()).toBe(
      sample.direction * 86_400_000,
    );
  });
});
