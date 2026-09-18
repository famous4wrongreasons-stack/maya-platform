// P-RENDER — R3.9.3: "Every refusal above renders as `reason_text` plus, where one exists, a
// `remedy` intent. None renders red, none renders as an error ARIA role, none auto-retries."
// (C11:4897-4899). §4.5.2 L8 adds the same for `EXPIRED` (C11:5506).
//
// `reason_text` is a server-minted `Phrase`, never free text. The signature is what enforces that:
// there is no parameter a caller could put a string into, and the only way to obtain a `Phrase` is
// to name a code that the contract's own table already carries. An exception message, an ORM error,
// a provider's body — none of them can reach a renderer through this function, because none of them
// is a key.
//
// The remedy intent is NOT minted here. R3.9.4's successor is Gate 1's and Gate 5's branch
// (P-G15a), and its capability comes from the predecessor record, which this module never reads.

import type { Phrase } from '../../widget-contract/envelope';
import {
  LIMITATION_REASON_TABLE,
  REFUSAL_PHRASES,
} from '../../widget-contract/reason-table';

/**
 * The key space: a §3.9 refusal code or a response outcome. Stated as `string` rather than as
 * `RefusalCode` on purpose — `RefusalCode` still carries `mechanism_absent`, which is not contract
 * vocabulary and has no R3.9.3 rendering (AMB-02a; it leaves the union with the last `pending()`
 * slot at U8b). Narrowing the parameter to `RefusalCode` today would compile a promise this file
 * cannot keep; `refusal-codes-covered.spec.ts` holds the interlock instead, and stays red until the
 * member leaves.
 */
export type ReasonTextKey = string;

/** The phrase every unrecognised key falls back to: P10(b)'s honest unknown, spelled once. */
const FALLBACK_TEXT_KEY = 'widget.limitation.provider_silent';

/**
 * Mint the `reason_text` for a refusal code or a response outcome.
 *
 * Total by construction. An unknown key resolves to the `PROVIDER_SILENT` phrase rather than
 * throwing, for the same reason `projectC9Denial` does not throw: on the refusal path a throw is a
 * 500, and a 500 is the error surface R3.9.3 exists to prevent. The build interlock — not a runtime
 * exception — is what keeps the key space total.
 */
export function reasonText(code: ReasonTextKey): Phrase {
  const row = Object.prototype.hasOwnProperty.call(
    LIMITATION_REASON_TABLE,
    code,
  )
    ? LIMITATION_REASON_TABLE[code]
    : undefined;
  const phrase_key = row?.text_key ?? FALLBACK_TEXT_KEY;
  return Object.freeze({
    phrase_key,
    rendered: REFUSAL_PHRASES[phrase_key] ?? REFUSAL_PHRASES[FALLBACK_TEXT_KEY],
  });
}

/**
 * The severity the table gives a code — `'limitation' | 'caveat'`, never `'error'` (§1.6.7 P9's
 * own comment: "NEVER 'error' — there is no error severity (§2.1)"). An unrecognised code takes
 * P9's default.
 */
export function reasonSeverity(code: ReasonTextKey): 'limitation' | 'caveat' {
  return Object.prototype.hasOwnProperty.call(LIMITATION_REASON_TABLE, code)
    ? LIMITATION_REASON_TABLE[code].severity
    : 'limitation';
}

/** Whether the code carries its own row. The interlock's reader, and `reasonTextOrNull`'s branch. */
export function hasReasonRow(code: ReasonTextKey): boolean {
  return Object.prototype.hasOwnProperty.call(LIMITATION_REASON_TABLE, code);
}

/**
 * What the ROUTE renders for a §3.9 code. CKPT-W1 review fix.
 *
 * `reasonText` above is total, and must stay total: it is called with keys from more than one space,
 * and on the refusal path a throw is a 500 — the exact surface R3.9.3 exists to prevent. But its
 * fallback is P10(b)'s, and P10(b) is declared for the `c9_*` DENIAL code space (`projectC9Denial`,
 * `denial-projection.ts`), where "the source pays no answer" is a true statement about an upstream
 * that really did go quiet. The §3.9 refusal space is not that space, and the one key it carries with
 * no row is `mechanism_absent` — the interim marker for a gate that is NOT BUILT (AMB-02a;
 * `mechanism_absent` occurs 0 times in V1.1). Since U8a moved the wall from slot 8 to slot 9, EVERY
 * conformant live submission refuses `mechanism_absent`, so every such response was telling the
 * reader «Источник пока не отвечает.» — "the source is not responding yet" — about a step nobody has
 * written. R3.9.3 is precisely the clause that separates a policy fence from a fault; attributing an
 * unbuilt gate to a silent data source is a false statement in the one place the contract asks for a
 * true one.
 *
 * So the route says NOTHING rather than something false: `null`, which is the shape the response
 * already carries when there is no code at all, and which R3.9.3 does not forbid — its "Every refusal
 * above renders as `reason_text`" is about the refusals of the §3.9 table, and `mechanism_absent` is
 * not one of them. This is the D-10 interim, and it ends with the code itself: `mechanism_absent`
 * leaves `RefusalCode` in U8b's merge (Wave 3), REN-3 turns green, and from then on every member of
 * the union has a row and this function never answers `null` to a refusal again.
 *
 * Nothing slips through it unnoticed: REN-1 asserts every §3.9 code the contract prints HAS a row and
 * REN-3 asserts the ONLY uncovered member is `mechanism_absent`, so a new code without a row goes red
 * at build rather than quietly rendering as nothing.
 */
export function reasonTextOrNull(code: ReasonTextKey | null): Phrase | null {
  return code === null || !hasReasonRow(code) ? null : reasonText(code);
}
