// P-LEDGER exit tests LED-1, LED-2, LED-4 and the unit half of LED-3 (GATES-PLAN-V11, Wave 1).
//
// Class BUILD/U: the generated ledgers against the contract text and K1's versioned JSONs they are
// read from, and the start-up assertion against ledgers that have stopped matching their own
// declaration. Not live proof — §0.5 counts neither BUILD nor U as evidence for a clause, and this
// unit flips no clause (its card's audit row is "none directly").
//
// LED-3's `[GW]` half — "a missing binding blocks boot" — was a MERGE-STEP EXIT (plan §1.0, D-18): it
// needs IR-LED-1, the `WidgetsModule.onModuleInit` call, and `widgets.module.ts` is an integrator-only
// file. The IR landed in P-LEDGER's merge commit, so LED-3g below is an ordinary `it` and the
// integrator ran the boot half against the proof database in that commit.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  CAPABILITY_GAP_KEYS,
  CAPABILITY_GAP_KEY_PREFIX,
  CAPABILITY_GAP_LEDGER_RUNTIME,
  CAPABILITY_GAP_OWNER_STATE_COUNTS,
  CAPABILITY_GAP_ROWS,
  NEVER_CHAT_ACTUATED_GAP_KEYS,
  capabilityGapRow,
  isCapabilityGapKey,
  type CapabilityGapRow,
} from '../../widget-contract/capability-gap-ledger.runtime';
import {
  MECHANISM_GAP_BY_PREF,
  MECHANISM_GAP_DECLARED_ROW_COUNT,
  MECHANISM_GAP_KEY_PREFIX,
  MECHANISM_GAP_LEDGER_RUNTIME,
  MECHANISM_GAP_PREREQUISITE_FIRST,
  MECHANISM_GAP_PREREQUISITE_LAST,
  MECHANISM_GAP_ROWS,
  MECHANISM_GAP_STATUS_COUNTS,
  NORMATIVE_PENDING_BINDINGS,
  isMechanismNormativePending,
  mechanismGapForPRef,
} from '../../widget-contract/mechanism-gap-ledger.runtime';
import type { MechanismGap } from '../../widget-contract/registries';
import {
  LedgerStartupAssertionError,
  SHIPPED_LEDGERS,
  assertLedgersBindAtRegistryLoad,
  ledgerStartupProblems,
  type LedgerPair,
} from './ledger-startup.assert';

