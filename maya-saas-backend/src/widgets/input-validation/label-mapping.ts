// ── Gate 8 — the labels Gate 9 is allowed to interpolate (R3.9.2, C11:4889-4895; U8a) ───────────────
//
// R3.9.2: "`{{selection}}` is filled from `IntentRecord.selected_labels`, which the gateway writes at
// Gate 8 by mapping validated domain members to their canonical display labels. Raw client bytes are
// never interpolated."
//
// Two consequences shape this file, and both are about what it may NOT do.
//
//   1. A label is produced from a VALIDATED member, never from the submission. So the mapping's input is
//      `validatedInputs` — Gate 8's own product — and this file has no parameter of the submission's
//      `inputs` type. The fence is structural: a function that cannot see the client's bytes cannot
//      interpolate them, and that is checked at the source (`label-mapping.spec.ts`), not hoped for.
//   2. On the null-schema lane nothing was validated, so nothing was selected. `selectedLabels` is `[]`
//      — the empty selection — and NOT `null`, which `gate.types.ts` reserves for "a validated member's
//      label is unresolvable" (DS-03 A, which Gate 9 answers with `superseded/handle_stale`). The two
//      must not collapse: "nothing was selected" and "the label of something that was selected cannot be
//      resolved" are different facts, and only the second one is a render impossibility.
//
// The schema lane's mapping (the field-keyed decode of `selectionDomainLabelsJson`, C11:4546) is U8b's.
// It is not stubbed here as an empty list, because an empty list is a VALUE Gate 9 would interpolate:
// a selector whose labels silently vanished would lower to a sentence with no selection in it. It
// raises instead, and the lane that would reach it refuses before it can (`input-validation.ts`).

import type { AdmissionFacts } from '../gate.types';

/** Gate 8's product for the null-schema lane. `null` there means "no schema declared any field". */
export type ValidatedInputs = NonNullable<AdmissionFacts['validatedInputs']>;

/** The empty selection, frozen once: nothing was selected, and no label is unresolvable. */
export const NO_SELECTION: readonly string[] = Object.freeze([]);

/** Raised when the schema lane's label mapping is asked for before U8b builds it. */
export class LabelMappingNotBuilt extends Error {
  constructor(fields: readonly string[]) {
    super(
      `gate 8: the schema lane's label mapping is not built (U8b); validated fields: ${
        fields.length > 0 ? fields.join(', ') : '(none)'
      }`,
    );
    this.name = 'LabelMappingNotBuilt';
  }
}

/**
 * The labels of what was validated.
 *
 * Null schema (`validatedInputs === null`) → `NO_SELECTION`. Anything else raises: mapping a validated
 * member to its canonical label needs the field-keyed label source, which no lane may improvise.
 */
export const selectedLabelsFor = (
  validatedInputs: ValidatedInputs | null,
): readonly string[] => {
  if (validatedInputs === null) return NO_SELECTION;
  throw new LabelMappingNotBuilt([...validatedInputs.closed.keys()]);
};
