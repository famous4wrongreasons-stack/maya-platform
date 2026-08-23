import { BadRequestException } from '@nestjs/common';

import { localDateMinuteToUtc } from '../internal-calendar/internal-calendar.utils';

const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

type DateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function formatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new BadRequestException('Invalid appointment timezone');
  }
}

function partsInTimezone(value: Date, timezone: string): DateTimeParts {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function assertCalendarDate(year: number, month: number, day: number): void {
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new BadRequestException('Invalid appointment datetime');
  }
}

/**
 * Appointment inputs without an offset are wall-clock values in the salon's
 * timezone. Inputs with `Z`/an offset are real instants. Both forms converge
 * to one UTC identity before Action Engine fingerprinting and persistence.
 */
export function canonicalAppointmentInstant(
  value: string,
  timezone: string,
): string {
  const normalized = String(value ?? '').trim();
  const local = LOCAL_DATE_TIME.exec(normalized);

  if (local) {
    const year = Number(local[1]);
    const month = Number(local[2]);
    const day = Number(local[3]);
    const hour = Number(local[4]);
    const minute = Number(local[5]);
    const second = Number(local[6] ?? 0);
    const millis = Number((local[7] ?? '').padEnd(3, '0') || 0);

    assertCalendarDate(year, month, day);
    if (hour > 23 || minute > 59 || second > 59 || millis > 999) {
      throw new BadRequestException('Invalid appointment datetime');
    }

    // Validate the IANA zone before the calendar helper uses it so callers get
    // one stable API error instead of an environment-specific RangeError.
    formatter(timezone);
    const localDate = `${local[1]}-${local[2]}-${local[3]}`;
    const instant = localDateMinuteToUtc(
      localDate,
      hour * 60 + minute,
      timezone,
    );
    instant.setUTCSeconds(second, millis);

    // A spring DST gap has no corresponding instant. Never silently move a
    // booking to another wall-clock time when that happens.
    const roundTrip = partsInTimezone(instant, timezone);
    if (
      roundTrip.year !== local[1] ||
      roundTrip.month !== local[2] ||
      roundTrip.day !== local[3] ||
      roundTrip.hour !== local[4] ||
      roundTrip.minute !== local[5] ||
      roundTrip.second !== String(second).padStart(2, '0')
    ) {
      throw new BadRequestException(
        'Appointment datetime does not exist in the salon timezone',
      );
    }

    return instant.toISOString();
  }

  const parsed = new Date(normalized);
  if (!normalized.includes('T') || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid appointment datetime');
  }

  return parsed.toISOString();
}

/** Convert a canonical instant back to the wall-clock format YClients uses. */
export function appointmentInstantForProvider(
  value: string,
  timezone: string,
): string {
  const instant = new Date(canonicalAppointmentInstant(value, timezone));
  const parts = partsInTimezone(instant, timezone);

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
