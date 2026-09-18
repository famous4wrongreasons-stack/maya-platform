// U8b-c — the shared `InputSchema` parser (GATES-PLAN-V11 D-7).
//
// One implementation, two callers. The minter (P-MINT-CORE) parses the schema it is about to seal into
// an envelope and hash into `IntentRecord.input_schema_hash`; Gate 8's schema lane (U8b, Wave 3) parses
// the schema it projects back out of `WidgetRenderReceipt.emittedEnvelopeJson` and hashes it to prove it
// is the same one. If those two sides parsed differently, `input_schema_hash` would compare two readings
// of one document and call the difference tampering — which is why D-7 split this file out of U8b and
// forbade anyone else to re-implement it (`input-schema.architecture.spec.ts`).
//
// WHAT IS PARSED is exactly §3.6's declaration (C11:4421-4443) and the three rules that close it:
//   - R3.6.4 (C11:4445-4454): a field of kind `integer`, `decimal`, `date`, `time` or `datetime`
//     without `bounds`/`window` is "structurally unrepresentable" — so it is a parse defect here, not a
//     Gate 8 refusal later;
//   - R3.6.5 (C11:4456-4463): no `InputField` may declare a sensitivity class at all. An undeclared
//     member is refused, which is how "no field class" is enforced on a shape nobody typed;
//   - R3.6.6 (C11:4465) with E-16 (C11:6925): `free_input_justification` is required on any schema
//     carrying a non-closed field, and the declaration spells it `iff` (C11:4423), so it is also
//     refused on a schema whose fields are all closed.
//
// WHAT IS NOT PARSED HERE: values. This file never sees a submission. Membership, cardinality, bounds,
// normalizers, `c9SafeText` and the byte cap are Gate 8's (U8b), and they read the schema this file
// returns. The split matters for AMB-21d: no bounds source and no normalizer is registered this cycle,
// so a schema naming one still PARSES — it is Gate 8 that refuses the submission (`bound_violation` /
// `use_secure_surface`, D-10). A parser that rejected the schema outright would move an unapproved
// engineering choice into the shape stage and hide the refusal.
//
// FAIL-CLOSED, AND NEVER BY THROWING. Every defect is returned, with the path it sits at, because both
// callers must decide what a defect means at their own evaluation point: at `EP-MINT` it is a mint
// defect, at Gate 8 it is a stored document that no longer parses (B-10, AMB-18). Deciding that here
// would be this file inventing a refusal code.

import type { FormJustification } from '../../widget-contract/kinds';
import type { InputField, InputSchema } from '../../widget-contract/intent';

/** Where a defect sits, and what is wrong with it. `at` is a path, not a message. */
export interface InputSchemaDefect {
  /** JSON-ish path from the schema root, e.g. `fields[2].bounds.min`. */
  readonly at: string;
  /** Why that location is not the declared shape. Never contains a value. */
  readonly why: string;
}

export type ParsedInputSchema =
  | { readonly ok: true; readonly schema: InputSchema }
  | { readonly ok: false; readonly defects: readonly InputSchemaDefect[] };

/**
 * The seven non-closed kinds of R3.6.6 (C11:4465-4470). `enum`, `ref` and `boolean` are closed: an
 * `enum`/`ref` selects from a server-declared closed set, and AMB-21e (C11:7205) reads `boolean` as a
 * closed two-member domain.
 */
export const NON_CLOSED_KINDS: ReadonlySet<string> = new Set([
  'integer',
  'decimal',
  'date',
  'time',
  'datetime',
  'text',
  'phone',
]);

/** §2.6.17's closed `FormJustification` union, quoted by §3.6's `free_input_justification`. */
const JUSTIFICATIONS: ReadonlySet<string> = new Set<FormJustification>([
  'LEGAL_EXACTNESS',
  'MULTI_FIELD_ATOMIC',
  'ACCESSIBILITY_REQUEST',
  'CORRECTION_OF_RECORD',
  'AUDIT_EXACT_INPUT',
]);

/** The members every `InputField` variant carries, whatever its kind. */
const COMMON_FIELD_KEYS = ['name', 'required', 'kind'] as const;

/** The members each kind adds. The union of these and `COMMON_FIELD_KEYS` is closed (R3.8.1/R3.6.5). */
const KIND_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  enum: ['domain_ref', 'selection_min', 'selection_max'],
  ref: ['domain_ref', 'selection_min', 'selection_max'],
  integer: ['bounds'],
  decimal: ['bounds'],
  date: ['window'],
  time: ['window'],
  datetime: ['window'],
  text: ['max_len', 'normalizer_ref'],
  phone: ['normalizer_ref'],
  boolean: [],
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isNonNegativeInteger = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Collects the defects of one object against a closed key set. An UNDECLARED key is a defect in its own
 * right: R3.8.1/R3.8.2 (C11:4635-4660) refuse a key the contract does not declare, and R3.6.5 exists
 * precisely so that a field cannot grow a sensitivity member nobody declared.
 */
const closedKeys = (
  at: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
  out: InputSchemaDefect[],
): void => {
  const known = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      out.push({ at: `${at}.${key}`, why: 'undeclared member' });
    }
  }
};

