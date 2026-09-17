// ── Gate 8 — input validation: the slot seam ────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX). Slot 8 calls this file. NOT BUILT: its body is the gateway's former
// `pending('8', …)` stub, moved without a change. It runs and REFUSES `mechanism_absent`, because "not
// built yet" and "allowed" must never be the same branch (F5's fail-closed default). The slot still
// carries `pendingOn`, so `liveGateCount` does not count it.
//
// The function that stood in this slot before U0 failed open: it passed every non-string value, and every
// value on an empty domain (G8 §5.0). U8a builds the null-schema lane here, and U8b the schema lane.

import type { GateContext, GateVerdict } from '../gate.types';
import { refuse } from '../gates/verdict';

/** What slot 8 waits on. The gateway's slot carries it as `pendingOn`. */
export const INPUT_VALIDATION_PENDING_ON =
  'the input-validation mechanism (schema retrieval, closed-domain codec, bounds and normalizer registries) and the owner rulings on its refusal codes';

export const inputValidation: (ctx: GateContext) => GateVerdict = () =>
  refuse(
    'mechanism_absent',
    `gate 8 (Input validation) is NORMATIVE-PENDING on ${INPUT_VALIDATION_PENDING_ON}`,
  );
