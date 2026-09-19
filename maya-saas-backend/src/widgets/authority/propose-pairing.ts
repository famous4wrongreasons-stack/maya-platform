// P-25 — `AE_PROPOSE_PAIRING`, the runtime rows of F38 (contract C11:755-774).
//
// `src/widget-contract/registries.ts` declares `AE_PROPOSE_PAIRING` and never defines it
// (`export declare`), so the pairing existed as a type and never as behaviour. This file is the one
// runtime statement of it. The rows are TRANSCRIBED from F38's table, not derived: F38 says a row
// appears there "only where the trace from the AI-tool handler's dispatch through its service to a
// literal AE-CAP key or a registered constant completed", so the table is the evidence and nothing
// here may extend it. F37 is the other half of the same sentence: "A missing mapping is a GAP, and a
// GAP has no button. None may be filled by inference, by name similarity, or by a projector's choice
// at runtime." A fourteenth row is therefore not an implementation decision.
//
// WHAT READS IT.
//   FR-6b (C11:1786)  an allowlist row must be the `ae` side of EXACTLY ONE pairing row. Gate 7
//                     resolves a COMMIT's authority through the C9 propose key, never through the
//                     AE key, so a key with two propose sides — or none — has no decidable
//                     authority and must not commit.
//   Gate 10 (10.5)    `ownerSet`/`sameOwner` over an AE-spelled candidate reaches its owner through
//                     the propose key; an undefined pairing fails closed.
//   Gate 13 (R6)      the draft-owner registry is indexed by AE key through this table.
//
// FAIL-CLOSED, AS A RULE. Every lookup answers `null` unless the key names exactly one row in the
// right space: an unknown key, a key in the wrong space, a key carried in the wrong argument, and a
// key that (after a bad edit) names two rows all answer `null`. The indexes are `Map`s, so
// `__proto__` and `constructor` are ordinary misses rather than inherited hits.
//
// IT AUTHORS NO POLICY AND ADDS NO FIELD. The row shape is the declared one — `propose` and `ae`,
// both `CapabilityRef`. F38's middle column ("Owner traversed") is the trace that justifies the row,
// not a member of it; storing it would add a field to a declared registry shape (FR-16).
//
// THE START-UP FENCE. `assertProposePairingResolves()` is the load assertion: every row is well
// spaced, every propose key resolves in the C9 registry, every AE key resolves in the Action Engine
// registry, and each side is injective. P-25 wires no start-up hook of its own (it requests no
// integrator edit); P-23's allowlist start-up vetoes call it, and `checkProposePairing()` is exported
// so the fence can be exercised over injected rows rather than only over the real thirteen.

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { C9_CAPABILITIES } from '../../orchestration/c9.registry';

// These indexes are deliberately local. P-23's runtime allowlist reads the pairing table, while the
// public contract bindings re-export the completed allowlist. Importing those bindings here would
// make the registry-load assertion depend on a partially initialised cycle.
const AE_CAP_BY_KEY = new Map(
  new ActionCapabilityRegistry().list().map((cap) => [cap.capability, cap]),
);
const C9_CAP_BY_KEY = new Map(
  C9_CAPABILITIES.map((cap) => [cap.capabilityKey, cap]),
);

/** The declared row shape of `AE_PROPOSE_PAIRING` (registries.ts:36), named so callers can hold one. */
export interface ProposePairingRow {
  /** The C9-CAP propose key. Authority is resolved through this side. */
  readonly propose: CapabilityRef;
  /** The AE-CAP key the propose key was traced to, call site by call site. */
  readonly ae: CapabilityRef;
}

const row = (proposeKey: string, aeKey: string): ProposePairingRow =>
  Object.freeze({
    propose: Object.freeze({ space: 'C9', key: proposeKey } as const),
    ae: Object.freeze({ space: 'AE', key: aeKey } as const),
  });

/**
 * F38, C11:761-773, in the contract's own order. Thirteen rows.
 *
 * Each pair is `<C9-CAP key> ⇄ <AE-CAP key>`; the trace between them is F38's middle column.
 */
export const AE_PROPOSE_PAIRING: readonly ProposePairingRow[] = Object.freeze([
  row('appointments.own.create', 'crm.appointment.create.v1'),
  row('appointments.own.cancel', 'crm.appointment.cancel.v1'),
  row('appointments.own.reschedule', 'crm.appointment.reschedule.v1'),
  row('loyalty.internal.adjust', 'loyalty.internal-adjust.execute.v1'),
  row('expenses.create', 'expenses.create.execute.v1'),
  row('expenses.period.complete', 'expenses.period-declare.execute.v1'),
  row(
    'staff.schedule.update',
    'package5.wave3.update-staff-schedule-day.execute.v1',
  ),
  row('settings.update', 'package5.settings.assistant.execute.v1'),
  row('tasks.create', 'package5.work-item.task-create.execute.v1'),
  row('tasks.complete', 'package5.work-item.task-complete.execute.v1'),
  row(
    'support.contact-admin.request',
    'package5.work-item.admin-contact.execute.v1',
  ),
  row(
    'notifications.appointments.update',
    'package5.settings.appointment-notifications.execute.v1',
  ),
  row('b35.confirm', 'communication.bulk-campaign.admit.v2'),
]);

