import {
  localDateMinuteToUtc,
  localWeekday,
  minuteToTime,
  parseTimeToMinute,
  rangesOverlap,
} from './internal-calendar.utils';

describe('internal calendar utilities', () => {
  it('converts a Moscow local time to UTC', () => {
    expect(
      localDateMinuteToUtc('2026-07-20', 9 * 60, 'Europe/Moscow').toISOString(),
    ).toBe('2026-07-20T06:00:00.000Z');
  });

  it('handles time and weekday representations', () => {
    expect(parseTimeToMinute('09:30')).toBe(570);
    expect(minuteToTime(570)).toBe('09:30');
    expect(localWeekday('2026-07-20')).toBe(1);
  });

  it('uses half-open ranges for overlap checks', () => {
    const start = new Date('2026-07-20T09:00:00.000Z');
    const end = new Date('2026-07-20T10:00:00.000Z');

    expect(
      rangesOverlap(
        start,
        end,
        new Date('2026-07-20T09:30:00.000Z'),
        new Date('2026-07-20T10:30:00.000Z'),
      ),
    ).toBe(true);
    expect(
      rangesOverlap(
        start,
        end,
        new Date('2026-07-20T10:00:00.000Z'),
        new Date('2026-07-20T11:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
