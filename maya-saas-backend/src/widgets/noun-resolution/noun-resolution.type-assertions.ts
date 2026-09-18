// G11-N5 — R3.7.4's mechanism, asserted by the COMPILER (GATES-PLAN-V11 U11a; C11:4593-4598).
//
// > *Mechanism:* the noun resolver's type distinguishes `Handle` from `Witness` and has no re-read
// > path for the latter.
//
// A mechanism that is a TYPE cannot be proven by a jest test: a test asserts what a value does at run
// time, and these claims are about what does not compile. So this file is NOT a spec. It is an
// ordinary module under `src/`, which means `tsc --noEmit -p tsconfig.build.json` — `npm run typecheck`
// — compiles it on every commit, and each `@ts-expect-error` below FAILS THE BUILD if the error it
// expects stops happening. Delete a brand, widen a port to take a `Witness`, or let a plain string be
// used as a handle, and this file is what goes red.
//
// It exports one frozen marker so nothing prunes it as dead code, and it has no run-time behaviour.

import {
  asHandle,
  asWitness,
  witnessesAgree,
  type Handle,
  type Witness,
} from './noun-handles';
import type {
  Gate11Applicability,
  NounActor,
  NounResolverInput,
} from './noun-resolution';
import type {
  NounReadPort,
  NounResolutionPorts,
  WitnessPort,
} from './noun-resolution.ports';

const handle: Handle = asHandle('h_appointment_1');
const witness: Witness = asWitness('rev-1');

// ── 1. the two brands are distinguished, in both directions ──────────────────────────────────────

// @ts-expect-error R3.7.4: a witness is not a handle, so it can never be what a read is made with.
const notAHandle: Handle = witness;
// @ts-expect-error R3.7.4: a handle is not a witness, so it can never be what a comparison is made of.
const notAWitness: Witness = handle;

// ── 2. neither is reachable from a plain string ──────────────────────────────────────────────────
// A value that arrived as a string — from a client, a log line, a header — cannot become a handle by
// assignment. §3.8 has no member that could carry one (R3.7.3), and this is why that stays true.

// @ts-expect-error a bare string is not a handle; branding is the only way in (`asHandle`).
const notFromString: Handle = 'h_appointment_1';
// @ts-expect-error a bare string is not a witness either.
const notFromStringEither: Witness = 'rev-1';

// ── 3. NO RE-READ PATH: no port method accepts a `Witness` ───────────────────────────────────────
// This is the load-bearing one. The witness port takes the RUN's handle and answers with the run's
// current revision; if anyone ever widens it to take the frozen witness, the first assertion below
// stops erroring and the build fails.

declare const ports: NounResolutionPorts;
declare const actor: NounActor;
declare const input: NounResolverInput;

const witnessPort: WitnessPort | null = ports.witness;
if (witnessPort !== null) {
  // @ts-expect-error R3.7.4: the witness is never resolved — only a handle names something to read.
  void witnessPort.currentRevision(witness, actor);
  // The lawful call: the RUN's handle.
  void witnessPort.currentRevision(handle, actor);
}

const nounPort: NounReadPort | null = ports.nouns;
if (nounPort !== null) {
  // @ts-expect-error the noun port reads F15's seven; a witness is not an input to a read.
  void nounPort.read(witness, actor);
  void nounPort.read(input, actor);
}

// ── 4. the seven are exactly seven, and the applicability view is not a record ────────────────────
// `keyof` is compared against the literal union, so adding an eighth member to `NounResolverInput`
// (or renaming one) fails the build here as well as in G11-N15.

type SevenKeys =
  | 'capability'
  | 'frozenNouns'
  | 'requestedScopeHash'
  | 'principalProofHash'
  | 'tenantId'
  | 'confirmationOfRef'
  | 'producedByIntentTokenHash';
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const seven: Exact<keyof NounResolverInput, SevenKeys> = true;
const twoExtras: Exact<keyof Gate11Applicability, 'effect' | 'witness'> = true;

// @ts-expect-error F15: the record itself is not an input to the resolver.
const notARecord: NounResolverInput = { bodyHash: 'c'.repeat(64) };

// ── 5. the comparison needs no unwrapping ────────────────────────────────────────────────────────
// Gate 11 compares two witnesses as the strings they already are. `unwrapHandle`/`unwrapWitness` are
// deliberately NOT imported here: `widget-import-graph.architecture.spec.ts`'s `G11-UNWRAP` rule and
// `gate11.architecture.spec.ts` both fence them to `owner-ports/` with no exception, and a build-time
// assertion file is not a reason to open a fence. What they return is a plain string, which is a fact
// about their declarations rather than a claim needing a call.

const agrees: boolean = witnessesAgree(witness, null);

/** The one export, so nothing treats this module as unused. It carries no run-time meaning. */
export const NOUN_RESOLUTION_TYPE_ASSERTIONS = Object.freeze({
  id: 'G11-N5',
  rule: 'R3.7.4 — Handle is distinguished from Witness, and no port method takes a Witness',
  evaluatedAt: 'EP-BUILD (npm run typecheck)',
});

void notAHandle;
void notAWitness;
void notFromString;
void notFromStringEither;
void notARecord;
void seven;
void twoExtras;
void agrees;
