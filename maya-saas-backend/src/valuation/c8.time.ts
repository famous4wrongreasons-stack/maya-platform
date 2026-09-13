import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';
import { c8Object } from './c8.contract';
/** Version 1: elapsed days; calendar months preserve tenant-local wall time, clamping month-end. */
export function c8ShiftWindow(
  at: Date,
  window: unknown,
  timezone: string,
  direction: 1 | -1,
): Date {
  const w = c8Object(window, ['unit', 'count']);
  if (!Number.isSafeInteger(w.count) || Number(w.count) < 1)
    throw new Error('c8_window_count');
  const count = Number(w.count) * direction;
  if (w.unit === 'day') return new Date(at.getTime() + count * 86400000);
  if (w.unit !== 'calendar_month') throw new Error('c8_window_unit');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const first = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1 + count, 1),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const date = new Date(
    Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      Math.min(Number(parts.day), lastDay),
    ),
  )
    .toISOString()
    .slice(0, 10);
  return new Date(
    localDateMinuteToUtc(
      date,
      Number(parts.hour) * 60 + Number(parts.minute),
      timezone,
    ).getTime() +
      at.getUTCSeconds() * 1000 +
      at.getUTCMilliseconds(),
  );
}
