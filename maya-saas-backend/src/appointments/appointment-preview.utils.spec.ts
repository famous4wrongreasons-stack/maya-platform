import {
  findMatchingSlotByLocalStart,
  formatDateTimeInTimeZone,
  normalizeBookingPhone,
  normalizeClientName,
  normalizeRequestedStart,
} from './appointment-preview.utils';

describe('appointment preview utils', () => {
  it('normalizes Russian phones to +7 format', () => {
    expect(normalizeBookingPhone('8 (999) 000-00-00')).toBe('+79990000000');
    expect(normalizeBookingPhone('+7 999 000 00 00')).toBe('+79990000000');
  });

  it('normalizes local appointment datetimes and keeps explicit local wall time', () => {
    expect(normalizeRequestedStart('2026-07-04T10:15', 'Europe/Moscow')).toBe(
      '2026-07-04T10:15:00',
    );
  });

  it('converts UTC slot time into Moscow wall time for preview matching', () => {
    expect(
      formatDateTimeInTimeZone('2026-07-04T07:15:00.000Z', 'Europe/Moscow'),
    ).toBe('2026-07-04T10:15:00');
  });

  it('finds the matching slot by local requested time', () => {
    const match = findMatchingSlotByLocalStart(
      [
        {
          start: '2026-07-04T07:15:00.000Z',
          end: '2026-07-04T08:15:00.000Z',
          staff_id: '3278920',
          branch_id: null,
        },
      ],
      '2026-07-04T10:15:00',
      'Europe/Moscow',
    );

    expect(match?.staff_id).toBe('3278920');
  });

  it('requires a non-empty client name', () => {
    expect(normalizeClientName('  Алексей  ')).toBe('Алексей');
  });
});
