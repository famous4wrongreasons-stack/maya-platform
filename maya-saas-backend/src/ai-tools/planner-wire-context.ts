import type {
  ConversationPlannerContract,
  ConversationPlannerIntent,
} from '../conversation-intelligence/conversation-intelligence.types';
import type { AiCoreToolDescriptor } from './ai-core.types';

// Request-local indexes for these four repeated labels only. The actual values
// remain in the same message; no intent, permission or readiness row is removed.
const LABEL_COLUMNS = ['domain', 'action', 'data_class', 'readiness'] as const;

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
  const dictionaries = Object.fromEntries(
    LABEL_COLUMNS.map((key) => [
      key,
      [...new Set(contract.intents.map((intent) => intent[key]))],
    ]),
  ) as Record<(typeof LABEL_COLUMNS)[number], string[]>;
  const rows = contract.intents.map((intent) => {
    // Fail loudly on a heterogeneous future contract rather than drop a field.
    if (
      Object.keys(intent).length !== columns.length ||
      columns.some((key) => !Object.prototype.hasOwnProperty.call(intent, key))
    )
      throw new Error('planner_intent_shape_mismatch');
    return columns.map((key) =>
      Object.prototype.hasOwnProperty.call(dictionaries, key)
        ? dictionaries[key as keyof typeof dictionaries].indexOf(
            intent[key] as string,
          )
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
  return {
    available_tools: homogeneous
      ? {
          columns: toolColumns,
          rows: available.map((tool) =>
            toolColumns.map((key) => (tool as Record<string, unknown>)[key]),
          ),
        }
      : available,
    tool_input_schemas: schemas,
    conversation_contract: {
      ...contract,
      intents: { columns, rows, dictionaries },
    },
  };
}

export const PLANNER_WIRE_INSTRUCTIONS =
  'WIRE REPRESENTATION: available_tools and conversation_contract.intents use {columns,rows}: each row contains field values in column order. For intent columns named in dictionaries, expand each zero-based cell index using that column dictionary. Read rows as complete objects, including denied and planned intents. available_tools may also contain ordinary descriptor objects. input_schema_ref indexes the complete schema in tool_input_schemas (zero-based). All descriptions, readiness, permissions, slots and policies remain authoritative.';
