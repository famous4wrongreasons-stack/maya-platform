// ── Gate 11 — noun resolution ────────────────────────────────────────────────────────────────────
//
// Row 11 (C11:4731):
//
// > each frozen noun is resolved by a **fresh read from its canonical owner**; the three witnesses
// > (R3.7.4) are compared, not re-read; a value divergence returns `SUPERSEDED` with a rendered diff
// > | `SUPERSEDED / handle_stale` | IntentGateway + capability owner
//
// WHAT THIS FILE REPLACED, because the gap is the finding (GATES-PLAN-V11 U11a; AREA-C §2.1.2). The
// body that stood here took an optional `FreshRead`, and:
//   - `if (!fresh) return pass` — the gate PASSED whenever no reader was supplied, which was every
//     request, so the only anti-drift fence between mint and execution was a pass-through;
//   - it compared `bodyHash`, the hash of the SEALED ENVELOPE. That is Gate 8-R's term and the
//     SUPERSEDED comparison's; it is not a canonical owner's value, so comparing it answers "has the
//     widget changed", never row 11's "has the WORLD changed";
//   - it returned `refuse`, and row 11's outcome is `SUPERSEDED`.
// All three are gone. This gate now reads no record, holds no reader of its own, and decides only what
// row 11 gives it to decide.
//
// It takes VIEWS, not a record (F15, C11:220-235; AREA-C §2.1.4): `NounResolverInput` is F15's seven
// fields and `Gate11Applicability` is B-19's two legal extras. There is no parameter here that could
// carry an `IntentRecordRow`, a `GateContext` or a `SubmissionShape`, so no conversation content can
// reach the decision path even by a later edit — which is the property F15's build-time reachability
// test exists to keep (`noun-resolution/erasure-reachability.gate11.spec.ts`, G11-N15).
//
// OUTCOMES are B-18/AMB-36's (C11:7210-7213), and only those:
//   not_found, already_cancelled, slot taken, a stale revision → `superseded/handle_stale`
//   policy fences                                             → pass; Gates 13/14 decide
//   transport errors                                          → FAULT, not caught here. R3.9.3
//                                                               (C11:4902-4903) says only a genuine
//                                                               transport fault may look like a fault,
//                                                               and an outage swallowed into
//                                                               `handle_stale` is drift that never
//                                                               happened.
//
// NW (D-12): every branch reads and compares. Nothing here writes, and both owner ports are read ports.

import type { GateContext, GateVerdict } from '../gate.types';
import { witnessesAgree } from '../noun-resolution/noun-handles';
import {
  gate11ApplicabilityOf,
  nounActor,
  nounResolverInput,
  nounRow,
  resolvedNothing,
  type Gate11Applicability,
  type NounActor,
  type NounResolverInput,
  type ResolvedNounsValue,
} from '../noun-resolution/noun-resolution';
import type { NounResolutionPorts } from '../noun-resolution/noun-resolution.ports';
import { superseded } from './verdict';

/**
 * A `pass` carrying J-1's one Gate 11 fact. Every passing branch goes through it, so `resolvedNouns`
 * is always produced with a value: slots 12 and 13 can then tell "Gate 11 resolved nothing" from
 * "Gate 11 did not run", which a bare `pass` cannot say.
 */
const passResolved = (value: ResolvedNounsValue): GateVerdict => ({
  outcome: 'pass',
  facts: { resolvedNouns: value },
});

