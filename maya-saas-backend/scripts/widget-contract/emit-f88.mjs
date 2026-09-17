// P-F88 (GATES-PLAN-V11) — F88's forbidden-key union and F88.2's exemption table, EXTRACTED from the
// certified contract rather than transcribed by hand.
//
// F88 states the list once and says so in its own title ("stated once: one union, three enforcement
// points"). A second hand-written copy is the defect the clause exists to prevent — R3.8.2 records
// that the copy which used to sit in §3.8 carried fifteen of the twenty-eight keys and one of the
// three evaluation points, "which is what a list maintained in two places does". So the runtime list
// is parsed from §0.15 F88's own paragraph, and the exemption table from F88.2's own markdown rows.
//
//   node scripts/widget-contract/emit-f88.mjs [<out>]   write <out> (default src/widget-contract/f88.generated.ts)
//   node scripts/widget-contract/emit-f88.mjs --check   exit 1 when f88.generated.ts is not what this script writes
//
// Everything this script cannot read from the contract is an error, never a default: a wording change
// that breaks a parse fails the build instead of silently emitting a shorter list or a permissive
// predicate. The type column of F88.2 is half of each permission ("the type is half of the
// permission", F88.1), so a row whose type cell this script cannot map to a runtime predicate is
// fatal — never `() => true`.
//
// The output is formatted with the repository's prettier configuration before it is written or
// compared, so the committed file is byte-for-byte this script's output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '../..');
// Relative to this script, never an absolute checkout path: the build runs in clean exports and in CI.
const CONTRACT_FILE = path.resolve(
  BACKEND,
  '../docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md',
);
const CONTRACT = fs.readFileSync(CONTRACT_FILE, 'utf8');

const fail = (message) => {
  throw new Error(`emit-f88: ${message}`);
};

const slice = (from, to) => {
  const start = CONTRACT.indexOf(from);
  if (start < 0) fail(`anchor not found in the contract: ${from}`);
  const end = CONTRACT.indexOf(to, start + from.length);
  if (end < 0) fail(`closing anchor not found in the contract: ${to}`);
  return CONTRACT.slice(start + from.length, end);
};

