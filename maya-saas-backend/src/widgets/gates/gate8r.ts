// ── Gate 8-R — readback ──────────────────────────────────────────────────────────────────────────
//
// On a spoken carrier, an actuating effect requires the person to have affirmed the SERVER's
// sentence — and the affirmation is checked against the body hash, so affirming a different body
// than the one that was read out does not pass.

import type { GateContext, GateVerdict } from '../gate.types';
import type { ChannelId } from '../../widget-contract/lifecycle';
import { ACTUATING } from './gate7';
import { pass, refuse } from './verdict';

const SPOKEN_CARRIERS: readonly ChannelId[] = ['realtime-voice'];

export const gate8R = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('readback_missing', 'no record');
  if (!SPOKEN_CARRIERS.includes(ctx.carrier)) return pass;
  if (!ACTUATING.includes(r.effect)) return pass;

  const ack = ctx.submission.readback_ack;
  if (!ack)
    return refuse('readback_missing', 'a spoken actuation requires a readback');
  if (ack.body_hash !== r.bodyHash)
    return refuse(
      'readback_mismatch',
      'the affirmation names a different body',
    );
  return pass;
};
