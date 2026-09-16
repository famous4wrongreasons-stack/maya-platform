// ── Gate 7 — effect admissibility ────────────────────────────────────────────────────────────────
//
// A COMMIT is admissible only from the allowlist, and only behind the confirmation kind F72's
// lookup gives it — a lookup with NO DEFAULT BRANCH, so an un-allowlisted key resolves to no
// confirmation kind at all and refuses.

import type { GateContext, GateVerdict } from '../gate.types';
import { isAllowlisted, rowFor } from '../booking/booking-allowlist';
import { subjectOf } from './subject';
import { pass, refuse } from './verdict';

/** Stated once, here; Gate 8-R reads the same set (`gate8r.ts`). */
export const ACTUATING = [
  'COMMIT',
  'DRAFT',
  'REQUEST_APPROVAL',
  'REFINE',
  'CONTROL',
];

export const gate7 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('effect_not_admissible', 'no record');
  if (!ACTUATING.includes(r.effect)) return pass;

  const subject = subjectOf(r);
  if (subject === null)
    return refuse(
      'effect_not_admissible',
      `${r.effect} with no subject capability`,
    );

  if (r.effect === 'COMMIT') {
    if (subject.space !== 'AE')
      return refuse('effect_not_admissible', 'a COMMIT names an AE capability');
    if (!isAllowlisted(subject.key))
      return refuse('effect_not_admissible', 'capability_not_allowlisted');
    const row = rowFor(subject.key);
    if (!row) return refuse('effect_not_admissible', 'no allowlist row');
    // F74: the confirmation this COMMIT names must be of the kind its row pairs with, and it must
    // exist. A COMMIT that names no confirmation is the thing the whole booking flow exists to
    // make impossible.
    if (r.confirmationOfKind !== row.confirmationOfKind || !r.confirmationOfRef)
      return refuse(
        'booking_confirmation_required',
        `expected a ${row.confirmationOfKind} confirmation`,
      );
  }
  return pass;
};