// ── the two indexes ──────────────────────────────────────────────────────────────────────────────

/** Groups rows by one side's key. Grouped rather than keyed, so a duplicate is visible, not silent. */
const index = (
  rows: readonly ProposePairingRow[],
  side: (r: ProposePairingRow) => string,
): ReadonlyMap<string, readonly ProposePairingRow[]> => {
  const by = new Map<string, ProposePairingRow[]>();
  for (const r of rows) {
    const at = by.get(side(r));
    if (at) at.push(r);
    else by.set(side(r), [r]);
  }
  return by;
};

const BY_AE = index(AE_PROPOSE_PAIRING, (r) => r.ae.key);
const BY_PROPOSE = index(AE_PROPOSE_PAIRING, (r) => r.propose.key);

/** FR-6b's "exactly one": zero rows and two rows are both a miss. */
const only = (
  rows: readonly ProposePairingRow[] | undefined,
): ProposePairingRow | null =>
  rows !== undefined && rows.length === 1 ? rows[0] : null;

/** The key a caller meant, or `null` when the ref is absent or in another space. */
const keyIn = (
  ref: CapabilityRef | string | null | undefined,
  space: CapabilityRef['space'],
): string | null => {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === 'string') return ref;
  return ref.space === space ? ref.key : null;
};

// ── the lookups ──────────────────────────────────────────────────────────────────────────────────

/** The one row whose `ae` side is this key, or `null`. Accepts an `AE` ref or a bare AE key. */
export const pairingForAe = (
  ae: CapabilityRef | string | null | undefined,
): ProposePairingRow | null => {
  const key = keyIn(ae, 'AE');
  return key === null ? null : only(BY_AE.get(key));
};

/** The one row whose `propose` side is this key, or `null`. Accepts a `C9` ref or a bare C9 key. */
export const pairingForPropose = (
  propose: CapabilityRef | string | null | undefined,
): ProposePairingRow | null => {
  const key = keyIn(propose, 'C9');
  return key === null ? null : only(BY_PROPOSE.get(key));
};

/** The C9 propose key an AE key is committed through — Gate 7's authority side, and Gate 10's owner. */
export const proposeForAe = (
  ae: CapabilityRef | string | null | undefined,
): CapabilityRef | null => pairingForAe(ae)?.propose ?? null;

/** The AE key a propose key actuates through. */
export const aeForPropose = (
  propose: CapabilityRef | string | null | undefined,
): CapabilityRef | null => pairingForPropose(propose)?.ae ?? null;

/** FR-6b as a predicate: this AE key is the `ae` side of exactly one pairing row. */
export const hasExactlyOnePairing = (
  ae: CapabilityRef | string | null | undefined,
): boolean => pairingForAe(ae) !== null;

// ── the fence ────────────────────────────────────────────────────────────────────────────────────

/**
 * Every way the table can be wrong, as a list of problems. Empty means whole.
 *
 * Exported over `rows` rather than closed over the real thirteen so that the fence itself can be
 * shown to refuse — a check that is never run against a violating row is not a check.
 */
export const checkProposePairing = (
  rows: readonly ProposePairingRow[],
): readonly string[] => {
  const problems: string[] = [];
  for (const [at, r] of rows.entries()) {
    if (r.propose.space !== 'C9')
      problems.push(`row ${at}: propose side is in space ${r.propose.space}`);
    else if (!C9_CAP_BY_KEY.has(r.propose.key))
      problems.push(`row ${at}: ${r.propose.key} is not a registered C9 key`);
    if (r.ae.space !== 'AE')
      problems.push(`row ${at}: ae side is in space ${r.ae.space}`);
    else if (!AE_CAP_BY_KEY.has(r.ae.key))
      problems.push(`row ${at}: ${r.ae.key} is not a registered AE key`);
  }
  for (const [key, group] of index(rows, (r) => r.ae.key))
    if (group.length > 1)
      problems.push(`${key} is the ae side of ${group.length} rows (FR-6b)`);
  for (const [key, group] of index(rows, (r) => r.propose.key))
    if (group.length > 1)
      problems.push(`${key} is the propose side of ${group.length} rows`);
  return problems;
};

/** The load assertion: the real table, or the process does not get to use it. */
export const assertProposePairingResolves = (): void => {
  const problems = checkProposePairing(AE_PROPOSE_PAIRING);
  if (problems.length)
    throw new Error(`AE_PROPOSE_PAIRING is not whole: ${problems.join('; ')}`);
};
