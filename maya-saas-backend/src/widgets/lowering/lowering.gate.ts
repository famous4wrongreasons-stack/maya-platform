// ── Gate 9 — lowering: the slot seam ────────────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX). Slot 9 calls this file. NOT BUILT: its body is the gateway's former
// `pending('9', …)` stub, moved without a change. It runs and REFUSES `mechanism_absent`, because "not
// built yet" and "allowed" must never be the same branch (F5's fail-closed default). The slot still
// carries `pendingOn`, so `liveGateCount` does not count it.
//
// A wiring commit once put a function here that returned `pass` and performed nothing, which is worse
// than a stub: the append of `rendered_utterance` as a USER turn never happened, so Gate 10 received no
// utterance to compare on the tap path. U9b builds the gate here (`lower`, DS-03 A).

import type { GateContext, GateVerdict } from '../gate.types';
import { refuse } from '../gates/verdict';

/** What slot 9 waits on. The gateway's slot carries it as `pendingOn`. */
export const LOWERING_PENDING_ON =
  'the USER-turn append of rendered_utterance, and a ruling on the refusal when it cannot render';

export const lower: (ctx: GateContext) => GateVerdict = () =>
  refuse(
    'mechanism_absent',
    `gate 9 (Lowering) is NORMATIVE-PENDING on ${LOWERING_PENDING_ON}`,
  );
