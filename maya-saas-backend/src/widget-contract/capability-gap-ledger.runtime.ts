// GENERATED from the certified contract and K1's versioned ledger — do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md §A1.1 P-07, §0.7 F35, §0.7 F36, §A1.6
//             docs/rebuild/evidence/maya-chat-first-ux/k1/k1-capability-gap-ledger.json
// Regenerate: node scripts/widget-contract/emit-ledgers.mjs
// Module:     capability-gap-ledger (P-07)
//
// P-07 is the register of gap KEYS — "this act has no canonical owner" — which is a different
// artefact from `AE_CAPABILITY_GAP_LEDGER` (F35: that one is keyed on an AE-CAP capability and maps
// it to one of these keys), and a different artefact again from the mechanism ledger ("this
// component is not built yet"). F35 requires the two key shapes, `GAP-` and `MG-`, to stay
// disjoint, and the start-up assertion checks it.
//
// The rows are K1's, and their keys are exactly the `GAP-…` keys the certified text names — the
// generator refuses a ledger that carries a key the contract does not, or misses one it does.
//
// One reading is disclosed rather than resolved. §A1.1 P-07 describes "the 8 gap keys as first-class
// entries with `owner: NONE`"; §A1.6.1 then CORRECTS that count by act — three acts with no owner
// at all, one with an owner unreachable from the widget source type, four with a reachable
// registered owner under a different name — and §A1.6.2 makes the correction normative. K1's rows
// carry §A1.6.1's per-act state, so `owner_state` is `registered_elsewhere` or `unreachable` on five
// of the eight. That is the corrected figure, not a softening: none of the eight reserved NAMES is a
// registry member in any space, so every one of them still emits `capability_gap_ref` and no intent.

/** K1's row, as the runtime carries it. F35 names the artefact; it declares no shape for it. */
export interface CapabilityGapRow {
  /** `GAP-…`, the value a `capability_gap_ref` may hold. */
  readonly gap_key: string;
  /** The act with no canonical owner. */
  readonly act: string;
  /** §A1.6.1's per-act verdict. `none`: no owner at all. */
  readonly owner_state: 'none' | 'registered_elsewhere' | 'unreachable';
  readonly evidence: string;
  /** The package that opened the row. */
  readonly opened_at: string;
  /** A2.7 (c): non-null only in the commit that withdraws the key, with (a) and (b) beside it. */
  readonly closed_at: string | null;
  readonly closing_commit: string | null;
  /** One of §A1.6's eight reserved consent/identity/erasure acts (§0.7 F36's "Declared GAPs."). */
  readonly is_one_of_the_eight: boolean;
}

