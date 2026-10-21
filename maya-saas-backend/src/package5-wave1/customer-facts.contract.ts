import { BadRequestException } from '@nestjs/common';
import { businessRuleContainsKnownPii } from './business-rule-safety';

export const CUSTOMER_FACTS_CONTRACT = 'maya.customer-facts/1';
export const CUSTOMER_FACTS_NAMESPACE = 'customer_facts';
export const CUSTOMER_FACTS_SOURCE = 'tenant_owner_confirmed';

function exact(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new BadRequestException('Exact public customer facts required');
  return value as Record<string, unknown>;
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new BadRequestException('Explicit canonical UTC validity required');
  return value;
}

/** Public text is explicitly authored by the A22 owner; never derived from staff rules. */
export function customerFactsContent(value: unknown) {
  const object = exact(value, [
    'audience',
    'source',
    'effectiveAt',
    'expiresAt',
    'facts',
  ]);
  if (object.audience !== 'customer' || object.source !== CUSTOMER_FACTS_SOURCE)
    throw new BadRequestException(
      'Explicit customer audience and owner source required',
    );
  const effectiveAt = instant(object.effectiveAt);
  const expiresAt = instant(object.expiresAt);
  if (effectiveAt >= expiresAt)
    throw new BadRequestException('Public facts validity must be nonempty');
  if (!Array.isArray(object.facts) || object.facts.length > 20)
    throw new BadRequestException('At most 20 public customer facts');
  const facts = object.facts.map((raw) => {
    const fact = exact(raw, ['text']);
    const text =
      typeof fact.text === 'string'
        ? fact.text.normalize('NFC').replace(/\s+/g, ' ').trim()
        : '';
    if (
      text.length < 8 ||
      text.length > 500 ||
      businessRuleContainsKnownPii(text) ||
      /token|password|парол|секрет|паспорт|снилс|bearer|api[_ -]?key|<[^>]+>/iu.test(
        text,
      ) ||
      /(?:ignore|bypass|override|игнорир|обой|отключ|отмен)[\s\S]*(?:system|security|authorization|систем|безопас|авторизац|проверк)/iu.test(
        text,
      ) ||
      /(?:доступ|разрешени|права)[\s\S]*(?:данн|истори|клиент|администратор)/iu.test(
        text,
      )
    )
      throw new BadRequestException(
        'Public customer fact is not safe guidance',
      );
    return { text };
  });
  if (new Set(facts.map((fact) => fact.text)).size !== facts.length)
    throw new BadRequestException('Duplicate public customer fact');
  return {
    audience: 'customer' as const,
    source: CUSTOMER_FACTS_SOURCE,
    effectiveAt,
    expiresAt,
    facts,
  };
}

/** User text, history and model output cannot fill an absent or expired source. */
export function customerFactsPresentation(value: unknown, now = new Date()) {
  const unavailable = {
    status: 'blocked' as const,
    reply:
      'Действующие сведения для клиентов пока не подтверждены. Уточните этот вопрос у администратора.',
  };
  try {
    const data = exact(value, [
      'contract',
      'audience',
      'source',
      'status',
      'revision',
      'source_revision_id',
      'content_hash',
      'effectiveAt',
      'expiresAt',
      'facts',
    ]);
    if (
      data.contract !== CUSTOMER_FACTS_CONTRACT ||
      data.audience !== 'customer' ||
      data.source !== CUSTOMER_FACTS_SOURCE ||
      data.status !== 'configured' ||
      typeof data.revision !== 'number' ||
      !Number.isSafeInteger(data.revision) ||
      Number(data.revision) < 1 ||
      typeof data.source_revision_id !== 'string' ||
      !data.source_revision_id ||
      typeof data.content_hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.content_hash)
    )
      return unavailable;
    const content = customerFactsContent({
      audience: data.audience,
      source: data.source,
      effectiveAt: data.effectiveAt,
      expiresAt: data.expiresAt,
      facts: data.facts,
    });
    if (
      !Number.isFinite(now.getTime()) ||
      now.getTime() < Date.parse(content.effectiveAt) ||
      now.getTime() >= Date.parse(content.expiresAt) ||
      !content.facts.length
    )
      return unavailable;
    return {
      status: 'verified' as const,
      reply: `Сведения для клиентов, опубликованные владельцем, редакция ${data.revision}:\n\n${content.facts.map((fact) => `• ${fact.text}`).join('\n')}`,
    };
  } catch {
    return unavailable;
  }
}

export function customerFactsReply(value: unknown, now = new Date()): string {
  return customerFactsPresentation(value, now).reply;
}
