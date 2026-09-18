// R3.7.4 — three hashes are WITNESSES, not handles (C11:4593-4598).
//
// > `snapshotHash`, `revisionId` and `payloadHash`, where present, are **compared** at Gate 11, never
// > re-read. Re-resolving them would destroy the anti-drift guarantee they exist for. *Mechanism:* the
// > noun resolver's type distinguishes `Handle` from `Witness` and has no re-read path for the latter.
//
// The mechanism the contract names is a TYPE, so it is a type here and not a convention:
//
//   Handle   an opaque name for a canonical row (§3.7 `frozen_nouns`, `run_ref.run_id`). It is what a
//            fresh read is made WITH: `NounReadPort` and `WitnessPort` take handles.
//   Witness  a hash frozen at mint. It is what a comparison is made AGAINST. NO PORT METHOD TAKES ONE
//            — that absence is R3.7.4's "no re-read path", and `gate11.architecture.spec.ts` holds it
//            at the source rather than trusting that nobody adds one.
//
// The two brands are mutually unassignable and neither is assignable from a plain `string`, so a
// handle cannot be compared as a witness and a witness cannot be read as a handle even by accident
// (`noun-resolution.type-assertions.ts`, G11-N5, compiles those errors as part of `npm run typecheck`).
//
// `unwrapHandle`/`unwrapWitness` are the only way back to a string, and they are fenced to
// `owner-ports/` (G11-ARCH). A gate that could unwrap a handle could log it or put it in a `detail`,
// and R3.7.3 says frozen nouns never travel to the client. Gate 11 never needs to: two witnesses are
// compared as the strings they already are, with `===`, without unwrapping either.

declare const HANDLE_BRAND: unique symbol;
declare const WITNESS_BRAND: unique symbol;

/** An opaque name for a canonical row. WHAT, never a value and never a word the data subject said (F14). */
export type Handle = string & { readonly [HANDLE_BRAND]: 'Handle' };

/** A hash frozen at mint: compared at Gate 11, never re-read (R3.7.4). */
export type Witness = string & { readonly [WITNESS_BRAND]: 'Witness' };

/**
 * Brand a stored value as a handle. Called by the slot-11 projection (`noun-resolution.ts`) and by the
 * owner adapters (U11b); never by a gate, and never over a value that came from a client — §3.8 has no
 * member that could carry one (R3.7.3).
 */
export const asHandle = (value: string): Handle => value as Handle;

/** Brand a stored or freshly read hash as a witness. Nothing may then use it to read. */
export const asWitness = (value: string): Witness => value as Witness;

/** `owner-ports/` only (G11-ARCH): the handle as the owner's own id. */
export const unwrapHandle = (handle: Handle): string => handle;

/**
 * `owner-ports/` only (G11-ARCH). It exists for the rendered diff (B-23), which reports an
 * AUDIT_RETAINED fact beside a fresh owner value. It is NOT a read path: nothing takes the result and
 * resolves it, and no port method accepts a `Witness` at all.
 */
export const unwrapWitness = (witness: Witness): string => witness;

/**
 * R3.7.4's comparison, and the whole of what Gate 11 does with a witness. `null` (the owner has no
 * current revision for this run) is a divergence, not a match: "cannot be compared" and "compared
 * equal" must never be the same branch (F5, fail closed).
 */
export const witnessesAgree = (
  frozen: Witness,
  live: Witness | null,
): boolean => live !== null && frozen === live;
