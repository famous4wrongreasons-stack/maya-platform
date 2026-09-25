// P-LEDGER (GATES-PLAN-V11, Wave 1) — the two ledgers, as runtime values.
//
// §0.7 F35 declares `MechanismGap` and `MECHANISM_GAP_LEDGER` and `registries.ts` carries that
// declaration, but as `export declare const`: a compile-time name with no runtime value, exactly the
// way `verification-floor.ts` carried a derivation that never ran. §A2.4 (as errata EC-5 restates it
// over `MECHANISM_GAP_LEDGER` rather than over the capability ledger) evaluates at
// `EP-REGISTRY-LOAD`: every §A1 row whose status is not `[EXISTS]` must resolve under its own
// `gap_key`, and a row with no key fails the start-up assertion and the process does not start. A
// declaration cannot fail a start-up assertion. This script gives both ledgers a value.
//
// NOTHING HERE IS AUTHORED. Two sources, cross-checked against each other, and a build that stops
// when they disagree:
//
//   1. the certified contract's §A1 register — the 39 prerequisite rows P-01 … P-39, each with its
//      component, its explicit status and the K-package that owes it;
//   2. K1's versioned ledgers, `docs/rebuild/evidence/maya-chat-first-ux/k1/k1-{mechanism,capability}-
//      gap-ledger.json`. F92 requires the ledger to be versioned with the contract "so that a
//      withdrawal is a reviewable diff" (A2.7 (c), RT8), so the JSON is the artefact a discharge
//      edits and this script is what makes an edit reach the running process.
//
// The two must agree row for row. They are not merged and neither is preferred: a divergence means
// either the contract moved under the ledger or a row was withdrawn without a contract change, and
// both are the failure mode A2.7 exists to prevent, so the build stops.
//
// Counts are DERIVED, never transcribed: §A5 retired a prose tally precisely because it drifted, and
// F92 requires the per-status counts to be "printed from `MECHANISM_GAP_LEDGER` at `EP-BUILD`".
// This script prints them; the runtime module derives the same counts from its own rows; and the
// unit's LED-4 asserts the two agree, so neither can drift without a red test.
//
// A note on one spelling, recorded rather than decided. F35's comment and F92 name the range
// "MG-P01 … MG-P34"; K1's ledger spells each key `MG-P-01`. Both satisfy the declared type
// `` `MG-${string}` ``, and `MG-` + `P-01` — the `gap_key` = `MG-` + `p_ref` composition F35's own
// two members state — produces K1's spelling. The ledger therefore keeps K1's, the build asserts the
// composition on every row, and `MECHANISM_GAP_BY_PREF` is exported so no consumer has to know.
//
//   node scripts/widget-contract/emit-ledgers.mjs [<out-dir>]   write both modules (default src/widget-contract)
//   node scripts/widget-contract/emit-ledgers.mjs --check       exit 1 when a committed module is not what this writes
//
// Output is formatted with the repository's prettier configuration before it is written or compared,
// so `--check` has no formatting noise to hide a drift in.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '../..');
// Relative to this script, never an absolute checkout path: the build runs in clean exports and in CI.
const DOCS = path.resolve(BACKEND, '../docs/rebuild');
const CONTRACT_PATH = path.join(DOCS, 'MAYA-WIDGET-CONTRACT-V1.md');
const K1 = path.join(DOCS, 'evidence/maya-chat-first-ux/k1');
const CONTRACT = fs.readFileSync(CONTRACT_PATH, 'utf8');

const fail = (message) => {
  console.error(`emit-ledgers: ${message}`);
  process.exit(1);
};

const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(K1, file), 'utf8'));

// ── 1. §A1, parsed ───────────────────────────────────────────────────────────────────────────────
//
// The same row shape K1's own `build-ledgers.mjs` reads, re-read here rather than trusted: this
// script's whole purpose is to be the second reader that notices when the JSON and §A1 diverge.

const STATUSES = ['[ABSENT]', '[EXISTS]', '[PARTIAL]', '[UNENFORCEABLE-TODAY]'];

