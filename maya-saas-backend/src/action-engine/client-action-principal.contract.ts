import { ActionContractError } from './action-engine.errors';
import {
  ActionCapabilityRegistry,
  normalizeOpaqueRef,
} from './action-engine.registry';

const AUTHORITY_PREFIX = 'client-authority:v1:';
const TARGET_PREFIX = 'client-target:appointment:v1:';

export interface ClientActionPrincipal {
  linkId: string;
  target:
    | { kind: 'create_appointment'; clientId: string }
    | { kind: 'appointment'; appointmentId: string; externalId: string };
}

export function clientPrincipalTarget(capability: string) {
  if (capability === 'crm.appointment.create.v1') return 'create_appointment';
  if (
    [
      'crm.appointment.cancel.v1',
      'crm.appointment.reschedule.v1',
      'crm.appointment.services.v1',
    ].includes(capability)
  )
    return 'appointment';
  return undefined;
}

/** Only trusted initiators call this after authenticating and resolving a link.
 * An evidence reference is durable attribution, never a bearer credential. */
export function clientPrincipalEvidence(
  linkId: string,
  appointmentId?: string,
): string[] {
  const refs = [AUTHORITY_PREFIX + normalizeOpaqueRef(linkId, 'Client link')];
  if (appointmentId)
    refs.push(TARGET_PREFIX + normalizeOpaqueRef(appointmentId, 'Appointment'));
  refs.forEach((ref) => normalizeOpaqueRef(ref, 'Client authority evidence'));
  return refs;
}

/** Shared admission/claim projection. Business normalization remains owned by
 * the existing capability; channel metadata never enters its intent hash. */
export function readClientActionPrincipal(request: {
  capability: string;
  sourceType: string;
  targetRef: string;
  input: unknown;
  evidenceRefs: readonly string[];
  hasBookingIntent: boolean;
}): ClientActionPrincipal | undefined {
  const refs = request.evidenceRefs.filter(
    (ref) =>
      ref.startsWith('client-authority:') || ref.startsWith('client-target:'),
  );
  if (!refs.length) return undefined;
  const kind = clientPrincipalTarget(request.capability);
  const authority = refs.filter((ref) => ref.startsWith(AUTHORITY_PREFIX));
  const targets = refs.filter((ref) => ref.startsWith(TARGET_PREFIX));
  if (
    !kind ||
    request.sourceType !== 'authenticated_request' ||
    authority.length !== 1 ||
    refs.length !== authority.length + targets.length ||
    targets.length !== (kind === 'appointment' ? 1 : 0)
  )
    throw new ActionContractError(
      'Invalid or unregistered Client authority evidence',
    );
  const linkId = normalizeOpaqueRef(
    authority[0].slice(AUTHORITY_PREFIX.length),
    'Client link',
  );
  const input = new ActionCapabilityRegistry()
    .get(request.capability)
    .normalizeInput(request.input);
  if (kind === 'create_appointment') {
    if (
      !request.hasBookingIntent ||
      input.creationMode !== 'client' ||
      input.allowBusy !== false ||
      input.notifyBySmsHours !== 0 ||
      !request.targetRef.startsWith('create/')
    )
      throw new ActionContractError(
        'Client create requires the canonical immutable booking intent',
      );
    return {
      linkId,
      target: {
        kind,
        clientId: normalizeOpaqueRef(input.clientId, 'canonical Client'),
      },
    };
  }
  const externalId = normalizeOpaqueRef(
    request.capability === 'crm.appointment.services.v1'
      ? request.targetRef.slice('appointment/'.length)
      : input.externalId,
    'Appointment reference',
  );
  if (request.targetRef !== `appointment/${externalId}`)
    throw new ActionContractError(
      'Client authority does not match the action target',
    );
  return {
    linkId,
    target: {
      kind,
      externalId,
      appointmentId: normalizeOpaqueRef(
        targets[0].slice(TARGET_PREFIX.length),
        'canonical Appointment',
      ),
    },
  };
}
