import { createHash } from 'node:crypto';
import { ActionPolicyDecision, type UserRole } from '@prisma/client';
import { ActionContractError } from '../action-engine/action-engine.errors';
import { stableActionJson } from '../action-engine/action-engine.identity';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';
import type { ConsentChannelBinding } from '../crm/client-consent-authority';

export const FEEDBACK_CONTRACT = 'maya.native-feedback/1';
export const FEEDBACK_ROLES: UserRole[] = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
];
export const FEEDBACK_ACTIONS = {
  request: 'native-feedback.request.execute.v1',
  response: 'native-feedback.response.execute.v1',
  withdraw: 'native-feedback.withdraw.execute.v1',
} as const;
export const FEEDBACK_DELIVERY = {
  request: 'communication.native-feedback.invitation.execute.v1',
  response: 'communication.native-feedback.response.execute.v1',
} as const;
export type FeedbackOperation = keyof typeof FEEDBACK_ACTIONS;
export type FeedbackSlot = {
  slotKey: string;
  channel: 'telegram' | 'web_push' | 'inbox';
  recipientRef: string;
  userId: string | null;
  membershipId: string | null;
  memberRole: string | null;
  branchId: string | null;
  link: ConsentChannelBinding | null;
  endpointId: string | null;
  endpointMaterialHash: string | null;
  endpointLinkId: string | null;
};
export type FeedbackPlan = {
  contract: typeof FEEDBACK_CONTRACT;
  phase: 'request' | 'response' | 'withdraw';
  tenantId: string;
  clientId: string;
  requestId: string;
  revisionId: string | null;
  appointmentId: string;
  branchId: string;
  version: number;
  eligibleAt: string;
  expiresAt: string;
  createdAt: string;
  title: string;
  bodyText: string;
  contentHash: string;
  eligibilityHash: string;
  slots: FeedbackSlot[];
};
export type ResponseCommand = {
  requestId: string;
  expectedAcceptedVersion: number;
  kind: 'response' | 'withdraw';
  rating: number | null;
  comment: string | null;
};
export function feedbackObject(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
  )
    throw new ActionContractError('Exact native feedback contract required');
  return value as Record<string, unknown>;
}
export function feedbackId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value))
    throw new ActionContractError(
      'Exact canonical feedback reference required',
    );
  return value;
}
export function feedbackKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ActionContractError('Stable feedback command UUID required');
  return value.toLowerCase();
}
export function feedbackHash(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`maya.native-feedback.${domain}/1\0`)
    .update(stableActionJson(value))
    .digest('hex');
}
export function feedbackResponse(
  operation: 'response' | 'withdraw',
  value: unknown,
): ResponseCommand {
  const x = feedbackObject(value, [
    'requestId',
    'expectedAcceptedVersion',
    'kind',
    'rating',
    'comment',
  ]);
  const requestId = feedbackId(x.requestId);
  if (
    x.kind !== operation ||
    !Number.isSafeInteger(x.expectedAcceptedVersion) ||
    Number(x.expectedAcceptedVersion) < 0
  )
    throw new ActionContractError(
      'Explicit accepted feedback version required',
    );
  if (operation === 'withdraw') {
    if (
      x.rating !== null ||
      x.comment !== null ||
      Number(x.expectedAcceptedVersion) < 1
    )
      throw new ActionContractError('Withdrawal has no response content');
    return {
      requestId,
      expectedAcceptedVersion: Number(x.expectedAcceptedVersion),
      kind: operation,
      rating: null,
      comment: null,
    };
  }
  if (
    !Number.isInteger(x.rating) ||
    Number(x.rating) < 1 ||
    Number(x.rating) > 5 ||
    (x.comment !== null && typeof x.comment !== 'string')
  )
    throw new ActionContractError(
      'Explicit rating 1..5 and optional comment required',
    );
  const comment =
    typeof x.comment === 'string'
      ? x.comment.normalize('NFC').replace(/\r\n?/g, '\n').trim() || null
      : null;
  if (comment && Array.from(comment).length > 2000)
    throw new ActionContractError('Feedback comment exceeds 2000 characters');
  return {
    requestId,
    expectedAcceptedVersion: Number(x.expectedAcceptedVersion),
    kind: operation,
    rating: Number(x.rating),
    comment,
  };
}
export function feedbackBinding(value: unknown): ConsentChannelBinding {
  const x = feedbackObject(value, [
    'linkId',
    'provider',
    'providerSubjectHash',
    'verificationEvidenceHash',
  ]);
  feedbackId(x.linkId);
  if (
    !['telegram', 'maya_user'].includes(String(x.provider)) ||
    !/^[a-f0-9]{64}$/.test(String(x.providerSubjectHash)) ||
    !/^[a-f0-9]{64}$/.test(String(x.verificationEvidenceHash))
  )
    throw new ActionContractError('Verified canonical Client binding required');
  return x as unknown as ConsentChannelBinding;
}
export function feedbackPlanHash(plan: FeedbackPlan) {
  return feedbackHash('immutable-plan', plan);
}
export function feedbackSlotKey(
  plan: Pick<
    FeedbackPlan,
    | 'tenantId'
    | 'clientId'
    | 'requestId'
    | 'revisionId'
    | 'phase'
    | 'contentHash'
  >,
  slot: Omit<FeedbackSlot, 'slotKey'>,
) {
  return feedbackHash('slot', { ...plan, slot });
}
export function normalizeFeedbackPlan(value: unknown): FeedbackPlan {
  const x = feedbackObject(value, [
    'contract',
    'phase',
    'tenantId',
    'clientId',
    'requestId',
    'revisionId',
    'appointmentId',
    'branchId',
    'version',
    'eligibleAt',
    'expiresAt',
    'createdAt',
    'title',
    'bodyText',
    'contentHash',
    'eligibilityHash',
    'slots',
  ]);
  for (const key of [
    'tenantId',
    'clientId',
    'requestId',
    'appointmentId',
    'branchId',
  ])
    feedbackId(x[key]);
  if (x.revisionId !== null) feedbackId(x.revisionId);
  for (const key of ['eligibleAt', 'expiresAt', 'createdAt'])
    if (
      typeof x[key] !== 'string' ||
      !Number.isFinite(Date.parse(x[key])) ||
      new Date(x[key]).toISOString() !== x[key]
    )
      throw new ActionContractError('Canonical feedback time required');
  if (
    x.contract !== FEEDBACK_CONTRACT ||
    !['request', 'response', 'withdraw'].includes(String(x.phase)) ||
    !Number.isSafeInteger(x.version) ||
    Number(x.version) < 0 ||
    !Array.isArray(x.slots) ||
    x.slots.length > 10000 ||
    typeof x.title !== 'string' ||
    x.title.length > 160 ||
    typeof x.bodyText !== 'string' ||
    x.bodyText.length > 2200 ||
    !/^[a-f0-9]{64}$/.test(String(x.eligibilityHash)) ||
    x.contentHash !==
      feedbackHash('content', { title: x.title, bodyText: x.bodyText })
  )
    throw new ActionContractError('Immutable feedback manifest mismatch');
  if (
    x.phase === 'request'
      ? x.revisionId !== null || x.version !== 0
      : x.revisionId === null || Number(x.version) < 1
  )
    throw new ActionContractError('Exact feedback phase required');
  const plan = x as unknown as FeedbackPlan;
  const keys = new Set<string>();
  for (const raw of plan.slots) {
    const s = feedbackObject(raw, [
      'slotKey',
      'channel',
      'recipientRef',
      'userId',
      'membershipId',
      'memberRole',
      'branchId',
      'link',
      'endpointId',
      'endpointMaterialHash',
      'endpointLinkId',
    ]) as unknown as FeedbackSlot;
    feedbackId(s.recipientRef);
    if (s.link) feedbackBinding(s.link);
    if (
      plan.phase === 'withdraw' ||
      (plan.phase === 'request' &&
        !['telegram', 'web_push'].includes(s.channel)) ||
      (plan.phase === 'response' && s.channel !== 'inbox')
    )
      throw new ActionContractError('Feedback route is outside approved phase');
    if (
      s.channel === 'inbox'
        ? !s.userId ||
          !s.membershipId ||
          !FEEDBACK_ROLES.some((role) => role === s.memberRole) ||
          s.link !== null ||
          s.endpointId !== null
        : s.userId !== null || s.membershipId !== null || s.memberRole !== null
    )
      throw new ActionContractError('Exact feedback recipient required');
    if (
      s.channel === 'telegram' &&
      (!s.link || s.link.provider !== 'telegram' || s.endpointId !== null)
    )
      throw new ActionContractError('Verified Telegram invitation required');
    if (
      s.channel === 'web_push' &&
      (!s.endpointId ||
        !s.endpointLinkId ||
        !/^[a-f0-9]{64}$/.test(s.endpointMaterialHash ?? '') ||
        s.link !== null)
    )
      throw new ActionContractError(
        'Frozen verified Web Push endpoint required',
      );
    const { slotKey, ...material } = s;
    if (
      slotKey !==
        feedbackSlotKey(
          {
            tenantId: plan.tenantId,
            clientId: plan.clientId,
            requestId: plan.requestId,
            revisionId: plan.revisionId,
            phase: plan.phase,
            contentHash: plan.contentHash,
          },
          material,
        ) ||
      keys.has(slotKey)
    )
      throw new ActionContractError('Feedback slot identity mismatch');
    keys.add(slotKey);
  }
  if (
    plan.phase === 'request' &&
    (new Set(plan.slots.map((s) => s.channel)).size > 1 ||
      plan.slots.length > 5 ||
      (plan.slots[0]?.channel === 'telegram' && plan.slots.length !== 1))
  )
    throw new ActionContractError('One immutable invitation route required');
  return plan;
}
export function normalizeFeedbackAction(
  operation: FeedbackOperation,
  value: unknown,
) {
  const x = feedbackObject(value, [
    'contract',
    'operation',
    'tenantId',
    'clientId',
    'targetRef',
    'commandHash',
    'intentHash',
    'planHash',
    'plan',
    'consentChannel',
  ]);
  const plan = normalizeFeedbackPlan(x.plan);
  if (
    x.contract !== FEEDBACK_CONTRACT ||
    x.operation !== operation ||
    plan.phase !== operation ||
    x.tenantId !== plan.tenantId ||
    x.clientId !== plan.clientId ||
    x.targetRef !==
      (operation === 'request' ? plan.requestId : plan.clientId) ||
    !/^[a-f0-9]{64}$/.test(String(x.commandHash)) ||
    !/^[a-f0-9]{64}$/.test(String(x.intentHash)) ||
    x.planHash !== feedbackPlanHash(plan)
  )
    throw new ActionContractError('Feedback action/plan identity mismatch');
  if (operation === 'request' ? x.consentChannel !== null : !x.consentChannel)
    throw new ActionContractError('Feedback initiating authority mismatch');
  if (x.consentChannel) feedbackBinding(x.consentChannel);
  return { ...x, plan };
}
export function nativeFeedbackCapabilities(): RegisteredActionCapabilityV1[] {
  return (Object.keys(FEEDBACK_ACTIONS) as FeedbackOperation[]).map(
    (operation) => ({
      capability: FEEDBACK_ACTIONS[operation],
      capabilityVersion: 1,
      actionClass:
        operation === 'request'
          ? 'request_native_feedback'
          : operation === 'response'
            ? 'submit_native_feedback_revision'
            : 'withdraw_native_feedback',
      normalizedInputContract: FEEDBACK_CONTRACT,
      targetKind:
        operation === 'request'
          ? 'native_feedback_request'
          : 'native_feedback_revision',
      allowedSourceTypes: ['authenticated_request'],
      identityVersion: 1,
      riskProfileVersion: 1,
      riskFacets: ['canonical_client', 'local_atomic', 'native_feedback'],
      policyKey: `chapter6.native-feedback.${operation}`,
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'L3_CANONICAL',
      approvalRequirement: 'NONE',
      retry: {
        key: 'native-feedback.local-transaction',
        version: 1,
        maxExecutionAttempts: 3,
        retryablePreDispatchErrors: new Set(['local_serialization']),
        backoffMs: [0, 25, 100],
      },
      reconciliation: {
        key: 'native-feedback.local-atomic',
        version: 1,
        maxInconclusiveAttempts: 1,
        retryAfterProvenNonExecution: false,
      },
      transportIdentityVersion: 1,
      executorKey: 'native-feedback.local',
      executorVersion: 1,
      payloadRetentionMs: 365 * 86400000,
      auditRetentionMs: 7 * 365 * 86400000,
      normalizeInput: (value) => normalizeFeedbackAction(operation, value),
    }),
  );
}
