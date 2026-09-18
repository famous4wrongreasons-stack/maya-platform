// U8b-c — the field-keyed `selection_domain` codec (B-09/AMB-17) and the field-keyed labels decode.
//
// TWO MEMBERS, TWO ERASURE CLASSES, ONE FILE. §0.4 F16 (C11:243-244) is explicit that they are
// distinct: "The `selection_domain` FIELD is `AUDIT_RETAINED`; the `selection_domain` LABELS are
// `CONVERSATION_CONTENT`, and the two are distinct." They are coded together because they are two
// projections of one document — the ids and the human strings of those same ids — and because a second
// implementation of either is exactly what D-7 forbids. They are never MERGED: nothing here returns ids
// and labels in one structure, so no caller can carry a label into an `AUDIT_RETAINED` path by accident
// (F15, C11:220-235).
//
// THE COLUMN IS A STRING. §3.7 declares `IntentRecord.selection_domain: string` (C11:4514) — "the closed
// domain this token may select from; read by the SUPERSEDED comparison". AMB-17 (C11:7201) then rules
// that "closed-domain membership is checked per field, and `selection_domain` is keyed by field". One
// string, many fields: that is what a codec is for, and AREA-A §1 names it "the shared P1 codec
// (engineering, one owner)".
//
// CANONICAL, BECAUSE THE COLUMN IS COMPARED AS A STRING. Gate 10's SUPERSEDED comparison reads
// `selection_domain` and compares records. If one record spelled a domain `{"a":["x","y"]}` and another
// spelled the same domain `{"a":["y","x"]}`, two equal domains would compare unequal. So the encoding
// is canonical in both axes: field names are sorted by the one canonicaliser (`stableActionJson` sorts
// object keys at every depth), and the option ids of each field are sorted here, by code unit, before
// they reach it. `decodeSelectionDomain` then REFUSES a non-canonical spelling rather than accepting it
// quietly — a stored value no conformant minter could have written is a store defect, and admitting it
// would make the comparison above meaningless.
//
// SELECTIONS ARE SETS (B-11/AMB-20, C11:7203; SCHED.1 C11:3148 calls `move_targets` "a CLOSED set of
// bucket_ids"). A repeated id is therefore a defect, not a longer list: the codec refuses it on both
// sides. Cardinality — `selection_min`/`selection_max` over a PRESENT value — is Gate 8's (U8b), not
// the codec's.
//
// NOTHING HERE DECIDES ANYTHING. Every failure is a returned defect. Whether a defect is a mint defect,
// an integrity fault or `superseded/handle_stale` (B-10, AMB-18) is the caller's evaluation point to
// name, and naming it here would be this file inventing a refusal code.

import { stableActionJson } from '../../action-engine/action-engine.identity';

/** Field name → the closed set of option ids that field may be selected from. */
export type SelectionDomain = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Field name → option id → canonical label (C11:4546, column `selectionDomainLabelsJson`).
 * `CONVERSATION_CONTENT`: read by Gate 9's lowering and by nothing after it (F15, C11:226-228).
 */
export type SelectionDomainLabels = ReadonlyMap<
  string,
  ReadonlyMap<string, string>
>;

export interface CodecDefect {
  /** Path inside the coded document, e.g. `.slot[1]`. Never a value. */
  readonly at: string;
  readonly why: string;
}

export type CodecResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly defects: readonly CodecDefect[] };

/** The empty domain, spelled canonically. A record that offers no selection still stores a string. */
export const EMPTY_SELECTION_DOMAIN = '{}';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Code-unit order, not locale order: the ids are opaque server tokens, and a comparator that depended on
 * the process locale would spell one domain two ways on two machines.
 */
const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** Reads either shape a caller holds: the map `decodeSelectionDomain` returns, or a plain record. */
const entriesOf = (
  domain: unknown,
): readonly (readonly [unknown, unknown])[] | null => {
  if (domain instanceof Map) return [...domain.entries()];
  if (isRecord(domain)) return Object.entries(domain);
  return null;
};

const idsOf = (ids: unknown): readonly unknown[] | null => {
  if (Array.isArray(ids)) return ids as readonly unknown[];
  if (ids instanceof Set) return [...(ids as Set<unknown>)];
  return null;
};

/**
 * Encodes a field-keyed domain into the canonical `IntentRecord.selection_domain` string.
 *
 * Accepts the map this file's decoder returns and the plain record a minter builds, so that
 * `encodeSelectionDomain(decodeSelectionDomain(s).value)` round-trips to `s` exactly.
 */
