// P-LEDGER (GATES-PLAN-V11, Wave 1) — §A2.4's start-up assertion, at `EP-REGISTRY-LOAD`.
//
// A2.4: "At `EP-REGISTRY-LOAD` the capability-gap ledger (P-07) is read and every `[ABSENT]`
// mechanism named in §A1 is bound to its gap key; a §A1 row with no gap key fails the start-up
// assertion and the process does not start." Errata EC-5 restates that assertion over
// `MECHANISM_GAP_LEDGER` rather than over the capability ledger, because "§A1 has no such column and
// the capability ledger holds a different kind of gap" — F35's own distinction. §0.7 F35 then states
// the assertion in full: over the thirty-nine prerequisite rows, "every row whose `status` is not
// `[EXISTS]` resolves in `MECHANISM_GAP_LEDGER` under its own `gap_key`", and "a build assertion
// states that the two ledgers' key shapes (`MG-` versus `GAP-`) are disjoint".
//
// Two readings are applied here, both fail-closed and both stated so a reviewer can disagree with
// them in one place:
//
//   - A2.4 names `[ABSENT]`; this asserts the binding for every row that is not `[EXISTS]`. A2.1
//     makes `[UNENFORCEABLE-TODAY]` NORMATIVE-PENDING on the same terms and A2.6 (3) says a
//     `[PARTIAL]` row is NORMATIVE-PENDING "on identical terms to `[ABSENT]`", so a status that
//     escaped the binding would be the one status that gets to cite a mechanism it is forbidden to
//     cite. F35's own sentence is already written this way.
//   - F35 (2) and (3) — every NORMATIVE-PENDING clause bound to the rows its status line names, as
//     `(clause, p_ref)` pairs — is NOT asserted. K1's ledger carries `blocking_rules: []` on all
//     thirty-nine rows, so there is nothing to check them against; the generator refuses a populated
//     list for the same reason. Deriving the pairs from the clauses' own status lines is
//     P-DISCHARGE's DIS-0 reader. This is a disclosed residual of the unit, not a softening: it means
//     the pair half of F35's assertion is unproven, and it is recorded in the unit's report.
//
// What this file is NOT: it does not decide whether a mechanism exists. The ledger says that, §A1
// says the ledger, and the generator refuses to emit a row the two disagree on. This file only makes
// a process that ships a ledger which has stopped matching its own declaration refuse to start.

import type { CapabilityGapRow } from '../../widget-contract/capability-gap-ledger.runtime';
import {
  CAPABILITY_GAP_KEY_PREFIX,
  CAPABILITY_GAP_LEDGER_RUNTIME,
  CAPABILITY_GAP_ROWS,
  NEVER_CHAT_ACTUATED_GAP_KEYS,
} from '../../widget-contract/capability-gap-ledger.runtime';
import {
  MECHANISM_GAP_DECLARED_ROW_COUNT,
  MECHANISM_GAP_KEY_PREFIX,
  MECHANISM_GAP_LEDGER_RUNTIME,
  MECHANISM_GAP_PREREQUISITE_FIRST,
  MECHANISM_GAP_PREREQUISITE_LAST,
  MECHANISM_GAP_ROWS,
} from '../../widget-contract/mechanism-gap-ledger.runtime';
import type { MechanismGap } from '../../widget-contract/registries';

/** The four statuses §A1 defines and F35 declares. A fifth would be a status nothing rules on. */
const STATUSES: readonly MechanismGap['status'][] = [
  '[ABSENT]',
  '[EXISTS]',
  '[PARTIAL]',
  '[UNENFORCEABLE-TODAY]',
];

/** §A1.1 P-07's key shape. A key outside it could not be a `capability_gap_ref` the contract names. */
const CAPABILITY_GAP_KEY = /^GAP-[A-Z][A-Z0-9-]*$/;

/**
 * The pair of ledgers the assertion runs over. Both the rows and the keyed record are carried,
 * because "resolves under its own `gap_key`" is a statement about the record and the record is what
 * a reader of the ledger indexes — an assertion that rebuilt the record from the rows would prove
 * only that it can rebuild it.
 */
