// ── Gate 1 — token integrity: the slot seam ─────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX). Slot 1 calls this file, and its body is the gateway's former inline
// Gate 1, moved without a change: the same checks in the same order, with the same outcomes, codes and
// details. The gateway keeps calling it, and P-G15a changes only this file.
//
// V1.1's row asks for more than this does: "HMAC valid", "`widget_id` matches", `EXPIRED` as a response
// outcome (L8) and the R3.9.4 successor. P-G15a builds them here.

import type { GateContext, GateVerdict } from '../gate.types';
import { pass, refuse, superseded } from './verdict';

export const gate1 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('EXPIRED', 'no record for this token');
  if (r.supersededByWidgetId !== null)
    return superseded('SUPERSEDED', 'a newer envelope replaced this one');
  if (r.expiresAt.getTime() <= ctx.now.getTime())
    return refuse('EXPIRED', 'token expired');
  // Single use is what makes a replayed tap find a consumed row instead of a second effect.
  if (r.singleUse && r.consumedAt !== null)
    return refuse('EXPIRED', 'token already consumed');
  return pass;
};
