// ── Gate 7 — effect admissibility: §3.9 row 7 in full ───────────────────────────────────────────
//
// GATES-PLAN-V11 U7a. What stood here refused almost nothing: `if (!ACTUATING.includes(r.effect))
// return pass` let every `NONE`, `NAVIGATE` and `HANDOFF` through without checking the kind, the key
// space or the delivering tier, and the `COMMIT` branch it guarded was unreachable because Gate 6
// refused every AE subject first. So the gate the row describes as several separate fences was, on
// the live path, no fence at all.
//
// The row (C11:4726) states five things, and this file is them, in order:
//
//   C1  `effect` is within the kind's declared ceiling, CHECKED OVER `IntentRecord.widget_kind`
//   C2  the capability's key space matches the effect (R3.2.2, F69)
//   C3  `CONTROL` keys are in the control registry (F27)
//   C7  the delivering tier was permitted to carry this effect (§3.12)
//   COMMIT: C9a → C6 → C8a → C4 → C5a → C5b → C8b → C6a → C11 → C9b
//
// Three disciplines, each with a source fence in `gate7.pipeline.spec.ts`:
//
//   NO TABLE IS RESTATED HERE. `KIND_PERMITTED_EFFECTS`, `EFFECT_KEY_SPACES`, `CHANNEL_TIER`,
//   `TIER_EFFECTS` and `TIER_ESCAPE` are U-TAB's generated tables, read through their owners. There
//   is no channel id in the tier check: `carrierAdmits` is K6's one implementation and the fitter's
//   CARRIER CEILING calls the same function, so a ruling on a tier cell moves fitter and gate
//   together (D-5).
//
//   NO CLIENT VALUE IS AN ANTECEDENT (I18). Every input is the stored record, its emission's minted
//   `delivery_channel`, the producing record, a compiled table or an owner binding. `ctx.submission`,
//   `ctx.carrier` (the route hard-codes `'pwa'`), `ctx.principal` and anything named `role` are not
//   read — the last two also because Gate 7 must not become a second authority gate (I21).
//
//   NO CLASS-`C` COLUMN IS READ (I20; F15, C11:216-235). `bodyJson`, `textEquivalentJson`, `a11yJson`
//   and `speechJson` are not reachable from here, which is why C11 below is a held lane rather than a
//   read of the envelope body.
//
// THE HANDOFF MEMBER IS NEVER READ DIRECTLY (AMB-09, Block B B-06, C11:7195; R3.5.3 C11:4219-4224).
// A destination reaches this gate only through `subjectOf`, `subjectCapability`'s record-row form.
// One consequence is disclosed rather than hidden: a NON-handoff record that also carried a
// `handoff_capability_ref` is invisible here, because `subjectCapability` prefers `capability`. That
// shape is refused at `EP-MINT` by F21/INV-8′, and B-06 is the ruling that keeps the field's reader
// set at four. Gate 7 does not become a fifth reader to close it.
//
// EVERY REFUSAL IS ONE OF THE ROW'S TWO CODES (AMB-02b, PKT:366): `booking_confirmation_required` for
// the COMMIT-confirmation clauses (C6's kind comparison, C8a, C4, C5a, C5b, C8b, C11) and
// `effect_not_admissible` for everything else. Each `detail` begins with the clause id, so two
// clauses sharing a code can still be told apart in a test; `detail` is server text the controller
// does not return.
//
// NW (AMB-08, D-12): this gate writes nothing. Its one store operation is C5a's producing-record
// READ, taken only for a non-draft COMMIT, so a submission refused anywhere else still performs
// exactly the one record read Gate 1 made.

