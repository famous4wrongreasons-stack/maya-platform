import { BadRequestException } from '@nestjs/common';

import { normalizeRussianPhone } from '../common/phone.util';
import { AvailableSlot } from '../crm/crm-adapter.interface';

const LOCAL_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function normalizeBookingPhone(phone: string): string {
  return normalizeRussianPhone(phone);
}

export function normalizeClientName(name: string): string {
  const normalized = String(name || '').trim();

  if (!normalized) {
    throw new BadRequestException('Client name is required');
  }

  return normalized;
}

export function formatDateTimeInTimeZone(
  value: string | Date,
  timeZone: string,
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid appointment datetime');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const partMap = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}`;
}

export function normalizeRequestedStart(
  start: string,
  timeZone: string,
): string {
  const normalized = String(start || '').trim();

  if (!normalized) {
    throw new BadRequestException('Appointment start is required');
  }

  if (LOCAL_DATE_TIME_REGEX.test(normalized)) {
    return normalized.length === 16 ? `${normalized}:00` : normalized;
  }

  return formatDateTimeInTimeZone(normalized, timeZone);
}

export function findMatchingSlotByLocalStart(
  slots: AvailableSlot[],
  requestedStart: string,
  timeZone: string,
): AvailableSlot | null {
  for (const slot of slots) {
    if (
      normalizeRequestedStart(slot.start, timeZone) ===
      normalizeRequestedStart(requestedStart, timeZone)
    ) {
      return slot;
    }
  }

  return null;
}