const parseBounds = (
  at: string,
  value: unknown,
  out: InputSchemaDefect[],
): void => {
  if (!isRecord(value)) {
    out.push({ at, why: 'bounds is not an object (R3.6.4)' });
    return;
  }
  closedKeys(
    at,
    value,
    ['min', 'max', 'step', 'unit_ref', 'bounds_source'],
    out,
  );
  if (!isFiniteNumber(value.min))
    out.push({ at: `${at}.min`, why: 'not a finite number' });
  if (!isFiniteNumber(value.max))
    out.push({ at: `${at}.max`, why: 'not a finite number' });
  if (
    isFiniteNumber(value.min) &&
    isFiniteNumber(value.max) &&
    value.min > value.max
  ) {
    out.push({ at, why: 'min is above max' });
  }
  if (value.step !== null && !(isFiniteNumber(value.step) && value.step > 0)) {
    out.push({ at: `${at}.step`, why: 'not null and not a positive number' });
  }
  if (!isNonEmptyString(value.unit_ref))
    out.push({ at: `${at}.unit_ref`, why: 'not a non-empty string' });
  // R3.6.4: the registry key naming the canonical owner that produced the bound. Gate 8 re-reads it;
  // an unregistered key refuses `bound_violation` there (D-10), so its ABSENCE is the defect here.
  if (!isNonEmptyString(value.bounds_source))
    out.push({ at: `${at}.bounds_source`, why: 'not a non-empty string' });
};

const parseWindow = (
  at: string,
  value: unknown,
  out: InputSchemaDefect[],
): void => {
  if (!isRecord(value)) {
    out.push({ at, why: 'window is not an object (R3.6.4)' });
    return;
  }
  closedKeys(
    at,
    value,
    ['earliest', 'latest', 'granularity_s', 'calendar_ref', 'bounds_source'],
    out,
  );
  if (!isNonEmptyString(value.earliest))
    out.push({ at: `${at}.earliest`, why: 'not a non-empty string' });
  if (!isNonEmptyString(value.latest))
    out.push({ at: `${at}.latest`, why: 'not a non-empty string' });
  if (!(isNonNegativeInteger(value.granularity_s) && value.granularity_s > 0)) {
    out.push({ at: `${at}.granularity_s`, why: 'not a positive integer' });
  }
  if (!isNonEmptyString(value.calendar_ref))
    out.push({ at: `${at}.calendar_ref`, why: 'not a non-empty string' });
  if (!isNonEmptyString(value.bounds_source))
    out.push({ at: `${at}.bounds_source`, why: 'not a non-empty string' });
};

const parseField = (
  at: string,
  value: unknown,
  out: InputSchemaDefect[],
): void => {
  if (!isRecord(value)) {
    out.push({ at, why: 'field is not an object' });
    return;
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !(kind in KIND_KEYS)) {
    // The kind selects the variant, so nothing else about this field can be read once it is unknown.
    out.push({ at: `${at}.kind`, why: 'not one of the ten declared kinds' });
    return;
  }
  closedKeys(at, value, [...COMMON_FIELD_KEYS, ...KIND_KEYS[kind]], out);
  if (!isNonEmptyString(value.name))
    out.push({ at: `${at}.name`, why: 'not a non-empty string' });
  if (typeof value.required !== 'boolean')
    out.push({ at: `${at}.required`, why: 'not a boolean' });

  switch (kind) {
    case 'enum':
    case 'ref': {
      if (!isNonEmptyString(value.domain_ref)) {
        out.push({ at: `${at}.domain_ref`, why: 'not a non-empty string' });
      }
      const min = value.selection_min;
      const max = value.selection_max;
      if (!isNonNegativeInteger(min)) {
        out.push({
          at: `${at}.selection_min`,
          why: 'not a non-negative integer',
        });
      }
      if (!isNonNegativeInteger(max)) {
        out.push({
          at: `${at}.selection_max`,
          why: 'not a non-negative integer',
        });
      }
      if (isNonNegativeInteger(min) && isNonNegativeInteger(max)) {
        if (min > max)
          out.push({ at, why: 'selection_min is above selection_max' });
        // A field that can never be selected from is a field the minter should not have emitted;
        // B-11 (C11:7203) reads min/max as the bounds of a PRESENT value, so max 0 admits nothing.
        if (max === 0)
          out.push({ at: `${at}.selection_max`, why: 'admits no selection' });
      }
      break;
    }
    case 'integer':
    case 'decimal':
      parseBounds(`${at}.bounds`, value.bounds, out);
      break;
    case 'date':
    case 'time':
    case 'datetime':
      parseWindow(`${at}.window`, value.window, out);
      break;
    case 'text': {
      if (!(isNonNegativeInteger(value.max_len) && value.max_len > 0)) {
        out.push({ at: `${at}.max_len`, why: 'not a positive integer' });
      }
      if (!isNonEmptyString(value.normalizer_ref)) {
        out.push({ at: `${at}.normalizer_ref`, why: 'not a non-empty string' });
      }
      break;
    }
    case 'phone':
      // The declaration fixes the literal (C11:4441): `normalizer_ref: 'canonical_msisdn'`.
      if (value.normalizer_ref !== 'canonical_msisdn') {
        out.push({
          at: `${at}.normalizer_ref`,
          why: "not the declared literal 'canonical_msisdn'",
        });
      }
      break;
    default:
      // `boolean` carries nothing beyond the common members; `closedKeys` above has already run.
      break;
  }
};

