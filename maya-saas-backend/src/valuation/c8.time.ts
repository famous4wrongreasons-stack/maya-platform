import { c8Object } from './c8.contract';

export class C8CalendarInstantUnavailable extends Error {
  constructor() {
    super('c8_calendar_instant_unavailable');
    this.name = 'C8CalendarInstantUnavailable';
  }
}

const formatOptions: Intl.DateTimeFormatOptions = {
  calendar: 'gregory',
  numberingSystem: 'latn',
  era: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
};
const utcFormat = new Intl.DateTimeFormat('en-GB', {
  ...formatOptions,
  timeZone: 'UTC',
});
// Pure calendar inversion only, never policy/source/actor currentness. Whole seconds;
// callers add their milliseconds to a fresh Date. Null also caches a proven refusal.
const calendarInstants = new Map<string, number | null>();
const CACHE_LIMIT = 256;
const OFFSET_BOUND_SECONDS = 24 * 60 * 60;

function uniqueInstant(
  civil: Date,
  timezone: string,
  formatter: Intl.DateTimeFormat,
): number {
  const key = `${timezone}:${civil.toISOString()}`;
  if (!calendarInstants.has(key)) {
    const target = utcFormat.format(civil);
    let match: number | null = null;
    // C8's supported offset domain is integral seconds within +/-24 hours.
    // Enumerate every candidate: minute grids miss historical second offsets,
    // while sampling either side of a transition does not prove uniqueness.
    for (
      let offset = -OFFSET_BOUND_SECONDS;
      offset <= OFFSET_BOUND_SECONDS;
      offset++
    ) {
      const candidate = civil.getTime() - offset * 1000;
      if (formatter.format(candidate) !== target) continue;
      if (match !== null) {
        match = null;
        break;
      }
      match = candidate;
    }
    if (calendarInstants.size >= CACHE_LIMIT) {
      for (const oldest of calendarInstants.keys()) {
        calendarInstants.delete(oldest);
        break;
      }
    }
    calendarInstants.set(key, match);
  }
  const match = calendarInstants.get(key)!;
  if (match === null) throw new C8CalendarInstantUnavailable();
  return match;
}

/** Version 1: elapsed days; calendar months preserve local wall time and clamp month-end.
 * No gap shift or fold preference is authorized: non-unique targets are unavailable.
 * Calendar support: Gregorian AD years 1..9999, integral-second offsets +/-24h.
 */
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
  if (!Number.isFinite(at.getTime())) throw new C8CalendarInstantUnavailable();
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      ...formatOptions,
      timeZone: timezone,
    });
  } catch (error) {
    if (error instanceof RangeError) throw new C8CalendarInstantUnavailable();
    throw error;
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const sourceCivil = new Date(0);
  sourceCivil.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day));
  sourceCivil.setUTCHours(
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    at.getUTCMilliseconds(),
  );
  if (
    Math.abs(sourceCivil.getTime() - at.getTime()) >
    OFFSET_BOUND_SECONDS * 1000
  )
    throw new C8CalendarInstantUnavailable();
  const monthIndex = (year - 1) * 12 + Number(parts.month) - 1 + count;
  if (
    parts.era !== 'AD' ||
    year > 9999 ||
    monthIndex < 0 ||
    monthIndex >= 9999 * 12
  )
    throw new C8CalendarInstantUnavailable();
  // setUTCFullYear avoids Date.UTC's implicit 1900 addition for years 0..99.
  const civil = new Date(0);
  civil.setUTCFullYear(
    Math.floor(monthIndex / 12) + 1,
    (monthIndex % 12) + 1,
    0,
  );
  civil.setUTCDate(Math.min(Number(parts.day), civil.getUTCDate()));
  civil.setUTCHours(
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    0,
  );
  return new Date(
    uniqueInstant(civil, timezone, formatter) + at.getUTCMilliseconds(),
  );
}
