// ── Gate 11 — noun resolution ────────────────────────────────────────────────────────────────────
//
// The only anti-drift fence between mint and execution. The handles a widget froze are compared
// against a fresh read; a handle that has moved refuses `handle_stale` rather than acting on a
// record that is no longer what was shown.

import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import { pass, refuse } from './verdict';

export type FreshRead = (
  r: IntentRecordRow,
) => Promise<{ bodyHash: string } | null>;

export const gate11 = async (
  ctx: GateContext,
  fresh?: FreshRead,
): Promise<GateVerdict> => {
  const r = ctx.record;
  if (!r) return refuse('handle_stale', 'no record');
  if (!fresh) return pass; // no canonical read is owed for this effect
  const now = await fresh(r);
  if (!now)
    return refuse('handle_stale', 'the referenced record no longer resolves');
  return now.bodyHash === r.bodyHash
    ? pass
    : refuse('handle_stale', 'the record changed after the widget was shown');
};
