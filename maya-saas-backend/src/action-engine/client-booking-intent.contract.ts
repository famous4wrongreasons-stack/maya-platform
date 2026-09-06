import { normalizeRussianPhone } from '../common/phone.util';
import { ActionContractError } from './action-engine.errors';
import { normalizeOpaqueRef } from './action-engine.registry';

export const CLIENT_BOOKING_INTENT_CONTRACT =
  'maya.client-appointment-create-intent/1' as const;
export const CLIENT_BOOKING_IDEMPOTENCY_SCOPE =
  'appointments.client.create.v1' as const;

export interface ClientBookingCalendarTarget {
  source: 'internal' | 'external';
  provider: string | null;
  companyId: string | null;
}

/** Trusted server resolution, never copied from an HTTP/AI input object. */
export interface ClientBookingIntentContext {
  contract: typeof CLIENT_BOOKING_INTENT_CONTRACT;
  calendarTarget: ClientBookingCalendarTarget;
  timezone: string;
}

export interface ClientBookingIntentDescriptor {
  tenantId: string;
  mayaClientId: string;
  calendarTarget: ClientBookingCalendarTarget;
  branchId: string | null;
  staffRef: string;
  serviceIds: string[];
  startAt: string;
  durationMinutes: number | null;
  clientName: string;
  clientPhone: string;
  notes: string | null;
  creationMode: 'client';
  allowBusy: false;
  notifyBySmsHours: 0;
}

export interface ClientBookingSnapshot {
  descriptor: ClientBookingIntentDescriptor;
  resolutionContext: { timezone: string };
}

export interface BoundClientBookingSnapshot extends ClientBookingSnapshot {
  executionId: string;
}

export function normalizeClientBookingIntent(
  tenantId: string,
  normalizedActionInput: Record<string, unknown>,
  context: ClientBookingIntentContext,
): ClientBookingSnapshot {
  if (context.contract !== CLIENT_BOOKING_INTENT_CONTRACT)
    throw new ActionContractError(
      'Unsupported canonical booking intent version',
    );
  const source = context.calendarTarget.source;
  const provider = context.calendarTarget.provider;
  const companyId = context.calendarTarget.companyId;
  if (source === 'internal') {
    if (provider !== null || companyId !== null)
      throw new ActionContractError(
        'Internal booking target cannot contain a provider',
      );
  } else if (source === 'external') {
    normalizeOpaqueRef(provider, 'bookingProvider');
    if (
      (provider === 'yclients' || provider === 'altegio') &&
      (typeof companyId !== 'string' ||
        !/^[1-9]\d*$/.test(companyId) ||
        !Number.isSafeInteger(Number(companyId)))
    )
      throw new ActionContractError('Canonical provider company required');
    if (provider !== 'yclients' && provider !== 'altegio' && companyId !== null)
      throw new ActionContractError('Unsupported provider company contract');
  } else throw new ActionContractError('Canonical calendar source required');
  // This input has already passed the registered create action normalizer.
  const input = normalizedActionInput;
  if (
    input.creationMode !== 'client' ||
    input.allowBusy !== false ||
    input.notifyBySmsHours !== 0
  )
    throw new ActionContractError('Canonical Client create options required');
  if (
    typeof input.clientName !== 'string' ||
    typeof input.clientPhone !== 'string'
  )
    throw new ActionContractError('Canonical booking contact required');
  new Intl.DateTimeFormat('en', { timeZone: context.timezone });
  return {
    descriptor: {
      tenantId: normalizeOpaqueRef(tenantId, 'tenantId'),
      mayaClientId: normalizeOpaqueRef(input.clientId, 'clientId'),
      calendarTarget: { source, provider, companyId },
      branchId: typeof input.branchId === 'string' ? input.branchId : null,
      staffRef: normalizeOpaqueRef(input.staffId, 'staffId'),
      serviceIds: [...new Set(input.serviceIds as string[])].sort(),
      startAt: new Date(String(input.start)).toISOString(),
      durationMinutes:
        typeof input.durationMinutes === 'number'
          ? input.durationMinutes
          : null,
      clientName: input.clientName.trim(),
      clientPhone: normalizeRussianPhone(input.clientPhone),
      notes: typeof input.notes === 'string' ? input.notes : null,
      creationMode: 'client',
      allowBusy: false,
      notifyBySmsHours: 0,
    },
    resolutionContext: { timezone: context.timezone },
  };
}
