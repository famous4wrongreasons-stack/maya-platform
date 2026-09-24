// U12b — `PROJECTOR_REGISTRY` carries the finite, contract-approved first row set.
//
// The registry, rather than a fallback branch, decides whether a read is possible: no exact
// `(tapped_kind, subject_key)` row means no owner call and a `degraded` outcome. The six rows below
// have the U12b owner-port binding and B-16 degrade carrier. Principal-narrowed, scalar-argument and
// F36a rows remain explicitly deferred; U12b does not decide OD-5 or create a second read path.

import type { SlotBinding } from '../../widget-contract/envelope';
import type { Provenance } from '../../widget-contract/envelope';
import type { IntentProposal } from '../../widget-contract/derived-shapes';
import type { CapabilityRefKey } from '../../widget-contract/capability-ref';
import type { WidgetKind } from '../../widget-contract/kinds';
import { INITIAL_PROJECTOR_ROWS } from './rows/initial-projector.rows';

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
  | { readonly from: 'closed_input'; readonly name: string }
  | { readonly from: 'retained_local_business_date' };

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
  readonly composition: 'canonical_read' | 'owner_response';
  /** Owner fields the static projector needs. Missing L2 data degrades to the B-16 text carrier. */
  readonly required_fields: readonly string[];
  /** Static: owner-response field -> slot. A slot is bound from the map, never from a key walk. */
  readonly slots: Readonly<Record<string, SlotBinding>>;
  readonly arguments: Readonly<Record<string, ProjectorArgumentSource>>;
  readonly completeness: ProjectorCompletenessSignal;
  readonly intent_proposals: readonly IntentProposal[];
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
export const ROWS_BLOCKED_BY: readonly string[] = Object.freeze([]);

/** Categories intentionally left unregistered by U12b; they do not block the safe first row set. */
export const ROWS_DEFERRED_BY: readonly string[] = Object.freeze([
  'OD-5 / AMB-48(vi): principal-dependent narrowing to `data_scope.masked_fields` is an OPEN OWNER DECISION (GATES-PLAN-V11 §0.3)',
  'S6-2 / S6-6: F36a keys are in no owner class, so ARCH-12-7 `subject_key ∈ ownerClassKeys(result_kind)` cannot be met for them',
]);

/** U12b's finite first row set. */
export const PROJECTOR_REGISTRY: readonly ProjectorRow[] =
  INITIAL_PROJECTOR_ROWS;

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
