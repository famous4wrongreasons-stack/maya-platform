const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return representedAsUtc - date.getTime();
}

export function localDateMinuteToUtc(
  localDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match || minuteOfDay < 0 || minuteOfDay > 24 * 60) {
    throw new Error('Invalid local calendar date or minute');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let result = new Date(desiredAsUtc);

  // A second pass handles offsets that change near a daylight-saving boundary.
  for (let pass = 0; pass < 2; pass += 1) {
    result = new Date(desiredAsUtc - timeZoneOffsetMs(result, timeZone));
  }

  return result;
}

export function parseTimeToMinute(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  if (!match) {
    throw new Error('Invalid time value');
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function minuteToTime(value: number): string {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function localWeekday(localDate: string): number {
  const parsed = new Date(`${localDate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid local calendar date');
  }

  return parsed.getUTCDay();
}

export function rangesOverlap(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): boolean {
  return (
    leftStart.getTime() < rightEnd.getTime() &&
    rightStart.getTime() < leftEnd.getTime()
  );
}