import type { EffectClass } from '../../widget-contract/intent';
import type { WidgetKind } from '../../widget-contract/kinds';
import { emittable } from '../../widget-contract/owner-classes';
import {
  EFFECT_KEY_SPACES,
  KIND_PERMITTED_EFFECTS,
} from '../../widget-contract/tables';
import {
  confirmationKindMismatch,
  confirmationRefProblem,
  producingRecordProblem,
  type CommitSubject,
  type ProducingRecordLoader,
} from '../authority/commit-guard';
import { requiredConfirmationKind } from '../authority/confirmation-guard.runtime';
import {
  BOOKING,
  MONEY,
  MintRefusal,
  WIDGET_CAPABILITY_POLICY,
  actionCapabilityRegistry,
  capKey,
} from '../authority/contract-bindings';
import {
  hasExactlyOnePairing,
  pairingForAe,
} from '../authority/propose-pairing';
import { resolves } from '../authority/registry-binding';
import { carrierAdmits } from '../carriers/channel-profile';
import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import { subjectOf } from './subject';
import { pass, refuse } from './verdict';

export type { ProducingRecordLoader } from '../authority/commit-guard';

/** Row 7's two codes, each carrying the clause id in its detail. */
const no = (clause: string, why: string): GateVerdict =>
  refuse('effect_not_admissible', `G7.${clause}: ${why}`);
const unconfirmed = (clause: string, why: string): GateVerdict =>
  refuse('booking_confirmation_required', `G7.${clause}: ${why}`);

/**
 * F69's "may carry" column (C11:1358-1367), in the one dimension `EFFECT_KEY_SPACES` cannot carry:
 * WHICH MEMBER of the intent may hold the ref. The generated table answers "which SPACE"; the two
 * halves together are F69's row.
 *
 * It is a transcription, so it is checked against the contract rather than trusted:
 * `gate7.pipeline.spec.ts` parses F69's table out of `MAYA-WIDGET-CONTRACT-V1.md` and asserts every
 * cell of the table below against it.
 *
 *   NONE      "nothing (`capability: null`)"                                       — no member
 *   NAVIGATE  "a `C9` ref **only** when `target.class === 'c'`; otherwise nothing"  — the target
 *   HANDOFF   "`capability: null`; the destination is a `C9` or `AE` ref in
 *              `handoff_capability_ref`"                                           — the handoff
 *   the rest  "a `C9` / `AE` / `CONTROL` ref"                                      — `capability`
 */
export interface MemberShape {
  readonly capability: boolean;
  readonly handoff: boolean;
  readonly targetC: boolean;
}
const member = (
  capability: boolean,
  handoff: boolean,
  targetC: boolean,
): MemberShape => Object.freeze({ capability, handoff, targetC });

export const EFFECT_MEMBER_SHAPE: Readonly<Record<EffectClass, MemberShape>> =
  Object.freeze({
    NONE: member(false, false, false),
    NAVIGATE: member(false, false, true),
    REFINE: member(true, false, false),
    DRAFT: member(true, false, false),
    HANDOFF: member(false, true, false),
    CONTROL: member(true, false, false),
    REQUEST_APPROVAL: member(true, false, false),
    COMMIT: member(true, false, false),
  });

/** F80 (C11:1524-1531): a `SETTINGS_DRAFT` COMMIT's propose key must be one of these two classes. */
const SETTINGS_DRAFT_CONSENT_CLASSES: readonly string[] = Object.freeze([
  'none',
  'communication',
]);

