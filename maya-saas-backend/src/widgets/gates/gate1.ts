// ── Gate 1 — token integrity: the slot seam ─────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX). Slot 1 calls this file, and its body is the gateway's former inline
// Gate 1, moved without a change: the same checks in the same order, with the same outcomes, codes and
// details. The gateway keeps calling it, and P-G15a changes only this file.
//
// V1.1's row asks for more than this does: "HMAC valid", "`widget_id` matches", `EXPIRED` as a response
// outcome (L8) and the R3.9.4 successor. P-G15a builds them here.

import type { SealVerifier } from '../emission/seal-verifier.service';
import type { GateContext, GateVerdict } from '../gate.types';
import { digestEquals, sha256Hex } from '../token.util';
import { expired, pass, replaced } from './verdict';

/** Gate 1 in the exact V1.1 order. No branch exposes why an opaque token was rejected. */
export const gate1 = async (
  ctx: GateContext,
  verifier: SealVerifier,
): Promise<GateVerdict> => {
  const seal = await verifier.verify(ctx.intentTokenHash, {
    tenantId: ctx.tenantId,
  });
  if (!seal.ok) return expired();

  const r = ctx.record;
  if (!r) return expired();

  const submittedWidgetId = ctx.submission.widget_id;
  if (
    typeof submittedWidgetId !== 'string' ||
    !digestEquals(sha256Hex(r.widgetId), sha256Hex(submittedWidgetId))
  )
    return expired();

  if (r.expiresAt.getTime() <= ctx.now.getTime()) return expired();
  // Single use is what makes a replayed tap find a consumed row instead of a second effect.
  if (r.singleUse && r.consumedAt !== null) return expired();
  if (r.supersededByWidgetId !== null) return replaced();
  return pass;
};
