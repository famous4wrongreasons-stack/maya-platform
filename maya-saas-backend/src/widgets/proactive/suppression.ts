// K13 — PR5b: a proactive emission may render nothing, and silence is the correct output.
//
// «A greeting that says "не удалось загрузить" every morning would do more damage than no greeting
// at all.» If any required Cell resolves to a non-KNOWN state at compose time, the emission is
// SUPPRESSED: no envelope, no empty card, no placeholder, no failure message.
//
// The audit row is what separates chosen silence from lost silence. Without it the two are
// indistinguishable from outside, and a scheduler that quietly stopped working would look exactly
// like a scheduler with nothing to say.

import type { CellState } from '../../widget-contract/envelope';
import {
  assertMomentCompositionInput,
  momentTemplateFor,
  type MomentCompositionInput,
} from './moments';

export interface SuppressedEmission {
  readonly moment: string;
  readonly momentTemplateKey: string;
  readonly dedupeKey: string;
  readonly suppressedAt: string;
  /** JSON Pointers — which cells were unresolved, never what they would have held. */
  readonly unresolvedCells: readonly string[];
  readonly subjectPrincipalProofHash: string | null;
}

export type ComposeOutcome =
  | { readonly emit: true; readonly moment: string }
  | { readonly emit: false; readonly row: SuppressedEmission };

/** Read a JSON Pointer out of the closed server-owned composition input. */
const at = (body: unknown, pointer: string): unknown => {
  let cur: unknown = body;
  for (const seg of pointer.split('/').slice(1)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[
      seg.replace(/~1/g, '/').replace(/~0/g, '~')
    ];
  }
  return cur;
};

const isKnown = (leaf: unknown): boolean =>
  typeof leaf === 'object' &&
  leaf !== null &&
  (leaf as { state?: CellState }).state === 'KNOWN';

/**
 * Compose, or choose silence.
 *
 * The required cells come from the moment's resolved template, not from a parameter — a caller
 * that could supply its own required set could supply an empty one and never suppress.
 */
export const composeOrSuppress = (args: {
  momentKey: string;
  compositionInput: MomentCompositionInput;
  dedupeKey: string;
  subjectPrincipalProofHash: string | null;
  now: Date;
}): ComposeOutcome => {
  assertMomentCompositionInput(args.compositionInput);
  if (args.compositionInput.moment_key !== args.momentKey)
    throw new Error('moment composition key mismatch');
  const template = momentTemplateFor(args.momentKey);
  const unresolved = template.required_cells.filter(
    (p) => !isKnown(at(args.compositionInput.inputs, p)),
  );

  if (!unresolved.length) return { emit: true, moment: args.momentKey };

  return {
    emit: false,
    row: Object.freeze({
      moment: args.momentKey,
      momentTemplateKey: `${template.moment_template_id}@${template.version}`,
      dedupeKey: args.dedupeKey,
      suppressedAt: args.now.toISOString(),
      unresolvedCells: unresolved,
      subjectPrincipalProofHash: args.subjectPrincipalProofHash,
    }),
  };
};

/**
 * The audit row carries pointers and never values.
 *
 * Stated as a checkable predicate rather than a convention, because a suppression row is written
 * on the unhappy path and the unhappy path is where PII leaks.
 */
export const suppressionRowIsContentFree = (row: SuppressedEmission): boolean =>
  row.unresolvedCells.every((p) => /^\/[A-Za-z0-9_~/-]*$/.test(p));
