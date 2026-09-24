import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { openWidgetNounHandle } from '../emission/seal.service';
import type {
  NounActor,
  NounResolverInput,
} from '../noun-resolution/noun-resolution';
import type {
  NounReadPort,
  NounReadResult,
} from '../noun-resolution/noun-resolution.ports';
import { BookingCreateNounAdapter } from './noun-booking-create.adapter';
import { BookingCancelNounAdapter } from './noun-booking-cancel.adapter';
import { BookingRescheduleNounAdapter } from './noun-booking-reschedule.adapter';
import { ClientAppointmentReadNounAdapter } from './noun-client-appointment-read.adapter';

@Injectable()
export class NounResolutionOwnersProvider implements NounReadPort {
  constructor(
    private readonly create: BookingCreateNounAdapter,
    private readonly cancel: BookingCancelNounAdapter,
    private readonly reschedule: BookingRescheduleNounAdapter,
    private readonly readOwner: ClientAppointmentReadNounAdapter,
  ) {}

  async read(
    input: NounResolverInput,
    actor: NounActor,
  ): Promise<NounReadResult> {
    if (actor.tenantId === null || actor.tenantId !== input.tenantId)
      return { kind: 'policy_deferred' };
    const values = new Map<string, string>();
    for (const [noun, handle] of input.frozenNouns) {
      const opened = openWidgetNounHandle(handle);
      if (
        opened === null ||
        opened.tenantId !== input.tenantId ||
        opened.noun !== noun
      )
        return { kind: 'gone', reason: 'not_found' };
      values.set(noun, opened.ownerRef);
    }
    try {
      const key = input.capability?.key ?? '';
      if (key === 'appointments.own.create') {
        if ((await this.create.quote(actor, values)) === null)
          return { kind: 'gone', reason: 'slot_taken' };
      } else if (key === 'appointments.own.reschedule') {
        if ((await this.reschedule.quote(actor, values)) === null)
          return { kind: 'gone', reason: 'slot_taken' };
      } else if (key === 'appointments.own.cancel') {
        const appointment = values.get('appointment');
        if (!appointment) return { kind: 'gone', reason: 'not_found' };
        const answer = await this.cancel.read(actor, appointment);
        if (answer === null) return { kind: 'gone', reason: 'not_found' };
        if (answer.alreadyCancelled)
          return { kind: 'gone', reason: 'already_cancelled' };
      } else if (key === 'appointments.own.list') {
        const appointment = values.get('appointment');
        if (
          !appointment ||
          !(await this.readOwner.contains(actor, appointment))
        )
          return { kind: 'gone', reason: 'not_found' };
      } else return { kind: 'policy_deferred' };
      return { kind: 'resolved', values };
    } catch (error) {
      if (error instanceof ForbiddenException)
        return { kind: 'policy_deferred' };
      if (error instanceof NotFoundException)
        return { kind: 'gone', reason: 'not_found' };
      if (error instanceof ConflictException)
        return { kind: 'gone', reason: 'slot_taken' };
      if (error instanceof BadRequestException)
        return { kind: 'gone', reason: 'slot_taken' };
      throw error;
    }
  }
}
