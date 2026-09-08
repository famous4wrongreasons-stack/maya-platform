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
export const MORNING_REPORT_CONTRACT = 'maya.owner-report-plan/2';
export const MORNING_STAFF_ROLES = [
  'tenant_owner',
  'business_owner',
  'provider',
  'employee',
  'staff',
] as const;
export type MorningReportRecipient = Omit<OwnerReportRecipient, 'role'> & {
  role: OwnerReportRecipient['role'] | (typeof MORNING_STAFF_ROLES)[number];
  staffId: string | null;
  staffBindingEvidenceHash: string | null;
  content: OwnerReportPlan['content'];
};
export type MorningReportPlan = Omit<
  OwnerReportPlan,
  'contract' | 'reportType' | 'content' | 'recipients'
> & {
  contract: typeof MORNING_REPORT_CONTRACT;
  reportType: 'morning_owner' | 'morning_staff';
  recipients: MorningReportRecipient[];
};
export type CanonicalOwnerReportPlan = OwnerReportPlan | MorningReportPlan;
export type CanonicalOwnerReportRecipient =
  OwnerReportRecipient | MorningReportRecipient;
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
/** V1 remains unchanged; the approved V2 carries an independently scoped content per recipient. */
export function normalizeCanonicalOwnerReportPlan(
  candidate: CanonicalOwnerReportPlan,
): CanonicalOwnerReportPlan {
  if (candidate.contract === OWNER_REPORT_CONTRACT)
    return normalizeOwnerReportPlan(candidate);
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
    'recipients',
  ]);
  if (
    candidate.contract !== MORNING_REPORT_CONTRACT ||
    !['morning_owner', 'morning_staff'].includes(candidate.reportType) ||
    !Array.isArray(candidate.recipients) ||
    !candidate.recipients.length
  )
    throw new ActionContractError(
      'Invalid finite morning report kind/recipients',
    );
  const users = new Set<string>(),
    keys = new Set<string>();
  const recipients = candidate.recipients.map((recipient) => {
    exact(recipient, [
      'userId',
      'membershipId',
      'role',
      'staffId',
      'staffBindingEvidenceHash',
      'content',
      'slots',
    ]);
    const staff = candidate.reportType === 'morning_staff';
    const roles: readonly string[] = staff
      ? MORNING_STAFF_ROLES
      : OWNER_REPORT_ROLES;
    if (
      !roles.includes(recipient.role) ||
      users.has(recipient.userId) ||
      (staff
        ? typeof recipient.staffId !== 'string' ||
          !opaque.test(recipient.staffId) ||
          typeof recipient.staffBindingEvidenceHash !== 'string' ||
          !hash.test(recipient.staffBindingEvidenceHash)
        : recipient.staffId !== null ||
          recipient.staffBindingEvidenceHash !== null)
    )
      throw new ActionContractError(
        'Invalid canonical morning report principal',
      );
    users.add(recipient.userId);
    // Reuse all established period/content/route/policy validation without weakening the V1 branch.
    const validated = normalizeOwnerReportPlan({
      ...candidate,
      contract: OWNER_REPORT_CONTRACT,
      reportType: 'daily_report',
      content: recipient.content,
      recipients: [
        {
          userId: recipient.userId,
          membershipId: recipient.membershipId,
          role: 'tenant_owner',
          slots: recipient.slots,
        },
      ],
    });
    for (const slot of validated.recipients[0].slots) {
      if (keys.has(slot.key))
        throw new ActionContractError('Duplicate morning report slot');
      keys.add(slot.key);
    }
    return {
      ...recipient,
      content: validated.content,
      slots: validated.recipients[0].slots,
    };
  });
  recipients.sort((a, b) => lexical(a.userId, b.userId));
  return JSON.parse(
    stableActionJson({ ...candidate, recipients }),
  ) as MorningReportPlan;
}
export function ownerReportFingerprint(
  identity: ActionIdentityService,
  plan: CanonicalOwnerReportPlan,
) {
  return identity.hmac(plan.contract, {
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
    CanonicalOwnerReportPlan,
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
  plan: CanonicalOwnerReportPlan,
  recipient: CanonicalOwnerReportRecipient,
  slot: OwnerReportSlot,
): TrustedActionExecutionRequestV1 {
  const logical = ownerReportLogicalIdentity(identity, plan);
  const content =
    plan.contract === OWNER_REPORT_CONTRACT
      ? plan.content
      : (recipient as MorningReportRecipient).content;
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
      messageType:
        plan.reportType === 'daily_report' ? 'daily_report' : 'morning_brief',
      sourceEventId: `owner-report:${logical}`,
      title: content.title,
      bodyText: content.bodyText,
      recipientIdentityRef: slot.routeHash,
      ...(slot.channel === 'telegram'
        ? { telegramChatId: slot.destination }
        : {
            userId: recipient.userId,
            deepLink: content.deepLink,
            payload: content.payload,
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
