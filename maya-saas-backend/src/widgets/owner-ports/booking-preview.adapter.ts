import { Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { mintBookingCreateFactsRef } from '../booking/booking-create-facts-ref';

import { ClientAppointmentCreateService } from '../../appointments/client-appointment-create.service';
import { ClientAppointmentCancelService } from '../../crm/client-appointment-cancel.service';
import { ClientAppointmentRescheduleService } from '../../crm/client-appointment-reschedule.service';
import { ClientAppointmentReadService } from '../../crm/client-appointment-read.service';
import { isUsableTimezone } from '../../tenants/salon-timezone';
import type { FactUsed } from '../../widget-contract/envelope';
import type { BookingConfirmationPreview } from '../booking/booking-confirmation-minter.port';
import { subjectOf } from '../gates/subject';
import type {
  ActuatingRoutingInput,
  BookingProposeOwnerPort,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';
import type { DraftOwnerPort } from './draft-owner.registry';
import { openWidgetNounHandle } from '../emission/seal.service';
import {
  decodeBookingSlotSelectionRef,
  decodeBookingCatalogOwnerRef,
  sameBookingScope,
  type BookingSlotScope,
  isBookingNounIdentity,
} from '../booking/booking-noun-identity';

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
    private readonly appointments: ClientAppointmentReadService,
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
        {
          staffId,
          serviceIds: [serviceId],
          start,
          ...(nouns.get('branch') ? { branchId: nouns.get('branch') } : {}),
        },
        {
          ...(nouns.get('branch_source_revision')
            ? { branchSourceRevision: nouns.get('branch_source_revision') }
            : {}),
        },
      );
      const service = quoted.services.find(
        (candidate) => candidate.id === serviceId,
      );
      if (!service || !quoted.staff || quoted.staff.id !== staffId)
        return refused();
      const draftRef = mintBookingCreateFactsRef(quoted.factsHash);
      return accepted({
        subject: 'create',
        sourceCapabilityKey: 'appointments.own.create',
        frozenArgumentHandles: frozen,
        draftRef,
        appointmentRef: null,
        producingIntentTokenHash: null,
        when: quoted.start,
        whenFormatted:
          new Intl.DateTimeFormat('ru-RU', {
            timeZone: quoted.timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(quoted.start)) + ` (${quoted.timezone})`,
        whenPrevious: null,
        serviceLabel: service.name,
        staffLabel: quoted.staff.name,
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
        return await this.proposeReschedule(input);
      if (subject.key === 'appointments.own.cancel')
        return await this.proposeCancel(input);
      return refused();
    } catch {
      return refused();
    }
  }

  async proposeCreateSelection(
    input: Parameters<BookingProposeOwnerPort['proposeCreateSelection']>[0],
  ): Promise<{
    outcome: EffectRouteOutcome;
    values: ReadonlyMap<string, string>;
  }> {
    const opened = new Map<string, string>();
    const scopes: (BookingSlotScope | null)[] = [];
    for (const noun of ['service', 'staff', 'slot'] as const) {
      const value = openWidgetNounHandle(input.handles[noun] as never);
      if (
        value === null ||
        value.tenantId !== input.routing.tenantId ||
        !isBookingNounIdentity(value, noun)
      )
        return { outcome: refused(), values: new Map() };
      const slot =
        noun === 'slot' ? decodeBookingSlotSelectionRef(value.ownerRef) : null;
      const catalog =
        noun === 'slot' ? null : decodeBookingCatalogOwnerRef(value.ownerRef);
      const ownerRef =
        noun === 'slot' ? (slot?.start ?? null) : (catalog?.id ?? null);
      scopes.push(
        noun === 'slot' ? (slot?.scope ?? null) : (catalog?.scope ?? null),
      );
      if (ownerRef === null) return { outcome: refused(), values: new Map() };
      opened.set(noun, ownerRef);
      if (slot?.scope) {
        opened.set('branch', slot.scope.branchId);
        opened.set('branch_source_revision', slot.scope.sourceRevision);
      }
    }
    if (scopes.some((scope) => !sameBookingScope(scope, scopes[0])))
      return { outcome: refused(), values: new Map() };
    const serviceId = opened.get('service');
    const staffId = opened.get('staff');
    const start = opened.get('slot');
    if (!serviceId || !staffId || !start)
      return { outcome: refused(), values: new Map() };
    try {
      const quoted = await this.create.quoteForAccount(
        input.routing.tenantId,
        input.actorUserId,
        {
          staffId,
          serviceIds: [serviceId],
          start,
          ...(opened.get('branch') ? { branchId: opened.get('branch') } : {}),
        },
        {
          ...(opened.get('branch_source_revision')
            ? { branchSourceRevision: opened.get('branch_source_revision') }
            : {}),
        },
      );
      const service = quoted.services.find(
        (candidate) => candidate.id === serviceId,
      );
      if (!service || !quoted.staff || quoted.staff.id !== staffId)
        return { outcome: refused(), values: new Map() };
      const draftRef = mintBookingCreateFactsRef(quoted.factsHash);
      return {
        outcome: accepted({
          subject: 'create',
          sourceCapabilityKey: 'appointments.own.create',
          frozenArgumentHandles: input.handles,
          draftRef,
          appointmentRef: null,
          producingIntentTokenHash: null,
          when: quoted.start,
          whenFormatted:
            new Intl.DateTimeFormat('ru-RU', {
              timeZone: quoted.timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(quoted.start)) + ` (${quoted.timezone})`,
          whenPrevious: null,
          serviceLabel: service.name,
          staffLabel: quoted.staff.name,
          durationMinutes: service.duration_minutes,
          priceKopecks: Math.round(service.price * 100),
          currency: service.currency,
          fact: fact(
            'appointments.own.create',
            input.routing.now,
            input.routing.record.requestedScopeHash,
          ),
        }),
        values: new Map([
          ...opened,
          ['service', serviceId],
          ['staff', staffId],
          ['slot', quoted.start],
        ]),
      };
    } catch {
      return { outcome: refused(), values: new Map() };
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
    const display = await this.ownedDisplay(
      input,
      appointment,
      quoted.prepared,
    );
    // Public-label reads can await the CRM. Re-read the existing operation
    // owner afterwards; display data never renews Client/source authority.
    const current = await this.cancel.readOwnedCancelTarget(
      input.routing.tenantId,
      input.actorUserId,
      appointmentId,
    );
    if (
      current.alreadyCancelled ||
      current.target.tenantId !== quoted.target.tenantId ||
      current.target.clientId !== quoted.target.clientId ||
      current.target.linkId !== quoted.target.linkId ||
      (current.target.branchSourceRevision ?? null) !==
        (quoted.prepared.branchSourceRevision ?? null) ||
      !isDeepStrictEqual(current.target.appointment, appointment)
    )
      return refused();
    const preview: BookingConfirmationPreview = {
      subject: 'reschedule',
      sourceCapabilityKey: 'appointments.own.reschedule',
      frozenArgumentHandles: frozen,
      draftRef: null,
      appointmentRef: appointmentId,
      producingIntentTokenHash: input.routing.record.intentTokenHash,
      when: quoted.prepared.start,
      whenFormatted: this.displayTime(
        quoted.prepared.start,
        quoted.prepared.timezone,
      ),
      whenPrevious: appointment.startAt.toISOString(),
      whenPreviousFormatted: this.displayTime(
        appointment.startAt.toISOString(),
        quoted.prepared.timezone,
      ),
      serviceLabel: display.serviceLabel,
      staffLabel: display.staffLabel,
      durationMinutes: Math.max(
        1,
        Math.round(
          (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60000,
        ),
      ),
      priceKopecks: appointment.totalPriceKopecks,
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
    const display = await this.ownedDisplay(input, appointment);
    const current = await this.cancel.readOwnedCancelTarget(
      input.routing.tenantId,
      input.actorUserId,
      appointmentId,
    );
    if (!isDeepStrictEqual(current, quoted)) return refused();
    return accepted({
      subject: 'cancel',
      sourceCapabilityKey: 'appointments.own.cancel',
      frozenArgumentHandles: frozen,
      draftRef: null,
      appointmentRef: appointmentId,
      producingIntentTokenHash: input.routing.record.intentTokenHash,
      when: appointment.startAt.toISOString(),
      whenFormatted: this.displayTime(
        appointment.startAt.toISOString(),
        display.timezone,
      ),
      whenPrevious: null,
      serviceLabel: display.serviceLabel,
      staffLabel: display.staffLabel,
      durationMinutes: Math.max(
        1,
        Math.round(
          (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60000,
        ),
      ),
      priceKopecks: appointment.totalPriceKopecks,
      currency: appointment.currency,
      fact: fact(
        'appointments.own.cancel',
        input.routing.now,
        input.routing.record.requestedScopeHash,
      ),
    });
  }

  private async ownedDisplay(
    input: ActuatingRoutingInput,
    appointment: Awaited<
      ReturnType<ClientAppointmentCancelService['readOwnedCancelTarget']>
    >['target']['appointment'],
    selection?: { serviceIds: string[]; staffId: string },
  ) {
    const rows = await this.appointments.forAccount(
      input.routing.tenantId,
      input.actorUserId,
    );
    const row = rows.find(
      (value) =>
        value.id === appointment.id &&
        value.tenant_id === input.routing.tenantId,
    );
    if (
      !row ||
      row.branch_id !== appointment.branchId ||
      row.staff_external_id !== appointment.staffExternalId ||
      JSON.stringify(row.service_ids) !==
        JSON.stringify(appointment.serviceIds) ||
      row.start_at.getTime() !== appointment.startAt.getTime() ||
      row.end_at.getTime() !== appointment.endAt.getTime() ||
      row.updated_at.getTime() !== appointment.updatedAt.getTime() ||
      row.status !== appointment.status ||
      row.source !== appointment.source ||
      row.crm_external_id !== appointment.crmExternalId
    )
      throw new Error('booking_preview_display_changed');
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    return {
      // Missing public catalogue labels do not acquire identity from an ID or
      // revoke the existing ability to cancel an owned appointment.
      serviceLabel:
        (selection?.serviceIds ?? row.service_ids)
          .map(
            (id) =>
              text(row.services.find((service) => service.id === id)?.name) ??
              'Название услуги недоступно',
          )
          .join(', ') || 'Название услуги недоступно',
      staffLabel:
        row.staff.id === (selection?.staffId ?? row.staff_external_id) &&
        'name' in row.staff
          ? (text(row.staff.name) ?? 'Имя мастера недоступно')
          : 'Имя мастера недоступно',
      timezone: row.branch?.timezone ?? row.timezone,
    };
  }

  private displayTime(instant: string, timezone: unknown) {
    const zone = isUsableTimezone(timezone) ? timezone.trim() : 'UTC';
    return (
      new Intl.DateTimeFormat('ru-RU', {
        timeZone: zone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(instant)) + ` (${zone})`
    );
  }
}
