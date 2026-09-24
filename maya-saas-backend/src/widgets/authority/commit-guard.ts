// F72 and F74 — the COMMIT confirmation guard, in one place (GATES-PLAN-V11 U7a).
//
// WHY IT IS HERE AND NOT IN `booking/`. F72 (C11:1391-1411) and F74 (C11:1415-1449) govern all four
// COMMIT-bearing kinds — `BOOKING_CONFIRMATION`, `SETTINGS_DRAFT`, `APPROVAL`, `PAYMENT_HANDOFF`
// (F73, C11:1413) — so a body that lives inside the booking package would be the booking package
// deciding for the other three. §0.13 owns the guard; this module is §0.13's runtime owner, beside
// the generated copy of F72 itself (`confirmation-guard.runtime.ts`).
//
// WHAT IT REPLACED. `BookingCommitService.assertCommitAdmissible` held a SECOND comparison of the
// confirmation kind, reached from no request path, while the gate held a third that never compared
// with `widget_kind` at all. Two answers to "has this been confirmed" can disagree without anything
// going red. There is one now: K7's guard and Gate 7 both call the functions below, and Gate 7 is the
// one that runs on the live path.
//
// F74's two rows, quoted, because the asymmetry is the whole point (C11:1432-1435):
//
//   confirmation_of_ref.kind   producing effect        identity that must hold
//   'record' (reschedule,      REFINE or DRAFT         the record's C9 capability equals the
//    cancel)                                           `propose` side of the COMMIT's
//                                                      AE_PROPOSE_PAIRING row
//   'approval' (an APPROVAL    REQUEST_APPROVAL        the record's AE capability equals the `ae`
//    decision)                                         side of that same row — i.e. the COMMIT's
//                                                      own AE key
//
// "The two spaces share no spelling: 'equal to the propose key' can never hold for the approval case"
// (C11:1438-1441). So the two identities are fixed TOGETHER with the producing effect class, never
// separately.
//
// THE PAIRING IS READ FROM `AE_PROPOSE_PAIRING`, NEVER FROM THE ALLOWLIST. F70 (C11:1236-1238): the
// widget layer "records the pairing against `AE_PROPOSE_PAIRING`; it does not compute it". K7's own
// rows carry a `proposeKey` column naming `c9.booking.*` keys that resolve in no registry; reading it
// here would make the identity hold against a key nothing owns. The column is not read in this file,
// and a source fence in `gate7.pipeline.spec.ts` holds that.
//
// FAIL CLOSED THROUGHOUT. Every function answers with a problem string (or `null` for "no problem"),
// and every unexpected shape — no allowlist row, no pairing row, a producing record that does not
// resolve, a producing record that resolves unconsumed — is a problem rather than a pass.

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  confirmationOfKindForRow,
} from './ae-commit-allowlist.runtime';
import { requiredConfirmationKind } from './confirmation-guard.runtime';
import { pairingForAe } from './propose-pairing';

/**
 * The producing record C5a names, in the four AUDIT_RETAINED columns the identity needs (§4.4.3,
 * C11:5766-5776). The loader that supplies it is tenant-scoped IN THE QUERY, never filtered after.
 */
export interface ProducingRecordRow {
  readonly effect: string;
  readonly capabilitySpace: string | null;
  readonly capabilityKey: string | null;
  readonly consumedAt: Date | null;
}

/** Reads one producing record by its intent-token hash, inside the request's own tenant. */
export type ProducingRecordLoader = (
  intentTokenHash: string,
) => Promise<ProducingRecordRow | null>;

/** What the guard reads off a COMMIT record. `ae` is `subjectCapability(record)`, already known AE. */
export interface CommitSubject {
  readonly widgetKind: string;
  readonly ae: CapabilityRef;
  readonly confirmationOfKind: string | null;
  readonly confirmationOfRef: string | null;
  readonly producedByIntentTokenHash: string | null;
}

/** A refusal from the guard: which F74/F72 clause, and the text for the server log. */
export interface CommitProblem {
  readonly clause: 'C4' | 'C5a' | 'C5b';
  readonly message: string;
}

const confirmationOfKindFor = (aeKey: string) =>
  confirmationOfKindForRow(aeKey, AE_WIDGET_COMMIT_ALLOWLIST[aeKey]);

/**
 * F72's second evaluation point (C11:4726): `requiredConfirmationKind(subjectCapability(record))`
 * must equal `record.widget_kind`, READ FROM THE LIVE ALLOWLIST in the running process.
 *
 * It calls the generated copy of §0.13, so the lookup's two fail-closed branches are the contract's
 * own and throw `MintRefusal`; the caller decides what a mint code means at its evaluation point.
 *
 * The message is K7's, unchanged, because K7's exit asserts it.
 */
export const confirmationKindMismatch = (
  aeKey: string,
  widgetKind: string,
): string | null => {
  const required = requiredConfirmationKind({ space: 'AE', key: aeKey });
  return required === widgetKind
    ? null
    : `${aeKey} requires ${required}, got ${widgetKind}`;
};

