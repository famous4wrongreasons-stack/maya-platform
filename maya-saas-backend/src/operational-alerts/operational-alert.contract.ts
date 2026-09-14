import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type TrustedActionExecutionRequestV1,
} from '../action-engine/action-engine.contract';
import {
  ActionIdentityService,
  stableActionJson,
} from '../action-engine/action-engine.identity';
import { ActionContractError } from '../action-engine/action-engine.errors';
export const ALERT_CONTRACT = 'maya.operational-alert-plan/1';
export const ALERT_DAY = 86400000;
export const SHIFT_ROLES = [
  'tenant_owner',
  'business_owner',
  'provider',
  'employee',
  'staff',
] as const;
export const ALERT_ADMIN_ROLES = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
] as const;
export type ShiftSource = {
  staffId: string;
  branchId: string;
  calendarSource: 'internal' | 'external';
  integrationId: string | null;
  staffProviderLinkId: string | null;
  localDate: string;
  timezone: string;
  leadMinutes: 30 | 60;
  scheduledStartAt: string;
  scheduleEvidenceHash: string;
};
export type InterestSource = {
  interestId: string;
  clientId: string;
  branchId: string;
  staffId: string;
  createdByActionExecutionId: string;
  sourceChannelLinkId: string;
  desiredStartAt: string;
  interestExpiresAt: string;
  creationEvidenceHash: string;
};
export type AlertRecipient = {
  userId: string;
  membershipId: string;
  role: string;
  branchScope: string;
  content: {
    title: string;
    bodyText: string;
    payload: Record<string, unknown>;
    deepLink: string;
  };
  slot: { key: string; channel: 'inbox'; routeId: string; destination: string };
};
export type AlertPlan = {
  contract: typeof ALERT_CONTRACT;
  tenantId: string;
  alertType: 'staff_shift_reminder' | 'wanted_slot_admin_notice';
  occurrenceRef: string;
  contractVersion: 1;
  occurredAt: string;
  expiresAt: string;
  source: ShiftSource | InterestSource;
  policy: {
    capability: string;
    actionClass: string;
    policyKey: string;
    policyVersion: 1;
    classification: 'operational_single';
    channelOrder: ['inbox'];
  };
  recipients: AlertRecipient[];
};
const keys = (value: unknown, list: string[]) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...list].sort().join(',');
export function normalizeAlert(value: unknown): AlertPlan {
  const p = value as AlertPlan;
  if (
    !keys(p, [
      'contract',
      'tenantId',
      'alertType',
      'occurrenceRef',
      'contractVersion',
      'occurredAt',
      'expiresAt',
      'source',
      'policy',
      'recipients',
    ]) ||
    p.contract !== ALERT_CONTRACT ||
    p.contractVersion !== 1 ||
    !['staff_shift_reminder', 'wanted_slot_admin_notice'].includes(
      p.alertType,
    ) ||
    !/^[a-f0-9]{64}$/.test(p.occurrenceRef)
  )
    throw new ActionContractError('R06 finite alert plan required');
  const shift = p.alertType === 'staff_shift_reminder',
    policy = alertPolicy(p.alertType);
  if (stableActionJson(p.policy) !== stableActionJson(policy))
    throw new ActionContractError('R06 immutable Inbox policy required');
  const sourceKeys = shift
    ? [
        'staffId',
        'branchId',
        'calendarSource',
        'integrationId',
        'staffProviderLinkId',
        'localDate',
        'timezone',
        'leadMinutes',
        'scheduledStartAt',
        'scheduleEvidenceHash',
      ]
    : [
        'interestId',
        'clientId',
        'branchId',
        'staffId',
        'createdByActionExecutionId',
        'sourceChannelLinkId',
        'desiredStartAt',
        'interestExpiresAt',
        'creationEvidenceHash',
      ];
  if (!keys(p.source, sourceKeys))
    throw new ActionContractError('R06 exact source discriminator required');
  const source = p.source as unknown as Record<string, unknown>;
  for (const [key, v] of Object.entries(source)) {
    if (
      v === null &&
      shift &&
      ['integrationId', 'staffProviderLinkId'].includes(key)
    )
      continue;
    if (key === 'leadMinutes' && [30, 60].includes(Number(v))) continue;
    if (typeof v !== 'string' || !v || v.length > 200)
      throw new ActionContractError('R06 source field invalid');
  }
  for (const instant of [p.occurredAt, p.expiresAt])
    if (
      typeof instant !== 'string' ||
      !Number.isFinite(Date.parse(instant)) ||
      new Date(instant).toISOString() !== instant
    )
      throw new ActionContractError('R06 canonical UTC timestamp required');
  if (
    Date.parse(p.expiresAt) <= Date.parse(p.occurredAt) ||
    !Array.isArray(p.recipients) ||
    !p.recipients.length
  )
    throw new ActionContractError('R06 nonempty live recipient plan required');
  const recipients = p.recipients
    .map((r) => {
      if (
        !keys(r, [
          'userId',
          'membershipId',
          'role',
          'branchScope',
          'content',
          'slot',
        ]) ||
        !(shift ? SHIFT_ROLES : ALERT_ADMIN_ROLES).includes(r.role as never) ||
        !keys(r.content, ['title', 'bodyText', 'payload', 'deepLink']) ||
        !keys(r.slot, ['key', 'channel', 'routeId', 'destination']) ||
        r.slot.channel !== 'inbox' ||
        r.slot.routeId !== r.membershipId ||
        r.slot.destination !== r.userId ||
        !/^[a-f0-9]{64}$/.test(r.slot.key) ||
        !['tenant', 'branch:' + String(source.branchId)].includes(r.branchScope)
      )
        throw new ActionContractError('R06 canonical recipient route required');
      if (
        !r.content.title ||
        r.content.title.length > 160 ||
        !r.content.bodyText ||
        r.content.bodyText.length > 12000 ||
        !r.content.deepLink.startsWith('/')
      )
        throw new ActionContractError('R06 content invalid');
      return {
        ...r,
        content: {
          ...r.content,
          title: r.content.title.normalize('NFC'),
          bodyText: r.content.bodyText.normalize('NFC'),
        },
      };
    })
    .sort((a, b) => a.userId.localeCompare(b.userId));
  if (new Set(recipients.map((r) => r.userId)).size !== recipients.length)
    throw new ActionContractError('R06 duplicate audience');
  return { ...p, recipients };
}
export function alertPolicy(kind: AlertPlan['alertType']): AlertPlan['policy'] {
  const actionClass =
    kind === 'staff_shift_reminder'
      ? 'deliver_appointment_reminder'
      : 'deliver_business_alert';
  return {
    capability:
      kind === 'staff_shift_reminder'
        ? 'communication.appointment-reminders.execute.v1'
        : 'communication.business-alerts.execute.v1',
    actionClass,
    policyKey: `production.${actionClass}.proven-cutover`,
    policyVersion: 1,
    classification: 'operational_single',
    channelOrder: ['inbox'],
  };
}
export function alertFingerprint(
  identity: ActionIdentityService,
  plan: AlertPlan,
) {
  return identity.hmac(ALERT_CONTRACT, normalizeAlert(plan));
}
export function alertRequest(
  id: string,
  identity: ActionIdentityService,
  plan: AlertPlan,
  recipient: AlertRecipient,
): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: plan.tenantId,
    capability: plan.policy.capability,
    source: {
      type: 'scheduler',
      sourceRef: 'operational-alert:' + plan.occurrenceRef,
      occurrenceScope: `operational-alert:${plan.occurrenceRef}:${recipient.slot.key}`,
    },
    targetRef: 'user:' + recipient.userId,
    input: {
      channel: 'inbox',
      messageType:
        plan.alertType === 'staff_shift_reminder'
          ? 'shift_reminder'
          : 'owner_alert',
      userId: recipient.userId,
      sourceEventId: 'operational-alert:' + plan.occurrenceRef,
      title: recipient.content.title,
      bodyText: recipient.content.bodyText,
      deepLink: recipient.content.deepLink,
      payload: recipient.content.payload,
      recipientIdentityRef: recipient.slot.key,
    },
    evidenceRefs: [
      'operational-alert:' + alertFingerprint(identity, plan),
      'operational-alert-slot:' + recipient.slot.key,
    ],
    intentExpiresAt: new Date(plan.expiresAt),
    callerIdempotency: {
      scope: 'communication:operational-alert:v1',
      key: plan.occurrenceRef + ':' + recipient.slot.key,
    },
    operationalAlertSlot: { runId: id, slotKey: recipient.slot.key },
  };
}
