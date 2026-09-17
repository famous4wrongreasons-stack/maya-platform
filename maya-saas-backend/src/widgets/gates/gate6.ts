// ── Gate 6 — authority, computed from scratch ────────────────────────────────────────────────────
//
// "May THIS live principal exercise THIS capability." Dispatched on the subject's SPACE, per F54's
// four branches, and fail-closed on every one of them. Nothing here reads a role — not from the
// client, and not from `ctx.actor` either: which read supplies the live principal's role is AMB-03's
// ruling, and until it is made no gate reads one (`gate-context.source.spec.ts`).

import type { GateContext, GateVerdict } from '../gate.types';
import {
  actionCapabilityRegistry,
  c9Registry,
  CONSENT,
  IDENTITY,
  MONEY,
  WIDGET_CAPABILITY_POLICY,
  capKey,
} from '../authority/contract-bindings';
import { sensitiveDest } from '../authority/floor';
import { isAllowlisted } from '../booking/booking-allowlist';
import { subjectOf } from './subject';
import { pass, refuse } from './verdict';

export const gate6 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('insufficient_authority', 'no record');

  const subject = subjectOf(r);
  // A null subject means no capability is exercised — NONE, and a w/i/s/detail NAVIGATE. There is
  // nothing to authorise, and refusing here would make the mandatory escape unusable.
  if (subject === null) return pass;

  switch (subject.space) {
    case 'CONTROL':
      // The control registry's keys are closed and each handler performs its own principal and
      // tenant check. Gate 13 routes them; there is no Action Engine edge to authorise.
      return pass;
    case 'TOOL':
      // FAIL CLOSED — no intent may carry a TOOL ref. F24: all 47 catalogue names are also C9
      // keys, so a TOOL-spaced ref is a ref that resolved against the wrong table.
      return refuse(
        'insufficient_authority',
        'a TOOL ref may not be an intent subject',
      );
    case 'C9': {
      const cap = c9Registry.tryGet(subject.key);
      if (!cap) return refuse('insufficient_authority', 'unregistered C9 key');
      const row = WIDGET_CAPABILITY_POLICY[capKey(subject)];
      if (!row) return refuse('insufficient_authority', 'no policy row');
      return pass;
    }
    case 'AE': {
      const cap = actionCapabilityRegistry.tryGet(subject.key);
      if (!cap) return refuse('insufficient_authority', 'unregistered AE key');
      // The three vetoes that admit no exemption in this contract version.
      if (CONSENT(cap))
        return refuse(
          'insufficient_authority',
          'CONSENT capability: the widget layer cannot confer consent',
        );
      if (IDENTITY(cap))
        return refuse(
          'insufficient_authority',
          'IDENTITY capability: not actuable from a widget',
        );
      if (MONEY(cap) && !isAllowlisted(subject.key))
        return refuse(
          'insufficient_authority',
          'MONEY capability is gap-keyed',
        );
      return pass;
    }
    default:
      return refuse('insufficient_authority', 'unknown capability space');
  }
};

/** A sensitive destination admits a class-`s` HANDOFF and nothing else — R3.5.1, on the path. */
export const gateSensitiveDest = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return pass;
  const subject = subjectOf(r);
  if (subject === null) return pass;
  if (!sensitiveDest(subject)) return pass;
  const target = r.targetJson as { class?: string } | null | undefined;
  if (r.effect !== 'HANDOFF' || target?.class !== 's')
    return refuse(
      'insufficient_authority',
      'a consent or identity subject admits a class-s HANDOFF and nothing else',
    );
  return pass;
};
