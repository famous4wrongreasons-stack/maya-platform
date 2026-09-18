// ── Gate 8-R — readback ──────────────────────────────────────────────────────────────────────────
//
// THE ANTECEDENT IS THE RECORD, AND ONLY THE RECORD. Row 8-R (C11:4728) says the gate "applies
// exactly when `record.confirmation?.requires_readback === true`". Not when the submission arrives
// over a spoken channel, not when the effect is actuating, and not when a render profile says so.
// The code this file replaces asked the first two questions and never the right one: it keyed on
// `ctx.carrier` and on `ACTUATING.includes(r.effect)`, so a readback duty stored on a record was
// ignored on the `pwa` route, and a REFINE minted with no duty at all was held on a voice one. Both
// are the same defect — the gate decided the duty instead of reading the one the mint decided.
//
// A stored duty is still only a claim about a row, so Block B B-17 adds the second half: the duty is
// RECOMPUTED at ingress from the record's own effect and the delivery tier (C11:4386-4389 — true iff
// a COMMIT on a SPOKEN tier), and a stored value that disagrees with the recomputed one is a mint
// defect or a store corruption, never a decision to honour. It refuses `readback_mismatch` (AMB-27,
// GATES-PLAN-V11 D-10). Note which way the fence points: divergence refuses in BOTH directions, so
// neither a duty invented on a row nor a duty erased from one gets past.
//
// The affirmation is CONVERSATION_CONTENT (F16, §4.4.3). It is read at submission and handed to the
// owner verbatim; it is never logged, never echoed into a detail, and never normalised here (R-7,
// V5). A gate that trimmed or case-folded before asking would be deciding membership while appearing
// to ask, and "an exact member" is the clause.
//
// REFUSES, NEVER REPAIRS. No branch re-reads a body, re-renders a sentence or invites a corrected
// ack: every path out of the required branch is `pass` or one of the row's two §3.9 codes.

import type { ChannelId } from '../../widget-contract/lifecycle';
import { CHANNEL_TIER } from '../../widget-contract/tables';
import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import { GATE_8R_OWNERS_UNRULED, type Gate8ROwners } from './gate-8r.owners';
import { pass, refuse } from './verdict';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The tier a channel is fitted to, as a TOTAL function of any string. `CHANNEL_TIER` (§4.5.3, U-TAB)
 * is total over the eleven `ChannelId`s; a column holding anything else is a store that stopped
 * meaning what the schema's CHECK says, and the honest reading of such a value is "not a declared
 * SPOKEN tier". It can never read as SPOKEN by accident, so an unknown channel cannot manufacture a
 * readback duty — and where one is stored on such a row, the divergence below refuses.
 */
const tierOf = (channel: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(CHANNEL_TIER, channel)
    ? CHANNEL_TIER[channel as ChannelId]
    : undefined;

/**
 * B-17's recompute, and the ONLY place this gate reads an effect or a delivery channel. Both are
 * permitted inputs of the recompute and of nothing else — `gate-8r.antecedent.spec.ts` (T-SRC-8R)
 * holds that at the source, so a later edit cannot quietly restore an effect-keyed antecedent by
 * reading `r.effect` a second time somewhere else in this file.
 */
export const recomputeRequiresReadback = (r: IntentRecordRow): boolean =>
  r.effect === 'COMMIT' && tierOf(r.deliveryChannel) === 'SPOKEN';

/**
 * `owners` defaults to the production value `GATE_8R_OWNERS_UNRULED`, which is the very value R8R-1
 * binds to `GATE_8R_OWNERS`. The default exists only because the gateway is an integrator-only file
 * (§2.1) and still calls `gate8R(ctx)`: a new parameter with no default would break a file this unit
 * may not edit (D-18). It is not a second binding — it is the same object — and
 * `gate-8r.binding.spec.ts` asserts that the injected port, once wired, resolves to it.
 */
export const gate8R = (
  ctx: GateContext,
  owners: Gate8ROwners = GATE_8R_OWNERS_UNRULED,
): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('readback_missing', 'no record');

  // R-1: the stored duty, read with no coercion. A stored `'true'`, a `1` or a missing member is not
  // `true`, and a confirmation column holding no plain object projects to `null` (D-3).
  const c = r.confirmation;
  const stored = c !== null && isPlainObject(c) && c.requires_readback === true;
  // R-1a (B-17): the duty the record itself implies, recomputed here at ingress.
  const recomputed = recomputeRequiresReadback(r);
  if (stored !== recomputed)
    return refuse(
      'readback_mismatch',
      'the stored readback duty is not the one this record recomputes',
    );

  const ack: unknown = ctx.submission.readback_ack;
  // Presence, not truthiness: a submission that carries the member at all has answered the question,
  // and a value that is not an object is a wrong answer rather than an absent one (R-6, AMB-02c).
  const carried = ack !== undefined;

  // R-6: an ack on a record that requires none is refused — including a record whose confirmation is
  // null. Carrying a readback for a widget that read nothing out is a client claiming a ceremony took
  // place, and the answer to that claim is a refusal, not an ignore.
  if (!stored)
    return carried
      ? refuse('readback_mismatch', 'a readback on a record that requires none')
      : pass;

  // R-2: required and absent.
  if (!carried)
    return refuse('readback_missing', 'this record requires a readback');

  // R-3, R-4, R-5. One expression, because each is a reason to refuse with the same code and none of
  // them may short-circuit into a repair. `readback_ref` must be a string on BOTH sides: two nulls
  // are not a match, they are two absences (R-3's iff).
  const matches =
    isPlainObject(ack) &&
    typeof ack.readback_ref === 'string' &&
    c !== null &&
    typeof c.readback_ref === 'string' &&
    ack.readback_ref === c.readback_ref &&
    typeof ack.body_hash === 'string' &&
    ack.body_hash === r.bodyHash &&
    typeof ack.affirmation === 'string' &&
    // R-5: membership is the owner's answer. `null` is the production binding until the vocabulary is
    // ruled (A1/A2, PKT:471), and an unruled vocabulary admits nothing.
    owners.isReadbackAffirmation !== null &&
    owners.isReadbackAffirmation({ affirmation: ack.affirmation, record: r });

  // R-7: one refusal, no repair, and the affirmation is not in the detail.
  return matches
    ? pass
    : refuse('readback_mismatch', 'the readback does not match the record');
};
