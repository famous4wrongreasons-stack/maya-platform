import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type TrustedActionExecutionRequestV1,
} from '../action-engine/action-engine.contract';
import { ActionContractError } from '../action-engine/action-engine.errors';
import {
  ActionIdentityService,
  stableActionJson,
} from '../action-engine/action-engine.identity';
import { dayIsoRange } from './owner-reports.time';

export const OWNER_REPORT_ACTION = 'communication.reports-briefings.execute.v1';
export const OWNER_REPORT_CONTRACT = 'maya.owner-report-plan/1';
export const OWNER_REPORT_ORDER = ['inbox', 'telegram', 'apns'] as const;
export const OWNER_REPORT_ROLES = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'platform_owner',
] as const;
export const OWNER_REPORT_DAY = 86_400_000;
export type OwnerReportChannel = (typeof OWNER_REPORT_ORDER)[number];
export type OwnerReportSlot = {
  key: string;
  channel: OwnerReportChannel;
  routeId: string;
  routeHash: string;
  /** Recoverable destination is encrypted with the whole manifest, never evidence/log data. */
  destination: string;
};
export type OwnerReportRecipient = {
  userId: string;
  membershipId: string;
  role: (typeof OWNER_REPORT_ROLES)[number];
  slots: OwnerReportSlot[];
};
export type OwnerReportPlan = {
  contract: typeof OWNER_REPORT_CONTRACT;
  tenantId: string;
  reportType: 'daily_report';
  periodLocalDate: string;
  reportVersion: 1;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  expiresAt: string;
  classification: 'operational_single';
  channelOrder: typeof OWNER_REPORT_ORDER;
  policy: {
    action: typeof OWNER_REPORT_ACTION;
    key: 'production.deliver_report_briefing.proven-cutover';
    version: 1;
    preference: 'daily_brief';
  };
  content: {
    title: string;
    bodyText: string;
    payload: Record<string, unknown>;
    deepLink: string;
  };
  recipients: OwnerReportRecipient[];
};
const opaque = /^[A-Za-z0-9_.:-]{1,160}$/;
const hash = /^[a-f0-9]{64}$/;
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function exact(value: object, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
  )
    throw new ActionContractError('Invalid owner report contract keys');
}
export function normalizeOwnerReportPlan(
  candidate: OwnerReportPlan,
): OwnerReportPlan {
  exact(candidate, [
    'contract',
    'tenantId',
    'reportType',
    'periodLocalDate',
    'reportVersion',
    'timezone',
    'periodStart',
    'periodEnd',
    'expiresAt',
    'classification',
    'channelOrder',
    'policy',
    'content',
    'recipients',
  ]);
  const plan = JSON.parse(stableActionJson(candidate)) as OwnerReportPlan;
  if (
    plan.contract !== OWNER_REPORT_CONTRACT ||
    !opaque.test(plan.tenantId) ||
    plan.reportType !== 'daily_report' ||
    plan.reportVersion !== 1 ||
    plan.classification !== 'operational_single' ||
    stableActionJson(plan.channelOrder) !==
      stableActionJson(OWNER_REPORT_ORDER) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(plan.periodLocalDate)
  )
    throw new ActionContractError('Invalid owner report identity/order');
  const range = dayIsoRange(plan.timezone, plan.periodLocalDate);
  const end = new Date(Date.parse(range.to) + 1).toISOString();
  if (
    plan.periodStart !== range.from ||
    plan.periodEnd !== end ||
    plan.expiresAt !==
      new Date(Date.parse(end) + 7 * OWNER_REPORT_DAY).toISOString()
  )
    throw new ActionContractError('Invalid owner report period/expiry');
  exact(plan.policy, ['action', 'key', 'version', 'preference']);
  if (
    plan.policy.action !== OWNER_REPORT_ACTION ||
    plan.policy.key !== 'production.deliver_report_briefing.proven-cutover' ||
    plan.policy.version !== 1 ||
    plan.policy.preference !== 'daily_brief'
  )
    throw new ActionContractError('Invalid owner report policy');
  exact(plan.content, ['title', 'bodyText', 'payload', 'deepLink']);
  if (
    typeof plan.content.title !== 'string' ||
    !plan.content.title.trim() ||
    plan.content.title.length > 160 ||
    typeof plan.content.bodyText !== 'string' ||
    !plan.content.bodyText.trim() ||
    plan.content.bodyText.length > 12000 ||
    typeof plan.content.deepLink !== 'string' ||
    plan.content.deepLink !== '/app/?panel=chat' ||
    !plan.content.payload ||
    typeof plan.content.payload !== 'object' ||
    Array.isArray(plan.content.payload) ||
    !Array.isArray(plan.recipients) ||
    !plan.recipients.length
  )
    throw new ActionContractError('Invalid owner report content/recipients');
  plan.content.title = plan.content.title.trim();
  plan.content.bodyText = plan.content.bodyText.trim();
  const users = new Set<string>();
  const keys = new Set<string>();
  for (const recipient of plan.recipients) {
    exact(recipient, ['userId', 'membershipId', 'role', 'slots']);
    if (
      !opaque.test(recipient.userId) ||
      !opaque.test(recipient.membershipId) ||
      !OWNER_REPORT_ROLES.includes(recipient.role) ||
      users.has(recipient.userId) ||
      !Array.isArray(recipient.slots)
    )
      throw new ActionContractError('Invalid owner report principal');
    users.add(recipient.userId);
    for (const slot of recipient.slots) {
      exact(slot, ['key', 'channel', 'routeId', 'routeHash', 'destination']);
      if (
        !hash.test(slot.key) ||
        !hash.test(slot.routeHash) ||
        !opaque.test(slot.routeId) ||
        !OWNER_REPORT_ORDER.includes(slot.channel) ||
        typeof slot.destination !== 'string' ||
        !slot.destination ||
        slot.destination.length > 512 ||
        keys.has(slot.key) ||
        (slot.channel === 'inbox' &&
          (slot.routeId !== recipient.membershipId ||
            slot.destination !== recipient.userId))
      )
        throw new ActionContractError('Invalid owner report route');
      keys.add(slot.key);
    }
    if (recipient.slots.filter((s) => s.channel === 'inbox').length !== 1)
      throw new ActionContractError(
        'Owner report requires one canonical Inbox per recipient',
      );
    recipient.slots.sort(
      (a, b) =>
        OWNER_REPORT_ORDER.indexOf(a.channel) -
          OWNER_REPORT_ORDER.indexOf(b.channel) || lexical(a.key, b.key),
    );
  }
  plan.recipients.sort((a, b) => lexical(a.userId, b.userId));
  return plan;
}
export function ownerReportFingerprint(
  identity: ActionIdentityService,
  plan: OwnerReportPlan,
) {
  return identity.hmac(OWNER_REPORT_CONTRACT, {
    ...plan,
    recipients: plan.recipients.map((r) => ({
      ...r,
      slots: r.slots.map((slot) => ({
        key: slot.key,
        channel: slot.channel,
        routeId: slot.routeId,
        routeHash: slot.routeHash,
      })),
    })),
  });
}
export function ownerReportLogicalIdentity(
  identity: ActionIdentityService,
  plan: Pick<
    OwnerReportPlan,
    'tenantId' | 'reportType' | 'periodLocalDate' | 'reportVersion'
  >,
) {
  return identity.hmac('maya.owner-report-identity/1', {
    tenantId: plan.tenantId,
    reportType: plan.reportType,
    periodLocalDate: plan.periodLocalDate,
    reportVersion: plan.reportVersion,
  });
}
export function ownerReportRequest(
  runId: string,
  identity: ActionIdentityService,
  plan: OwnerReportPlan,
  recipient: OwnerReportRecipient,
  slot: OwnerReportSlot,
): TrustedActionExecutionRequestV1 {
  const logical = ownerReportLogicalIdentity(identity, plan);
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: plan.tenantId,
    capability: OWNER_REPORT_ACTION,
    source: {
      type: 'scheduler',
      sourceRef: `owner-report:${logical}`,
      occurrenceScope: `owner-report:${logical}:${slot.key}`,
    },
    targetRef: `staff:${slot.routeHash}`,
    input: {
      channel: slot.channel,
      messageType: 'daily_report',
      sourceEventId: `owner-report:${logical}`,
      title: plan.content.title,
      bodyText: plan.content.bodyText,
      recipientIdentityRef: slot.routeHash,
      ...(slot.channel === 'telegram'
        ? { telegramChatId: slot.destination }
        : {
            userId: recipient.userId,
            deepLink: plan.content.deepLink,
            payload: plan.content.payload,
            ...(slot.channel === 'apns'
              ? { deviceToken: slot.destination }
              : {}),
          }),
    },
    evidenceRefs: [
      `owner-report-plan:${ownerReportFingerprint(identity, plan)}`,
      `owner-report-slot:${slot.key}`,
    ],
    intentExpiresAt: new Date(plan.expiresAt),
    callerIdempotency: {
      scope: 'communication:owner-report:slot:v1',
      key: `${logical}:${slot.key}`,
    },
    ownerReportSlot: { runId, slotKey: slot.key },
  };
}
