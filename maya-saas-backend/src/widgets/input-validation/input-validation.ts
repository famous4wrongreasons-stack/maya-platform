// ── Gate 8 — input validation: the decision, as a pure function (U8a, GATES-PLAN-V11) ──────────────
//
// Row 8 (C11:4727) is one gate with two lanes, and this file decides which lane a submission is in
// before anything is read from a store. B-01 (AMB-01a, C11:7188) is why it is a LANE and not a gate:
// "an unbuilt clause refuses only the cases it governs, and built clauses evaluate". The schema lane
// needs the schema source, the codec and the two registries (U8b); the null-schema lane needs none of
// them, so it is built here and the other one is held, fail closed.
//
//   record.inputSchemaHash === null      the NULL-SCHEMA lane, built
//     submission.inputs absent or null     pass. Nothing was submitted, so nothing can be out of a
//                                          domain, and `validatedInputs` is null rather than empty.
//     anything else, `{}` included         REFUSED / selection_out_of_domain (K12, C11:2902)
//   record.inputSchemaHash !== null      the SCHEMA lane, HELD: `mechanism_absent` until U8b
//
// `{}` refuses, and that is deliberate. K12's sentence is about CARRYING `inputs`, not about carrying
// values: "refuses a submission carrying `inputs` for a null schema". An empty object is a submission
// that carried the member. Treating it as "nothing was sent" would make the one form a hostile client
// can always produce the one form that is never refused — and §3.8 already distinguishes the two, since
// `inputs` is REQUIRED and NULLABLE there (P-F88): "omitted" and "null" are different answers, and `{}`
// is a third. The gate does not repair, normalise or truncate any of them (row 8: "enforced by refusal,
// never truncation").
//
// Nothing here reads a store, a clock, a registry or the principal. The gate file calls it, and the one
// read the lane performs happens THERE, after the decision (D-2).

import type {
  GateContext,
  IntentRecordRow,
  SubmissionShape,
} from '../gate.types';

/** What the submission said about `inputs`, as three cases rather than a truthiness test. */
export type InputsPresence = 'absent' | 'null' | 'values';

/**
 * `absent` and `null` are kept apart even though this lane answers both with a pass: they are different
 * submissions (§3.8 makes `inputs` required and nullable), the reason each passes is different, and the
 * schema lane U8b builds will answer them differently.
 *
 * Every value that is neither `undefined` nor `null` is `values` — a string, an array or a number as
 * much as an object. A shape that is not a map of scalars is refused by the §3.8 stage before a gate
 * runs (P-F88's `ClosedInputsConstraint`), and a gate that assumed that had held would be trusting a
 * pipe: here it simply cannot be out of a null domain and pass.
 */
export const inputsPresence = (submission: SubmissionShape): InputsPresence => {
  const inputs: unknown = submission?.inputs;
  if (inputs === undefined) return 'absent';
  if (inputs === null) return 'null';
  return 'values';
};

/** Which lane the record put the submission in, and what the lane answers. */
export type InputValidationDecision =
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
      readonly verdict: 'refuse';
      readonly code: 'mechanism_absent';
      readonly detail: string;
      readonly presence: InputsPresence;
    };

/**
 * What the schema lane waits on. It is the HELD half of row 8, and it names the mechanism rather than a
 * ruling: the codec is U8b-c's, the schema source, the bounds registry and the normalizer registry are
 * U8b's. A record that carries a schema hash therefore refuses — "not built yet" and "allowed" are never
 * the same branch (F5).
 */
export const INPUT_VALIDATION_HELD_ON =
  'the schema lane: the server-held input schema (hash-bound), the closed-domain codec, and the bounds and normalizer registries (U8b)';

/**
 * The decision, from the record and the submission alone.
 *
 * A null record fails closed on the HELD lane rather than on the built one: with no record there is no
 * `inputSchemaHash`, so the gate cannot tell which lane it is in, and a gate that cannot tell refuses.
 * Slot 8 never sees one on a conformant build — Gate 1 refuses first — which is exactly why the branch
 * is written down instead of assumed away.
 */
export const decideInputValidation = (
  record: IntentRecordRow | null,
  submission: SubmissionShape,
): InputValidationDecision => {
  const presence = inputsPresence(submission);
  if (!record)
    return {
      lane: 'schema',
      verdict: 'refuse',
      code: 'mechanism_absent',
      detail:
        'no record: the lane cannot be determined without inputSchemaHash',
      presence,
    };
  if (record.inputSchemaHash !== null)
    return {
      lane: 'schema',
      verdict: 'refuse',
      code: 'mechanism_absent',
      detail: `gate 8 (Input validation) is NORMATIVE-PENDING on ${INPUT_VALIDATION_HELD_ON}`,
      presence,
    };
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

/** The same decision over a gate context, so the gate file states the read once. */
export const decideForContext = (ctx: GateContext): InputValidationDecision =>
  decideInputValidation(ctx.record, ctx.submission);
