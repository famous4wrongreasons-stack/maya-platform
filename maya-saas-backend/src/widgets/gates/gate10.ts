// ── Gate 10 — divergence audit: the slot seam ───────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX). Slot 10 calls this file. NOT BUILT: its body is the gateway's former
// `pending('10', …)` stub, moved without a change. It runs and REFUSES `mechanism_absent`, because "not
// built yet" and "allowed" must never be the same branch (F5's fail-closed default). The slot still
// carries `pendingOn`, so `liveGateCount` does not count it.
//
// The function that stood in this slot before U0 read the persisted utterance rather than this request's
// lowering, audited into a process-local array, and classified effects with a mapping the contract does
// not state (G10 G-1…G-14). A stub that refuses is honest about that; a function that passed would be
// counted as a gate. U10b builds the gate here.

import type { GateContext, GateVerdict } from '../gate.types';
import { refuse } from './verdict';

/** What slot 10 waits on. The gateway's slot carries it as `pendingOn`. */
export const GATE10_PENDING_ON =
  "the deterministic router over Gate 9's lowered utterance, a durable divergence audit record, and the owner rulings on the router, the canonical owner, a null resolution and the audit store";

export const gate10: (ctx: GateContext) => GateVerdict = () =>
  refuse(
    'mechanism_absent',
    `gate 10 (Divergence audit) is NORMATIVE-PENDING on ${GATE10_PENDING_ON}`,
  );