// ── F88's union, parsed from the paragraph between its heading and its *Mechanism:* line ─────────
const forbiddenKeys = () => {
  const block = slice(
    '**F88 — the forbidden-key list, stated once: one union, three enforcement points.**',
    '*Mechanism:* one structural validator',
  );
  // The paragraph marks three of its keys `*(F88.2)*`; the marker is prose about where an exemption
  // exists, not part of the key, and it is dropped here so the union stays twenty-eight names.
  const keys = [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const unique = [...new Set(keys)];
  if (unique.length !== keys.length)
    fail(`F88's paragraph repeats a key: ${keys.join(', ')}`);
  // The contract states the cardinality twice ("twenty-eight keys", F88.2's first sentence). Parsing
  // fewer means a line wrap or a wording change truncated the block, which is exactly the way a
  // fence quietly loses an arm.
  if (unique.length !== 28)
    fail(`F88's union parsed as ${unique.length} keys, not the stated 28`);
  for (const marked of ['state', 'role', 'tenant_id'])
    if (!unique.includes(marked))
      fail(`F88's union lost its F88.2-marked key ${marked}`);
  return unique;
};

// ── the three declared enums the F88.2 rows require by type ──────────────────────────────────────
const members = (block, what, expected) => {
  const values = [...block.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map(
    (m) => m[1],
  );
  const unique = [...new Set(values)];
  if (unique.length !== expected)
    fail(
      `${what} parsed as ${unique.length} members (${unique.join(', ')}), not the declared ${expected}`,
    );
  return unique;
};

const cellState = () =>
  members(slice('type CellState =', ';'), '§1.3 CellState', 5);

// The declaration's own comments carry semicolons ("retention_sec elapsed; headline + summary only"),
// so this block ends at the fence, not at the first `;`.
const lifecycleState = () =>
  members(slice('type LifecycleState =', '\n```'), '§4.1 LifecycleState', 10);

// F88.1 quotes §3.1's declaration verbatim and states the count in the sentence above it ("§3.1
// declares eight members, not four"), so the eight are read from the clause that binds them.
const intentRole = () => {
  const quoted = slice('eight members, not four:**', ';').split('role:')[1];
  if (quoted === undefined)
    fail('F88.1 no longer quotes §3.1 role declaration under its own sentence');
  return members(quoted, "F88.1's quotation of WidgetIntent.role", 8);
};

// ── F88.2's table, parsed from its own markdown rows ─────────────────────────────────────────────
//
// Each row is a (shape, path, depth, type) structural location. There is deliberately no key column
// here and none in the emitted file: the key is DERIVED from the path by the walk, so no row can name
// a key without also naming where it sits — F88.2's "an implementation that can express 'the key k is
// allowed' is non-conforming".
const TYPE_PREDICATES = new Map([
  ['CellState', { expr: 'inSet(CELL_STATE)', needs: 'CELL_STATE' }],
  [
    'LifecycleState',
    { expr: 'inSet(LIFECYCLE_STATE)', needs: 'LIFECYCLE_STATE' },
  ],
  ['string', { expr: 'isString', needs: null }],
  [
    'the eight-member enum §3.1 declares',
    { expr: 'inSet(WIDGET_INTENT_ROLE)', needs: 'WIDGET_INTENT_ROLE' },
  ],
  [
    "exactly WidgetIntent['role']",
    { expr: 'inSet(WIDGET_INTENT_ROLE)', needs: 'WIDGET_INTENT_ROLE' },
  ],
]);

const exemptions = () => {
  const block = slice(
    '| # | shape | path | depth | required type | why this location and no other |',
    '**Rows 4 and 6 are the wave-1 rulings',
  );
  const rows = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length !== 6)
        fail(`F88.2 row has ${cells.length} cells, not 6: ${line}`);
      const plain = (c) => c.replace(/`/g, '').replace(/\*\*/g, '').trim();
      const row = Number(cells[0]);
      const declaredType = plain(cells[4]);
      const predicate = TYPE_PREDICATES.get(declaredType);
      // Fail-closed: a type cell this script cannot map is fatal. Emitting a permissive predicate
      // for an unrecognised type is precisely how an exemption widens by one word.
      if (!predicate)
        fail(
          `F88.2 row ${row} declares a type this script cannot map to a runtime predicate: ${JSON.stringify(declaredType)}`,
        );
      const depth = Number(cells[3]);
      if (!Number.isInteger(depth) || depth < 0)
        fail(`F88.2 row ${row} has a non-integer depth: ${cells[3]}`);
      return {
        row,
        shape: plain(cells[1]),
        path: plain(cells[2]),
        depth,
        declaredType,
        predicate,
        note: plain(cells[5]),
      };
    });
  // "F88's exemptions are exactly six structural locations" — the count is the clause's own title.
  if (rows.length !== 6)
    fail(`F88.2's table parsed as ${rows.length} rows, not the stated 6`);
  rows.forEach((r, i) => {
    if (r.row !== i + 1) fail(`F88.2's rows are not 1..6 in order`);
    const key = r.path.split('.').pop().replace(/\[\]$/, '');
    if (!FORBIDDEN.includes(key))
      fail(`F88.2 row ${r.row} exempts ${key}, which is not on F88's union`);
  });
  return rows;
};

const FORBIDDEN = forbiddenKeys();
const CELL_STATE = cellState();
const LIFECYCLE_STATE = lifecycleState();
const WIDGET_INTENT_ROLE = intentRole();
const EXEMPTIONS = exemptions();

// ── emit ─────────────────────────────────────────────────────────────────────────────────────────
const lit = (xs) => xs.map((x) => `'${x}'`).join(', ');

const source = () => {
  const usedSets = new Set(
    EXEMPTIONS.map((e) => e.predicate.needs).filter(Boolean),
  );
  return `// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md, section 0.15 F88 (the union), F88.1 (the role
//             declaration it quotes) and F88.2 (the six structural locations), with section 1.3
//             CellState and section 4.1 LifecycleState for the two state enums F88.2 requires by type.
// Regenerate: node scripts/widget-contract/emit-f88.mjs
//
// F88 states its union ONCE. This file is that statement compiled; \`scripts/widget-contract-check.mjs\`
// checks the same union statically, and a build test (F88-8) asserts the two are equal, so the list
// cannot drift into the two-places state R3.8.2 records.
//
// F88.2's exemptions are (shape, path, depth, type) TUPLES, never key names. There is no \`key\` member
// on \`F88Exemption\` and none in the table below: a row's key is derived from its path by the walk, so
// no row can name a key without also naming where it sits. F88.2: "an implementation that can express
// 'the key k is allowed' is non-conforming, whatever its current contents".

/** F88's mechanism names the five serialized values its one walk is applied to. */
export const F88_WALK_ROOTS = Object.freeze([
  'WidgetEnvelope',
  'WidgetIntentSubmission',
  'ChannelProfile',
  'NativeBridgeManifest',
  'IntentRecord',
] as const);

export type F88WalkRoot = (typeof F88_WALK_ROOTS)[number];

/** section 0.15 F88 - the union, ${FORBIDDEN.length} keys, parsed from the clause's own paragraph. */
export const F88_FORBIDDEN_KEYS = Object.freeze([${lit(FORBIDDEN)}] as const);

/** section 1.3 - the declared body cell state enum (F88.2 row 1's required type). */
export const CELL_STATE = Object.freeze([${lit(CELL_STATE)}] as const);

/** section 4.1 - the declared lifecycle enum (F88.2 row 2's required type). */
export const LIFECYCLE_STATE = Object.freeze([${lit(LIFECYCLE_STATE)}] as const);

/** section 3.1 as F88.1 quotes it - the eight members (rows 5 and 6's required type). */
export const WIDGET_INTENT_ROLE = Object.freeze([${lit(WIDGET_INTENT_ROLE)}] as const);

/**
 * One admitted structural location. \`accepts\` is the row's declared type as a runtime predicate:
 * the type is half of the permission (F88.1), so a value outside it is not exempt.
 */
export interface F88Exemption {
  /** F88.2's own row number, so an audit can quote the row. */
  readonly row: number;
  readonly shape: string;
  /** The location inside \`shape\`; array steps are written \`[]\` and add no depth. */
  readonly path: string;
  readonly depth: number;
  /** The contract's own words in the type column, carried so a drift is visible. */
  readonly declaredType: string;
  readonly accepts: (value: unknown) => boolean;
  readonly note: string;
}

const isString = (value: unknown): boolean => typeof value === 'string';
${
  usedSets.size
    ? `const inSet =
  (values: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === 'string' && values.includes(value);
`
    : ''
}
/** section 0.15 F88.2 - the closed table, exactly ${EXEMPTIONS.length} rows. */
export const F88_EXEMPTIONS: readonly F88Exemption[] = Object.freeze([
${EXEMPTIONS.map(
  (e) => `  Object.freeze({
    row: ${e.row},
    shape: '${e.shape}',
    path: '${e.path}',
    depth: ${e.depth},
    declaredType: ${JSON.stringify(e.declaredType)},
    accepts: ${e.predicate.expr},
    note: ${JSON.stringify(e.note)},
  }),`,
).join('\n')}
]);
`;
};

const out = process.argv.find((a) => !a.startsWith('--') && a.endsWith('.ts'));
const target = path.resolve(
  BACKEND,
  out ?? 'src/widget-contract/f88.generated.ts',
);

// `resolveConfig` is resolved against the OUTPUT FILE, not the package directory: given a directory
// it finds no `.prettierrc`, and the file would be written with prettier's defaults instead of the
// repository's - which `--check` would then report as a drift on a tree nobody edited.
const formatted = async (text) => {
  const prettier = await import('prettier');
  const options = (await prettier.resolveConfig(target)) ?? {};
  return prettier.format(text, { ...options, parser: 'typescript' });
};

const text = await formatted(source());

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current === text) {
    process.stdout.write(
      `emit-f88: ${path.relative(BACKEND, target)} is what the contract says (${FORBIDDEN.length} keys, ${EXEMPTIONS.length} exemptions)\n`,
    );
    process.exit(0);
  }
  process.stderr.write(
    `emit-f88: ${path.relative(BACKEND, target)} DIFFERS from the contract; regenerate it\n`,
  );
  process.exit(1);
}

fs.writeFileSync(target, text);
process.stdout.write(
  `emit-f88: wrote ${path.relative(BACKEND, target)} (${FORBIDDEN.length} keys, ${EXEMPTIONS.length} exemptions)\n`,
);
