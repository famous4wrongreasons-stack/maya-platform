import { createHash } from 'node:crypto';
import { ActionPolicyDecision } from '@prisma/client';
import { ActionContractError } from '../action-engine/action-engine.errors';
import { stableActionJson } from '../action-engine/action-engine.identity';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';
import { businessRuleContainsKnownPii } from '../package5-wave1/business-rule-safety';

export const COMMUNITY_CONTRACT = 'maya.public-community/1';
export const COMMUNITY_ROLES = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
];
export const COMMUNITY_ACTIONS = {
  moderate: 'public-community.moderate.execute.v1',
  reply: 'public-community.reply.execute.v1',
} as const;
export type CommunityOperation = keyof typeof COMMUNITY_ACTIONS;
export function communityHash(domain: string, value: unknown) {
  return createHash('sha256')
    .update(`${COMMUNITY_CONTRACT}:${domain}\0`)
    .update(stableActionJson(value))
    .digest('hex');
}
export function communityObject(
  value: unknown,
  keys: string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new ActionContractError('Exact community command required');
  return value as Record<string, unknown>;
}
export function communityId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value))
    throw new ActionContractError('Exact community reference required');
  return value;
}
export function communityKey(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(value))
    throw new ActionContractError('Stable community request key required');
  return value;
}
export function communityDigest(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new ActionContractError('Community content identity required');
  return value;
}
export function communityVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new ActionContractError(
      'Explicit community expected version required',
    );
  return Number(value);
}
const PROFANITY =
  /(?<![\p{L}\p{N}])(?:бл[яяиеё][дть]?|еб(?:а|ан|ат|у|н|л|уч|ут|ё)|ёб(?:а|ан|ат|у|н|л|уч|ут)|пизд|ху[йиеяё]|мудак|долбоёб|мразь|ублюдок|сука|fuck|shit|bitch)[a-zа-яё]*/iu;
export function communityText(value: unknown, author = false) {
  if (typeof value !== 'string')
    throw new ActionContractError('Community text required');
  let text = value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\0/g, '')
    .trim();
  if (author)
    text =
      text
        .replace(/\s+/g, ' ')
        .replace(/[^0-9a-zA-Zа-яА-ЯёЁ .'-]/g, '')
        .trim() || 'Гость';
  else text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  if (
    !text ||
    Array.from(text).length > (author ? 40 : 1200) ||
    businessRuleContainsKnownPii(text) ||
    PROFANITY.test(text) ||
    /(?:ты|вы|мастер|барбер|салон)\s+(?:идиот|дебил|тупой|конченый|ничтожество)/iu.test(
      text,
    ) ||
    (text.match(/https?:\/\/|www\.|t\.me\/|vk\.com\//giu) ?? []).length > 1 ||
    /(.)\1{8,}/iu.test(text)
  )
    throw new ActionContractError('Public text did not pass safety checks');
  if (
    author &&
    /эстетик|malesthetic|админ|admin|moderator|модератор|майя|maya/iu.test(
      text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^а-яa-z]/g, ''),
    )
  )
    throw new ActionContractError('Anonymous label cannot impersonate staff');
  return text;
}
export type CommunityCommand = {
  commentId: string;
  contentHash: string;
  expectedRevision: number;
  decision: 'approve' | 'reject' | 'withdraw' | 'acknowledge' | null;
  reasonCode: string | null;
  text: string | null;
};
export function communityCommand(
  operation: CommunityOperation,
  value: unknown,
): CommunityCommand {
  const x = communityObject(value, [
    'commentId',
    'contentHash',
    'expectedRevision',
    'decision',
    'reasonCode',
    'text',
  ]);
  const base = {
    commentId: communityId(x.commentId),
    contentHash: communityDigest(x.contentHash),
    expectedRevision: communityVersion(x.expectedRevision),
  };
  if (operation === 'reply') {
    if (x.decision !== null || x.reasonCode !== null)
      throw new ActionContractError(
        'Brand reply is an explicit separate command',
      );
    return {
      ...base,
      text: communityText(x.text),
      decision: null,
      reasonCode: null,
    };
  }
  if (
    x.text !== null ||
    !['approve', 'reject', 'withdraw', 'acknowledge'].includes(
      String(x.decision),
    ) ||
    typeof x.reasonCode !== 'string' ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(x.reasonCode)
  )
    throw new ActionContractError(
      'Explicit moderation decision/reason code required',
    );
  return {
    ...base,
    text: null,
    decision: x.decision as CommunityCommand['decision'],
    reasonCode: x.reasonCode,
  };
}
export function normalizeCommunityAction(
  operation: CommunityOperation,
  value: unknown,
) {
  const x = communityObject(value, [
    'contract',
    'operation',
    'tenantId',
    'actorUserId',
    'actorMembershipId',
    'targetRef',
    'command',
    'commandHash',
    'sourceGatewayId',
    'publicationKey',
    'brandName',
  ]);
  const command = communityCommand(operation, x.command);
  for (const key of [
    'tenantId',
    'actorUserId',
    'actorMembershipId',
    'sourceGatewayId',
    'publicationKey',
  ])
    communityId(x[key]);
  if (
    x.contract !== COMMUNITY_CONTRACT ||
    x.operation !== operation ||
    x.targetRef !== command.commentId ||
    (operation === 'reply'
      ? typeof x.brandName !== 'string' ||
        !x.brandName ||
        x.brandName.length > 160
      : x.brandName !== null) ||
    x.commandHash !==
      communityHash('moderator-intent', {
        contractVersion: 1,
        tenantId: x.tenantId,
        actorUserId: x.actorUserId,
        operation,
        ...command,
      })
  )
    throw new ActionContractError('Community executor intent mismatch');
  return { ...x, command };
}
export function publicCommunityCapabilities(): RegisteredActionCapabilityV1[] {
  return (Object.keys(COMMUNITY_ACTIONS) as CommunityOperation[]).map(
    (operation) => ({
      capability: COMMUNITY_ACTIONS[operation],
      capabilityVersion: 1,
      actionClass:
        operation === 'moderate'
          ? 'moderate_public_community_comment'
          : 'publish_public_community_reply',
      normalizedInputContract: COMMUNITY_CONTRACT,
      targetKind: 'public_community_comment',
      allowedSourceTypes: ['authenticated_request'],
      identityVersion: 1,
      riskProfileVersion: 1,
      riskFacets: ['human_moderation', 'local_atomic'],
      policyKey: `chapter6.public-community.${operation}`,
      policyVersion: 1,
      policyDecision: ActionPolicyDecision.ALLOW,
      autonomyLevel: 'L3_CANONICAL',
      approvalRequirement: 'NONE',
      retry: {
        key: 'public-community.local-transaction',
        version: 1,
        maxExecutionAttempts: 3,
        retryablePreDispatchErrors: new Set(['local_serialization']),
        backoffMs: [0, 25, 100],
      },
      reconciliation: {
        key: 'public-community.local-atomic',
        version: 1,
        maxInconclusiveAttempts: 1,
        retryAfterProvenNonExecution: false,
      },
      transportIdentityVersion: 1,
      executorKey: 'public-community.local',
      executorVersion: 1,
      payloadRetentionMs: 365 * 86400000,
      auditRetentionMs: 7 * 365 * 86400000,
      normalizeInput: (value) => normalizeCommunityAction(operation, value),
    }),
  );
}