export interface LedgerPair {
  readonly mechanismRows: readonly Readonly<MechanismGap>[];
  readonly mechanismLedger: Readonly<Record<string, Readonly<MechanismGap>>>;
  readonly capabilityRows: readonly CapabilityGapRow[];
  readonly capabilityLedger: Readonly<Record<string, CapabilityGapRow>>;
  /** §0.7 F36's eight declared GAPs, which §A1.6 P-22 tracks per act. */
  readonly reservedGapKeys: readonly string[];
  /** F92's declared row count, and F35's `p_ref` range. */
  readonly declaredRowCount: number;
  readonly firstPRef: number;
  readonly lastPRef: number;
}

/** The ledgers this build ships. */
export const SHIPPED_LEDGERS: LedgerPair = Object.freeze({
  mechanismRows: MECHANISM_GAP_ROWS,
  mechanismLedger: MECHANISM_GAP_LEDGER_RUNTIME,
  capabilityRows: CAPABILITY_GAP_ROWS,
  capabilityLedger: CAPABILITY_GAP_LEDGER_RUNTIME,
  reservedGapKeys: NEVER_CHAT_ACTUATED_GAP_KEYS,
  declaredRowCount: MECHANISM_GAP_DECLARED_ROW_COUNT,
  firstPRef: MECHANISM_GAP_PREREQUISITE_FIRST,
  lastPRef: MECHANISM_GAP_PREREQUISITE_LAST,
});

