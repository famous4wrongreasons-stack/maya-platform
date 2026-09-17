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

/** Whether the code carries its own row. The interlock's reader; never a branch on the live path. */
export function hasReasonRow(code: ReasonTextKey): boolean {
  return Object.prototype.hasOwnProperty.call(LIMITATION_REASON_TABLE, code);
}
