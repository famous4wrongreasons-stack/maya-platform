import { Injectable } from '@nestjs/common';
import { ClientAppointmentReadService } from '../../crm/client-appointment-read.service';
import type { NounActor } from '../noun-resolution/noun-resolution';

@Injectable()
export class ClientAppointmentReadNounAdapter {
  constructor(private readonly owner: ClientAppointmentReadService) {}
  async contains(actor: NounActor, appointmentId: string): Promise<boolean> {
    if (actor.tenantId === null) return false;
    const rows = await this.owner.forAccount(actor.tenantId, actor.userId);
    return rows.some((row) => row.id === appointmentId);
  }
}
