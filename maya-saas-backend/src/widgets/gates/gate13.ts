// ── Gate 13 — effect routing ─────────────────────────────────────────────────────────────────────
//
// The router has no default case and no edge from a control key to the Action Engine, and no
// `NONE`-class intent appears in any routing map. A subject that resolves to none of the four
// destinations terminates rather than falling through.

import type { GateContext, GateVerdict } from '../gate.types';
import type { EffectRouterService } from '../routing/effect-router.service';

/** Slot seam: Gate 13 delegates to the one closed effect router. */
export const gate13 = (
  ctx: GateContext,
  router: Pick<EffectRouterService, 'route'>,
): Promise<GateVerdict> => router.route(ctx, ctx.facts.resolvedNouns);
