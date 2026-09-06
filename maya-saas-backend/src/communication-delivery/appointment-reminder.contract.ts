import { ActionContractError } from '../action-engine/action-engine.errors';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type TrustedActionExecutionRequestV1,
} from '../action-engine/action-engine.contract';

export const REMINDER_ACTION = 'communication.appointment-reminders.execute.v1';
export type ReminderPlan = {
  version: 1;
  appointmentId: string;
  clientId: string;
  occurrence: string;
  scheduleHash: string;
  leadMinutes: number;
  linkId: string | null;
  endpointIds: string[];
  apnsDevices: Array<{ id: string; tokenHash: string }>;
  issuedAt: string;
  expiresAt: string;
};
export function normalizeReminderPlan(
  input: Record<string, unknown>,
): ReminderPlan | undefined {
  if (input.reminderPlan === undefined) return undefined;
  const p = input.reminderPlan as ReminderPlan;
  if (
    !p ||
    typeof p !== 'object' ||
    input.messageType !== 'appointment_reminder' ||
    !['inbox', 'telegram', 'web_push'].includes(String(input.channel)) ||
    Object.keys(p).sort().join(',') !==
      'apnsDevices,appointmentId,clientId,endpointIds,expiresAt,issuedAt,leadMinutes,linkId,occurrence,scheduleHash,version' ||
    p.version !== 1
  )
    throw new ActionContractError('Invalid reminder plan');
  if (input.sourceEventId !== `appointment-reminder:${p.occurrence}`)
    throw new ActionContractError('Reminder source identity mismatch');
  for (const value of [
    p.appointmentId,
    p.clientId,
    p.occurrence,
    p.scheduleHash,
  ])
    if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(value))
      throw new ActionContractError('Invalid reminder identity');
  if (
    !Number.isInteger(p.leadMinutes) ||
    p.leadMinutes < 30 ||
    p.leadMinutes > 10080 ||
    typeof p.issuedAt !== 'string' ||
    !Number.isFinite(Date.parse(p.issuedAt)) ||
    typeof p.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(p.expiresAt)) ||
    Date.parse(p.expiresAt) <= Date.parse(p.issuedAt) ||
    !Array.isArray(p.endpointIds) ||
    p.endpointIds.length > 5 ||
    new Set(p.endpointIds).size !== p.endpointIds.length ||
    p.endpointIds.some(
      (id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id),
    ) ||
    (input.channel === 'web_push'
      ? p.linkId !== null
      : typeof p.linkId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(p.linkId))
  )
    throw new ActionContractError('Invalid reminder route/schedule');
  if (
    input.channel === 'web_push' &&
    (input.clientId !== p.clientId ||
      JSON.stringify(input.endpointIds) !== JSON.stringify(p.endpointIds) ||
      input.expiresAt !== p.expiresAt)
  )
    throw new ActionContractError('Reminder device plan mismatch');
  if (
    !Array.isArray(p.apnsDevices) ||
    p.apnsDevices.some(
      (d) =>
        !d ||
        Object.keys(d).sort().join(',') !== 'id,tokenHash' ||
        typeof d.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(d.id) ||
        !/^[a-f0-9]{64}$/.test(d.tokenHash),
    ) ||
    (input.channel !== 'inbox' && p.apnsDevices.length)
  )
    throw new ActionContractError('Invalid reminder APNs snapshot');
  return {
    ...p,
    endpointIds: [...p.endpointIds],
    apnsDevices: p.apnsDevices.map((d) => ({ ...d })),
  };
}
export function reminderRequest(
  tenantId: string,
  input: Record<string, unknown>,
): TrustedActionExecutionRequestV1 {
  const p = normalizeReminderPlan(input);
  if (!p) throw new ActionContractError('Reminder plan required');
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId,
    capability: REMINDER_ACTION,
    source: {
      type: 'scheduler',
      sourceRef: `b25.reminder:${p.occurrence}`,
      occurrenceScope: p.occurrence,
    },
    targetRef: `client:${p.clientId}`,
    input,
    evidenceRefs: [`appointment-schedule:${p.scheduleHash}`],
    intentExpiresAt: new Date(p.expiresAt),
    callerIdempotency: {
      scope: 'communication:appointment:occurrence:v1',
      key: p.occurrence,
    },
  };
}
/** Server-internal dispatch-time authority. Never serialized or exposed via HTTP. */
export type ReminderDispatch = {
  request: TrustedActionExecutionRequestV1;
  authorize: () => Promise<void>;
};
