// ── Gate 5 — verification floor ──────────────────────────────────────────────────────────────────
//
// Two comparisons, and the first is the one that was missing entirely.
//
//   1. STORED vs RECOMPUTED. R3.4.2: the gateway compares against its OWN recomputed result, never
//      the stored one, and ANY divergence — raised or lowered — refuses. A floor raised in policy
//      after mint must not let a token already in flight through, and a floor LOWERED after mint
//      must not be honoured either, because that is how a policy change becomes retroactive.
//   2. LEVEL vs FLOOR, per effect (R3.4.5), against the level capped by the carrier.

import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { VerificationLevel } from '../../widget-contract/envelope';
import type { EffectClass, IntentTarget } from '../../widget-contract/intent';
import type { WidgetKind } from '../../widget-contract/kinds';
import { meets, VERIFICATION_RANK } from '../authority/ladder';
import { verificationFloor } from '../authority/verification-floor.runtime';
import { pass, refuse, superseded } from './verdict';

/** The floor, recomputed from the live tables over the record's own terms. */
export const recomputeFloor = (r: IntentRecordRow): VerificationLevel =>
  verificationFloor(
    {
      effect: r.effect as EffectClass,
      capability:
        r.capabilitySpace && r.capabilityKey
          ? ({
              space: r.capabilitySpace,
              key: r.capabilityKey,
            } as CapabilityRef)
          : null,
      handoff_capability_ref:
        r.handoffSpace && r.handoffKey
          ? ({ space: r.handoffSpace, key: r.handoffKey } as CapabilityRef)
          : null,
      target: (r.targetJson ?? null) as IntentTarget | null,
      priority: r.priority,
    },
    r.widgetKind as WidgetKind,
  );

/**
 * The level this request actually has, capped by what the carrier can establish. A session that
 * claims SESSION_VERIFIED over SMS is still arriving over SMS.
 *
 * Exported so a later gate that must evaluate a floor over the same request reads the level through
 * this one statement rather than restating the cap.
 */
export const effectiveLevel = (
  ctx: Pick<GateContext, 'principal' | 'channelMaxLevel'>,
): VerificationLevel => {
  if (ctx.principal === null) return 'ANONYMOUS';
  const principalLevel = ctx.principal.verificationLevel;
  const principalRank = VERIFICATION_RANK[principalLevel];
  const channelRank = VERIFICATION_RANK[ctx.channelMaxLevel];
  if (principalRank === undefined || channelRank === undefined)
    return 'ANONYMOUS';
  return principalRank <= channelRank ? principalLevel : ctx.channelMaxLevel;
};

/** Process-local and PII-free. A policy-floor divergence is never persisted by Gate 5. */
export const widgetFloorDivergence = {
  count: 0,
  increment: (): void => {
    widgetFloorDivergence.count += 1;
  },
  reset: (): void => {
    widgetFloorDivergence.count = 0;
  },
};

const STEP_UP_EFFECTS = ['CONTROL', 'DRAFT', 'REQUEST_APPROVAL', 'COMMIT'];

export const gate5 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('policy_floor_changed', 'no record');

  const recomputed = recomputeFloor(r);
  if (recomputed !== r.verificationFloor) {
    widgetFloorDivergence.increment();
    return superseded(
      'policy_floor_changed',
      `stored ${r.verificationFloor}, recomputed ${recomputed}`,
    );
  }

  const effective = effectiveLevel(ctx);

  if (meets(effective, recomputed)) return pass;

  // R3.4.5's branch. A read-shaped effect below its floor is routed to a step-up rather than
  // refused outright; an actuating one is refused, because offering a path would be offering the
  // effect.
  return STEP_UP_EFFECTS.includes(r.effect)
    ? refuse('needs_second_channel', `${effective} below ${recomputed}`)
    : refuse('handoff_required', `${effective} below ${recomputed}`);
};