const has = (record: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const pRefOf = (n: number): string => `P-${String(n).padStart(2, '0')}`;

/**
 * Every way the shipped ledgers fail §A2.4, F35 and A2.7 (c), as sentences. Separated from the throw
 * so a test can read the reasons instead of a message, and so the assertion has exactly one throw.
 */
export const ledgerStartupProblems = (
  ledgers: LedgerPair = SHIPPED_LEDGERS,
): string[] => {
  const problems: string[] = [];
  const {
    mechanismRows,
    mechanismLedger,
    capabilityRows,
    capabilityLedger,
    reservedGapKeys,
    declaredRowCount,
    firstPRef,
    lastPRef,
  } = ledgers;

  // ── F92: the register is total over the declared range ─────────────────────────────────────────
  if (mechanismRows.length !== declaredRowCount)
    problems.push(
      `F92: MECHANISM_GAP_LEDGER carries ${mechanismRows.length} prerequisite rows; the contract declares ${declaredRowCount}`,
    );
  const byPRef = new Map<string, Readonly<MechanismGap>>();
  for (const row of mechanismRows) {
    if (byPRef.has(row.p_ref))
      problems.push(
        `F92: prerequisite row ${row.p_ref} appears more than once`,
      );
    byPRef.set(row.p_ref, row);
  }
  for (let n = firstPRef; n <= lastPRef; n += 1)
    if (!byPRef.has(pRefOf(n)))
      problems.push(
        `A2.4: §A1 row ${pRefOf(n)} is bound to no gap key in MECHANISM_GAP_LEDGER`,
      );
  for (const row of mechanismRows) {
    const n = Number(row.p_ref.slice(2));
    if (!/^P-\d\d$/.test(row.p_ref) || n < firstPRef || n > lastPRef)
      problems.push(
        `F35: ${row.p_ref} is outside the declared range ${pRefOf(firstPRef)} … ${pRefOf(lastPRef)}`,
      );
  }

  // ── F35 (1): every non-`[EXISTS]` row resolves under its own gap_key ───────────────────────────
  for (const row of mechanismRows) {
    if (!STATUSES.includes(row.status))
      problems.push(
        `§A1: ${row.p_ref} carries status ${row.status}, which §A1 does not define`,
      );
    if (row.gap_key !== `${MECHANISM_GAP_KEY_PREFIX}${row.p_ref}`)
      problems.push(
        `F35: ${row.p_ref}'s gap key is ${row.gap_key}, not ${MECHANISM_GAP_KEY_PREFIX}${row.p_ref}`,
      );
    if (row.status === '[EXISTS]') continue;
    if (
      !has(mechanismLedger, row.gap_key) ||
      mechanismLedger[row.gap_key] !== row
    )
      problems.push(
        `A2.4: ${row.p_ref} is ${row.status} and does not resolve in MECHANISM_GAP_LEDGER under ${row.gap_key}`,
      );
  }
  for (const key of Object.keys(mechanismLedger))
    if (!mechanismRows.some((row) => row.gap_key === key))
      problems.push(
        `F35: MECHANISM_GAP_LEDGER holds ${key}, which is no prerequisite row`,
      );

  // ── §A1.1 P-07: the capability-gap register ────────────────────────────────────────────────────
  if (capabilityRows.length === 0)
    problems.push(
      'P-07: the capability-gap ledger is empty; §A1.6 alone declares eight keys',
    );
  const seen = new Set<string>();
  for (const row of capabilityRows) {
    if (!CAPABILITY_GAP_KEY.test(row.gap_key))
      problems.push(
        `P-07: ${row.gap_key} is not a declared capability-gap key`,
      );
    if (seen.has(row.gap_key))
      problems.push(`P-07: ${row.gap_key} appears more than once`);
    seen.add(row.gap_key);
    if (
      !has(capabilityLedger, row.gap_key) ||
      capabilityLedger[row.gap_key] !== row
    )
      problems.push(
        `P-07: ${row.gap_key} does not resolve in the capability-gap ledger`,
      );
    // A2.7 (c): a withdrawal is a reviewable diff, so it names the commit that carries (a) and (b).
    if (row.closed_at !== null && row.closing_commit === null)
      problems.push(
        `A2.7: ${row.gap_key} is withdrawn with no closing commit; a withdrawal is a reviewable diff`,
      );
  }
  for (const key of Object.keys(capabilityLedger))
    if (!seen.has(key))
      problems.push(
        `P-07: the capability-gap ledger holds ${key}, which is no row`,
      );
  for (const key of reservedGapKeys)
    if (!seen.has(key))
      problems.push(
        `§A1.6: reserved act ${key} has no row in the capability-gap ledger`,
      );
  const flagged = capabilityRows
    .filter((row) => row.is_one_of_the_eight)
    .map((row) => row.gap_key)
    .sort();
  if (flagged.join(',') !== [...reservedGapKeys].sort().join(','))
    problems.push(
      `§A1.6: the rows flagged as reserved acts are ${flagged.join(' ') || 'none'}; §0.7 F36 declares ${reservedGapKeys.join(' ')}`,
    );

  // ── F35's build assertion: the two key shapes stay disjoint ────────────────────────────────────
  for (const row of mechanismRows)
    if (row.gap_key.startsWith(CAPABILITY_GAP_KEY_PREFIX))
      problems.push(
        `F35: mechanism key ${row.gap_key} is shaped like a capability gap`,
      );
  for (const row of capabilityRows)
    if (row.gap_key.startsWith(MECHANISM_GAP_KEY_PREFIX))
      problems.push(
        `F35: capability key ${row.gap_key} is shaped like a mechanism gap`,
      );

  return problems;
};

/** Thrown at `EP-REGISTRY-LOAD`. A distinct class so a boot failure here is not read as a DI fault. */
export class LedgerStartupAssertionError extends Error {
  constructor(problems: readonly string[]) {
    super(
      `the prerequisite ledgers do not bind at registry load (§A2.4, §0.7 F35):\n  ${problems.join('\n  ')}`,
    );
    this.name = 'LedgerStartupAssertionError';
  }
}

/**
 * §A2.4 at `EP-REGISTRY-LOAD`. Called from `WidgetsModule.onModuleInit`, where a throw stops the
 * bootstrap: "a §A1 row with no gap key fails the start-up assertion and the process does not start".
 */
export const assertLedgersBindAtRegistryLoad = (
  ledgers: LedgerPair = SHIPPED_LEDGERS,
): void => {
  const problems = ledgerStartupProblems(ledgers);
  if (problems.length) throw new LedgerStartupAssertionError(problems);
};
