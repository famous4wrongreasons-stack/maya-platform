import type { ScheduleBody } from '../../widget-contract/kinds';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { PersonalScheduleSource } from '../owner-ports/personal-schedule.port';
import type { MintSelectorHandle } from './booking-selector.presenter';
import {
  BOOKING_NOUN_OWNERS,
  encodeBookingSlotOwnerRef,
} from './booking-noun-identity';
const known = <T>(value: T, label = String(value)) => ({
  state: 'KNOWN' as const,
  value,
  label,
  reason_code: null,
  fact_ref: 0,
  as_of: null,
  evidence_refs: [],
  next_intent_ref: null,
});
/** BS-1 uses existing exact cancel/reschedule recipes. One bounded personal appointment,
 * one canonical availability proposal. Neither time nor display index identifies the record. */
export function presentPersonalSchedule(
  tenantId: string,
  source: PersonalScheduleSource,
  mint: MintSelectorHandle,
  detail = false,
): { body: ScheduleBody; proposals: IntentProposal[] } {
  const appointment = mint({
    tenantId,
    noun: 'appointment',
    ownerKind: 'appointment',
    ownerRef: source.appointmentId,
  });
  const canManage = !detail && source.canManageAsClient !== false;
  const proposals: IntentProposal[] = canManage
    ? [
        {
          intent_template_key: 'refine.booking.cancel@1',
          capability: { space: 'C9', key: 'appointments.own.cancel' },
          role: 'primary',
          argument_handles: { appointment },
        },
      ]
    : [];
  const slot =
    source.rescheduleStart === null
      ? null
      : encodeBookingSlotOwnerRef(source.rescheduleStart);
  const movable = canManage && slot !== null && source.serviceId !== null;
  if (movable)
    proposals.push({
      intent_template_key: 'refine.booking.reschedule@1',
      capability: { space: 'C9', key: 'appointments.own.reschedule' },
      role: 'primary',
      argument_handles: {
        appointment,
        service: mint({
          tenantId,
          noun: 'service',
          ownerKind: BOOKING_NOUN_OWNERS.service,
          ownerRef: source.serviceId!,
        }),
        staff: mint({
          tenantId,
          noun: 'staff',
          ownerKind: BOOKING_NOUN_OWNERS.staff,
          ownerRef: source.staffId,
        }),
        slot: mint({
          tenantId,
          noun: 'slot',
          ownerKind: BOOKING_NOUN_OWNERS.slot,
          ownerRef: slot,
        }),
      },
    });
  const bookingIntent = `i${proposals.length + 1}`;
  if (!detail)
    proposals.push({
      intent_template_key: 'navigate.personal-booking@1',
      role: 'primary',
    });
  proposals.push({
    intent_template_key: 'control.dismiss@1',
    capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
    role: 'escape',
  });
  const body: ScheduleBody = {
    range: { from: source.start, to: source.end },
    timezone: 'UTC',
    lanes: [
      { lane_id: 'personal', label: known('Моя запись'), staff_ref: null },
    ],
    buckets: [{ bucket_id: 'current', start: source.start, end: source.end }],
    entries: [
      {
        entry_ref: appointment,
        lane_id: 'personal',
        bucket_span: ['current', 'current'],
        title: known(source.title),
        subtitle: movable ? known(`Перенос: ${source.rescheduleStart}`) : null,
        state: known('BOOKED' as const, 'Запланирована'),
        pii_masked: false,
        detail_intent: canManage ? 'i1' : null,
        move_intent: movable ? 'i2' : null,
        move_targets: null,
      },
    ],
    gaps: [],
    // The explicit personal form is navigation. Cancel/move retain their own current gates.
    detail_intent: bookingIntent,
  };
  return { body, proposals };
}