const CAPABILITY_GAP_LEDGER_SOURCE: CapabilityGapRow[] = [
  {
    gap_key: 'GAP-APPOINTMENT-DETAIL-COMMIT',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-ATTENDANCE',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-ATTENDANCE-CONFIRM',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-BULK-SEND-DIRECT',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-CASH-DECLARATION',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-COMMERCE-CREDENTIALS',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-COMMERCE-GIFT',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-CONSENT-MKT-GRANT',
    act: 'grant marketing consent',
    owner_state: 'registered_elsewhere',
    evidence: 'the same call, kind marketing',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-CONSENT-MKT-REVOKE',
    act: 'revoke marketing consent',
    owner_state: 'registered_elsewhere',
    evidence: 'the same call, kind marketing, granted false',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-CONSENT-PD-GRANT',
    act: 'record a 152-FZ base consent',
    owner_state: 'registered_elsewhere',
    evidence:
      'package5.wave3.record-client-consent.execute.v1, kind privacy, granted true',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-CONSENT-PD-WITHDRAW',
    act: 'withdraw a 152-FZ base consent',
    owner_state: 'registered_elsewhere',
    evidence: 'the same call, granted false - granted:false IS the revocation',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-CONSENT-READ',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-CONSENT-REGISTER-EXPORT',
    act: 'export the consent register',
    owner_state: 'none',
    evidence: 'zero occurrences of any consent-register export under src',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-EXPENSE-COMMIT',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-EXPENSE-DELETE',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-HISTORY-ERASE',
    act: 'erase conversation history as a data-subject right',
    owner_state: 'none',
    evidence:
      'the only erasure in the tree is a maintenance-run payload erasure, not a data-subject right',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-IDENTITY-CLIENT-UNBIND',
    act: 'unbind a client channel',
    owner_state: 'unreachable',
    evidence:
      'ClientChannelLinkService.revoke() has zero callers; its only transactional caller declares allowedSourceTypes legacy_bridge only',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-IDENTITY-READ',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-IDENTITY-SESSION',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-IDENTITY-STAFF-UNBIND',
    act: 'unbind a staff Telegram identity',
    owner_state: 'none',
    evidence:
      'binding exists at auth/social-auth.service.ts completeTelegramLink; no unbind of any kind exists',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: true,
  },
  {
    gap_key: 'GAP-LOYALTY-REDEEM',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-MEDIA-GENERATION',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-REFERRAL-REWARD',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-SEPARATION-OF-DUTIES',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-SUBSCRIPTION',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-TENANT-ADMIN',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-TENANT-BILLING',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-TENANT-CONFIG-COMMIT',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-TIPS',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
  {
    gap_key: 'GAP-VALUE-CONFIG',
    act: 'named by the contract; the act is stated at its declaring clause',
    owner_state: 'none',
    evidence:
      'declared in the certified contract (see F36/F37 and the kind bodies)',
    opened_at: 'K1',
    closed_at: null,
    closing_commit: null,
    is_one_of_the_eight: false,
  },
];

export const CAPABILITY_GAP_ROWS: readonly CapabilityGapRow[] = Object.freeze(
  CAPABILITY_GAP_LEDGER_SOURCE.map((row) => Object.freeze(row)),
);

export const CAPABILITY_GAP_LEDGER_RUNTIME: Readonly<
  Record<string, CapabilityGapRow>
> = Object.freeze(
  Object.fromEntries(CAPABILITY_GAP_ROWS.map((row) => [row.gap_key, row])),
);

export const CAPABILITY_GAP_KEYS: readonly string[] = Object.freeze(
  CAPABILITY_GAP_ROWS.map((row) => row.gap_key),
);

/** §0.7 F36's "Declared GAPs." cell, in its order: the eight reserved names of §A1.6 P-22. */
export const NEVER_CHAT_ACTUATED_GAP_KEYS: readonly string[] = Object.freeze([
  'GAP-CONSENT-PD-GRANT',
  'GAP-CONSENT-PD-WITHDRAW',
  'GAP-CONSENT-MKT-GRANT',
  'GAP-CONSENT-MKT-REVOKE',
  'GAP-IDENTITY-STAFF-UNBIND',
  'GAP-IDENTITY-CLIENT-UNBIND',
  'GAP-CONSENT-REGISTER-EXPORT',
  'GAP-HISTORY-ERASE',
]);

/** Derived, never transcribed — the same discipline F92 imposes on the mechanism ledger. */
export const CAPABILITY_GAP_OWNER_STATE_COUNTS: Readonly<
  Record<CapabilityGapRow['owner_state'], number>
> = Object.freeze(
  CAPABILITY_GAP_ROWS.reduce<Record<CapabilityGapRow['owner_state'], number>>(
    (counts, row) => {
      counts[row.owner_state] += 1;
      return counts;
    },
    { none: 0, registered_elsewhere: 0, unreachable: 0 },
  ),
);

export const capabilityGapRow = (
  gapKey: string,
): CapabilityGapRow | undefined => CAPABILITY_GAP_LEDGER_RUNTIME[gapKey];

/**
 * LIMIT.1's backstop input: a `capability_gap_ref` is a key this register declares, or it is not a
 * gap ref at all. Fail-closed on an unregistered value — a minter that invented one would otherwise
 * clear the gap fence by naming a key nothing opened.
 */
export const isCapabilityGapKey = (ref: string | null | undefined): boolean =>
  typeof ref === 'string' &&
  Object.prototype.hasOwnProperty.call(CAPABILITY_GAP_LEDGER_RUNTIME, ref);

/** F35's build assertion, the other half: the capability ledger's key shape. */
export const CAPABILITY_GAP_KEY_PREFIX = 'GAP-';
