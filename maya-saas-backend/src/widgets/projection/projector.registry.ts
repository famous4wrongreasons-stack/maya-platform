// U12a — `PROJECTOR_REGISTRY`, and it is EMPTY.
//
// An empty registry is the whole mechanism in U12a, and it is a decision rather than a gap. §3.9 row 12
// says the `REFINE` / `NAVIGATE` body "is produced by the same projector" (C11:4732). A projector that
// answered from an unregistered subject would be a second read path — exactly what F95 item 2 forbids —
// so the registry, not a branch, is what makes a read possible: no row, no read, `degraded`.
//
// Why no row is registered yet (ARCH-12-13). Each entry of `ROWS_BLOCKED_BY` names a thing that must
// EXIST before a row can be answered honestly, and no implementer may decide one of them away:
//   (1) the port has no binding until U12b (G12-R3): a row with no owner call site is a row whose
//       answer would have to come from somewhere else;
//   (2) B-16's degrade-to-text carrier (C11:7208, G12-I3) — an L2 missing field must degrade to the
//       composer's deterministic text turn, and until that carrier exists a partial body has nowhere
//       to go but into the answer;
//   (3) OD-5 / AMB-48(vi): how principal-dependent narrowing reaches `data_scope.masked_fields` is an
//       OPEN OWNER DECISION. No row whose owner narrows by principal may be registered while it is
//       open (GATES-PLAN-V11 §0.3), and this unit decides nothing about it;
//   (4) scalar submission inputs are unclassified until an owner or privacy decision (C11:7413), so a
//       row that would need a scalar argument (a day-scoped schedule read) cannot bind one;
//   (5) S6-2 / S6-6: F36a's keys are in no owner class, so `subject_key ∈ ownerClassKeys(result_kind)`
//       (ARCH-12-7) cannot be satisfied for them.
// U12b empties this list entry by entry, in the same commit as the row and the test that pins it
// (§2.6 item 6). Emptying it is therefore a reviewable act, not a quiet edit.

import type { SlotBinding } from '../../widget-contract/envelope';
import type { Provenance } from '../../widget-contract/envelope';
import type { CapabilityRefKey } from '../../widget-contract/capability-ref';
import type { WidgetKind } from '../../widget-contract/kinds';

/**
 * The two `Provenance.source_kind` values a projector row may carry, READ FROM the generated contract
 * rather than copied (C11:2207). `agent_result` and `action_execution` are minted elsewhere: a
 * projector answers a tap from a capability READ or from orchestrator state, and from nothing else.
 */
export type ProjectorSourceKind = Extract<
  Provenance['source_kind'],
  'capability_read' | 'orchestrator_state'
>;

/**
 * Where one owner argument comes from. Closed on purpose (ARCH-12-5, I49): a frozen noun's handle
 * (R3.7.3 — "WHAT, never how much or when", C11:4191) or a validated closed input. There is no
 * `from: 'submission'` and no `from: 'record'`, so a client value cannot become an owner argument by
 * being placed in the right field — the shape has no such field.
 */
export type ProjectorArgumentSource =
  | { readonly from: 'frozen_noun'; readonly handle: string }
  | { readonly from: 'closed_input'; readonly name: string };

/**
 * The owner's OWN completeness signal, by field path. P5 and ARCH-12-4: the projector copies what the
 * owner said about totals and exhaustion and computes nothing. `null` means the owner publishes no such
 * signal, and the composition then says so — it never fills the silence with `hasMore: false`.
 */
export interface ProjectorCompletenessSignal {
  readonly total_field: string | null;
  readonly exhausted_field: string | null;
}

/**
 * One registered projection. Selected by `(tapped_kind, subject_key)` and by nothing else, so a tap
 * cannot reach a subject the emission did not name.
 *
 * `result_kind` is the successor's kind proposal, and it is the ROW's, never the tapped kind by default
 * (PLAN G12 §5.5, ARCH-12-7): `(SCHEDULE, appointments.own.reschedule) -> BOOKING_CONFIRMATION` is a
 * kind change the contract declares, and a default of "same kind" would silently lose it.
 */
export interface ProjectorRow {
  readonly projector_id: string;
  readonly tapped_kind: WidgetKind;
  /** Space-qualified, e.g. `C9:catalog.services.read` — the same key space the C9 canon uses. */
  readonly subject_key: CapabilityRefKey;
  readonly result_kind: WidgetKind;
  readonly source_kind: ProjectorSourceKind;
  /** Static: owner-response field -> slot. A slot is bound from the map, never from a key walk. */
  readonly slots: Readonly<Record<string, SlotBinding>>;
  readonly arguments: Readonly<Record<string, ProjectorArgumentSource>>;
  readonly completeness: ProjectorCompletenessSignal;
  /**
   * The ruling, decision or unit that makes THIS row answerable, quoted in the merge commit. A row
   * without one cannot be registered: `ARCH-12-13` reads it, and `ROWS_BLOCKED_BY` must be empty of
   * every blocker the row depends on before it may appear here.
   */
  readonly unblocked_by: string;
}

/**
 * What must exist before ANY row may be registered. Read by ARCH-12-13. Never edited to make a test
 * pass: an entry leaves only when the thing it names exists, in the commit that builds it.
 */
export const ROWS_BLOCKED_BY: readonly string[] = Object.freeze([
  'G12-R3: `CanonicalReadPort` has no binding until U12b — no row has an owner call site',
  'G12-I3 / B-16 (C11:7208): the degrade-to-text carrier for an L2 missing field is not built',
  'OD-5 / AMB-48(vi): principal-dependent narrowing to `data_scope.masked_fields` is an OPEN OWNER DECISION (GATES-PLAN-V11 §0.3)',
  'C11:7413: scalar submission inputs are unclassified, so a row needing a scalar argument cannot bind one',
  'S6-2 / S6-6: F36a keys are in no owner class, so ARCH-12-7 `subject_key ∈ ownerClassKeys(result_kind)` cannot be met for them',
]);

/** EMPTY (ARCH-12-13). U12b registers the first rows; nothing else may. */
export const PROJECTOR_REGISTRY: readonly ProjectorRow[] = Object.freeze([]);

/**
 * The one selection rule: exact `(tapped_kind, subject_key)`. No prefix match, no fallback to the
 * tapped kind's "default" row and no wildcard — a near miss is a miss, and a miss is `degraded`.
 *
 * ARCH-12-7 asserts at build time that at most one row answers a pair, so this returning the first is
 * not a tie-break hidden in code.
 */
export const projectorRowFor = (
  tappedKind: string,
  subjectKey: string | null,
): ProjectorRow | null => {
  if (subjectKey === null) return null;
  return (
    PROJECTOR_REGISTRY.find(
      (row) => row.tapped_kind === tappedKind && row.subject_key === subjectKey,
    ) ?? null
  );
};
