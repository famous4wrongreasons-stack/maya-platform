// Gate 8 — deterministic validation over the exact server-emitted schema.
//
// The null-schema lane is decided without a read. The schema lane reads the exact render receipt
// inside the request transaction, verifies its hash against the audit-retained record and validates
// every submitted member. No submitted value can select a schema, domain, bound or normalizer.

import { c9SafeText } from '../../orchestration/c9.contract';
import type { InputField, InputSchema } from '../../widget-contract/intent';
import type {
  GateContext,
  IntentRecordRow,
  SubmissionShape,
} from '../gate.types';
import {
  decodeSelectionDomain,
  type SelectionDomain,
} from '../input-schema/codec';
import { inputSchemaHash } from '../input-schema/input-schema-hash';
import { inputsByteLength } from '../input-schema/inputs-bytes';
import { parseInputSchema } from '../input-schema/parse-input-schema';
import type { InputBoundsRegistry } from './input-bounds.registry';
import type { InputNormalizerRegistry } from './input-normalizers.registry';

export type InputsPresence = 'absent' | 'null' | 'values';

export const inputsPresence = (submission: SubmissionShape): InputsPresence => {
  const inputs: unknown = submission?.inputs;
  if (inputs === undefined) return 'absent';
  if (inputs === null) return 'null';
  return 'values';
};

export type NullSchemaDecision =
  | {
      readonly lane: 'null-schema';
      readonly verdict: 'pass';
      readonly presence: InputsPresence;
    }
  | {
      readonly lane: 'null-schema';
      readonly verdict: 'refuse';
      readonly code: 'selection_out_of_domain';
      readonly detail: string;
      readonly presence: InputsPresence;
    }
  | {
      readonly lane: 'schema';
      readonly verdict: 'evaluate';
      readonly presence: InputsPresence;
    };

/** The lane decision itself reads no store. */
export const decideInputValidation = (
  record: IntentRecordRow | null,
  submission: SubmissionShape,
): NullSchemaDecision => {
  const presence = inputsPresence(submission);
  if (!record || record.inputSchemaHash !== null)
    return { lane: 'schema', verdict: 'evaluate', presence };
  if (presence === 'values')
    return {
      lane: 'null-schema',
      verdict: 'refuse',
      code: 'selection_out_of_domain',
      detail:
        'the record declares no input schema, and the submission carries `inputs` (K12)',
      presence,
    };
  return { lane: 'null-schema', verdict: 'pass', presence };
};

export const decideForContext = (ctx: GateContext): NullSchemaDecision =>
  decideInputValidation(ctx.record, ctx.submission);

export class InputValidationIntegrityError extends Error {
  constructor(reason: string) {
    super(`gate 8 input integrity fault: ${reason}`);
    this.name = 'InputValidationIntegrityError';
  }
}

export type SchemaValidationResult =
  | {
      readonly verdict: 'pass';
      readonly validatedInputs: {
        readonly closed: ReadonlyMap<string, readonly string[]>;
      };
    }
  | {
      readonly verdict: 'refuse';
      readonly code:
        | 'selection_out_of_domain'
        | 'bound_violation'
        | 'use_secure_surface'
        | 'oversize_submission';
      readonly detail: string;
    };

const refusal = (
  code: Extract<SchemaValidationResult, { verdict: 'refuse' }>['code'],
  detail: string,
): SchemaValidationResult => ({ verdict: 'refuse', code, detail });

const asSelections = (value: unknown): readonly string[] | null => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === 'string'))
    return value;
  return null;
};

const safeText = (value: unknown, max?: number): string | null => {
  try {
    return c9SafeText(value, max);
  } catch {
    return null;
  }
};

const boundSourceOf = (
  field: Extract<
    InputField,
    { kind: 'integer' | 'decimal' | 'date' | 'time' | 'datetime' }
  >,
): string =>
  'bounds' in field ? field.bounds.bounds_source : field.window.bounds_source;

/**
 * Validates one schema-bearing submission. The schema and domain are server-held inputs already
 * integrity-checked by the caller; this function never reads a record or a provider directly.
 */
