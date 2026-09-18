// U8b-c — what `max_total_bytes` measures (AMB-19, C11:7203 / plan §0.2).
//
// §3.6 declares the cap as a "hard cap; oversize submissions are REFUSED, never truncated" (C11:4423)
// and row 8 enforces it (C11:4727), but the declaration never says what is counted. AMB-19 is the
// ENGINEERING_WITHIN_TEXT ruling that closes it: the UTF-8 byte length of `stableActionJson(inputs)`,
// "one function shared by mint and Gate 8" (AREA-A §1). This is that function.
//
// Why one function and not two readings of one sentence: the minter chooses `max_total_bytes` so that
// the surface it drew fits under it, and Gate 8 refuses a submission that does not. If the minter
// counted the pretty-printed form and the gate counted the canonical one, a surface the server drew
// would be refused at the server's own cap — and `oversize_submission` would be a bug report, not a
// verdict. H6 (C11:2627) gives the layer one canonicaliser, so the two sides share it here too.
//
// It counts BYTES, not characters: a Cyrillic label is two bytes per character in UTF-8 and one unit of
// `String.length`. A cap measured in `length` would be a different cap for a Russian tenant than for an
// English one, which is not a cap the contract states.

import { stableActionJson } from '../../action-engine/action-engine.identity';

/**
 * The UTF-8 byte length of the canonical serialisation of a submission's `inputs`.
 *
 * `null` is the §3.8 spelling of "no input" and measures as the four bytes of `null` — it is never
 * compared against a cap, because Gate 8's null lane (U8a) decides an absent or null `inputs` before
 * any schema is read.
 *
 * It RAISES only on a value the one canonicaliser cannot canonicalise: `undefined`, a function, a
 * symbol, a BigInt, a non-finite number. None of those can reach Gate 8 — P-F88's §3.8 DTO makes
 * `inputs` required and closes its value domain to `string | number | boolean | string[]` at the shape
 * stage, so such a body is a 400 before the pipeline runs. Reaching this function with one is a
 * pipeline construction defect (D-11), and a construction defect is exactly the case that may throw.
 */
export const inputsByteLength = (inputs: unknown): number =>
  Buffer.byteLength(stableActionJson(inputs), 'utf8');
