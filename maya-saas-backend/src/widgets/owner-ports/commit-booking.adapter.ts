import { Injectable } from '@nestjs/common';

import {
  type ActionInvocationReceiptContext,
  withActionInvocationReceipt,
} from '../../action-engine/action-invocation-receipt.context';
import { ClientAppointmentCreateService } from '../../appointments/client-appointment-create.service';
import { ClientAppointmentCancelService } from '../../crm/client-appointment-cancel.service';
import { ClientAppointmentRescheduleService } from '../../crm/client-appointment-reschedule.service';
import type {
  ActuatingRoutingInput,
  CommitBookingOwnerPort,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';

const rejected = (reason?: string): EffectRouteOutcome => ({
  receiptOutcome: 'REFUSED',
  refusalCode: reason ? 'insufficient_authority' : 'effect_not_admissible',
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: null,
  gate14RefusalReason: reason ?? null,
});

/**
 * U13c: COMMIT reaches the three existing appointment owners. This adapter
 * never constructs an Action Engine request. It supplies only the immutable
 * server-minted caller idempotency key and observes the owner's canonical
 * execution through the existing invocation-receipt seam.
 */
@Injectable()
export class CommitBookingAdapter implements CommitBookingOwnerPort {
  constructor(
    private readonly create: ClientAppointmentCreateService,
    private readonly cancel: ClientAppointmentCancelService,
    private readonly reschedule: ClientAppointmentRescheduleService,
  ) {}

  async commit(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const record = input.routing.record;
    if (
      record.capabilitySpace !== 'AE' ||
      record.widgetKind !== 'BOOKING_CONFIRMATION' ||
      typeof record.confirmationIdempotencyKey !== 'string' ||
      record.confirmationIdempotencyKey.length === 0
    )
      return rejected();

    let executionId: string | null = null;
    const expectedKey = record.confirmationIdempotencyKey;
    const receipt: ActionInvocationReceiptContext = {
      observe: (execution) => {
        executionId = execution.id;
        return Promise.resolve();
      },
      admit: async (request, persist, transaction) => {
        if (
          request.source.type !== 'authenticated_request' ||
          request.callerIdempotency?.key !== expectedKey
        )
          throw new Error('WIDGET_CANONICAL_INVOCATION_MISMATCH');
        const execution = await persist(request, transaction);
        executionId = execution.id;
        return execution;
      },
    };

    try {
      await withActionInvocationReceipt(receipt, () => this.invoke(input));
    } catch (error) {
      if (executionId === null) return rejected(gate14Reason(error));
    }
    if (executionId === null) return rejected();

    const result = await this.create.executionResult(
      input.routing.tenantId,
      executionId,
    );
    if (result.state === 'SUCCEEDED')
      return {
        receiptOutcome: 'ACCEPTED',
        refusalCode: null,
        actionReceiptRef: result.executionId,
        nextEnvelope: null,
        resolvedWidget: null,
        ownerDecision: { state: result.state, outcomeCode: result.outcomeCode },
        gate14RefusalReason: null,
      };
    if (result.state === 'UNKNOWN')
      return {
        receiptOutcome: 'ACCEPTED',
        refusalCode: null,
        actionReceiptRef: null,
        nextEnvelope: null,
        resolvedWidget: null,
        ownerDecision: { state: result.state, reconciliation: 'required' },
        gate14RefusalReason: null,
      };
    return rejected();
  }

  private invoke(input: ActuatingRoutingInput): Promise<unknown> {
    const record = input.routing.record;
    const nouns = input.resolvedNouns.values;
    const invocation = {
      sourceType: 'authenticated_request' as const,
      callerIdempotency: {
        scope: 'maya.widgets.booking.commit.v1',
        key: record.confirmationIdempotencyKey as string,
      },
    };
    switch (record.capabilityKey) {
      case 'crm.appointment.create.v1': {
        const staffId = nouns.get('staff');
        const serviceId = nouns.get('service');
        const start = nouns.get('slot') ?? nouns.get('start');
        if (!staffId || !serviceId || !start)
          return Promise.reject(new Error('BOOKING_NOUNS_REQUIRED'));
        return this.create.forAccount(
          input.routing.tenantId,
          input.actorUserId,
          {
            staffId,
            serviceIds: [serviceId],
            start,
            ...(nouns.get('branch') ? { branchId: nouns.get('branch') } : {}),
          },
          invocation,
        );
      }
      case 'crm.appointment.cancel.v1': {
        const appointmentId = nouns.get('appointment');
        if (!appointmentId)
          return Promise.reject(new Error('BOOKING_NOUNS_REQUIRED'));
        return this.cancel.forAccount(
          input.routing.tenantId,
          input.actorUserId,
          appointmentId,
          invocation,
        );
      }
      case 'crm.appointment.reschedule.v1': {
        const appointmentId = nouns.get('appointment');
        const start = nouns.get('slot') ?? nouns.get('start');
        if (!appointmentId || !start)
          return Promise.reject(new Error('BOOKING_NOUNS_REQUIRED'));
        return this.reschedule.forAccount(
          input.routing.tenantId,
          input.actorUserId,
          appointmentId,
          {
            start,
            ...(nouns.get('staff') ? { staffId: nouns.get('staff') } : {}),
            ...(nouns.get('service')
              ? { serviceIds: [nouns.get('service') as string] }
              : {}),
            ...(nouns.get('branch') ? { branchId: nouns.get('branch') } : {}),
          },
          invocation,
        );
      }
      default:
        return Promise.reject(new Error('BOOKING_CAPABILITY_NOT_ALLOWED'));
    }
  }
}

const gate14Reason = (error: unknown): string | undefined => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('entitlement')) return 'entitlement_denied';
  if (message.includes('inactive') && message.includes('user'))
    return 'user_inactive';
  if (message.includes('inactive')) return 'membership_inactive';
  if (message.includes('membership') || message.includes('active account'))
    return 'membership_missing';
  if (message.includes('actor') || message.includes('authenticated'))
    return 'actor_required';
  if (message.includes('role') || message.includes('authority'))
    return 'role_denied';
  return undefined;
};