/** F35's own range, read from its declaration block instead of counted or assumed. */
const declaredRange = () => {
  const gap = CONTRACT.match(/MG-P(\d\d) … MG-P(\d\d)/);
  const pRef = CONTRACT.match(/'P-(\d\d)' … 'P-(\d\d)'/);
  if (!gap || !pRef)
    fail('§0.7 F35 does not state the MG-P/P- range; the declaration moved');
  if (gap[1] !== pRef[1] || gap[2] !== pRef[2])
    fail(
      `§0.7 F35's two ranges disagree: MG-P${gap[1]}..${gap[2]} vs P-${pRef[1]}..${pRef[2]}`,
    );
  return { first: Number(pRef[1]), last: Number(pRef[2]) };
};

const a1Rows = () => {
  const rows = [
    ...CONTRACT.matchAll(/^\| \*\*(P-\d\d)\*\* \| \*\*(.+?)\*\*(.*)$/gm),
  ].map((m) => {
    const [, pRef, component, rest] = m;
    const stated = rest.match(
      /`(\[ABSENT\]|\[PARTIAL\]|\[UNENFORCEABLE-TODAY\]|\[EXISTS\])`/,
    );
    const packages = [
      ...new Set(
        [...rest.matchAll(/\*\*(K1[0-6]|K[1-9])\*\*/g)].map((x) => x[1]),
      ),
    ];
    return {
      gapKey: `MG-${pRef}`,
      pRef,
      component: component.replace(/`/g, ''),
      status: stated?.[1] ?? fail(`${pRef}: §A1 row has no explicit status`),
      packageKey: packages.length
        ? packages.join('+')
        : 'NONE - outside the sixteen',
    };
  });
  const { first, last } = declaredRange();
  const expected = last - first + 1;
  if (rows.length !== expected)
    fail(
      `§A1 yields ${rows.length} prerequisite rows; F35 declares ${expected}`,
    );
  for (let n = first; n <= last; n += 1) {
    const pRef = `P-${String(n).padStart(2, '0')}`;
    if (!rows.some((r) => r.pRef === pRef)) fail(`§A1 has no row ${pRef}`);
  }
  if (new Set(rows.map((r) => r.pRef)).size !== rows.length)
    fail('§A1 repeats a prerequisite row');
  for (const r of rows)
    if (!STATUSES.includes(r.status))
      fail(`${r.pRef}: unknown status ${r.status}`);
  return rows;
};

const normalized = (value) => value.replace(/\s+/g, ' ').trim();

/** F35 (2)/(3), DIS-0: derive every clause→row pair from its own normative Status paragraph. */
const normativePendingBindings = () => {
  const bindings = [];
  for (const paragraph of CONTRACT.split(/\n\s*\n/)) {
    const statusAt = Math.max(
      paragraph.indexOf('*Status:*'),
      paragraph.indexOf('**Status.**'),
    );
    if (statusAt < 0) continue;
    const status = paragraph.slice(statusAt);
    if (!status.includes('NORMATIVE-PENDING')) continue;
    const pRefs = [
      ...new Set([...status.matchAll(/P-\d\d/g)].map((m) => m[0])),
    ].sort();
    if (!pRefs.length)
      fail(
        `NORMATIVE-PENDING status names no prerequisite row: ${normalized(status).slice(0, 160)}`,
      );
    const clauseId = `NP-${createHash('sha256').update(normalized(paragraph)).digest('hex').slice(0, 16)}`;
    bindings.push({ clauseId, pRefs });
  }
  if (!bindings.length)
    fail('the contract yields no NORMATIVE-PENDING clause bindings');
  if (
    new Set(bindings.map((binding) => binding.clauseId)).size !==
    bindings.length
  )
    fail('two NORMATIVE-PENDING paragraphs derive the same clause id');
  return bindings.sort((a, b) => a.clauseId.localeCompare(b.clauseId));
};

// ── 2. the capability gaps the contract declares ─────────────────────────────────────────────────

/** Every `GAP-…` key the certified text names, which is what P-07 registers (§A1.1 P-07). */
const contractGapKeys = () =>
  [
    ...new Set(
      [...CONTRACT.matchAll(/`(GAP-[A-Z][A-Z-]+)`/g)].map((m) => m[1]),
    ),
  ].sort();

/** §0.7 F36's "Declared GAPs." cell — the eight reserved consent/identity/erasure acts, in its order. */
const f36DeclaredGaps = () => {
  const line = CONTRACT.split('\n').find((l) =>
    l.includes('**Declared GAPs.**'),
  );
  if (!line) fail("§0.7 F36's declared-GAP row is gone");
  const keys = [
    ...new Set([...line.matchAll(/`(GAP-[A-Z][A-Z-]+)`/g)].map((m) => m[1])),
  ];
  if (keys.length !== 8)
    fail(`§0.7 F36 names ${keys.length} declared GAPs; §A1.6 tracks eight`);
  return keys;
};

// ── 3. the two sources, cross-checked ────────────────────────────────────────────────────────────

const mechanismRows = () => {
  const fromContract = a1Rows();
  const bindings = normativePendingBindings();
  const blockingByPRef = new Map(fromContract.map((row) => [row.pRef, []]));
  for (const binding of bindings)
    for (const pRef of binding.pRefs) {
      const rules = blockingByPRef.get(pRef);
      if (!rules)
        fail(`${binding.clauseId}: status names unknown prerequisite ${pRef}`);
      rules.push(binding.clauseId);
    }
  const ledger = readJson('k1-mechanism-gap-ledger.json');
  if (ledger.contract !== 'maya.k1.mechanism-gap-ledger/1')
    fail(`k1-mechanism-gap-ledger.json declares ${ledger.contract}`);
  const byPRef = new Map(ledger.rows.map((r) => [r.pRef, r]));
  if (ledger.rows.length !== fromContract.length)
    fail(
      `K1 carries ${ledger.rows.length} mechanism rows; §A1 carries ${fromContract.length}`,
    );
  for (const row of fromContract) {
    const k1 = byPRef.get(row.pRef);
    if (!k1) fail(`K1's ledger has no row for ${row.pRef}`);
    for (const field of ['gapKey', 'component', 'status', 'packageKey'])
      if (k1[field] !== row[field])
        fail(
          `${row.pRef}.${field}: §A1 says ${JSON.stringify(row[field])}, ` +
            `K1's ledger says ${JSON.stringify(k1[field])}`,
        );
    const expectedBlockingRules = [
      ...(blockingByPRef.get(row.pRef) ?? []),
    ].sort();
    if (
      !Array.isArray(k1.blockingRules) ||
      JSON.stringify([...k1.blockingRules].sort()) !==
        JSON.stringify(expectedBlockingRules)
    )
      fail(
        `${row.pRef}.blockingRules: contract derives ${JSON.stringify(expectedBlockingRules)}, ` +
          `K1 says ${JSON.stringify(k1.blockingRules)}`,
      );
    if (k1.gapKey !== `MG-${k1.pRef}`)
      fail(
        `${row.pRef}: gap_key ${k1.gapKey} is not MG- + p_ref, so the range is not derivable`,
      );
  }
  // K1's row order is the order the discharge diff reads; §A1's is the register's. Keep K1's.
  return ledger.rows.map((r) => ({
    gapKey: r.gapKey,
    pRef: r.pRef,
    component: r.component,
    status: r.status,
    packageKey: r.packageKey,
    blockingRules: [...r.blockingRules].sort(),
  }));
};

const capabilityRows = () => {
  const ledger = readJson('k1-capability-gap-ledger.json');
  if (ledger.contract !== 'maya.k1.capability-gap-ledger/1')
    fail(`k1-capability-gap-ledger.json declares ${ledger.contract}`);
  const declared = contractGapKeys();
  const keys = ledger.rows.map((r) => r.gapKey);
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(declared))
    fail(
      `P-07's keys are not the keys the contract declares: ` +
        `ledger ${keys.length}, contract ${declared.length}`,
    );
  const eight = f36DeclaredGaps();
  const flagged = ledger.rows
    .filter((r) => r.isOneOfTheEight)
    .map((r) => r.gapKey)
    .sort();
  if (JSON.stringify(flagged) !== JSON.stringify([...eight].sort()))
    fail("P-07's eight-act flags are not §0.7 F36's declared GAPs");
  const OWNER_STATES = ['none', 'registered_elsewhere', 'unreachable'];
  for (const r of ledger.rows) {
    if (!OWNER_STATES.includes(r.ownerState))
      fail(`${r.gapKey}: unknown ownerState ${r.ownerState}`);
    if (r.gapKey.startsWith('MG-'))
      fail(`${r.gapKey}: F35 keeps the two key shapes disjoint`);
  }
  return ledger.rows.map((r) => ({
    gapKey: r.gapKey,
    act: r.act,
    ownerState: r.ownerState,
    evidence: r.evidence,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    closingCommit: r.closingCommit,
    isOneOfTheEight: r.isOneOfTheEight,
  }));
};

// ── 4. the modules ───────────────────────────────────────────────────────────────────────────────

// JSON's own escaping, then prettier chooses the quote: several components carry an apostrophe
// ("Gate 6's key-space dispatch") and one carries an escaped markdown pipe, which K1's ledger stores
// as a backslash and LED-1 compares byte for byte.
const lit = (s) => JSON.stringify(s);

const mechanismModule = (
  rows,
  range,
) => `// GENERATED from §A1 of the certified contract and K1's versioned ledger — do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md §A1, §0.7 F35, §0.18 F92, §A2.4 (errata EC-5)
//             docs/rebuild/evidence/maya-chat-first-ux/k1/k1-mechanism-gap-ledger.json
// Regenerate: node scripts/widget-contract/emit-ledgers.mjs
// Module:     mechanism-gap-ledger (P-29's own row, P-LEDGER)
//
// \`registries.ts\` DECLARES \`MECHANISM_GAP_LEDGER\` and never defines it. This module defines it, under
// a name of its own so the declaration stays where the contract emitter put it. Every row is §A1's,
// cross-read against K1's versioned ledger by the generator; the per-status counts are DERIVED here
// and never transcribed (§A5, F92).
//
// A row's \`gap_key\` is \`MG-\` + its \`p_ref\` — F35's own composition, which spells K1's \`MG-P-01\`
// where F35's prose range writes \`MG-P01\`. Read a row through \`MECHANISM_GAP_BY_PREF\` and the
// spelling never reaches a caller.
//
// \`blocking_rules\` is derived from every normative paragraph's own Status sentence. F35 (2)/(3)
// is checked in both directions: each clause reaches every named row, and no row carries a clause
// its status sentence does not name.

import type { MechanismGap } from './registries';

/** F35's declared range, read from its own block: \`'P-${String(range.first).padStart(2, '0')}' … 'P-${String(range.last).padStart(2, '0')}'\`. */
export const MECHANISM_GAP_PREREQUISITE_FIRST = ${range.first};
export const MECHANISM_GAP_PREREQUISITE_LAST = ${range.last};
/** F92's thirty-nine rows, as a number the start-up assertion can compare the ledger against. */
export const MECHANISM_GAP_DECLARED_ROW_COUNT = ${range.last - range.first + 1};

const MECHANISM_GAP_LEDGER_SOURCE: MechanismGap[] = [
${rows
  .map(
    (r) => `  {
    gap_key: ${lit(r.gapKey)},
    p_ref: ${lit(r.pRef)},
    component: ${lit(r.component)},
    status: ${lit(r.status)},
    package: ${lit(r.packageKey)},
    blocking_rules: [${r.blockingRules.map(lit).join(', ')}],
  },`,
  )
  .join('\n')}
];

/** The prerequisite register, frozen, in K1's order — the order a withdrawal diff is read in. */
export const MECHANISM_GAP_ROWS: readonly Readonly<MechanismGap>[] = Object.freeze(
  MECHANISM_GAP_LEDGER_SOURCE.map((row) => {
    Object.freeze(row.blocking_rules);
    return Object.freeze(row);
  }),
);

/** \`MECHANISM_GAP_LEDGER\` with a value: keyed by \`gap_key\`, which is what A2.4 resolves a row under. */
export const MECHANISM_GAP_LEDGER_RUNTIME: Readonly<
  Record<string, Readonly<MechanismGap>>
> = Object.freeze(Object.fromEntries(MECHANISM_GAP_ROWS.map((row) => [row.gap_key, row])));

/** By \`p_ref\`, so no caller has to know how \`gap_key\` is spelled. */
export const MECHANISM_GAP_BY_PREF: ReadonlyMap<string, Readonly<MechanismGap>> = new Map(
  MECHANISM_GAP_ROWS.map((row) => [row.p_ref, row]),
);

/** F92's build-printed counts, derived from the rows above. Never transcribed (§A5). */
export const MECHANISM_GAP_STATUS_COUNTS: Readonly<Record<MechanismGap['status'], number>> =
  Object.freeze(
    MECHANISM_GAP_ROWS.reduce<Record<MechanismGap['status'], number>>(
      (counts, row) => {
        counts[row.status] += 1;
        return counts;
      },
      { '[ABSENT]': 0, '[EXISTS]': 0, '[PARTIAL]': 0, '[UNENFORCEABLE-TODAY]': 0 },
    ),
  );

/** F35 (2)/(3)'s clause→row side, derived from the contract Status sentences. */
export const NORMATIVE_PENDING_BINDINGS = Object.freeze([
${normativePendingBindings()
  .map(
    (binding) =>
      `  Object.freeze({ clause_id: ${lit(binding.clauseId)}, p_refs: Object.freeze([${binding.pRefs.map(lit).join(', ')}]) }),`,
  )
  .join('\n')}
]);

export const mechanismGapForPRef = (pRef: string): Readonly<MechanismGap> | undefined =>
  MECHANISM_GAP_BY_PREF.get(pRef);

/**
 * A2.1: a rule whose mechanism is not \`[EXISTS]\` is NORMATIVE-PENDING, and A2.6 (3) puts
 * \`[PARTIAL]\` on identical terms. A \`p_ref\` no row declares answers true — a mechanism nobody
 * registered is not a mechanism that exists.
 */
export const isMechanismNormativePending = (pRef: string): boolean =>
  MECHANISM_GAP_BY_PREF.get(pRef)?.status !== '[EXISTS]';

/** F35's build assertion, one half: the mechanism ledger's key shape. */
export const MECHANISM_GAP_KEY_PREFIX = 'MG-';
`;

const capabilityModule = (
  rows,
  eight,
) => `// GENERATED from the certified contract and K1's versioned ledger — do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md §A1.1 P-07, §0.7 F35, §0.7 F36, §A1.6
//             docs/rebuild/evidence/maya-chat-first-ux/k1/k1-capability-gap-ledger.json
// Regenerate: node scripts/widget-contract/emit-ledgers.mjs
// Module:     capability-gap-ledger (P-07)
//
// P-07 is the register of gap KEYS — "this act has no canonical owner" — which is a different
// artefact from \`AE_CAPABILITY_GAP_LEDGER\` (F35: that one is keyed on an AE-CAP capability and maps
// it to one of these keys), and a different artefact again from the mechanism ledger ("this
// component is not built yet"). F35 requires the two key shapes, \`GAP-\` and \`MG-\`, to stay
// disjoint, and the start-up assertion checks it.
//
// The rows are K1's, and their keys are exactly the \`GAP-…\` keys the certified text names — the
// generator refuses a ledger that carries a key the contract does not, or misses one it does.
//
// One reading is disclosed rather than resolved. §A1.1 P-07 describes "the 8 gap keys as first-class
// entries with \`owner: NONE\`"; §A1.6.1 then CORRECTS that count by act — three acts with no owner
// at all, one with an owner unreachable from the widget source type, four with a reachable
// registered owner under a different name — and §A1.6.2 makes the correction normative. K1's rows
// carry §A1.6.1's per-act state, so \`owner_state\` is \`registered_elsewhere\` or \`unreachable\` on five
// of the eight. That is the corrected figure, not a softening: none of the eight reserved NAMES is a
// registry member in any space, so every one of them still emits \`capability_gap_ref\` and no intent.

/** K1's row, as the runtime carries it. F35 names the artefact; it declares no shape for it. */
export interface CapabilityGapRow {
  /** \`GAP-…\`, the value a \`capability_gap_ref\` may hold. */
  readonly gap_key: string;
  /** The act with no canonical owner. */
  readonly act: string;
  /** §A1.6.1's per-act verdict. \`none\`: no owner at all. */
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
${rows
  .map(
    (r) => `  {
    gap_key: ${lit(r.gapKey)},
    act: ${lit(r.act)},
    owner_state: ${lit(r.ownerState)},
    evidence: ${lit(r.evidence)},
    opened_at: ${lit(r.openedAt)},
    closed_at: ${r.closedAt === null ? 'null' : lit(r.closedAt)},
    closing_commit: ${r.closingCommit === null ? 'null' : lit(r.closingCommit)},
    is_one_of_the_eight: ${r.isOneOfTheEight ? 'true' : 'false'},
  },`,
  )
  .join('\n')}
];

export const CAPABILITY_GAP_ROWS: readonly CapabilityGapRow[] = Object.freeze(
  CAPABILITY_GAP_LEDGER_SOURCE.map((row) => Object.freeze(row)),
);

export const CAPABILITY_GAP_LEDGER_RUNTIME: Readonly<Record<string, CapabilityGapRow>> =
  Object.freeze(Object.fromEntries(CAPABILITY_GAP_ROWS.map((row) => [row.gap_key, row])));

export const CAPABILITY_GAP_KEYS: readonly string[] = Object.freeze(
  CAPABILITY_GAP_ROWS.map((row) => row.gap_key),
);

/** §0.7 F36's "Declared GAPs." cell, in its order: the eight reserved names of §A1.6 P-22. */
export const NEVER_CHAT_ACTUATED_GAP_KEYS: readonly string[] = Object.freeze([
${eight.map((k) => `  ${lit(k)},`).join('\n')}
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

export const capabilityGapRow = (gapKey: string): CapabilityGapRow | undefined =>
  CAPABILITY_GAP_LEDGER_RUNTIME[gapKey];

/**
 * LIMIT.1's backstop input: a \`capability_gap_ref\` is a key this register declares, or it is not a
 * gap ref at all. Fail-closed on an unregistered value — a minter that invented one would otherwise
 * clear the gap fence by naming a key nothing opened.
 */
export const isCapabilityGapKey = (ref: string | null | undefined): boolean =>
  typeof ref === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITY_GAP_LEDGER_RUNTIME, ref);

/** F35's build assertion, the other half: the capability ledger's key shape. */
export const CAPABILITY_GAP_KEY_PREFIX = 'GAP-';
`;

// ── 5. write or check ────────────────────────────────────────────────────────────────────────────

const range = declaredRange();
const mech = mechanismRows();
const caps = capabilityRows();
const eight = f36DeclaredGaps();

const outputs = [
  {
    file: 'mechanism-gap-ledger.runtime.ts',
    text: mechanismModule(mech, range),
  },
  {
    file: 'capability-gap-ledger.runtime.ts',
    text: capabilityModule(caps, eight),
  },
];

const check = process.argv.includes('--check');
const outDir = path.resolve(
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
    path.join(BACKEND, 'src/widget-contract'),
);

const prettier = await import('prettier');
let drift = 0;
for (const output of outputs) {
  const committed = path.join(BACKEND, 'src/widget-contract', output.file);
  const config = await prettier.resolveConfig(committed, {
    editorconfig: true,
  });
  if (!config)
    fail(
      `no prettier configuration resolves for src/widget-contract/${output.file}`,
    );
  const formatted = await prettier.format(output.text, {
    ...config,
    filepath: committed,
  });
  const target = path.join(outDir, output.file);
  if (check) {
    const current = fs.existsSync(target)
      ? fs.readFileSync(target, 'utf8')
      : null;
    if (current !== formatted) {
      console.error(
        `emit-ledgers --check: ${path.relative(BACKEND, target)} is not what emit-ledgers.mjs writes; regenerate it`,
      );
      drift += 1;
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, formatted);
  }
}

// F92 — the build-printed status counts, from the ledger, never from prose.
const byStatus = mech.reduce(
  (acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc),
  {},
);
const statusLine = STATUSES.map((s) => `${s} ${byStatus[s] ?? 0}`).join(' | ');
const ownerStates = caps.reduce(
  (acc, r) => ((acc[r.ownerState] = (acc[r.ownerState] ?? 0) + 1), acc),
  {},
);
console.log(
  `F92 MECHANISM_GAP_LEDGER ${mech.length} rows (P-${String(range.first).padStart(2, '0')}..P-${String(range.last).padStart(2, '0')}) | ${statusLine}`,
);
console.log(
  `P-07 CAPABILITY_GAP_LEDGER ${caps.length} keys | of the eight ${caps.filter((r) => r.isOneOfTheEight).length}` +
    ` | owner none ${ownerStates.none ?? 0} | registered_elsewhere ${ownerStates.registered_elsewhere ?? 0}` +
    ` | unreachable ${ownerStates.unreachable ?? 0} | withdrawn ${caps.filter((r) => r.closedAt !== null).length}`,
);
if (check && drift) process.exit(1);
if (check) console.log(`${outputs.length} ledger modules are current`);
