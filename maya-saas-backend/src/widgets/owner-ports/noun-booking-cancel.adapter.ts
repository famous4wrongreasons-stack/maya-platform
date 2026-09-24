import { Injectable } from '@nestjs/common';
import { ClientAppointmentCancelService } from '../../crm/client-appointment-cancel.service';
import type { NounActor } from '../noun-resolution/noun-resolution';

@Injectable()
export class BookingCancelNounAdapter {
  constructor(private readonly owner: ClientAppointmentCancelService) {}
  read(actor: NounActor, appointmentId: string) {
    return actor.tenantId === null
      ? null
      : this.owner.readOwnedCancelTarget(
          actor.tenantId,
          actor.userId,
          appointmentId,
        );
  }
}
