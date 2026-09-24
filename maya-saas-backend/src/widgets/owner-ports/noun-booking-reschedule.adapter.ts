import { Injectable } from '@nestjs/common';
import { ClientAppointmentRescheduleService } from '../../crm/client-appointment-reschedule.service';
import type { NounActor } from '../noun-resolution/noun-resolution';

@Injectable()
export class BookingRescheduleNounAdapter {
  constructor(private readonly owner: ClientAppointmentRescheduleService) {}
  quote(actor: NounActor, nouns: ReadonlyMap<string, string>) {
    if (actor.tenantId === null) return null;
    const appointmentId = nouns.get('appointment');
    const start = nouns.get('slot') ?? nouns.get('start');
    if (!appointmentId || !start) return null;
    return this.owner.quoteOwnedReschedule(
      actor.tenantId,
      actor.userId,
      appointmentId,
      {
        start,
        ...(nouns.get('staff') ? { staffId: nouns.get('staff') } : {}),
        ...(nouns.get('service')
          ? { serviceIds: [nouns.get('service') as string] }
          : {}),
        ...(nouns.get('branch') ? { branchId: nouns.get('branch') } : {}),
      },
    );
  }
}