const resolve = async (
  input: NounResolverInput,
  applicability: Gate11Applicability,
  actor: NounActor,
  ports: NounResolutionPorts | null,
): Promise<GateVerdict> => {
  // ── row W — the witness lane (R3.7.4) ──────────────────────────────────────────────────────────
  // Compared, never re-read: the port is asked for the RUN's current revision, and the frozen witness
  // is compared against that answer. While the lane is UNBOUND it refuses with ZERO owner calls — a
  // clause-level fail-closed lane (AMB-01a, B-01 C11:7188), never a whole-gate refusal. A record whose
  // revision is present but whose run is not is malformed (§3.7's `run_ref` is one object) and takes
  // the same branch: "cannot be compared" and "compared equal" are never the same branch.
  const w = applicability.witness;
  if (w !== null) {
    if (ports === null || ports.witness === null || w.run === null)
      return superseded('handle_stale', 'witness lane unbound');
    const live = await ports.witness.currentRevision(w.run, actor);
    if (!witnessesAgree(w.revision, live))
      return superseded('handle_stale', 'revision moved');
    // A witness that AGREES settles only the world the run is in. The nouns are still owed.
  }

  // ── the noun rows ──────────────────────────────────────────────────────────────────────────────
  const row = nounRow(input, applicability, ports);
  // Row P: nothing to resolve.
  if (row === 'P') return passResolved(resolvedNothing(row));
  // Rows A0/N0: a duty with no port. Unreachable before P-01's discharge (D-4: no actuating record is
  // minted at all) and unreachable after it (P-MINT-CORE refuses to mint a subject whose port is
  // missing), so arriving here means the pipeline was assembled wrong. D-11: only a construction
  // defect throws. A refusal here would report a missing owner as drift and let it ship quietly.
  if (row === 'A0' || row === 'N0')
    throw new Error(
      `J-1: slot 11 owes a fresh read on row ${row} and no noun port is bound; the pipeline was assembled without Gate 11's capability owner`,
    );
  // Rows A1/N1: the fresh read row 11 names. One call, here, with no pre-fetch before it (G11-N12).
  if (ports === null || ports.nouns === null)
    throw new Error('J-1: the noun port vanished between the row and the read');
  const answer = await ports.nouns.read(input, actor);
  switch (answer.kind) {
    case 'gone':
      return superseded('handle_stale', answer.reason);
    case 'diverged':
      // G11-R3. The rendered diff is B-23's and travels on the SUCCESSOR (U11b), never in this
      // `detail`: R3.7.3 says frozen nouns never travel to the client, and a detail string is not the
      // place to start.
      return superseded('handle_stale', 'value divergence');
    case 'policy_deferred':
      // B-18: policy fences pass through. Gate 11 is an anti-drift fence, not a second Gate 6.
      return passResolved(resolvedNothing(row));
    case 'resolved':
      return passResolved({
        row,
        diverged: false,
        diff: [],
        values: answer.values,
      });
  }
};

/**
 * INTERIM — the I-CTX seam's shape (GATES-PLAN-V11 D-18; U11a IR-11a-1 and IR-11a-2).
 *
 * `intent-gateway.service.ts` is an integrator-only file and still calls `gate11(ctx)`. Making the
 * views the only way in would break the shared working tree's compile for every other Wave 1 unit, so
 * this overload stands until IR-11a-1 projects the views in the slot and IR-11a-2 deletes it. It is
 * the SAME gate: it projects with the same two functions the integrator's adapter will call, and it
 * passes NO ports, so it reaches no owner and flips no clause. `G11-WIRED` [BUILD] is `it.failing`
 * until IR-11a-1 lands, and goes red again if the slot ever drops the views.
 */
export function gate11(ctx: GateContext): Promise<GateVerdict>;
export function gate11(
  input: NounResolverInput,
  applicability: Gate11Applicability,
  actor: NounActor,
  ports: NounResolutionPorts | null,
): Promise<GateVerdict>;
export function gate11(
  first: NounResolverInput | GateContext,
  applicability?: Gate11Applicability,
  actor?: NounActor,
  ports?: NounResolutionPorts | null,
): Promise<GateVerdict> {
  if ('frozenNouns' in first) {
    if (applicability === undefined || actor === undefined)
      throw new Error(
        'J-1: gate11 was given the noun-resolver input without its applicability view or its actor',
      );
    return resolve(first, applicability, actor, ports ?? null);
  }
  return resolve(
    nounResolverInput(first.record),
    gate11ApplicabilityOf(first.record),
    nounActor(first.actor),
    null,
  );
}
