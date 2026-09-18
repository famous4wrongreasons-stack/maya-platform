// Gate 11's owner ports — the interfaces, not the bindings (GATES-PLAN-V11 U11a; D-6).
//
// Row 11 (C11:4731) names two mechanisms and one host: "each frozen noun is resolved by a **fresh read
// from its canonical owner**; the three witnesses (R3.7.4) are compared, not re-read", running in
// "IntentGateway + capability owner". So the gate owns the DECISION and the owner owns the READ, and
// the seam between them is this file. `NOUN_RESOLUTION_PORTS` (`di-tokens.ts`) is UNBOUND until U11b
// provides the adapters; a token that exists is not a port that is wired.
//
// Two properties are stated by the types rather than by a rule:
//
//  1. NO METHOD TAKES A `Witness`. R3.7.4's "no re-read path for the latter" is that absence. The
//     witness port is given the RUN's handle and answers with the run's CURRENT revision, which Gate 11
//     then compares against the frozen one; nothing anywhere resolves a witness.
//  2. A port answers with a RESULT, never with a verdict. B-18/AMB-36 (C11:7210-7213) maps owner
//     answers to outcomes — "not_found, already_cancelled, slot taken or stale revision → SUPERSEDED;
//     policy fences pass through to Gates 13/14; transport errors are faults, not verdicts" — and that
//     mapping belongs to the gate. An owner that could return `superseded` would be deciding the gate.
//
// A transport fault is therefore a THROW out of an adapter, and Gate 11 does not catch it: R3.9.3 says
// "only a genuine transport fault may look like a fault" (C11:4902-4903), and swallowing one into
// `handle_stale` would make an outage indistinguishable from drift.

import type { Handle, Witness } from './noun-handles';
import type {
  NounActor,
  NounResolverInput,
  ResolvedNounDiff,
} from './noun-resolution';

/**
 * What a canonical owner answers a fresh read with (B-18). Every member is an OWNER FACT; the outcome
 * it maps to is Gate 11's, in `gates/gate11.ts`.
 */
export type NounReadResult =
  /** Every frozen noun still resolves, unchanged. `values` are the owner's own, for the fact (AMB-43b). */
  | {
      readonly kind: 'resolved';
      readonly values: ReadonlyMap<string, string>;
    }
  /** A value moved. `diff` is B-23's rendered diff: AUDIT_RETAINED facts beside fresh owner values. */
  | {
      readonly kind: 'diverged';
      readonly diff: readonly ResolvedNounDiff[];
    }
  /**
   * The noun no longer names anything the widget can act on. The three owner codes B-18 lists, and
   * nothing else: an owner that wanted a fourth would be widening §3.9's vocabulary from outside it.
   */
  | {
      readonly kind: 'gone';
      readonly reason: 'not_found' | 'already_cancelled' | 'slot_taken';
    }
  /**
   * The owner's own policy fence answered. B-18: "Policy fences pass through to Gates 13/14" — Gate 11
   * is an anti-drift fence, not a second authority gate, and re-deciding authority here would put one
   * rule in two places.
   */
  | { readonly kind: 'policy_deferred' };

/** The actor a canonical owner reads as. Not one of F15's seven: AMB-37 limits only record fields. */
export type { NounActor };

/** The fresh read of row 11. One call, inside slot 11, with no pre-fetch before it (G11-N12). */
export interface NounReadPort {
  read(input: NounResolverInput, actor: NounActor): Promise<NounReadResult>;
}

/**
 * R3.7.4's comparison source. It takes the RUN's handle and returns that run's CURRENT revision — a
 * read of the run, never of the witness. `null`: the owner has no current revision for this run, which
 * Gate 11 treats as a divergence (`witnessesAgree`).
 */
export interface WitnessPort {
  currentRevision(run: Handle, actor: NounActor): Promise<Witness | null>;
}

/**
 * The value bound to `NOUN_RESOLUTION_PORTS` (U11b). `null` on a member means that lane is UNBOUND, and
 * every lane fails closed while it is: the witness lane refuses `superseded/handle_stale` with zero
 * owner calls (AMB-01a, clause-level fail-closed lanes), and a record that owes a noun read with no
 * port bound is a J-1 invariant violation, not a pass (see `gates/gate11.ts`, rows A0/N0).
 */
export interface NounResolutionPorts {
  readonly nouns: NounReadPort | null;
  readonly witness: WitnessPort | null;
}

/** The unbound value: what slot 11 sees until U11b binds the token. Never a pass on its own. */
export const NOUN_RESOLUTION_PORTS_UNBOUND: NounResolutionPorts = Object.freeze(
  {
    nouns: null,
    witness: null,
  },
);
