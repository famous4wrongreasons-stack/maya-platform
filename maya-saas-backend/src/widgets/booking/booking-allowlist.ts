// K7 — the COMMIT allowlist, and why it has three rows rather than seven.
//
// A COMMIT token is the only thing in this system that can change a business fact. The allowlist is
// the complete set of capabilities a widget may mint one for, and it is closed: a key that is not
// here cannot be committed from a widget at all, by any path, because the mint refuses before it
// reaches an owner.
//
// THREE, NOT SEVEN. `attendance`, `duration`, `services` and `fields` were in an earlier draft and
// are NOT here. They are gap-ledgered under GAP-APPOINTMENT-DETAIL-COMMIT for one reason: no propose
// key exists for them in any space. A COMMIT whose propose key cannot be resolved is a COMMIT whose
// authority cannot be checked, and the honest response to that is to refuse it rather than to invent
// the missing key. Adding a fourth row here is not an implementation decision.

import type { AeCommitRow } from '../../widget-contract/registries';
import { MONEY_FACETS, MONEY_TARGET_KINDS } from '../../widget-contract/tables';

export interface AllowlistRow {
  /** The AE capability a COMMIT may name. */
  readonly ae: string;
  /**
   * The C9 propose key K7 recorded for this row. **Gate 7 does not read this column.** F70
   * (C11:1236-1238): the widget layer "records the pairing against `AE_PROPOSE_PAIRING`; it does not
   * compute it" — and these three values (`c9.booking.*`) resolve in no registry. The pairing Gate 7's
   * C5b and C6a use is P-25's `AE_PROPOSE_PAIRING`; a source fence in `gate7.pipeline.spec.ts` holds
   * that neither the gate nor the commit guard reads this column.
   */
  readonly proposeKey: string;
  /**
   * The widget kind whose confirmation must precede it — F72's lookup column (C11:1393-1398).
   *
   * WIDENED by U7a from the literal `'BOOKING_CONFIRMATION'` to the generated union of the four
   * COMMIT-bearing kinds (F73, C11:1413). **No row value changes**: all three rows are still
   * `BOOKING_CONFIRMATION`. The narrow type made those three the only expressible rows, so F72's
   * comparison could not be exercised over a `SETTINGS_DRAFT`, `APPROVAL` or `PAYMENT_HANDOFF` row
   * even in a test — and a fence that is never shown refusing is not a fence.
   */
  readonly confirmationKind: AeCommitRow['confirmation_kind'];
  /**
   * `confirmation_of_ref.kind` — F74 (C11:1419-1428). `create` is a draft; reschedule and cancel name
   * an existing record. WIDENED by U7a to F74's third member, `'approval'`, which an `APPROVAL`
   * decision row carries; no row value changes.
   */
  readonly confirmationOfKind: 'draft' | 'record' | 'approval';
}

/** The whole of it. */
export const AE_WIDGET_COMMIT_ALLOWLIST: readonly AllowlistRow[] =
  Object.freeze([
    {
      ae: 'crm.appointment.create.v1',
      proposeKey: 'c9.booking.propose',
      confirmationKind: 'BOOKING_CONFIRMATION',
      confirmationOfKind: 'draft',
    },
    {
      ae: 'crm.appointment.reschedule.v1',
      proposeKey: 'c9.booking.reschedule.propose',
      confirmationKind: 'BOOKING_CONFIRMATION',
      confirmationOfKind: 'record',
    },
    {
      ae: 'crm.appointment.cancel.v1',
      proposeKey: 'c9.booking.cancel.propose',
      confirmationKind: 'BOOKING_CONFIRMATION',
      confirmationOfKind: 'record',
    },
  ] satisfies AllowlistRow[]);

/**
 * The four that are deliberately absent, named so their absence is a decision on the record rather
 * than an omission someone later "fixes".
 */
export const GAP_APPOINTMENT_DETAIL_COMMIT = Object.freeze([
  'attendance',
  'duration',
  'services',
  'fields',
] as const);

export const isAllowlisted = (aeKey: string): boolean =>
  AE_WIDGET_COMMIT_ALLOWLIST.some((r) => r.ae === aeKey);

export const rowFor = (aeKey: string): AllowlistRow | null =>
  AE_WIDGET_COMMIT_ALLOWLIST.find((r) => r.ae === aeKey) ?? null;

/**
 * THE FINANCE FENCE, stated here because the allowlist is where it bites.
 *
 * No money-mutating capability is on the allowlist at all. `MONEY` is the contract's own derived
 * predicate — riskFacets ∩ MONEY_FACETS, or targetKind ∈ MONEY_TARGET_KINDS — and it is satisfied by
 * 92 of the 226 AE capabilities. All 92 are gap-keyed; none is mintable from a widget.
 *
 * The sets this reads were once hard-coded in the generator as five plausible money words. That
 * version matched 15 capabilities instead of 92, and 12 by the bare `financial` token — which is the
 * exact near-miss the contract warns about. They are now extracted from §3.10.
 */
export const isMoney = (cap: {
  targetKind?: string;
  riskFacets?: readonly string[];
}): boolean => {
  const facets = new Set<string>(MONEY_FACETS as readonly string[]);
  const kinds = new Set<string>(MONEY_TARGET_KINDS as readonly string[]);
  return (
    (cap.riskFacets ?? []).some((f) => facets.has(f)) ||
    kinds.has(cap.targetKind ?? '')
  );
};