/**
 * Parses an unknown value as §3.6's `InputSchema`. Total: it returns defects, never throws, and the
 * value it returns on success is REBUILT from the declared members only — so `inputSchemaHash` hashes
 * the document, not whatever else the caller's object happened to carry.
 *
 * An empty `fields` array parses. It is well formed, and Gate 8 then refuses every submitted key as
 * undeclared; refusing it here would be this file inventing a rule §3.6 does not state.
 */
export const parseInputSchema = (value: unknown): ParsedInputSchema => {
  const out: InputSchemaDefect[] = [];
  if (!isRecord(value)) {
    return { ok: false, defects: [{ at: '', why: 'not an object' }] };
  }
  closedKeys(
    '',
    value,
    ['fields', 'max_total_bytes', 'free_input_justification'],
    out,
  );

  const fields = value.fields;
  if (!Array.isArray(fields)) {
    out.push({ at: '.fields', why: 'not an array' });
  } else {
    fields.forEach((field, index) =>
      parseField(`.fields[${index}]`, field, out),
    );
    // AMB-17 (C11:7201) keys `selection_domain` BY FIELD. Two fields of one name would give one key two
    // domains, and the codec could not tell which the submission selected from.
    const names = fields
      .map((f) => (isRecord(f) ? f.name : undefined))
      .filter(isNonEmptyString);
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name))
        out.push({ at: '.fields', why: 'duplicate field name' });
      seen.add(name);
    }
  }

  // "hard cap; oversize submissions are REFUSED, never truncated" (C11:4423). A cap that is not a
  // positive integer is not a cap: `inputsByteLength` answers in whole bytes.
  if (!(
    isNonNegativeInteger(value.max_total_bytes) && value.max_total_bytes > 0
  )) {
    out.push({ at: '.max_total_bytes', why: 'not a positive integer' });
  }

  // R3.6.6 with E-16, and the declaration's own `iff` (C11:4423).
  const nonClosed =
    Array.isArray(fields) &&
    fields.some(
      (f) =>
        isRecord(f) &&
        typeof f.kind === 'string' &&
        NON_CLOSED_KINDS.has(f.kind),
    );
  const justification = value.free_input_justification;
  if (nonClosed) {
    if (
      typeof justification !== 'string' ||
      !JUSTIFICATIONS.has(justification)
    ) {
      out.push({
        at: '.free_input_justification',
        why: 'required by R3.6.6 on a schema carrying a non-closed field, and not a member of FormJustification',
      });
    }
  } else if (justification !== null) {
    out.push({
      at: '.free_input_justification',
      why: 'present on a schema whose fields are all closed (the declaration says iff)',
    });
  }

  if (out.length > 0) return { ok: false, defects: out };

  const declared = fields as unknown[];
  return {
    ok: true,
    schema: {
      fields: declared.map((field) => rebuildField(field as InputField)),
      max_total_bytes: value.max_total_bytes as number,
      free_input_justification: justification as FormJustification | null,
    },
  };
};

/** Copies a validated field's declared members and nothing else. Key ORDER is irrelevant downstream:
 * `stableActionJson` sorts object keys before hashing. Field ORDER is not — it is the order the surface
 * drew, so the array is copied as it stands. */
const rebuildField = (field: InputField): InputField => {
  const f = field as unknown as Record<string, unknown>;
  const base = { name: f.name as string, required: f.required as boolean };
  switch (field.kind) {
    case 'enum':
    case 'ref':
      return {
        ...base,
        kind: field.kind,
        domain_ref: field.domain_ref,
        selection_min: field.selection_min,
        selection_max: field.selection_max,
      };
    case 'integer':
    case 'decimal':
      return {
        ...base,
        kind: field.kind,
        bounds: {
          min: field.bounds.min,
          max: field.bounds.max,
          step: field.bounds.step,
          unit_ref: field.bounds.unit_ref,
          bounds_source: field.bounds.bounds_source,
        },
      };
    case 'date':
    case 'time':
    case 'datetime':
      return {
        ...base,
        kind: field.kind,
        window: {
          earliest: field.window.earliest,
          latest: field.window.latest,
          granularity_s: field.window.granularity_s,
          calendar_ref: field.window.calendar_ref,
          bounds_source: field.window.bounds_source,
        },
      };
    case 'text':
      return {
        ...base,
        kind: 'text',
        max_len: field.max_len,
        normalizer_ref: field.normalizer_ref,
      };
    case 'phone':
      return { ...base, kind: 'phone', normalizer_ref: 'canonical_msisdn' };
    default:
      return { ...base, kind: 'boolean' };
  }
};
