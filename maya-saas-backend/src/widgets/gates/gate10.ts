// ── Gate 10 — divergence audit, REFUSAL ON EFFECT-CLASS DIVERGENCE ───────────────────────────────
//
// LEGACY. Moved here unchanged from the former `gate-logic.ts`. Integrator decision D-12: slot 10
// becomes a refusing `pending()` stub and this function, `DivergenceRecord` and `divergences[]` are
// deleted in the next U0 step. It is unreachable today (slot 9 refuses first).
//
// The owner's ruling, applied exactly: a divergence WITHIN one effect class is audited and is not
// on its own grounds for refusal; a divergence that CHANGES the effect class refuses before
// admission. The taxonomy is §3.2's existing eight classes — no new classification was created.
//
// What the rule may never permit, and does not: READ -> WRITE, PREPARE -> COMMIT, one action class
// to a materially different one, a change of canonical owner, an escalation of business effect, or
// a bypass of approval, consent or authority.

import type { GateContext, GateVerdict } from '../gate.types';
import {
  resolveCapability,
  effectClassOf,
} from '../routing/deterministic-router';
import { pass, refuse } from './verdict';

export interface DivergenceRecord {
  readonly recordCapability: string | null;
  readonly routerCapability: string | null;
  readonly recordEffectClass: string;
  readonly routerEffectClass: string | null;
  readonly crossed: boolean;
}

export const divergences: DivergenceRecord[] = [];

export const gate10 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return pass;
  if (!r.renderedUtterance) return pass; // nothing was said; there is nothing to compare

  const resolved = resolveCapability(r.renderedUtterance);
  const recordKey = r.capabilityKey;
  if (resolved === null || resolved.key === recordKey) return pass;

  const recordClass = r.effect;
  const routerClass = effectClassOf(resolved);
  const crossed = routerClass !== null && routerClass !== recordClass;

  divergences.push({
    recordCapability: recordKey,
    routerCapability: resolved.key,
    recordEffectClass: recordClass,
    routerEffectClass: routerClass,
    crossed,
  });

  // Same class: audited, not refused. Different class: refused before admission.
  return crossed
    ? refuse(
        'intent_divergence',
        `the tap names ${recordClass}, the words resolve to ${routerClass}`,
      )
    : pass;
};
