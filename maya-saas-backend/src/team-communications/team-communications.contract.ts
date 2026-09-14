import { createHash } from 'node:crypto';
import { ActionPolicyDecision, type UserRole } from '@prisma/client';
import { ActionContractError } from '../action-engine/action-engine.errors';
import { stableActionJson } from '../action-engine/action-engine.identity';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';

export const TEAM_CONTRACT = 'maya.team-communications/1';
export const TEAM_ROLES: UserRole[] = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'staff',
];
export const TEAM_ACTIONS = {
  send: 'team.message.send.execute.v1',
  withdraw: 'team.message.withdraw.execute.v1',
  reserve: 'team.attachment.reserve.execute.v1',
  finalize: 'team.attachment.finalize.execute.v1',
} as const;
export const TEAM_DELIVERY =
  'communication.team-message-notification.execute.v1';
export type TeamOperation = keyof typeof TEAM_ACTIONS;
export type TeamSlot = {
  slotKey: string;
  userId: string;
  membershipId: string;
  role: string;
  branchId: string | null;
  channel: 'inbox';
  eligibilityHash: string;
};
export type TeamPlan = {
  contract: typeof TEAM_CONTRACT;
  tenantId: string;
  messageId: string;
  senderUserId: string;
  conversationKey: 'team/main';
  createdAt: string;
  expiresAt: string;
  payloadHash: string;
  slots: TeamSlot[];
};
export function teamHash(domain: string, value: unknown) {
  return createHash('sha256')
    .update(`${TEAM_CONTRACT}:${domain}\0`)
    .update(stableActionJson(value))
    .digest('hex');
}
export function teamObject(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new ActionContractError('Exact team contract required');
  return value as Record<string, unknown>;
}
export function teamId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value))
    throw new ActionContractError('Exact team reference required');
  return value;
}
export function teamDigest(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new ActionContractError('Exact team content digest required');
  return value;
}
export function teamKey(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ActionContractError('Stable team request UUID required');
  return value.toLowerCase();
}
export function teamText(value: unknown) {
  if (typeof value !== 'string')
    throw new ActionContractError('Team message text required');
  const text = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (Array.from(text).length > 2000 || /\0/.test(text))
    throw new ActionContractError('Team text exceeds approved bounds');
  return text;
}
export type TeamSendCommand = {
  conversationKey: 'team/main';
  text: string;
  attachmentId: string | null;
};
export type TeamWithdrawCommand = {
  messageId: string;
  expectedRevision: number;
};
export type TeamReserveCommand = {
  contentSha256: string;
  declaredSize: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  mime: string;
  filename: string;
  retentionPolicyVersion: 1;
};
export type TeamFinalizeCommand = {
  attachmentId: string;
  expectedDigest: string;
};
const MEDIA = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-matroska',
  'video/3gpp',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/ogg',
  'audio/aac',
]);
export function teamSend(value: unknown): TeamSendCommand {
  const x = teamObject(value, ['conversationKey', 'text', 'attachmentId']),
    text = teamText(x.text),
    attachmentId = x.attachmentId === null ? null : teamId(x.attachmentId);
  if (x.conversationKey !== 'team/main' || (!text && !attachmentId))
    throw new ActionContractError('Non-empty fixed team/main message required');
  return { conversationKey: 'team/main', text, attachmentId };
}
export function teamWithdraw(value: unknown): TeamWithdrawCommand {
  const x = teamObject(value, ['messageId', 'expectedRevision']);
  if (x.expectedRevision !== 0)
    throw new ActionContractError('Own original message revision required');
  return { messageId: teamId(x.messageId), expectedRevision: 0 };
}
export function teamReserve(value: unknown): TeamReserveCommand {
  const x = teamObject(value, [
    'contentSha256',
    'declaredSize',
    'kind',
    'mime',
    'filename',
    'retentionPolicyVersion',
  ]);
  if (
    !['image', 'video', 'audio', 'file'].includes(String(x.kind)) ||
    typeof x.mime !== 'string' ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(x.mime) ||
    x.mime.length > 160 ||
    x.retentionPolicyVersion !== 1 ||
    typeof x.filename !== 'string'
  )
    throw new ActionContractError('Declared team media contract required');
  const filename = x.filename.normalize('NFC').trim();
  if (
    !filename ||
    Array.from(filename).length > 255 ||
    /[\0\r\n/\\]/.test(filename)
  )
    throw new ActionContractError('Display filename cannot be a path');
  const limit = x.kind === 'video' ? 1073741824 : 21 * 1024 * 1024;
  if (
    !Number.isSafeInteger(x.declaredSize) ||
    Number(x.declaredSize) < 1 ||
    Number(x.declaredSize) > limit ||
    (x.kind !== 'file' &&
      (!MEDIA.has(x.mime) || !x.mime.startsWith(String(x.kind) + '/')))
  )
    throw new ActionContractError(
      'Team media exceeds existing type/size limits',
    );
  return {
    contentSha256: teamDigest(x.contentSha256),
    declaredSize: Number(x.declaredSize),
    kind: x.kind as TeamReserveCommand['kind'],
    mime: x.mime,
    filename,
    retentionPolicyVersion: 1,
  };
}
export function teamFinalize(value: unknown): TeamFinalizeCommand {
  const x = teamObject(value, ['attachmentId', 'expectedDigest']);
  return {
    attachmentId: teamId(x.attachmentId),
    expectedDigest: teamDigest(x.expectedDigest),
  };
}
export function teamCommand(operation: TeamOperation, value: unknown) {
  return operation === 'send'
    ? teamSend(value)
    : operation === 'withdraw'
      ? teamWithdraw(value)
      : operation === 'reserve'
        ? teamReserve(value)
        : teamFinalize(value);
}
export function normalizeTeamPlan(value: unknown): TeamPlan {
  const x = teamObject(value, [
    'contract',
    'tenantId',
    'messageId',
    'senderUserId',
    'conversationKey',
    'createdAt',
    'expiresAt',
    'payloadHash',
    'slots',
  ]);
  for (const key of ['tenantId', 'messageId', 'senderUserId']) teamId(x[key]);
  teamDigest(x.payloadHash);
  if (
    x.contract !== TEAM_CONTRACT ||
    x.conversationKey !== 'team/main' ||
    typeof x.createdAt !== 'string' ||
    typeof x.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(x.createdAt)) ||
    new Date(x.createdAt).toISOString() !== x.createdAt ||
    new Date(Date.parse(x.createdAt) + 365 * 86400000).toISOString() !==
      x.expiresAt ||
    !Array.isArray(x.slots) ||
    x.slots.length > 10000
  )
    throw new ActionContractError('Immutable team manifest required');
  let previous = '';
  for (const raw of x.slots) {
    const s = teamObject(raw, [
      'slotKey',
      'userId',
      'membershipId',
      'role',
      'branchId',
      'channel',
      'eligibilityHash',
    ]);
    teamId(s.userId);
    teamId(s.membershipId);
    teamDigest(s.eligibilityHash);
    if (s.branchId !== null) teamId(s.branchId);
    if (
      s.channel !== 'inbox' ||
      !TEAM_ROLES.some((role) => role === s.role) ||
      s.userId === x.senderUserId ||
      String(s.userId) <= previous ||
      s.slotKey !==
        teamHash('slot', {
          tenantId: x.tenantId,
          messageId: x.messageId,
          userId: s.userId,
          channel: 'inbox',
        })
    )
      throw new ActionContractError(
        'Exact ordered team Inbox recipient required',
      );
    previous = String(s.userId);
  }
  return x as unknown as TeamPlan;
}
export function normalizeTeamAction(
  operation: TeamOperation,
  value: unknown,
): Record<string, unknown> & {
  command: ReturnType<typeof teamCommand>;
  facts: Record<string, unknown>;
} {
  const x = teamObject(value, [
    'contract',
    'operation',
    'tenantId',
    'actorUserId',
    'actorMembershipId',
    'targetRef',
    'command',
    'commandHash',
    'intentHash',
    'facts',
  ]);
  for (const key of [
    'tenantId',
    'actorUserId',
    'actorMembershipId',
    'targetRef',
  ])
    teamId(x[key]);
  teamDigest(x.intentHash);
  const command = teamCommand(operation, x.command);
  if (
    x.contract !== TEAM_CONTRACT ||
    x.operation !== operation ||
    x.commandHash !==
      teamHash('caller-intent', {
        contractVersion: 1,
        tenantId: x.tenantId,
        actorUserId: x.actorUserId,
        operation,
        command,
      })
  )
    throw new ActionContractError('Team immutable caller intent mismatch');
  const facts =
    operation === 'send'
      ? teamObject(x.facts, [
          'messageId',
          'plan',
          'planHash',
          'attachmentContentHash',
        ])
      : operation === 'withdraw'
        ? teamObject(x.facts, ['messageId', 'sendExecutionId'])
        : operation === 'reserve'
          ? teamObject(x.facts, [
              'attachmentId',
              'objectStoreKey',
              'createdAt',
              'uploadExpiresAt',
            ])
          : teamObject(x.facts, [
              'attachmentId',
              'objectStoreKey',
              'verifiedStagedSize',
              'verifiedStagedMime',
              'stagedContentHash',
            ]);
  if (operation === 'send') {
    const plan = normalizeTeamPlan(facts.plan);
    if (
      plan.messageId !== x.targetRef ||
      plan.tenantId !== x.tenantId ||
      plan.senderUserId !== x.actorUserId ||
      facts.planHash !== teamHash('plan', plan) ||
      facts.messageId !== plan.messageId
    )
      throw new ActionContractError('Team send manifest mismatch');
    if (facts.attachmentContentHash !== null)
      teamDigest(facts.attachmentContentHash);
  } else if (operation === 'withdraw') {
    if (
      facts.messageId !== x.targetRef ||
      (command as TeamWithdrawCommand).messageId !== x.targetRef
    )
      throw new ActionContractError('Team withdrawal target mismatch');
    teamId(facts.sendExecutionId);
  } else {
    if (
      facts.attachmentId !== x.targetRef ||
      typeof facts.objectStoreKey !== 'string' ||
      !/^team-v1\/[a-f0-9]{64}$/.test(facts.objectStoreKey)
    )
      throw new ActionContractError('Team reservation target mismatch');
    if (operation === 'finalize') {
      if (
        (command as TeamFinalizeCommand).attachmentId !== x.targetRef ||
        facts.stagedContentHash !==
          (command as TeamFinalizeCommand).expectedDigest ||
        !Number.isSafeInteger(facts.verifiedStagedSize) ||
        Number(facts.verifiedStagedSize) < 1 ||
        typeof facts.verifiedStagedMime !== 'string'
      )
        throw new ActionContractError('Verified staged team evidence required');
    } else if (
      typeof facts.createdAt !== 'string' ||
      typeof facts.uploadExpiresAt !== 'string' ||
      new Date(Date.parse(facts.createdAt) + 3600000).toISOString() !==
        facts.uploadExpiresAt
    )
      throw new ActionContractError('Fixed one hour reservation required');
  }
  const c = command as unknown as Record<string, unknown>;
  const intent =
    operation === 'send'
      ? {
          contractVersion: 1,
          tenantId: x.tenantId,
          senderUserId: x.actorUserId,
          conversationKey: 'team/main',
          normalizedText: c.text,
          attachmentId: c.attachmentId,
          attachmentContentHash: facts.attachmentContentHash,
        }
      : operation === 'withdraw'
        ? {
            contractVersion: 1,
            tenantId: x.tenantId,
            senderUserId: x.actorUserId,
            messageId: c.messageId,
            expectedRevision: c.expectedRevision,
          }
        : operation === 'reserve'
          ? {
              contractVersion: 1,
              tenantId: x.tenantId,
              ownerUserId: x.actorUserId,
              contentSha256: c.contentSha256,
              declaredSize: c.declaredSize,
              mediaKind: c.kind,
              mime: c.mime,
              normalizedFilename: c.filename,
              retentionPolicyVersion: c.retentionPolicyVersion,
            }
          : {
              contractVersion: 1,
              tenantId: x.tenantId,
              ownerUserId: x.actorUserId,
              attachmentId: c.attachmentId,
              expectedDigest: c.expectedDigest,
              verifiedStagedSize: facts.verifiedStagedSize,
              verifiedStagedMime: facts.verifiedStagedMime,
              stagedContentHash: facts.stagedContentHash,
            };
  if (x.intentHash !== teamHash('intent', intent))
    throw new ActionContractError(
      'Exact normalized team intent fingerprint required',
    );
  if (
    operation === 'send' &&
    (facts.plan as TeamPlan).payloadHash !==
      teamHash('payload', { text: c.text, attachmentId: c.attachmentId })
  )
    throw new ActionContractError('Team plan payload mismatch');
  return { ...x, command, facts };
}
export function teamCapabilities(): RegisteredActionCapabilityV1[] {
  return (Object.keys(TEAM_ACTIONS) as TeamOperation[]).map((operation) => ({
    capability: TEAM_ACTIONS[operation],
    capabilityVersion: 1,
    actionClass:
      operation === 'send'
        ? 'send_team_message'
        : operation === 'withdraw'
          ? 'withdraw_team_message'
          : operation === 'reserve'
            ? 'reserve_team_attachment'
            : 'finalize_team_attachment',
    normalizedInputContract: TEAM_CONTRACT,
    targetKind:
      operation === 'send' || operation === 'withdraw'
        ? 'team_message'
        : 'team_attachment',
    allowedSourceTypes: ['authenticated_request'],
    identityVersion: 1,
    riskProfileVersion: 1,
    riskFacets:
      operation === 'finalize'
        ? ['private_storage', 'external_effect']
        : ['team_owner', 'local_atomic'],
    policyKey: `chapter6.team.${operation}`,
    policyVersion: 1,
    policyDecision: ActionPolicyDecision.ALLOW,
    autonomyLevel: 'L3_CANONICAL',
    approvalRequirement: 'NONE',
    retry: {
      key: 'team.canonical',
      version: 1,
      maxExecutionAttempts: 3,
      retryablePreDispatchErrors: new Set(['local_serialization']),
      backoffMs: [0, 25, 100],
    },
    reconciliation: {
      key: 'team.exact-object',
      version: 1,
      maxInconclusiveAttempts: 1,
      retryAfterProvenNonExecution: false,
    },
    transportIdentityVersion: 1,
    executorKey:
      operation === 'finalize' ? 'team.storage.finalize' : 'team.local',
    executorVersion: 1,
    payloadRetentionMs: 365 * 86400000,
    auditRetentionMs: 7 * 365 * 86400000,
    normalizeInput: (value) => normalizeTeamAction(operation, value),
  }));
}
