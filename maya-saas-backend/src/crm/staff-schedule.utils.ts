import { createHash } from 'crypto';

import type { StaffScheduleSlot } from './crm-adapter.interface';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function scheduleTimeMinutes(value: string): number {
  const normalized = String(value || '').trim();
  if (!TIME_PATTERN.test(normalized)) {
    throw new Error(`Invalid schedule time: ${normalized}`);
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

export function scheduleMinutesLabel(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    throw new Error('Invalid schedule minute value');
  }
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
    value % 60,
  ).padStart(2, '0')}`;
}

export function normalizeScheduleSlots(
  slots: readonly StaffScheduleSlot[],
): StaffScheduleSlot[] {
  const sorted = slots
    .map((slot) => {
      const from = String(slot?.from || '').trim();
      const to = String(slot?.to || '').trim();
      const fromMinutes = scheduleTimeMinutes(from);
      const toMinutes = scheduleTimeMinutes(to);
      if (fromMinutes >= toMinutes) {
        throw new Error('Schedule interval start must precede its end');
      }
      return { from, to, fromMinutes, toMinutes };
    })
    .sort((left, right) => left.fromMinutes - right.fromMinutes);

  const result: StaffScheduleSlot[] = [];
  for (const slot of sorted) {
    const previous = result.at(-1);
    if (!previous) {
      result.push({ from: slot.from, to: slot.to });
      continue;
    }
    const previousEnd = scheduleTimeMinutes(previous.to);
    if (slot.fromMinutes < previousEnd) {
      throw new Error('Schedule intervals must not overlap');
    }
    if (slot.fromMinutes === previousEnd) {
      previous.to = slot.to;
      continue;
    }
    result.push({ from: slot.from, to: slot.to });
  }
  return result;
}

export function staffScheduleRevision(
  staffId: string,
  date: string,
  slots: readonly StaffScheduleSlot[],
): string {
  const normalized = normalizeScheduleSlots(slots);
  return createHash('sha256')
    .update(
      JSON.stringify({ staff_id: String(staffId), date, slots: normalized }),
    )
    .digest('hex');
}

export function scheduleSlotsContain(
  slots: readonly StaffScheduleSlot[],
  fromMinutes: number,
  toMinutes: number,
): boolean {
  return slots.some(
    (slot) =>
      scheduleTimeMinutes(slot.from) <= fromMinutes &&
      toMinutes <= scheduleTimeMinutes(slot.to),
  );
}
