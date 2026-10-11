import type {
  ConversationPlannerContract,
  ConversationPlannerIntent,
} from '../conversation-intelligence/conversation-intelligence.types';
import type { AiCoreToolDescriptor } from './ai-core.types';

// Request-local indexes for repeated labels and complete slot declarations.
// Values stay in the same request; no intent, permission or schema is dropped.
const DICTIONARY_COLUMNS = [
  'domain',
  'action',
  'data_class',
  'readiness',
  'required_slots',
  'optional_slots',
  'slot_aliases',
  'ready_tools',
  'readiness_note',
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One schema level only: preserve complete property schemas, including nested
 * constraints, and share only exact duplicates across distinct input schemas.
 * References live outside schemas so no original schema keyword is reserved. */
function internProperties(schemas: unknown[]) {
  const counts = new Map<string, number>();
  for (const schema of schemas) {
    if (!record(schema) || !record(schema.properties)) continue;
    for (const property of Object.values(schema.properties)) {
      if (!record(property)) continue;
      const key = JSON.stringify(property);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const properties: unknown[] = [];
  const indexes = new Map<string, number>();
  const refs: Array<Record<string, number>> = [];
  const compact = schemas.map((schema) => {
    const references: Array<[string, number]> = [];
    if (!record(schema) || !record(schema.properties)) {
      refs.push({});
      return schema;
    }
    const remaining = Object.entries(schema.properties).filter(
      ([name, property]) => {
        if (!record(property)) return true;
        const key = JSON.stringify(property);
        if ((counts.get(key) ?? 0) < 2) return true;
        let index = indexes.get(key);
        if (index === undefined) {
          index = properties.length;
          indexes.set(key, index);
          properties.push(property);
        }
        references.push([name, index]);
        return false;
      },
    );
    refs.push(Object.fromEntries(references));
    return references.length
      ? { ...schema, properties: Object.fromEntries(remaining) }
      : schema;
  });
  return { schemas: compact, properties, refs };
}

/** Request-local wire representation only. No filtering, routing or authority. */
export function plannerWireContext(
  tools: AiCoreToolDescriptor[],
  contract: ConversationPlannerContract,
) {
  const schemas: unknown[] = [];
  const indexes = new Map<string, number>();
  const available = tools.map(({ input_schema, ...tool }) => {
    const key = JSON.stringify(input_schema);
    if (key === undefined) return { ...tool, input_schema };
    let index = indexes.get(key);
    if (index === undefined) {
      index = schemas.length;
      indexes.set(key, index);
      schemas.push(input_schema);
    }
    return { ...tool, input_schema_ref: index };
  });
  const columns = Object.keys(contract.intents[0] ?? {}) as Array<
    keyof ConversationPlannerIntent
  >;
  // Compare whole JSON values, never object identity or a partial slot name.
  // A different alias/constraint must occupy a different entry.
  const dictionaryIndexes = new Map<string, Map<string, number>>();
  const dictionaries = Object.fromEntries(
    DICTIONARY_COLUMNS.map((key) => {
      const values: unknown[] = [];
      const indexes = new Map<string, number>();
      for (const intent of contract.intents) {
        const value = intent[key];
        const encoded = JSON.stringify(value);
        if (!indexes.has(encoded)) {
          indexes.set(encoded, values.length);
          values.push(value);
        }
      }
      dictionaryIndexes.set(key, indexes);
      return [key, values];
    }),
  ) as Record<(typeof DICTIONARY_COLUMNS)[number], unknown[]>;
  const rows = contract.intents.map((intent) => {
    // Fail loudly on a heterogeneous future contract rather than drop a field.
    if (
      Object.keys(intent).length !== columns.length ||
      columns.some((key) => !Object.prototype.hasOwnProperty.call(intent, key))
    )
      throw new Error('planner_intent_shape_mismatch');
    return columns.map((key) =>
      Object.prototype.hasOwnProperty.call(dictionaries, key)
        ? dictionaryIndexes.get(key)!.get(JSON.stringify(intent[key]))!
        : intent[key],
    );
  });
  const toolColumns = Object.keys(available[0] ?? {});
  const homogeneous = available.every(
    (tool) =>
      Object.keys(tool).length === toolColumns.length &&
      toolColumns.every((key) =>
        Object.prototype.hasOwnProperty.call(tool, key),
      ),
  );
  const propertyWire = internProperties(schemas);
  return {
    available_tools: homogeneous
      ? {
          columns: toolColumns,
          rows: available.map((tool) =>
            toolColumns.map((key) => (tool as Record<string, unknown>)[key]),
          ),
        }
      : available,
    tool_input_schemas: propertyWire.schemas,
    tool_input_property_schemas: propertyWire.properties,
    tool_input_schema_property_refs: propertyWire.refs,
    conversation_contract: {
      ...contract,
      intents: { columns, rows, dictionaries },
    },
  };
}

export const PLANNER_WIRE_INSTRUCTIONS =
  'WIRE REPRESENTATION: available_tools and conversation_contract.intents use {columns,rows}: each row contains field values in column order. For intent columns named in dictionaries, expand each zero-based cell index using that column dictionary, preserving the complete value (string, null, complete tool/slot array or alias object). Read rows as complete objects, including denied and planned intents. available_tools may also contain ordinary descriptor objects. input_schema_ref indexes tool_input_schemas (zero-based). Before reading schema i, merge each property name in tool_input_schema_property_refs[i] into its properties using the indexed complete tool_input_property_schemas value. All other schema fields remain unchanged. All descriptions, readiness, permissions, slots and policies remain authoritative.';