export const encodeSelectionDomain = (domain: unknown): CodecResult<string> => {
  const entries = entriesOf(domain);
  if (entries === null) {
    return { ok: false, defects: [{ at: '', why: 'not a record or a Map' }] };
  }
  const defects: CodecDefect[] = [];
  const out: Record<string, string[]> = {};
  const fields = new Set<string>();
  for (const [field, ids] of entries) {
    if (typeof field !== 'string' || field.length === 0) {
      defects.push({ at: '', why: 'field name is not a non-empty string' });
      continue;
    }
    if (fields.has(field)) {
      // Only a `Map` can carry a key twice; a record cannot. It is still refused, because AMB-17 gives
      // one field one domain.
      defects.push({ at: `.${field}`, why: 'duplicate field name' });
      continue;
    }
    fields.add(field);
    const list = idsOf(ids);
    if (list === null) {
      defects.push({ at: `.${field}`, why: 'ids are not an array or a Set' });
      continue;
    }
    const seen = new Set<string>();
    const kept: string[] = [];
    list.forEach((id, index) => {
      if (typeof id !== 'string' || id.length === 0) {
        defects.push({
          at: `.${field}[${index}]`,
          why: 'option id is not a non-empty string',
        });
        return;
      }
      if (seen.has(id)) {
        // B-11/AMB-20: selections are sets. A duplicate is a defect, never a silent de-duplication:
        // de-duplicating would let a minter emit a domain it did not mean and never hear about it.
        defects.push({ at: `.${field}[${index}]`, why: 'duplicate option id' });
        return;
      }
      seen.add(id);
      kept.push(id);
    });
    out[field] = [...kept].sort(byCodeUnit);
  }
  if (defects.length > 0) return { ok: false, defects };
  return { ok: true, value: stableActionJson(out) };
};

/**
 * Decodes the stored `selection_domain` string. Refuses anything a conformant `encodeSelectionDomain`
 * could not have written, the non-canonical spellings included.
 */
export const decodeSelectionDomain = (
  encoded: unknown,
): CodecResult<SelectionDomain> => {
  if (typeof encoded !== 'string') {
    return { ok: false, defects: [{ at: '', why: 'not a string' }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch {
    return { ok: false, defects: [{ at: '', why: 'not JSON' }] };
  }
  if (!isRecord(parsed)) {
    return { ok: false, defects: [{ at: '', why: 'not a JSON object' }] };
  }
  const defects: CodecDefect[] = [];
  const value = new Map<string, ReadonlySet<string>>();
  for (const [field, ids] of Object.entries(parsed)) {
    if (field.length === 0) {
      defects.push({ at: '', why: 'field name is empty' });
      continue;
    }
    if (!Array.isArray(ids)) {
      defects.push({ at: `.${field}`, why: 'ids are not an array' });
      continue;
    }
    const set = new Set<string>();
    ids.forEach((id: unknown, index: number) => {
      if (typeof id !== 'string' || id.length === 0) {
        defects.push({
          at: `.${field}[${index}]`,
          why: 'option id is not a non-empty string',
        });
        return;
      }
      if (set.has(id)) {
        defects.push({ at: `.${field}[${index}]`, why: 'duplicate option id' });
        return;
      }
      set.add(id);
    });
    value.set(field, set);
  }
  if (defects.length > 0) return { ok: false, defects };

  // Canonicality, checked by re-encoding rather than by a second set of rules: the one encoder decides
  // what canonical means, so the two can never drift apart.
  const re = encodeSelectionDomain(value);
  if (!re.ok || re.value !== encoded) {
    return {
      ok: false,
      defects: [
        {
          at: '',
          why: 'not the canonical spelling of its own domain (field or option order)',
        },
      ],
    };
  }
  return { ok: true, value };
};

/**
 * Decodes `selection_domain_labels` (C11:4546): field name → option id → canonical label.
 *
 * The nesting is the clause. A FLAT map of option id → label loses which field an id belonged to, and
 * AMB-17 is the ruling that ids are only meaningful per field — an id valid in one field is not valid in
 * another. A flat document is therefore refused, not flattened into the outer level.
 *
 * Absence is a defect here, deliberately: `selectionDomainLabelsJson` is nullable, and a caller must
 * decide what an absent label map means at its own evaluation point (Gate 9 lowers `{{selection}}` only
 * from server-resolved labels, R3.9.2 C11:4889-4895). A decoder that answered "absent" with an empty map
 * would hand Gate 9 a resolvable-looking document with nothing in it.
 */
export const decodeSelectionDomainLabels = (
  value: unknown,
): CodecResult<SelectionDomainLabels> => {
  if (value === null || value === undefined) {
    return { ok: false, defects: [{ at: '', why: 'absent' }] };
  }
  if (!isRecord(value)) {
    return { ok: false, defects: [{ at: '', why: 'not a JSON object' }] };
  }
  const defects: CodecDefect[] = [];
  const out = new Map<string, ReadonlyMap<string, string>>();
  for (const [field, labels] of Object.entries(value)) {
    if (field.length === 0) {
      defects.push({ at: '', why: 'field name is empty' });
      continue;
    }
    if (!isRecord(labels)) {
      defects.push({
        at: `.${field}`,
        why: 'labels are keyed by field and then by option id (C11:4546); this level is not an object',
      });
      continue;
    }
    const inner = new Map<string, string>();
    for (const [id, label] of Object.entries(labels)) {
      if (id.length === 0) {
        defects.push({ at: `.${field}`, why: 'option id is empty' });
        continue;
      }
      if (typeof label !== 'string' || label.length === 0) {
        defects.push({
          at: `.${field}.${id}`,
          why: 'label is not a non-empty string',
        });
        continue;
      }
      inner.set(id, label);
    }
    out.set(field, inner);
  }
  if (defects.length > 0) return { ok: false, defects };
  return { ok: true, value: out };
};
