const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Presentation only: acknowledge an exact preference only when the current
 * availability owner's single slot matches it. This never reserves a slot or
 * replaces the sealed selection, draft, confirmation or execution checks. */
export function matchedRequestedBookingSlot(source: unknown): {
  date: string;
  time: string;
  timezone: string;
} | null {
  const value = record(source);
  if (
    !value ||
    value.exact_time_unavailable != null ||
    !record(value.booking_selection) ||
    typeof value.requested_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.requested_date) ||
    typeof value.requested_time !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.requested_time) ||
    typeof value.timezone !== 'string' ||
    !Array.isArray(value.slots) ||
    value.slots.length !== 1
  )
    return null;
  const slot = record(value.slots[0]);
  if (
    !slot ||
    typeof slot.start !== 'string' ||
    typeof slot.end !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(slot.start) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(slot.end) ||
    !Number.isFinite(Date.parse(slot.start)) ||
    !Number.isFinite(Date.parse(slot.end)) ||
    Date.parse(slot.end) <= Date.parse(slot.start) ||
    new Date(slot.start).getUTCMilliseconds() !== 0
  )
    return null;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: value.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(slot.start))
        .map(({ type, value }) => [type, value]),
    );
    if (
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}` !==
      `${value.requested_date}T${value.requested_time}:00`
    )
      return null;
  } catch {
    return null;
  }
  return {
    date: value.requested_date,
    time: value.requested_time,
    timezone: value.timezone,
  };
}
