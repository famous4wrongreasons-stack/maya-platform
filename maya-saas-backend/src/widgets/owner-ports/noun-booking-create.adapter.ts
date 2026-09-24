import { Injectable } from '@nestjs/common';
import { ClientAppointmentCreateService } from '../../appointments/client-appointment-create.service';
import type { NounActor } from '../noun-resolution/noun-resolution';

@Injectable()
export class BookingCreateNounAdapter {
  constructor(private readonly owner: ClientAppointmentCreateService) {}
  quote(actor: NounActor, nouns: ReadonlyMap<string, string>) {
    if (actor.tenantId === null) return null;
    const staffId = nouns.get('staff');
    const serviceId = nouns.get('service');
    const start = nouns.get('slot') ?? nouns.get('start');
    if (!staffId || !serviceId || !start) return null;
    return this.owner.quoteForAccount(actor.tenantId, actor.userId, {
      staffId,
      serviceIds: [serviceId],
      start,
      ...(nouns.get('branch') ? { branchId: nouns.get('branch') } : {}),
    });
  }
}