const has = (table: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(table, key);

/**
 * INTERIM (U7a, integrator request R7-1). `intent-gateway.service.ts` is an integrator-only file, so
 * until slot 7 passes `(h) => this.findProducingRecord(h, ctx.tenantId)` the loader is this one,
 * which resolves no record at all. It is FAIL-CLOSED, never a bypass: with it C5a refuses every
 * non-draft COMMIT. The `[BUILD]` exit `T7-WIRED` is red until the gateway passes a loader, and turns
 * red again if it ever stops passing one — because a gate whose store read can be silently omitted is
 * exactly the defect (M7-17), and a default that PASSED would be that defect shipped.
 */
export const UNWIRED_PRODUCING_RECORDS: ProducingRecordLoader = () =>
  Promise.resolve(null);

/** `IntentRecord.confirmation_subject` (§3.7), which `IntentRecordRow` does not carry until I-MIG2. */
const confirmationSubject = (r: IntentRecordRow): unknown =>
  (r as { readonly confirmationSubject?: unknown }).confirmationSubject;

/**
 * C2 and C3 — R3.2.2 / F69 (C11:3825-3842, C11:1358-1367), plus F21's wholeness.
 *
 * Three questions, none of which touches `handoff_capability_ref`:
 *   (a) is the `capability` pair whole, and may this effect carry one at all?
 *   (b) may this effect take its subject from a class-`c` target, and does it?
 *   (c) does a subject exist where F69 requires one, is its SPACE admitted for this effect, and does
 *       the key RESOLVE in that space?
 * A `TOOL` ref fails (c) on every effect, because no cell of `EFFECT_KEY_SPACES` contains `TOOL`.
 */
const keySpaceProblem = (
  r: IntentRecordRow,
  effect: EffectClass,
  shape: MemberShape,
): GateVerdict | null => {
  const spaces = EFFECT_KEY_SPACES[effect];

  // (a) F21 (C11:1226-1228): a half-populated pair is not a ref.
  const capabilityPresent =
    r.capabilitySpace !== null || r.capabilityKey !== null;
  if (capabilityPresent && (!r.capabilitySpace || !r.capabilityKey))
    return no('C2', 'a half-populated capability ref (F21)');
  if (capabilityPresent && !shape.capability)
    return no('C2', `${effect} carries no capability of its own (F69)`);

  // (b) §2.3.4: class `c` is the only target class that names a ref.
  const target = r.targetJson as
    { readonly class?: unknown } | null | undefined;
  const targetC = target?.class === 'c';
  if (targetC && !shape.targetC)
    return no('C2', `${effect} takes no subject from a class-c target (F69)`);

  const subject = subjectOf(r);

  // (c) F69's "may carry": `NONE` names nothing, a non-`c` `NAVIGATE` names nothing, and every other
  // class must name the one member its cell gives it.
  if (subject === null) {
    const optional = spaces.length === 0 || (shape.targetC && !targetC);
    return optional
      ? null
      : no('C2', `${effect} names no capability in ${spaces.join(' or ')}`);
  }
  if (!spaces.includes(subject.space))
    return no(
      'C2',
      spaces.length === 0
        ? `${effect} carries no capability at all, and this record names ${capKey(subject)}`
        : `${effect} may name ${spaces.join(' or ')}, not ${subject.space}`,
    );
  if (!resolves(subject))
    // C3 is this same membership for the CONTROL space: F27's three keys, through K4's one
    // `resolves`, never `ControlRegistryService.CONTROL_KEYS`, which is Gate 13's DISPATCH set.
    return no(
      subject.space === 'CONTROL' ? 'C3' : 'C2',
      `${capKey(subject)} resolves in no registry`,
    );
  return null;
};

export const gate7 = async (
  ctx: GateContext,
  loadProducingRecord: ProducingRecordLoader = UNWIRED_PRODUCING_RECORDS,
): Promise<GateVerdict> => {
  const r = ctx.record;
  if (!r) return no('C1', 'no record');

  // ── C1 — effect within the kind's declared ceiling, over `widget_kind` ────────────────────────
  //
  // MEMBERSHIP in `permitted_effects`, never an ordered rank. §2.4's bold ceiling phrase is a label
  // over the ordered members (F57, C11:1069) and cannot decide the off-order classes: an ordered
  // comparison would admit `REFINE` on `APPROVAL`, whose cell is `NONE, NAVIGATE, CONTROL, COMMIT,
  // HANDOFF`. An unknown kind and an unknown effect both refuse — there is no default branch.
  if (!has(KIND_PERMITTED_EFFECTS, r.widgetKind))
    return no('C1', `${r.widgetKind} is not a widget kind`);
  const permitted = KIND_PERMITTED_EFFECTS[r.widgetKind as WidgetKind];
  if (!permitted.includes(r.effect as EffectClass))
    return no('C1', `${r.effect} is not permitted on ${r.widgetKind}`);
  const effect = r.effect as EffectClass;

  // ── C2 / C3 — the key space matches the effect, and the key resolves in that space ────────────
  const spaceProblem = keySpaceProblem(r, effect, EFFECT_MEMBER_SHAPE[effect]);
  if (spaceProblem) return spaceProblem;
  const subject = subjectOf(r);

  // ── C7 — the delivering tier was permitted to carry this effect ───────────────────────────────
  //
  // Keyed on the EMISSION's minted `delivery_channel` (CH2, C11:5899), never on `profile_id`, which
  // §4 calls advisory, and never on `ctx.carrier`, which the route hard-codes. The one escape CH1
  // admits on every tier whose cell does not reach CONTROL is `carrierAdmits`'s own branch over
  // `TIER_ESCAPE`; this gate states neither the cells nor the escape.
  if (!carrierAdmits(r.deliveryChannel, effect, subject, r.priority))
    return no(
      'C7',
      `${effect} is not carried by ${r.deliveryChannel} at priority ${r.priority}`,
    );

  if (effect !== 'COMMIT') return pass;

  // ── the COMMIT branch ─────────────────────────────────────────────────────────────────────────
  //
  // C2 has established that the subject is a registered AE ref: `EFFECT_KEY_SPACES.COMMIT` is `['AE']`
  // and a COMMIT must name one. The narrowing below is that proof, not an assumption.
  if (subject === null) return no('C2', 'COMMIT names no capability');
  const ae = subject;
  const commit: CommitSubject = {
    widgetKind: r.widgetKind,
    ae,
    confirmationOfKind: r.confirmationOfKind,
    confirmationOfRef: r.confirmationOfRef,
    producedByIntentTokenHash: r.producedByIntentTokenHash,
  };

  // C9a — FR-6d (C11:1788): "no money-mutating capability is on the allowlist at all". This is that
  // rule's own predicate, not F31's veto (`MONEY ⇒ confirmation_kind === 'PAYMENT_HANDOFF'`), which
  // ADMITS a money row on `PAYMENT_HANDOFF`. An unregistered key cannot reach here (C2); if one did,
  // it refuses rather than being treated as not-money.
  const cap = actionCapabilityRegistry.tryGet(ae.key);
  if (!cap) return no('C9a', `${ae.key} is not a registered AE capability`);
  if (MONEY(cap)) return no('C9a', `${ae.key} is MONEY (§3.10)`);

  try {
    // C6 — F72's SECOND evaluation point (C11:4726), read from the live allowlist in this process.
    // Its two fail-closed branches are MINT codes and surface below as `effect_not_admissible`: a
    // non-AE ref and an un-allowlisted key are not confirmation failures, they are keys no widget may
    // commit at all.
    const mismatch = confirmationKindMismatch(ae.key, r.widgetKind);
    if (mismatch) return unconfirmed('C6', mismatch);

    // C8a — FR-6b's built half (C11:1786): a booking capability's row is `BOOKING_CONFIRMATION`.
    // With C6 it pins a booking COMMIT to a `BOOKING_CONFIRMATION` record from both directions.
    if (BOOKING(cap) && requiredConfirmationKind(ae) !== 'BOOKING_CONFIRMATION')
      return unconfirmed(
        'C8a',
        `${ae.key} is BOOKING and its allowlist row is not BOOKING_CONFIRMATION`,
      );

    // C4 — F74: a non-null `confirmation_of_ref`, of the kind the row assigns.
    const ref = confirmationRefProblem(commit);
    if (ref) return unconfirmed('C4', ref);

    // C5a and C5b — F74's bypass guard and its identity. The ONE store read this gate performs, and
    // only for a non-draft COMMIT.
    const producing = await producingRecordProblem(commit, loadProducingRecord);
    if (producing) return unconfirmed(producing.clause, producing.message);

    // C8b — FR-6b's pairing half: the `ae` side of EXACTLY ONE `AE_PROPOSE_PAIRING` row. Authority
    // for a COMMIT is resolved through the C9 propose key, so a key with two propose sides — or none
    // — has no decidable authority and must not commit.
    if (BOOKING(cap) && !hasExactlyOnePairing(ae.key))
      return unconfirmed(
        'C8b',
        `${ae.key} is BOOKING and is the ae side of no single pairing row`,
      );

    // C6a — F80 (C11:1524-1531): a `SETTINGS_DRAFT` COMMIT is admitted only when its C9 propose key's
    // policy row carries `consent_class ∈ {none, communication}`. A missing row refuses (R3.11.5).
    if (r.widgetKind === 'SETTINGS_DRAFT') {
      const pairing = pairingForAe(ae.key);
      if (!pairing)
        return no('C6a', `${ae.key} is the ae side of no single pairing row`);
      const policy = WIDGET_CAPABILITY_POLICY[capKey(pairing.propose)];
      if (!policy)
        return no(
          'C6a',
          `${capKey(pairing.propose)} has no WIDGET_CAPABILITY_POLICY row`,
        );
      if (!SETTINGS_DRAFT_CONSENT_CLASSES.includes(policy.consent_class))
        return no(
          'C6a',
          `${capKey(pairing.propose)} is consent_class ${policy.consent_class}`,
        );
    }

    // C11 — BOOK.1 (C11:3109), a HELD LANE (AMB-01a, Block B B-01).
    //
    // BOOK.1 fixes both halves: Gate 7 "re-derives the subject from `subjectCapability(record)`
    // through the same three allowlist rows and refuses unless it equals
    // `IntentRecord.confirmation_subject` (§3.7) — an AUDIT_RETAINED member, so the check reads no
    // body field". It then states the interim in the contract's own words: "until
    // `confirmation_subject` is stored, Gate 7 refuses every `BOOKING_CONFIRMATION` `COMMIT`."
    //
    // The column arrives with the migration-2 fold (I-MIG2, D-8) and the subject comparison is U7c's.
    // The read below is written against the member so that U7c adds the comparison and nothing else.
    // The only persisted copy today is inside `WidgetEmission.bodyJson`, a class-C column F15 forbids
    // this path to read — which is why the lane is held rather than closed with a body read.
    if (r.widgetKind === 'BOOKING_CONFIRMATION') {
      const stored = confirmationSubject(r);
      return unconfirmed(
        'C11',
        stored === undefined || stored === null
          ? 'no confirmation_subject is stored (BOOK.1; I-MIG2)'
          : 'the confirmation_subject comparison is pending U7c (BOOK.1)',
      );
    }

    // C9b — FR-6d's other half (C11:1788): `PAYMENT_HANDOFF` is gap-blocked with a null
    // `commit_intent` and no button. The block is K20's DERIVED `emittable` (C11:2927), read from
    // U-TAB's one implementation; this gate hard-codes no `false`, so the day a commerce owner
    // registers a key the clause lifts by itself rather than by an edit here.
    if (r.widgetKind === 'PAYMENT_HANDOFF' && !emittable('PAYMENT_HANDOFF'))
      return no('C9b', 'PAYMENT_HANDOFF is gap-blocked (K20 emittable)');
  } catch (e) {
    // F72's own fail-closed branches. `wrong_space` and `capability_not_allowlisted` are MINT codes
    // (§0.13) and never ingress codes, so they travel in the detail, not in `code`.
    if (e instanceof MintRefusal) return no('C6', e.message);
    throw e;
  }

  return pass;
};
