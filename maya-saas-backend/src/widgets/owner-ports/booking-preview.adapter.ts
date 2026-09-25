import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ClientAppointmentCreateService } from '../../appointments/client-appointment-create.service';
import { ClientAppointmentCancelService } from '../../crm/client-appointment-cancel.service';
import { ClientAppointmentRescheduleService } from '../../crm/client-appointment-reschedule.service';
import type { FactUsed } from '../../widget-contract/envelope';
import type { BookingConfirmationPreview } from '../booking/booking-confirmation-minter.port';
import { subjectOf } from '../gates/subject';
import type {
  ActuatingRoutingInput,
  BookingProposeOwnerPort,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';
import type { DraftOwnerPort } from './draft-owner.registry';

const refused = (): EffectRouteOutcome => ({
  receiptOutcome: 'REFUSED',
  refusalCode: 'effect_not_admissible',
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: null,
});
const accepted = (preview: BookingConfirmationPreview): EffectRouteOutcome => ({
  receiptOutcome: 'ACCEPTED',
  refusalCode: null,
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: { kind: 'booking_preview', preview },
});

const fact = (key: string, at: Date, scope: string): FactUsed => ({
  capability: key,
  status: 'measured',
  as_of: at.toISOString(),
  evidence_refs: [],
  completeness: {
    status: 'COMPLETE',
    requestedScopeHash: scope,
    returnedCount: 1,
    totalCount: 1,
    hasMore: false,
    cursorRef: null,
    truncated: false,
    reasonCodes: [],
  },
});

const handles = (
  value: unknown,
  exact: readonly string[],
): Readonly<Record<string, string>> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...exact].sort();
  if (
    keys.length !== expected.length ||
    !keys.every((key, i) => key === expected[i])
  )
    return null;
  if (
    keys.some(
      (key) => typeof record[key] !== 'string' || record[key].length === 0,
    )
  )
    return null;
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, record[key] as string])),
  );
};

@Injectable()
export class BookingPreviewAdapter
  implements DraftOwnerPort, BookingProposeOwnerPort
{
  readonly aeCapabilityKey = 'crm.appointment.create.v1';

  constructor(
    private readonly create: ClientAppointmentCreateService,
    private readonly reschedule: ClientAppointmentRescheduleService,
    private readonly cancel: ClientAppointmentCancelService,
  ) {}

  async draft(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const subject = subjectOf(input.routing.record);
    const frozen = handles(input.routing.record.frozenNounsJson, [
      'service',
      'staff',
      'slot',
    ]);
    if (
      subject?.space !== 'C9' ||
      subject.key !== 'appointments.own.create' ||
      frozen === null
    )
      return refused();
    const nouns = input.resolvedNouns.values;
    const serviceId = nouns.get('service');
    const staffId = nouns.get('staff');
    const start = nouns.get('slot');
    if (!serviceId || !staffId || !start) return refused();
    try {
      const quoted = await this.create.quoteForAccount(
        input.routing.tenantId,
        input.actorUserId,
        { staffId, serviceIds: [serviceId], start },
      );
      const service = quoted.services.find(
        (candidate) => candidate.id === serviceId,
      );
      if (!service) return refused();
      const draftRef = randomUUID();
      return accepted({
        subject: 'create',
        sourceCapabilityKey: 'appointments.own.create',
        frozenArgumentHandles: frozen,
        draftRef,
        appointmentRef: null,
        producingIntentTokenHash: null,
        when: quoted.start,
        whenPrevious: null,
        serviceLabel: service.name,
        staffLabel: staffId,
        durationMinutes: service.duration_minutes,
        priceKopecks: Math.round(service.price * 100),
        currency: service.currency,
        fact: fact(
          'appointments.own.create',
          input.routing.now,
          input.routing.record.requestedScopeHash,
        ),
      });
    } catch {
      return refused();
    }
  }

  async propose(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const subject = subjectOf(input.routing.record);
    if (subject?.space !== 'C9') return refused();
    try {
      if (subject.key === 'appointments.own.reschedule')
        return this.proposeReschedule(input);
      if (subject.key === 'appointments.own.cancel')
        return this.proposeCancel(input);
      return refused();
    } catch {
      return refused();
    }
  }

  private async proposeReschedule(
    input: ActuatingRoutingInput,
  ): Promise<EffectRouteOutcome> {
    const frozen = handles(input.routing.record.frozenNounsJson, [
      'appointment',
      'service',
      'staff',
      'slot',
    ]);
    const nouns = input.resolvedNouns.values;
    const appointmentId = nouns.get('appointment');
    const start = nouns.get('slot');
    const staffId = nouns.get('staff');
    const serviceId = nouns.get('service');
    if (!frozen || !appointmentId || !start || !staffId || !serviceId)
      return refused();
    const quoted = await this.reschedule.quoteOwnedReschedule(
      input.routing.tenantId,
      input.actorUserId,
      appointmentId,
      { start, staffId, serviceIds: [serviceId] },
    );
    const appointment = quoted.target.appointment;
    const preview: BookingConfirmationPreview = {
      subject: 'reschedule',
      sourceCapabilityKey: 'appointments.own.reschedule',
      frozenArgumentHandles: frozen,
      draftRef: null,
      appointmentRef: appointmentId,
      producingIntentTokenHash: input.routing.record.intentTokenHash,
      when: quoted.prepared.start,
      whenPrevious: appointment.startAt.toISOString(),
      serviceLabel: serviceId,
      staffLabel: quoted.prepared.staffId,
      durationMinutes: Math.max(
        1,
        Math.round(
          (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60000,
        ),
      ),
      priceKopecks: appointment.totalPriceKopecks ?? 0,
      currency: appointment.currency,
      fact: fact(
        'appointments.own.reschedule',
        input.routing.now,
        input.routing.record.requestedScopeHash,
      ),
    };
    return accepted(preview);
  }

  private async proposeCancel(
    input: ActuatingRoutingInput,
  ): Promise<EffectRouteOutcome> {
    const frozen = handles(input.routing.record.frozenNounsJson, [
      'appointment',
    ]);
    const appointmentId = input.resolvedNouns.values.get('appointment');
    if (!frozen || !appointmentId) return refused();
    const quoted = await this.cancel.readOwnedCancelTarget(
      input.routing.tenantId,
      input.actorUserId,
      appointmentId,
    );
    if (quoted.alreadyCancelled) return refused();
    const appointment = quoted.target.appointment;
    return accepted({
      subject: 'cancel',
      sourceCapabilityKey: 'appointments.own.cancel',
      frozenArgumentHandles: frozen,
      draftRef: null,
      appointmentRef: appointmentId,
      producingIntentTokenHash: input.routing.record.intentTokenHash,
      when: appointment.startAt.toISOString(),
      whenPrevious: null,
      serviceLabel: Array.isArray(appointment.serviceIds)
        ? appointment.serviceIds.join(', ')
        : 'Appointment',
      staffLabel: appointment.staffExternalId,
      durationMinutes: Math.max(
        1,
        Math.round(
          (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60000,
        ),
      ),
      priceKopecks: appointment.totalPriceKopecks ?? 0,
      currency: appointment.currency,
      fact: fact(
        'appointments.own.cancel',
        input.routing.now,
        input.routing.record.requestedScopeHash,
      ),
    });
  }
}