export const validateSchemaInputs = async (args: {
  readonly tenantId: string;
  readonly schema: InputSchema;
  readonly selectionDomain: SelectionDomain;
  readonly inputs: Readonly<Record<string, unknown>> | null | undefined;
  readonly bounds: InputBoundsRegistry;
  readonly normalizers: InputNormalizerRegistry;
}): Promise<SchemaValidationResult> => {
  const values = args.inputs ?? {};
  if (args.inputs !== null && args.inputs !== undefined) {
    if (inputsByteLength(args.inputs) > args.schema.max_total_bytes)
      return refusal(
        'oversize_submission',
        'the canonical UTF-8 input encoding exceeds max_total_bytes',
      );
  }

  const fields = new Map(
    args.schema.fields.map((field) => [field.name, field]),
  );
  for (const key of Object.keys(values))
    if (!fields.has(key))
      return refusal(
        'selection_out_of_domain',
        `the submission contains undeclared field ${key}`,
      );

  const closed = new Map<string, readonly string[]>();
  for (const field of args.schema.fields) {
    const present = Object.prototype.hasOwnProperty.call(values, field.name);
    if (!present) {
      if (field.required)
        return refusal(
          'selection_out_of_domain',
          `required field ${field.name} is absent`,
        );
      continue;
    }
    const value = values[field.name];
    switch (field.kind) {
      case 'enum':
      case 'ref': {
        const selected = asSelections(value);
        if (selected === null)
          return refusal(
            'selection_out_of_domain',
            `field ${field.name} is not a closed selection`,
          );
        if (new Set(selected).size !== selected.length)
          return refusal(
            'selection_out_of_domain',
            `field ${field.name} repeats an option in a set`,
          );
        if (
          selected.length < field.selection_min ||
          selected.length > field.selection_max
        )
          return refusal(
            'selection_out_of_domain',
            `field ${field.name} violates its selection cardinality`,
          );
        const domain = args.selectionDomain.get(field.name);
        if (!domain || selected.some((id) => !domain.has(id)))
          return refusal(
            'selection_out_of_domain',
            `field ${field.name} contains an option outside its token domain`,
          );
        closed.set(field.name, Object.freeze([...selected]));
        break;
      }
      case 'boolean':
        if (typeof value !== 'boolean')
          return refusal(
            'selection_out_of_domain',
            `field ${field.name} is not boolean`,
          );
        break;
      case 'integer':
      case 'decimal':
      case 'date':
      case 'time':
      case 'datetime': {
        const correctType =
          field.kind === 'integer'
            ? typeof value === 'number' && Number.isSafeInteger(value)
            : field.kind === 'decimal'
              ? typeof value === 'number' && Number.isFinite(value)
              : typeof value === 'string';
        if (!correctType)
          return refusal(
            'bound_violation',
            `field ${field.name} does not conform to kind ${field.kind}`,
          );
        const source = args.bounds.get(boundSourceOf(field));
        if (!source)
          return refusal(
            'bound_violation',
            `field ${field.name} names an unregistered bounds source`,
          );
        if (
          !(await source({
            tenantId: args.tenantId,
            field,
            value: value as number | string,
          }))
        )
          return refusal(
            'bound_violation',
            `field ${field.name} is outside the fresh canonical bound`,
          );
        break;
      }
      case 'text': {
        if (typeof value !== 'string' || value.length > field.max_len)
          return refusal(
            'bound_violation',
            `field ${field.name} exceeds max_len or is not text`,
          );
        const first = safeText(value);
        if (first === null)
          return refusal(
            'use_secure_surface',
            `field ${field.name} contains secure-surface content`,
          );
        const normalizer = args.normalizers.get(field.normalizer_ref);
        if (!normalizer)
          return refusal(
            'use_secure_surface',
            `field ${field.name} names an unregistered normalizer`,
          );
        const normalized = safeText(normalizer(first));
        if (normalized === null)
          return refusal(
            'use_secure_surface',
            `field ${field.name} is unsafe after normalization`,
          );
        break;
      }
      case 'phone': {
        const first = safeText(value);
        if (first === null)
          return refusal(
            'use_secure_surface',
            `field ${field.name} is not safe text`,
          );
        const normalizer = args.normalizers.get(field.normalizer_ref);
        if (!normalizer)
          return refusal(
            'use_secure_surface',
            `field ${field.name} requires a secure registered normalizer`,
          );
        if (safeText(normalizer(first)) === null)
          return refusal(
            'use_secure_surface',
            `field ${field.name} is unsafe after normalization`,
          );
        break;
      }
    }
  }
  return {
    verdict: 'pass',
    validatedInputs: { closed },
  };
};

export const parseAndVerifySchema = (
  value: unknown,
  expectedHash: string,
): InputSchema => {
  const parsed = parseInputSchema(value);
  if (!parsed.ok)
    throw new InputValidationIntegrityError('the stored schema does not parse');
  if (inputSchemaHash(parsed.schema) !== expectedHash)
    throw new InputValidationIntegrityError(
      'the emitted schema hash differs from the intent record',
    );
  return parsed.schema;
};

export const decodeRecordDomain = (
  record: IntentRecordRow,
): SelectionDomain => {
  const decoded = decodeSelectionDomain(record.selectionDomain);
  if (!decoded.ok)
    throw new InputValidationIntegrityError(
      'the intent record selection domain is invalid',
    );
  return decoded.value;
};
