import { businessRuleContainsKnownPii } from './business-rule-safety';
import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { stableActionJson } from '../action-engine/action-engine.identity';

export const GOVERNED_SETTINGS_CONTRACT = 'maya.governed-settings/1';
export const TENANT_CONFIGURATION_NAMESPACES = [
  'business_rules',
  'client_capabilities',
  'staff_ai_provider',
] as const;
export type TenantConfigurationNamespace =
  (typeof TENANT_CONFIGURATION_NAMESPACES)[number];
export type GovernedOperation =
  'tenant_business_configuration' | 'staff_notification_preferences';
export const GOVERNED_OWNER_ROLES = new Set(['tenant_owner', 'business_owner']);
export const GOVERNED_STAFF_ROLES = new Set([
  ...GOVERNED_OWNER_ROLES,
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
  'accountant',
  'provider',
  'employee',
  'staff',
]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function governedObject(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new BadRequestException('Unlisted configuration input');
  return value as Record<string, unknown>;
}
export function governedCallerId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new BadRequestException('Stable caller UUID required');
  return value.toLowerCase();
}
export function governedNamespace(
  value: unknown,
): TenantConfigurationNamespace {
  if (
    !TENANT_CONFIGURATION_NAMESPACES.includes(
      value as TenantConfigurationNamespace,
    )
  )
    throw new BadRequestException('Unlisted tenant configuration namespace');
  return value as TenantConfigurationNamespace;
}
export function governedHash(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(domain)
    .update('\0')
    .update(stableActionJson(value))
    .digest('hex');
}
export function governedConfigurationContent(
  namespace: TenantConfigurationNamespace,
  value: unknown,
  context?: { tenantId: string; actorUserId: string; callerId: string },
): Record<string, unknown> {
  if (namespace === 'client_capabilities') {
    const object = governedObject(value, ['client_self_visit_history']);
    if (typeof object.client_self_visit_history !== 'boolean')
      throw new BadRequestException('Exact own-history boolean required');
    return { client_self_visit_history: object.client_self_visit_history };
  }
  if (namespace === 'staff_ai_provider') {
    const object = governedObject(value, ['provider']);
    if (!['claude', 'openai'].includes(String(object.provider)))
      throw new BadRequestException('Unlisted staff AI provider');
    return { provider: object.provider };
  }
  const object = governedObject(value, ['rules']);
  if (!Array.isArray(object.rules) || object.rules.length > 40)
    throw new BadRequestException('At most 40 business rules');
  const ids = new Set<string>();
  const rules = object.rules.map((item: unknown, position: number) => {
    const rule = governedObject(item, ['id', 'text']);
    if (typeof rule.text !== 'string')
      throw new BadRequestException('Rule text required');
    const text = rule.text.normalize('NFC').replace(/\s+/gu, ' ').trim();
    // Preserve the existing PII and explicit permission/security-override exclusions.
    if (
      text.length < 8 ||
      text.length > 500 ||
      businessRuleContainsKnownPii(text) ||
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){10,}|(?:api[_ -]?key|password|парол[ья]|token|токен)\s*[:=]/iu.test(
        text,
      ) ||
      /(?:игнорируй|обойди|отмени|ignore|bypass).{0,80}(?:системн\S*\s+правил|безопасност|авторизац|провер\S*\s+доступ|security|authorization|system)/iu.test(
        text,
      ) ||
      /(?:разреш\S*|запрет\S*|включ\S*|отключ\S*|открой\S*|закрой\S*).{0,100}(?:доступ\S*|прав\S*|истор\S*|данн\S*|карточ\S*)/iu.test(
        text,
      )
    )
      throw new BadRequestException(
        'Rule is outside bounded business guidance',
      );
    const rawId = rule.id ?? null;
    if (rawId !== null && typeof rawId !== 'string')
      throw new BadRequestException('Invalid existing rule identity');
    let id: string | null = rawId;
    if (
      id !== null &&
      (typeof id !== 'string' || !/^rule_[a-f0-9]{40}$/.test(id))
    )
      throw new BadRequestException('Invalid existing rule identity');
    if (id === null && context)
      id = `rule_${governedHash('maya.business-rule-id/1', { ...context, namespace, position }).slice(0, 40)}`;
    if (id !== null) {
      if (ids.has(String(id)))
        throw new BadRequestException('Duplicate rule identity');
      ids.add(String(id));
    }
    return { id, text };
  });
  return { rules };
}
export function governedCommand(
  operation: GovernedOperation,
  value: unknown,
): Record<string, unknown> {
  const command = governedObject(
    value,
    operation === 'tenant_business_configuration'
      ? [
          'confirmed',
          'namespace',
          'expectedRevision',
          'previousRevisionId',
          'content',
        ]
      : ['confirmed', 'durationMinutes', 'expectedGeneration'],
  );
  if (command.confirmed !== true)
    throw new BadRequestException('Explicit confirmation required');
  if (operation === 'staff_notification_preferences') {
    const duration = command.durationMinutes;
    if (
      duration !== null &&
      (!Number.isInteger(duration) ||
        Number(duration) < 1 ||
        Number(duration) > 1440)
    )
      throw new BadRequestException(
        'Mute duration must be 1..1440 minutes or null',
      );
    if (
      !Number.isSafeInteger(command.expectedGeneration) ||
      Number(command.expectedGeneration) < 0
    )
      throw new BadRequestException('Expected personal generation required');
    return {
      confirmed: true,
      durationMinutes: duration,
      expectedGeneration: command.expectedGeneration,
    };
  }
  const namespace = governedNamespace(command.namespace);
  if (
    !Number.isSafeInteger(command.expectedRevision) ||
    Number(command.expectedRevision) < 0
  )
    throw new BadRequestException('Expected predecessor revision required');
  if (
    (command.expectedRevision === 0 && command.previousRevisionId !== null) ||
    (command.expectedRevision !== 0 &&
      (typeof command.previousRevisionId !== 'string' ||
        command.previousRevisionId.length > 160 ||
        !command.previousRevisionId))
  )
    throw new BadRequestException('Expected predecessor identity required');
  return {
    confirmed: true,
    namespace,
    expectedRevision: command.expectedRevision,
    previousRevisionId: command.previousRevisionId,
    content: governedConfigurationContent(namespace, command.content),
  };
}
export function validateGovernedNormalizedInput(
  operation: GovernedOperation,
  input: Record<string, unknown>,
): void {
  const semantic = governedCommand(operation, input.semanticCommand);
  if (
    governedHash('maya.governed-command/1', semantic) !==
    governedHash('maya.governed-command/1', input.semanticCommand)
  )
    throw new BadRequestException('Command is not canonically normalized');
  governedCallerId(input.callerId);
  const config = governedObject(
    input.configJson,
    operation === 'tenant_business_configuration'
      ? ['namespace', 'revision', 'previousRevisionId', 'content']
      : ['schema_version', 'membershipId', 'telegramMutedUntil'],
  );
  if (operation === 'tenant_business_configuration') {
    const namespace = governedNamespace(config.namespace);
    if (
      !GOVERNED_OWNER_ROLES.has(String(input.actorRole)) ||
      config.revision !== Number(semantic.expectedRevision) + 1 ||
      config.previousRevisionId !== semantic.previousRevisionId ||
      namespace !== semantic.namespace ||
      input.targetRef !== `tenant-config:${namespace}`
    )
      throw new BadRequestException(
        'Exact tenant owner/revision target required',
      );
    governedConfigurationContent(namespace, config.content);
  } else {
    const until = config.telegramMutedUntil;
    if (
      !GOVERNED_STAFF_ROLES.has(String(input.actorRole)) ||
      config.schema_version !== 1 ||
      config.membershipId !== input.actorMembershipId ||
      input.targetGeneration !== semantic.expectedGeneration ||
      (until !== null &&
        (typeof until !== 'string' ||
          !Number.isFinite(Date.parse(until)) ||
          new Date(until).toISOString() !== until))
    )
      throw new BadRequestException(
        'Exact personal membership/instant required',
      );
  }
}
