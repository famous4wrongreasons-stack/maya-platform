import { matchedRequestedBookingSlot } from './booking-requested-slot';

const slot = (overrides: Record<string, unknown> = {}) => ({
  start: '2035-01-01T07:00:00Z',
  end: '2035-01-01T08:00:00Z',
  branch_id: 'branch-a',
  staff_id: 'staff-a',
  ...overrides,
});

const source = (overrides: Record<string, unknown> = {}) => ({
  requested_date: '2035-01-01',
  requested_time: '10:00',
  timezone: 'Europe/Moscow',
  booking_selection: {
    branchId: 'branch-a',
    branchSourceRevision: 'a'.repeat(64),
  },
  slots: [slot()],
  ...overrides,
});

describe('matchedRequestedBookingSlot — presentation evidence only', () => {
  it.each<[string, Record<string, unknown>]>([
    ['UTC instant in the source timezone', {}],
    [
      'equivalent explicit offset',
      {
        slots: [
          slot({
            start: '2035-01-01T10:00:00+03:00',
            end: '2035-01-01T11:00:00+03:00',
          }),
        ],
      },
    ],
    [
      'explicit zero milliseconds',
      { slots: [slot({ start: '2035-01-01T07:00:00.000Z' })] },
    ],
  ])('acknowledges one exact source slot: %s', (_name, overrides) => {
    expect(matchedRequestedBookingSlot(source(overrides))).toEqual({
      date: '2035-01-01',
      time: '10:00',
      timezone: 'Europe/Moscow',
    });
  });

  it.each<[string, string, string, string]>([
    ['Asia/Tokyo', '2035-01-02', '00:30', '2035-01-01T15:30:00Z'],
    ['America/Los_Angeles', '2034-12-31', '23:30', '2035-01-01T07:30:00Z'],
    ['Asia/Kathmandu', '2035-01-01', '13:15', '2035-01-01T07:30:00Z'],
  ])(
    'uses the local date and time in %s, including midnight and fractional offsets',
    (timezone, date, time, start) => {
      expect(
        matchedRequestedBookingSlot(
          source({
            timezone,
            requested_date: date,
            requested_time: time,
            slots: [
              slot({
                start,
                end: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
              }),
            ],
          }),
        ),
      ).toEqual({ date, time, timezone });
    },
  );

  it.each<[string, unknown]>([
    ['absent source', undefined],
    ['null source', null],
    ['array source', []],
    ['absent selection', source({ booking_selection: undefined })],
    ['null selection', source({ booking_selection: null })],
    ['non-record selection', source({ booking_selection: [] })],
    ['absent requested date', source({ requested_date: undefined })],
    ['absent requested time', source({ requested_time: undefined })],
    ['absent timezone', source({ timezone: undefined })],
    ['invalid timezone', source({ timezone: 'Mars/Olympus' })],
    ['empty timezone', source({ timezone: '' })],
    ['unqualified requested date', source({ requested_date: '01-01' })],
    ['non-calendar requested date', source({ requested_date: '2035-02-30' })],
    ['different requested date', source({ requested_date: '2035-01-02' })],
    ['different requested time', source({ requested_time: '10:01' })],
    ['different source timezone', source({ timezone: 'UTC' })],
    ['unqualified requested hour', source({ requested_time: '10' })],
    ['unbounded requested hour', source({ requested_time: '24:00' })],
    ['unbounded requested minute', source({ requested_time: '10:60' })],
    ['requested seconds', source({ requested_time: '10:00:00' })],
    ['absent slots', source({ slots: undefined })],
    ['empty slots', source({ slots: [] })],
    ['non-record slot', source({ slots: [null] })],
    ['absent start', source({ slots: [slot({ start: undefined })] })],
    ['absent end', source({ slots: [slot({ end: undefined })] })],
    ['invalid start', source({ slots: [slot({ start: 'invalidZ' })] })],
    ['invalid end', source({ slots: [slot({ end: 'invalidZ' })] })],
    [
      'unqualified start',
      source({ slots: [slot({ start: '2035-01-01T10:00:00' })] }),
    ],
    [
      'unqualified end',
      source({ slots: [slot({ end: '2035-01-01T11:00:00' })] }),
    ],
    [
      'zero duration',
      source({ slots: [slot({ end: '2035-01-01T07:00:00Z' })] }),
    ],
    [
      'negative duration',
      source({ slots: [slot({ end: '2035-01-01T06:00:00Z' })] }),
    ],
    [
      'nonzero seconds',
      source({ slots: [slot({ start: '2035-01-01T07:00:01Z' })] }),
    ],
    [
      'nonzero milliseconds',
      source({ slots: [slot({ start: '2035-01-01T07:00:00.001Z' })] }),
    ],
  ])(
    'does not acknowledge missing or mismatched evidence: %s',
    (_name, value) => {
      expect(matchedRequestedBookingSlot(value)).toBeNull();
    },
  );

  it.each<[string, unknown[]]>([
    ['duplicate source rows', [slot(), slot()]],
    [
      'a matching slot plus another choice',
      [
        slot(),
        slot({ start: '2035-01-01T08:00:00Z', end: '2035-01-01T09:00:00Z' }),
      ],
    ],
    ['a matching slot plus an incomplete row', [slot(), { start: 'invalid' }]],
  ])(
    'does not collapse %s into a single acknowledged choice',
    (_name, slots) => {
      expect(matchedRequestedBookingSlot(source({ slots }))).toBeNull();
    },
  );

  it('does not collapse two DST fold instants sharing one local time', () => {
    expect(
      matchedRequestedBookingSlot(
        source({
          timezone: 'America/New_York',
          requested_date: '2026-11-01',
          requested_time: '01:30',
          slots: [
            slot({
              start: '2026-11-01T05:30:00Z',
              end: '2026-11-01T06:00:00Z',
            }),
            slot({
              start: '2026-11-01T06:30:00Z',
              end: '2026-11-01T07:00:00Z',
            }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it.each(['incomplete_source', 'ambiguous_local_time'])(
    'preserves the owner refusal %s even with an otherwise matching slot',
    (exact_time_unavailable) => {
      expect(
        matchedRequestedBookingSlot(source({ exact_time_unavailable })),
      ).toBeNull();
      expect(
        matchedRequestedBookingSlot(
          source({
            exact_time_unavailable,
            booking_selection: null,
            slots: [],
          }),
        ),
      ).toBeNull();
    },
  );
});