describe('P-LEDGER — the runtime mechanism-gap and capability-gap ledgers', () => {
  const BACKEND = path.resolve(__dirname, '..', '..', '..');
  const DOCS = path.resolve(BACKEND, '..', 'docs/rebuild');
  const CONTRACT = fs.readFileSync(
    path.join(DOCS, 'MAYA-WIDGET-CONTRACT-V1.md'),
    'utf8',
  );
  const K1 = path.join(DOCS, 'evidence/maya-chat-first-ux/k1');
  const readK1 = (file: string): { contract: string; rows: unknown[] } =>
    JSON.parse(fs.readFileSync(path.join(K1, file), 'utf8')) as {
      contract: string;
      rows: unknown[];
    };

  const LINES = CONTRACT.split('\n');
  const pRefOf = (n: number): string => `P-${String(n).padStart(2, '0')}`;
  const GAP_KEY = /`(GAP-[A-Z][A-Z-]+)`/g;

  /**
   * §A1's own row for a prerequisite, read here independently of the generator: the point of LED-1 is
   * that a second reader agrees, so this does not import the generator's parse.
   */
  const a1Row = (
    pRef: string,
  ): { component: string; status: string; pkg: string } => {
    const prefix = `| **${pRef}** | **`;
    const matches = LINES.map((l, i) => ({ l, i })).filter(({ l }) =>
      l.startsWith(prefix),
    );
    expect(matches).toHaveLength(1);
    const { l: line } = matches[0];
    const rest = line.slice(`| **${pRef}** | `.length);
    const component =
      /^\*\*(.+?)\*\*/.exec(rest)?.[1].replace(/`/g, '') ?? '<unparsed>';
    const stated =
      /`(\[ABSENT\]|\[PARTIAL\]|\[UNENFORCEABLE-TODAY\]|\[EXISTS\])`/.exec(
        rest,
      )?.[1];
    expect(stated).toBeDefined();
    const packages = [
      ...new Set(
        [...rest.matchAll(/\*\*(K1[0-6]|K[1-9])\*\*/g)].map((m) => m[1]),
      ),
    ];
    return {
      component,
      status: stated ?? '<unparsed>',
      pkg: packages.length ? packages.join('+') : 'NONE - outside the sixteen',
    };
  };

  /** A ledger pair built from edited rows, so the assertion reads a ledger rather than rebuilding one. */
  const pairOf = (
    mechanismRows: readonly Readonly<MechanismGap>[],
    capabilityRows: readonly CapabilityGapRow[] = CAPABILITY_GAP_ROWS,
  ): LedgerPair => ({
    ...SHIPPED_LEDGERS,
    mechanismRows,
    mechanismLedger: Object.fromEntries(
      mechanismRows.map((row) => [row.gap_key, row]),
    ),
    capabilityRows,
    capabilityLedger: Object.fromEntries(
      capabilityRows.map((row) => [row.gap_key, row]),
    ),
  });

  const drop = (pRef: string): readonly Readonly<MechanismGap>[] =>
    MECHANISM_GAP_ROWS.filter((row) => row.p_ref !== pRef);
  const edit = (
    pRef: string,
    patch: Partial<MechanismGap>,
  ): readonly Readonly<MechanismGap>[] =>
    MECHANISM_GAP_ROWS.map((row) =>
      row.p_ref === pRef ? { ...row, ...patch } : row,
    );

  /** `emit-ledgers.mjs --check`, run once. The exit code is read directly: non-zero throws here. */
  let checkOutput: string | null = null;
  const emitCheck = (): string => {
    checkOutput ??= execFileSync(
      'node',
      ['scripts/widget-contract/emit-ledgers.mjs', '--check'],
      { cwd: BACKEND, encoding: 'utf8' },
    );
    return checkOutput;
  };
  const printedLine = (prefix: string): string => {
    const line = emitCheck()
      .split('\n')
      .find((l) => l.startsWith(prefix));
    expect(line).toBeDefined();
    return line ?? '';
  };

  // ── LED-1: the thirty-nine rows equal the JSON and §A1 ─────────────────────────────────────────

  it('LED-1a the ledger carries K1’s thirty-nine rows, and F92’s declared count', () => {
    const k1 = readK1('k1-mechanism-gap-ledger.json');
    expect(k1.contract).toBe('maya.k1.mechanism-gap-ledger/1');
    expect(MECHANISM_GAP_ROWS).toHaveLength(k1.rows.length);
    expect(MECHANISM_GAP_ROWS).toHaveLength(MECHANISM_GAP_DECLARED_ROW_COUNT);
    expect(MECHANISM_GAP_DECLARED_ROW_COUNT).toBe(39);
  });

  it('LED-1b the ledger is K1’s rows field for field, in K1’s order', () => {
    const k1 = readK1('k1-mechanism-gap-ledger.json');
    expect(
      MECHANISM_GAP_ROWS.map((row) => ({
        gapKey: row.gap_key,
        pRef: row.p_ref,
        component: row.component,
        status: row.status,
        packageKey: row.package,
        blockingRules: row.blocking_rules,
      })),
    ).toEqual(k1.rows);
  });

  it('LED-1c the ledger is §A1’s register field for field — component, status and package', () => {
    for (const row of MECHANISM_GAP_ROWS) {
      const a1 = a1Row(row.p_ref);
      expect({
        p: row.p_ref,
        component: row.component,
        status: row.status,
        pkg: row.package,
      }).toEqual({
        p: row.p_ref,
        component: a1.component,
        status: a1.status,
        pkg: a1.pkg,
      });
    }
  });

  it('LED-1d the ledger covers F35’s declared range P-01 … P-39, once each', () => {
    expect([
      MECHANISM_GAP_PREREQUISITE_FIRST,
      MECHANISM_GAP_PREREQUISITE_LAST,
    ]).toEqual([1, 39]);
    expect(CONTRACT).toContain('MG-P01 … MG-P39');
    expect(CONTRACT).toContain("'P-01' … 'P-39'");
    expect(MECHANISM_GAP_ROWS.map((row) => row.p_ref).sort()).toEqual(
      Array.from(
        {
          length:
            MECHANISM_GAP_PREREQUISITE_LAST -
            MECHANISM_GAP_PREREQUISITE_FIRST +
            1,
        },
        (_, i) => pRefOf(i + MECHANISM_GAP_PREREQUISITE_FIRST),
      ),
    );
  });

  it('LED-1e every gap key is MG- + its p_ref, and every row resolves under both', () => {
    for (const row of MECHANISM_GAP_ROWS) {
      expect(row.gap_key).toBe(`${MECHANISM_GAP_KEY_PREFIX}${row.p_ref}`);
      expect(MECHANISM_GAP_LEDGER_RUNTIME[row.gap_key]).toBe(row);
      expect(MECHANISM_GAP_BY_PREF.get(row.p_ref)).toBe(row);
      expect(mechanismGapForPRef(row.p_ref)).toBe(row);
    }
    expect(Object.keys(MECHANISM_GAP_LEDGER_RUNTIME)).toHaveLength(
      MECHANISM_GAP_ROWS.length,
    );
  });

  it('LED-1f blocking_rules equals every contract-derived clause→row pair in both directions', () => {
    const expected = NORMATIVE_PENDING_BINDINGS.flatMap((binding) =>
      binding.p_refs.map((pRef) => `${binding.clause_id}\u0000${pRef}`),
    ).sort();
    const actual = MECHANISM_GAP_ROWS.flatMap((row) =>
      row.blocking_rules.map((clauseId) => `${clauseId}\u0000${row.p_ref}`),
    ).sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
    for (const row of MECHANISM_GAP_ROWS.filter(
      (candidate) => candidate.status === '[EXISTS]',
    ))
      expect(row.blocking_rules).toEqual([]);
  });

  it('LED-1g every row that is not [EXISTS] is NORMATIVE-PENDING, and so is an unknown p_ref', () => {
    expect(MECHANISM_GAP_STATUS_COUNTS['[EXISTS]']).toBe(8);
    for (const row of MECHANISM_GAP_ROWS)
      expect(isMechanismNormativePending(row.p_ref)).toBe(
        row.status !== '[EXISTS]',
      );
    expect(isMechanismNormativePending('P-99')).toBe(true);
    expect(mechanismGapForPRef('P-99')).toBeUndefined();
  });

  it('LED-1h the per-status counts are derived from the rows, never transcribed (§A5)', () => {
    const recount: Record<string, number> = {};
    for (const row of MECHANISM_GAP_ROWS)
      recount[row.status] = (recount[row.status] ?? 0) + 1;
    expect(MECHANISM_GAP_STATUS_COUNTS).toEqual({
      '[ABSENT]': recount['[ABSENT]'] ?? 0,
      '[EXISTS]': recount['[EXISTS]'] ?? 0,
      '[PARTIAL]': recount['[PARTIAL]'] ?? 0,
      '[UNENFORCEABLE-TODAY]': recount['[UNENFORCEABLE-TODAY]'] ?? 0,
    });
    expect(
      Object.values(MECHANISM_GAP_STATUS_COUNTS).reduce((a, b) => a + b, 0),
    ).toBe(MECHANISM_GAP_ROWS.length);
  });

  // ── LED-2: the P-07 rows ───────────────────────────────────────────────────────────────────────

  it('LED-2a P-07 is K1’s capability-gap ledger field for field', () => {
    const k1 = readK1('k1-capability-gap-ledger.json');
    expect(k1.contract).toBe('maya.k1.capability-gap-ledger/1');
    expect(
      CAPABILITY_GAP_ROWS.map((row) => ({
        gapKey: row.gap_key,
        act: row.act,
        ownerState: row.owner_state,
        evidence: row.evidence,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        closingCommit: row.closing_commit,
        isOneOfTheEight: row.is_one_of_the_eight,
      })),
    ).toEqual(k1.rows);
  });

  it('LED-2b P-07 registers exactly the GAP- keys the certified text names', () => {
    const declared = [
      ...new Set([...CONTRACT.matchAll(GAP_KEY)].map((m) => m[1])),
    ].sort();
    expect(declared.length).toBeGreaterThanOrEqual(8);
    expect([...CAPABILITY_GAP_KEYS].sort()).toEqual(declared);
    for (const key of CAPABILITY_GAP_KEYS) {
      expect(capabilityGapRow(key)).toBe(CAPABILITY_GAP_LEDGER_RUNTIME[key]);
      expect(isCapabilityGapKey(key)).toBe(true);
    }
    expect(isCapabilityGapKey('GAP-INVENTED')).toBe(false);
    expect(isCapabilityGapKey(null)).toBe(false);
    expect(isCapabilityGapKey(undefined)).toBe(false);
  });

  it('LED-2c the eight flagged rows are §0.7 F36’s declared GAPs, and only those (§A1.6 P-22)', () => {
    const f36 = [
      ...new Set(
        [
          ...(
            LINES.find((l) => l.includes('**Declared GAPs.**')) ?? ''
          ).matchAll(GAP_KEY),
        ].map((m) => m[1]),
      ),
    ];
    expect(f36).toHaveLength(8);
    expect([...NEVER_CHAT_ACTUATED_GAP_KEYS]).toEqual(f36);
    expect(
      CAPABILITY_GAP_ROWS.filter((row) => row.is_one_of_the_eight)
        .map((row) => row.gap_key)
        .sort(),
    ).toEqual([...f36].sort());
  });

  it('LED-2d the eight carry §A1.6.1’s corrected owner state, not §A1.1 P-07’s superseded “owner: NONE”', () => {
    const byState: Record<string, number> = {};
    for (const row of CAPABILITY_GAP_ROWS.filter((r) => r.is_one_of_the_eight))
      byState[row.owner_state] = (byState[row.owner_state] ?? 0) + 1;
    expect(byState).toEqual({
      none: 3,
      unreachable: 1,
      registered_elsewhere: 4,
    });
    expect(CONTRACT).toContain(
      '**Corrected figure: three acts with no owner at all, one with an owner unreachable from the widget source type, four with a reachable registered owner under a different name.**',
    );
    expect(
      Object.values(CAPABILITY_GAP_OWNER_STATE_COUNTS).reduce(
        (a, b) => a + b,
        0,
      ),
    ).toBe(CAPABILITY_GAP_ROWS.length);
  });

  it('LED-2e the two ledgers’ key shapes are disjoint (F35)', () => {
    expect(MECHANISM_GAP_KEY_PREFIX).toBe('MG-');
    expect(CAPABILITY_GAP_KEY_PREFIX).toBe('GAP-');
    for (const row of MECHANISM_GAP_ROWS)
      expect(row.gap_key.startsWith(CAPABILITY_GAP_KEY_PREFIX)).toBe(false);
    for (const row of CAPABILITY_GAP_ROWS)
      expect(row.gap_key.startsWith(MECHANISM_GAP_KEY_PREFIX)).toBe(false);
  });

  // ── LED-3: the §A2.4 start-up assertion ────────────────────────────────────────────────────────

  it('LED-3a the assertion binds on the ledgers this build ships', () => {
    expect(ledgerStartupProblems()).toEqual([]);
    expect(() => assertLedgersBindAtRegistryLoad()).not.toThrow();
  });

  it('LED-3b a §A1 row bound to no gap key fails the assertion (A2.4, drop MG-P-01)', () => {
    expect(ledgerStartupProblems(pairOf(drop('P-01')))).toContain(
      'A2.4: §A1 row P-01 is bound to no gap key in MECHANISM_GAP_LEDGER',
    );
    expect(() => assertLedgersBindAtRegistryLoad(pairOf(drop('P-01')))).toThrow(
      LedgerStartupAssertionError,
    );
  });

  it('LED-3c a [PARTIAL] row that does not resolve under its own gap key fails (A2.6 (3))', () => {
    const partial = MECHANISM_GAP_ROWS.find(
      (row) => row.status === '[PARTIAL]',
    );
    if (partial === undefined) throw new Error('§A1 carries no [PARTIAL] row');
    const pair: LedgerPair = {
      ...SHIPPED_LEDGERS,
      mechanismRows: MECHANISM_GAP_ROWS,
      mechanismLedger: Object.fromEntries(
        MECHANISM_GAP_ROWS.filter((row) => row.p_ref !== partial.p_ref).map(
          (row) => [row.gap_key, row],
        ),
      ),
    };
    expect(ledgerStartupProblems(pair)).toContain(
      `A2.4: ${partial.p_ref} is [PARTIAL] and does not resolve in MECHANISM_GAP_LEDGER under ${partial.gap_key}`,
    );
  });

  it('LED-3d a gap key that is not MG- + p_ref fails (F35)', () => {
    expect(
      ledgerStartupProblems(pairOf(edit('P-02', { gap_key: 'MG-P02' }))),
    ).toContain("F35: P-02's gap key is MG-P02, not MG-P-02");
  });

  it('LED-3e a status §A1 does not define fails', () => {
    expect(
      ledgerStartupProblems(
        pairOf(edit('P-03', { status: '[SHIPPED]' as MechanismGap['status'] })),
      ),
    ).toContain(
      '§A1: P-03 carries status [SHIPPED], which §A1 does not define',
    );
  });

  it('LED-3e2 a missing or invented clause→row binding fails in either direction', () => {
    const source = MECHANISM_GAP_ROWS.find(
      (row) => row.blocking_rules.length > 0,
    );
    if (!source) throw new Error('contract carries no pending clause binding');
    const missing = edit(source.p_ref, {
      blocking_rules: source.blocking_rules.slice(1),
    });
    expect(ledgerStartupProblems(pairOf(missing))).toContain(
      `F35: pending clause ${source.blocking_rules[0]} is not bound to ${source.p_ref}`,
    );

    const invented = edit(source.p_ref, {
      blocking_rules: [...source.blocking_rules, 'NP-invented'],
    });
    expect(ledgerStartupProblems(pairOf(invented))).toContain(
      `F35: ${source.p_ref} carries unowned blocking clause NP-invented`,
    );
  });

  it('LED-3f the capability ledger fails on a mechanism-shaped key, a lost reserved act, and an uncommitted withdrawal', () => {
    const shaped: CapabilityGapRow[] = [
      ...CAPABILITY_GAP_ROWS,
      { ...CAPABILITY_GAP_ROWS[0], gap_key: 'MG-P-01' },
    ];
    expect(ledgerStartupProblems(pairOf(MECHANISM_GAP_ROWS, shaped))).toContain(
      'F35: capability key MG-P-01 is shaped like a mechanism gap',
    );

    const lost = CAPABILITY_GAP_ROWS.filter(
      (row) => row.gap_key !== NEVER_CHAT_ACTUATED_GAP_KEYS[0],
    );
    expect(ledgerStartupProblems(pairOf(MECHANISM_GAP_ROWS, lost))).toContain(
      `§A1.6: reserved act ${NEVER_CHAT_ACTUATED_GAP_KEYS[0]} has no row in the capability-gap ledger`,
    );

    const withdrawn = CAPABILITY_GAP_ROWS.map((row, i) =>
      i === 0 ? { ...row, closed_at: 'K3' } : row,
    );
    expect(
      ledgerStartupProblems(pairOf(MECHANISM_GAP_ROWS, withdrawn)),
    ).toContain(
      `A2.7: ${CAPABILITY_GAP_ROWS[0].gap_key} is withdrawn with no closing commit; a withdrawal is a reviewable diff`,
    );
  });

  // MERGE-STEP EXIT (D-18). `widgets.module.ts` is integrator-only and IR-LED-1 adds the call; until
  // it lands this pins the absence, so the integrator watches a red test go green rather than a
  // silent one. The `[GW]` proof that boot actually stops is the integrator's, in the merge commit.
  it('LED-3g [GW] WidgetsModule.onModuleInit runs the assertion', () => {
    const module = fs.readFileSync(
      path.join(BACKEND, 'src/widgets/widgets.module.ts'),
      'utf8',
    );
    expect(module).toContain("from './authority/ledger-startup.assert'");
    expect(module).toContain('assertLedgersBindAtRegistryLoad()');
  });

  // ── LED-4: the F92 build-printed count ─────────────────────────────────────────────────────────

  it('LED-4a emit-ledgers.mjs --check regenerates both committed modules with no diff', () => {
    expect(emitCheck()).toContain('2 ledger modules are current');
  });

  it('LED-4b the build prints the ledger’s own per-status counts (F92, §A5)', () => {
    const emitter = fs.readFileSync(
      path.join(BACKEND, 'scripts/widget-contract/emit-ledgers.mjs'),
      'utf8',
    );
    expect(emitter).toContain(
      'const byStatus = mech.reduce(\n' +
        '  (acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc),\n' +
        '  {},\n' +
        ');',
    );
    const line = printedLine('F92 MECHANISM_GAP_LEDGER');
    expect(line).toContain(
      `${MECHANISM_GAP_ROWS.length} rows (${pRefOf(MECHANISM_GAP_PREREQUISITE_FIRST)}..${pRefOf(MECHANISM_GAP_PREREQUISITE_LAST)})`,
    );
    for (const [status, count] of Object.entries(MECHANISM_GAP_STATUS_COUNTS))
      expect(line).toContain(`${status} ${count}`);
  });

  it('LED-4c the build prints P-07’s key count and owner-state split', () => {
    const line = printedLine('P-07 CAPABILITY_GAP_LEDGER');
    expect(line).toContain(`${CAPABILITY_GAP_ROWS.length} keys`);
    expect(line).toContain(
      `of the eight ${NEVER_CHAT_ACTUATED_GAP_KEYS.length}`,
    );
    expect(line).toContain(
      `owner none ${CAPABILITY_GAP_OWNER_STATE_COUNTS.none}`,
    );
    expect(line).toContain(
      `registered_elsewhere ${CAPABILITY_GAP_OWNER_STATE_COUNTS.registered_elsewhere}`,
    );
    expect(line).toContain(
      `unreachable ${CAPABILITY_GAP_OWNER_STATE_COUNTS.unreachable}`,
    );
    expect(line).toContain('withdrawn 0');
  });

  it('LED-4d --check is not vacuous: it exits non-zero with no committed module to compare', () => {
    // A checker that cannot go red is not a checker. --check writes nothing, so pointing it at an
    // empty directory is a safe way to make it fail.
    expect(() =>
      execFileSync(
        'node',
        [
          'scripts/widget-contract/emit-ledgers.mjs',
          '--check',
          path.join(BACKEND, 'src/widget-contract/no-such-directory'),
        ],
        { cwd: BACKEND, encoding: 'utf8', stdio: 'pipe' },
      ),
    ).toThrow();
  });
});
