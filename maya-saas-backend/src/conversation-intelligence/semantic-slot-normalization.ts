import type {
  ConversationEntities,
  ConversationEntityValue,
} from './conversation-intelligence.types';

// Entity vocabulary only. Tool arguments, identity and execution admission stay with their owners.
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  date_or_period: ['date', 'period'],
  date: ['date_or_period'],
  services: ['service'],
};
export function isSingleDaySemanticValue(
  value: ConversationEntityValue,
): value is string {
  return (
    typeof value === 'string' &&
    (['today', 'tomorrow', 'сегодня', 'завтра'].includes(value) ||
      /^\d{4}-\d{2}-\d{2}$/.test(value))
  );
}
export function semanticSlotAliases(
  slots: readonly string[],
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(ALIASES)
      .filter(([canonical]) => slots.includes(canonical))
      .map(([canonical, aliases]) => [
        canonical,
        aliases.filter((alias) => !slots.includes(alias)),
      ]),
  );
}
export function normalizeSemanticSlots(
  entities: ConversationEntities,
  slots: readonly string[],
): ConversationEntities {
  const result = { ...entities };
  for (const [canonical, aliases] of Object.entries(
    semanticSlotAliases(slots),
  )) {
    const present = [canonical, ...aliases].filter((key) =>
      Object.hasOwn(entities, key),
    );
    if (!present.length) continue;
    const normalize = (value: ConversationEntityValue): string | string[] => {
      if (
        canonical === 'date_or_period' &&
        typeof value === 'string' &&
        value.trim()
      )
        return value.trim();
      if (canonical === 'date' && typeof value === 'string' && value.trim()) {
        // A range cannot become a create date merely by changing its key.
        if (
          present.includes('date_or_period') &&
          !isSingleDaySemanticValue(value.trim())
        )
          throw new Error('conversation_entity_alias_invalid');
        return value.trim();
      }
      if (canonical === 'services') {
        const values = typeof value === 'string' ? [value] : value;
        if (
          Array.isArray(values) &&
          values.length &&
          values.every((v) => typeof v === 'string' && v.trim())
        )
          return (values as string[]).map((v) => v.trim());
      }
      throw new Error('conversation_entity_alias_invalid');
    };
    const values = present.map((key) => normalize(entities[key]));
    if (
      values.some(
        (value) => JSON.stringify(value) !== JSON.stringify(values[0]),
      )
    )
      throw new Error('conversation_entity_alias_conflict');
    result[canonical] = values[0];
    for (const alias of aliases) delete result[alias];
  }
  return result;
}
