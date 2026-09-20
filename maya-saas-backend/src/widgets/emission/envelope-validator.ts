import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import type { WidgetComposerInput } from '../../widget-contract/envelope';
import {
  KIND_OWNER_CLASS,
  allowedKinds,
  emittable,
  isInheritedOwner,
} from '../../widget-contract/owner-classes';
import { IntentTemplateRefusal } from './intent-template.registry';

const INPUT_KEYS = Object.freeze([
  'kind_proposal',
  'capability',
  'capability_version',
  'source',
  'correlation_refs',
  'origin',
  'facts',
  'facts_origin',
  'slots',
  'limitation_codes',
  'intent_proposals',
  'locale',
]);

const exactKeys = (value: object, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((v, i) => v === expected[i])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const refuseUnlessRecord = (
  value: unknown,
  code: string,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new IntentTemplateRefusal(code);
  return value;
};

const exactOptionalKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> => {
  const record = refuseUnlessRecord(value, 'composer_nested_shape_invalid');
  const actual = Object.keys(record);
  if (
    required.some((key) => !actual.includes(key)) ||
    actual.some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new IntentTemplateRefusal('composer_nested_unknown_field');
  return record;
};

const assertSourceClosed = (source: unknown): void => {
  const record = refuseUnlessRecord(source, 'source_invalid');
  switch (record.from) {
    case 'capability_envelope':
      exactOptionalKeys(record, [
        'from',
        'capability',
        'capability_version',
        'fact_index',
      ]);
      break;
    case 'agent_result':
      exactOptionalKeys(record, ['from', 'run_id', 'result_seq', 'path']);
      break;
    case 'action_intent':
      exactOptionalKeys(record, [
        'from',
        'run_id',
        'result_seq',
        'intent_index',
      ]);
      break;
    case 'action_execution':
      exactOptionalKeys(record, ['from', 'execution_id']);
      break;
    case 'orchestrator_state':
      exactOptionalKeys(record, ['from', 'run_id', 'field']);
      break;
    default:
      throw new IntentTemplateRefusal('source_invalid');
  }
};

const assertOriginClosed = (origin: unknown): void => {
  const record = exactOptionalKeys(origin, [
    'trigger',
    'emitter',
    'moment_key',
    'proactive_provenance',
  ]);
  if (record.proactive_provenance !== null)
    exactOptionalKeys(record.proactive_provenance, [
      'artefact_ref',
      'artefact_kind',
      'artefact_created_at',
      'narrative_source',
      'narrative_hash',
      'moment_template_id',
      'moment_template_version',
      'notify_pref_key',
    ]);
};

const assertFactsClosed = (composerFacts: unknown): void => {
  if (!Array.isArray(composerFacts))
    throw new IntentTemplateRefusal('facts_invalid');
  for (const fact of composerFacts) {
    const record = exactOptionalKeys(
      fact,
      ['capability', 'status', 'as_of', 'evidence_refs', 'completeness'],
      ['basis', 'currency'],
    );
    exactOptionalKeys(record.completeness, [
      'status',
      'requestedScopeHash',
      'returnedCount',
      'totalCount',
      'hasMore',
      'cursorRef',
      'truncated',
      'reasonCodes',
    ]);
  }
};

const assertSlotsClosed = (slots: unknown): void => {
  const record = refuseUnlessRecord(slots, 'slots_invalid');
  for (const binding of Object.values(record)) {
    const value = refuseUnlessRecord(binding, 'slot_invalid');
    if (value.from === 'fact') {
      exactOptionalKeys(value, ['from', 'fact_index'], ['measure_key']);
      continue;
    }
    if (value.from === 'phrase') {
      const phrase = exactOptionalKeys(
        value,
        ['from', 'phrase_key'],
        ['params'],
      );
      if (
        phrase.params !== undefined &&
        (!isRecord(phrase.params) ||
          Object.values(phrase.params).some(
            (index) => !Number.isInteger(index) || Number(index) < 0,
          ))
      )
        throw new IntentTemplateRefusal('slot_params_invalid');
      continue;
    }
    throw new IntentTemplateRefusal('slot_invalid');
  }
};

const assertProposalMembersClosed = (proposals: unknown): void => {
  if (!Array.isArray(proposals))
    throw new IntentTemplateRefusal('intent_proposals_invalid');
  for (const proposal of proposals) {
    const record = refuseUnlessRecord(proposal, 'intent_proposal_invalid');
    for (const refName of ['capability', 'handoff_capability_ref'] as const) {
      if (record[refName] !== undefined)
        exactOptionalKeys(record[refName], ['space', 'key']);
    }
    if (
      record.argument_handles !== undefined &&
      (!isRecord(record.argument_handles) ||
        Object.values(record.argument_handles).some(
          (handle) => typeof handle !== 'string',
        ))
    )
      throw new IntentTemplateRefusal('argument_handles_invalid');
  }
};

/** E1/E2/E5's closed composer-input boundary, before any hash, token or persistence. */
export const assertComposerInput = (input: WidgetComposerInput): void => {
  if (!isRecord(input))
    throw new IntentTemplateRefusal('composer_input_not_closed');
  if (!exactKeys(input, INPUT_KEYS))
    throw new IntentTemplateRefusal('composer_input_not_closed');
  assertSourceClosed(input.source);
  exactOptionalKeys(
    input.correlation_refs,
    [],
    ['run_id', 'turn_id', 'message_id', 'parent_id'],
  );
  assertOriginClosed(input.origin);
  // The admission pipeline also has a member named `facts`. Keep this composer boundary explicit
  // without presenting its unrelated array as a GateContext AdmissionFacts read to J-1's source
  // fence. The key is closed by INPUT_KEYS immediately above.
  const composerFactsKey: keyof WidgetComposerInput = 'facts';
  const composerFacts = input[composerFactsKey];
  assertFactsClosed(composerFacts);
  assertSlotsClosed(input.slots);
  assertProposalMembersClosed(input.intent_proposals);
  if (
    !Array.isArray(input.facts_origin) ||
    !Array.isArray(input.limitation_codes)
  )
    throw new IntentTemplateRefusal('composer_array_invalid');
  if (!emittable(input.kind_proposal))
    throw new IntentTemplateRefusal('kind_not_emittable');
  if (input.intent_proposals.length > 12)
    throw new IntentTemplateRefusal('too_many_intents');
  if (composerFacts.length !== input.facts_origin.length)
    throw new IntentTemplateRefusal('facts_origin_mismatch');
  if (!input.locale || input.locale.length > 64)
    throw new IntentTemplateRefusal('locale_invalid');
  if (input.capability_version !== C9_REGISTRY_HASH)
    throw new IntentTemplateRefusal('capability_version_incompatible');

  const kind = input.kind_proposal;
  if (
    KIND_OWNER_CLASS[kind] !== 'NONE' &&
    !isInheritedOwner(kind) &&
    !allowedKinds({ space: 'C9', key: input.capability }).has(kind)
  )
    throw new IntentTemplateRefusal('kind_not_allowed_for_source_capability');
};