/**
 * F74 part one (C11:1419-1428): `confirmation_of_ref` is NON-NULL iff the effect is `COMMIT`, and its
 * `kind` is the one the capability's row assigns — `'draft'` for `create`, every `SETTINGS_DRAFT` and
 * every `PAYMENT_HANDOFF`; `'record'` for `reschedule` and `cancel`; `'approval'` for an `APPROVAL`
 * decision. A `reschedule` COMMIT carrying `kind: 'draft'` would otherwise skip C5 entirely.
 */
export const confirmationRefProblem = (r: CommitSubject): string | null => {
  const confirmationOfKind = confirmationOfKindFor(r.ae.key);
  if (!confirmationOfKind) return `${r.ae.key} has no allowlist row`;
  if (!r.confirmationOfRef) return 'a COMMIT confirms nothing';
  if (r.confirmationOfKind !== confirmationOfKind)
    return `${r.ae.key} confirms a ${confirmationOfKind}, got ${String(r.confirmationOfKind)}`;
  return null;
};

/**
 * F74 part two, the half that needs no store read: a COMMIT whose confirmation is not a draft must
 * NAME the record it came from. Stated once here and used twice — by K7's off-path guard, which has
 * no loader, and as the first step of `producingRecordProblem`, which does.
 */
export const producingRecordMissing = (r: CommitSubject): string | null => {
  const confirmationOfKind = confirmationOfKindFor(r.ae.key);
  if (!confirmationOfKind) return `${r.ae.key} has no allowlist row`;
  if (confirmationOfKind === 'draft') return null;
  return r.producedByIntentTokenHash
    ? null
    : 'a non-draft COMMIT must name the consumed record that produced it';
};

/** F74's table: the producing effect class fixed together with the identity, per confirmation kind. */
const PRODUCING_EFFECTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    // C11:1433 — "'record' (reschedule, cancel) | REFINE or DRAFT". BOOK.3 (C11:2959) says the same.
    record: Object.freeze(['REFINE', 'DRAFT']),
    // C11:1434 — "'approval' (an APPROVAL decision) | REQUEST_APPROVAL".
    approval: Object.freeze(['REQUEST_APPROVAL']),
  });

/** The producing record's own capability ref, or `null` when the pair is absent or half-populated (F21). */
const refOf = (p: ProducingRecordRow): CapabilityRef | null =>
  p.capabilitySpace && p.capabilityKey
    ? ({ space: p.capabilitySpace, key: p.capabilityKey } as CapabilityRef)
    : null;

/**
 * C5a and C5b: the producing record resolves, in this tenant, consumed, of the effect class F74 fixes,
 * and carrying the identity F74 pairs with that class.
 *
 * The loader is called ONLY here, and only for a non-draft COMMIT, so a submission refused at Gates
 * 1–7 for any other reason still performs exactly one store read.
 */
export const producingRecordProblem = async (
  r: CommitSubject,
  load: ProducingRecordLoader,
): Promise<CommitProblem | null> => {
  const confirmationOfKind = confirmationOfKindFor(r.ae.key);
  if (!confirmationOfKind)
    return { clause: 'C4', message: `${r.ae.key} has no allowlist row` };
  if (confirmationOfKind === 'draft') return null;

  const missing = producingRecordMissing(r);
  if (missing) return { clause: 'C5a', message: missing };

  const hash = r.producedByIntentTokenHash as string;
  const producing = await load(hash);
  if (!producing)
    return {
      clause: 'C5a',
      message: 'the named producing record does not resolve in this tenant',
    };
  if (producing.consumedAt === null)
    return {
      clause: 'C5a',
      message: 'the producing record was never consumed by the gateway',
    };
  const admitted = PRODUCING_EFFECTS[confirmationOfKind] ?? [];
  if (!admitted.includes(producing.effect))
    return {
      clause: 'C5a',
      message: `a ${confirmationOfKind} confirmation is produced by ${admitted.join(' or ')}, not by ${producing.effect}`,
    };

  // C5b — F74's identity. "That same row" presupposes the COMMIT's own pairing row, so a key with no
  // single row has no decidable identity and refuses (FR-6b, C11:1786).
  const pairing = pairingForAe(r.ae.key);
  if (!pairing)
    return {
      clause: 'C5b',
      message: `${r.ae.key} is the ae side of no single AE_PROPOSE_PAIRING row`,
    };
  const produced = refOf(producing);
  if (!produced)
    return {
      clause: 'C5b',
      message: 'the producing record carries no whole capability ref',
    };
  const expected: CapabilityRef =
    confirmationOfKind === 'approval' ? pairing.ae : pairing.propose;
  if (produced.space !== expected.space || produced.key !== expected.key)
    return {
      clause: 'C5b',
      message: `the producing record names ${produced.space}:${produced.key}, not ${expected.space}:${expected.key}`,
    };
  return null;
};
