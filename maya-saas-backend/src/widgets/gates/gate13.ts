// ── Gate 13 — effect routing ─────────────────────────────────────────────────────────────────────
//
// The router has no default case and no edge from a control key to the Action Engine, and no
// `NONE`-class intent appears in any routing map. A subject that resolves to none of the four
// destinations terminates rather than falling through.

import type { GateContext, GateVerdict } from '../gate.types';
import { subjectOf } from './subject';
import { refuse } from './verdict';

export const gate13 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('effect_not_admissible', 'no record');

  const subject = subjectOf(r);
  if (r.effect === 'NONE')
    return { outcome: 'terminate', why: 'NONE has no route by design' };
  if (subject === null)
    return {
      outcome: 'terminate',
      why: 'a NAVIGATE with no capability routes in the shell',
    };

  switch (subject.space) {
    case 'CONTROL':
      return {
        outcome: 'terminate',
        why: 'routed to the one registered control handler',
      };
    case 'AE':
      return {
        outcome: 'terminate',
        why: 'routed to the canonical action ingress (Gate 14)',
      };
    case 'C9':
      return { outcome: 'terminate', why: 'routed to the orchestrator' };
    default:
      // No default admission. A space the router does not know is refused, not passed.
      return refuse(
        'effect_not_admissible',
        'no route for this capability space',
      );
  }
};
