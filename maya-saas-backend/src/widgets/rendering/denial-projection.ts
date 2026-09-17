// P-RENDER — §1.6.7 P10: every canonical denial code has a rendering, and none of them is an error.
//
// The projector maps the `c9_*` code space to `Cell` states and `Limitation` severities BEFORE
// anything reaches a renderer (R3.9.3, C11:4901-4903). This module is that map's one reader. It is
// deliberately tiny and deliberately pure: the table it reads is the contract's, and a second
// mapping written at a call site would be a second contract.
//
// What this module does NOT do: it does not mint a `Limitation`. §1.6.7 states two severity
// vocabularies — `Limitation.severity` is `'info' | 'limitation' | 'risk' | 'blocking'` (C11:2480)
// while `LimitationReason.severity` is `'limitation' | 'caveat'` (C11:2492) — and no certified
// sentence maps `caveat` onto the first union. Choosing one here would be an engineering choice on
// undecided text. The composer (EP-COMPOSE) mints `Limitation`; this module answers what the cell
// says, which is what P10 declares.

import type { DenialProjection } from '../../widget-contract/envelope';
import {
  C9_DENIAL_PROJECTION,
  UNMAPPED_DENIAL_PROJECTION,
} from '../../widget-contract/reason-table';

/**
 * P10(a) is the `EP-BUILD` ratchet (`denial-projection.ratchet.spec.ts`). This is P10(b): "at
 * runtime, an unmapped code projects to `state: 'UNAVAILABLE'`, `reason_code: 'PROVIDER_SILENT'`
 * and a `limitation`-severity `Limitation`, so a new upstream code degrades to an honest unknown
 * rather than to a red box."
 *
 * The default is not a shrug. It is the fail-closed direction for a RENDERING rule: an unrecognised
 * denial must not be able to reach a renderer as anything louder than "the source pays no answer".
 * Throwing here would do the opposite — it would turn a policy fence into a 500, which is the exact
 * failure R3.9.3 forbids.
 */
export function projectC9Denial(code: string): DenialProjection {
  return (
    (Object.prototype.hasOwnProperty.call(C9_DENIAL_PROJECTION, code)
      ? C9_DENIAL_PROJECTION[code]
      : undefined) ?? UNMAPPED_DENIAL_PROJECTION
  );
}

/** Whether the code carries a transcribed row, for the ratchet and for audit lines. Never a gate. */
export function hasDenialProjection(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(C9_DENIAL_PROJECTION, code);
}
