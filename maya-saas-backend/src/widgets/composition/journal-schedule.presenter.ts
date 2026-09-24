import type { FactUsed } from '../../widget-contract/envelope';
import type { ScheduleBody } from '../../widget-contract/kinds';

type RecordValue = Readonly<Record<string, unknown>>;

const record = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const cell = <T>(value: T, label: string, fact: FactUsed) => ({
  state: 'KNOWN' as const,
  value,
  label,
  reason_code: null,
  fact_ref: 0,
  as_of: fact.as_of,
  evidence_refs: fact.evidence_refs.map((ref) => ({
    ref,
    class: 'c9_invocation_handle' as const,
    dereferenceable_until: null,
  })),
  next_intent_ref: null,
});

/**
 * P-JOURNAL-PROJECTION: present the already-authorized, PII-free owner result as the certified
 * SCHEDULE body. It never calls an owner, derives attendance or changes the source date/timezone.
 */
export const presentJournalSchedule = (
  value: unknown,
  fact: FactUsed,
  expectedDate: string,
): ScheduleBody | null => {
  if (!record(value)) return null;
  const date = text(value.date);
  const timezone = text(value.timezone);
  const appointments = Array.isArray(value.appointments)
    ? value.appointments.filter(record)
    : null;
  if (date !== expectedDate || timezone === null || appointments === null)
    return null;

  const sourceStaff = Array.isArray(value.staff)
    ? value.staff
        .filter(record)
        .map((staff) => text(staff.name))
        .filter(isText)
    : [];
  const appointmentStaff = appointments
    .map((appointment) => text(appointment.staff_name))
    .filter(isText);
  const staffNames = [...new Set([...sourceStaff, ...appointmentStaff])];
  if (staffNames.length === 0) staffNames.push('Все мастера');
  const laneByName = new Map(
    staffNames.map((name, index) => [name, `lane-${index + 1}`]),
  );

  const slots = appointments
    .map((appointment) => ({
      from: text(appointment.time),
      to: text(appointment.end_time),
    }))
    .filter(
      (slot): slot is { from: string; to: string } =>
        slot.from !== null && slot.to !== null,
    );
  const distinctSlots = [
    ...new Map(slots.map((slot) => [`${slot.from}/${slot.to}`, slot])).values(),
  ];
  const buckets =
    distinctSlots.length === 0
      ? [
          {
            bucket_id: 'bucket-day',
            start: `${date}T00:00:00`,
            end: `${date}T23:59:59`,
          },
        ]
      : distinctSlots.map((slot, index) => ({
          bucket_id: `bucket-${index + 1}`,
          start: `${date}T${slot.from}:00`,
          end: `${date}T${slot.to}:00`,
        }));
  const bucketBySlot = new Map(
    distinctSlots.map((slot, index) => [
      `${slot.from}/${slot.to}`,
      `bucket-${index + 1}`,
    ]),
  );

  const entries = appointments.flatMap((appointment, index) => {
    const from = text(appointment.time);
    const to = text(appointment.end_time);
    if (from === null || to === null) return [];
    const bucket = bucketBySlot.get(`${from}/${to}`);
    if (bucket === undefined) return [];
    const staffName = text(appointment.staff_name) ?? staffNames[0];
    const services = Array.isArray(appointment.services)
      ? appointment.services.map(text).filter(isText)
      : [];
    const status = text(appointment.status) ?? 'recorded';
    const title = services.length > 0 ? services.join(', ') : 'Запись';
    return [
      {
        entry_ref: `journal-entry-${index + 1}`,
        lane_id: laneByName.get(staffName) ?? 'lane-1',
        bucket_span: [bucket, bucket] as [string, string],
        title: cell(title, title, fact),
        subtitle: cell(status, status, fact),
        state: cell(
          status === 'canceled' ? ('BLOCKED' as const) : ('BOOKED' as const),
          status,
          fact,
        ),
        pii_masked: false,
        detail_intent: 'i1',
        move_intent: null,
        move_targets: null,
      },
    ];
  });

  return {
    range: {
      from: buckets[0]?.start ?? `${date}T00:00:00`,
      to: buckets.at(-1)?.end ?? `${date}T23:59:59`,
    },
    timezone,
    lanes: staffNames.map((name, index) => ({
      lane_id: `lane-${index + 1}`,
      label: cell(name, name, fact),
      staff_ref: null,
    })),
    buckets,
    entries,
    gaps: [],
    detail_intent: 'i1',
  };
};

const isText = (value: string | null): value is string => value !== null;
