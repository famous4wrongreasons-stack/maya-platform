#!/usr/bin/env node
// The evidence verifier (GATES-PLAN-V11 I-HAR skeleton; §3.3 step 4, D-3, D-17). The integrator runs it after an
// evidence run; A-W5 completes it. It reads the three files `test/widgets-live/support/evidence.ts` appends to and
// REJECTS every manifest line that cannot stand as evidence. It never flips a clause: `gate-audit-build.mjs` does
// that from a manifest this verifier has passed.
//
//   node scripts/widgets-evidence-verify.mjs [--dir <evidence dir>] [--manifest <file>] [--mint <file>]
//        [--database <file>] [--inventory <gate-clause-inventory.json>] [--source-root <dir>]
//
// Defaults: `--dir` is `$WIDGETS_EVIDENCE_DIR` or `<os tmpdir>/widgets-evidence`; the three files are
// `evidence-manifest.jsonl`, `mint-provenance.jsonl` and `database-before-teardown.jsonl` in it; the inventory is
// `docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json`; the source root is maya-saas-backend.
// A missing manifest is 0 lines (CKPT-W step 5 requires 0 violations; from Wave 5 on, also the expected lines).
//
// Output: one JSON line (`maya.widgets-evidence-verify/1`), then one summary line. Exit 0 iff 0 violations;
// 2 on a usage error.
//
// A claim is a line whose `claim` is L, L-T or U. Rules (each violation names its rule):
//   V-SCHEMA          a line that does not parse or lacks a field of `maya.widgets-evidence/1`; a mint or database line
//                     that does not parse; a claim with no evidence label; a tamper label that names no column
//   V-INVENTORY       a clause key that is not in the inventory
//   V-GW              a claim on a GW line (GW entry is never evidence)
//   V-PROV-RECORD     an L or L-T claim that names no record: §0.5 L and L-T are about a production-minted record, and a
//                     claim without one would skip every provenance check (EP-BUILD clauses are not manifest claims)
//   V-PROV-MINT       a record hash (on any line) with no server `WidgetMintProvenance` line of the same entry, or with
//                     more than one (the record is not traced to exactly one mint; D-17 (4))
//   V-PROV-DB         a record hash (on any line) absent from the database as read before teardown (D-17 (4))
//   V-PROV-TRIGGER    a claim whose mint line's trigger is not a production trigger of §0.5 L (T-2b, T-2a, T-1, T-3).
//                     A `successor` mint is refused too: §0.5 admits it only when its predecessor qualifies, and the
//                     mint line does not name the predecessor, so the skeleton cannot trace it (fail closed; A-W5)
//   V-PROV-TRACE      a claim whose `trigger_trace_id` is null or differs from its mint line's `request_id`
//   V-PROV-PID        a claim whose line was written by another process than the one that captured its mint line
//   V-PROV-FORGED     a capture point refused a `WidgetMintProvenance` line (a call from outside the application's
//                     `src/`, or a malformed line): the run is not evidence
//   V-ENTRY-SOURCE    an HTTP claim whose source is not a `test/widgets-live/**.live-spec.ts` outside `support/`, or a BIN
//                     claim whose source is not `scripts/widgets-http-proof/gate<id>.cases.ts`
//   V-PROCESS         a claim line whose process id also wrote a line of the other entry (HTTP and BIN are two processes)
//   V-LABEL-CLASS     an `[E-TAMPER:…]`, `[tamper:…]` or `[E-INDEP…]` label on a claim other than L-T (§0.5: tamper and
//                     independence evidence are L-T only); an L claim without `[E-MINT]`, `[E-HOSTILE]` or `[E-DRIFT]`;
//                     an L-T claim without `[E-TAMPER:…]` or `[E-INDEP…]`
//   V-TAMPER-SEALED   a tamper label naming a column the H4 `SealVerifier` reads, on any line except one offered for G1-a
//                     alone (§0.5 L-T). Columns are read after splitting on commas and semicolons, trimming, dropping
//                     quotes and a `=value`, and comparing without case and underscores (`widget_emission.body_hash`)
//   V-TAMPER-SHAPE    a tamper label naming more than one column besides the `verificationFloor` rewrite (§0.5: one column)
//   V-SYNTH-CLAIM     a `[synthetic record]`, `[G-SYNTH]` or `[RI]` label (any case) on an L or L-T claim
//   V-LT-G9-G10       an L-T claim on a Gate 9 or Gate 10 key
//   V-L-PAIR          an L claim without a clean L line of the other entry (HTTP ↔ BIN) for the same test id and the same
//                     clauses (D-17 (5)); each half names and proves its own record
//   V-FIXTURE-WRITE   a claim whose source file, or a helper it imports from outside `support/` and `src/`, calls
//                     `Fixtures.widget`/`synthetic`, the emitter, the record writer or a widget model write, opens its own
//                     database client or raw SQL, names or forges the mint provenance context (a logger), touches the
//                     evidence directory's files or writer, or loads code dynamically (file granularity: fail closed)
//   V-OVERRIDE        a provider override, a `providers` binding, a module mock, a replaced property, a replacing spy
//                     (chained or through a variable), or a member assigned on a resolved provider or a prototype,
//                     outside the closed allowlist: in any harness support file (recursively), in the BIN runner, or in a
//                     claim's source file and its helpers (§3.2)
//   V-MODEL-STUB      any of those aimed at the model transport (D-15)
//   V-CONTROLLED      `controlledFixtureMode` in a harness support file or a claim's source file
//   V-UNVERIFIED      a U or L-T claim: this skeleton cannot check the four U duties or the `[HTTP]` mutant kills
//                     from the shard artifacts, so it refuses them until A-W5 completes the verifier (fail closed)
//
// Trust boundary, stated plainly. The capture points refuse what they can: the HTTP sink admits a provenance line only
// from a call site under `src/`; only the BIN runner, which claims the stdout capture before it loads a case, can
// register a binary's line; the evidence writer refuses a BIN entry inside jest and any server line no capture point
// registered. Test code that writes the three sidecar files with `fs` directly is caught only by the source scans above
// and by the D-17 (3) BUILD test (`harness.live-spec.ts` HAR-12). An evidence run therefore starts from an empty
// `WIDGETS_EVIDENCE_DIR`, and nothing but the harness writers may write it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const REPO = path.resolve(BACKEND, '..');

const usage = (message) => {
  process.stderr.write(`widgets-evidence-verify: ${message}\n`);
  process.exit(2);
};

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) usage(`${name} needs a value`);
  return value;
};

const dir = path.resolve(
  option('--dir') ??
    (option('--manifest')
      ? path.dirname(path.resolve(option('--manifest')))
      : process.env.WIDGETS_EVIDENCE_DIR?.trim() || path.join(os.tmpdir(), 'widgets-evidence')),
);
const manifestFile = path.resolve(option('--manifest') ?? path.join(dir, 'evidence-manifest.jsonl'));
const mintFile = path.resolve(option('--mint') ?? path.join(dir, 'mint-provenance.jsonl'));
const databaseFile = path.resolve(option('--database') ?? path.join(dir, 'database-before-teardown.jsonl'));
const inventoryFile = path.resolve(
  option('--inventory') ?? path.join(REPO, 'docs/rebuild/evidence/maya-chat-first-ux/gate-clause-inventory.json'),
);
const sourceRoot = path.resolve(option('--source-root') ?? BACKEND);

// ── the closed allowlists (§3.2) ──────────────────────────────────────────────────────────────────────────────
/** Columns the H4 `SealVerifier` reads (§0.5 L-T): never an E-TAMPER target, except for key G1-a. */
export const SEAL_READ_COLUMNS = Object.freeze({
  WidgetEmission: ['bodyHash', 'widgetId', 'tenantId', 'issuedAt', 'expiresAt', 'deliveryChannel'],
  WidgetIntentRecord: ['principalProofHash'],
  WidgetRenderReceipt: ['profileId'],
});
/** An identifier as the tamper rule compares it: no case, no underscores, no quotes or spaces. */
const ident = (text) => text.replace(/["'`\s_]/g, '').toLowerCase();
const SEALED_BY_MODEL = new Map(
  Object.entries(SEAL_READ_COLUMNS).map(([model, columns]) => [ident(model), new Set(columns.map(ident))]),
);
const SEALED_ANYWHERE = new Set(Object.values(SEAL_READ_COLUMNS).flat().map(ident));
/** The one companion column an E-TAMPER on a floor term also rewrites (§0.5 L-T). */
const FLOOR_COMPANION = ident('verificationFloor');

/**
 * The provider-override allowlist: two call-through observation wrappers and two external transports stubbed at
 * the adapter. Nothing else, and never the model transport (D-15).
 */
export const OVERRIDE_ALLOWLIST = Object.freeze([
  {
    id: 'recording-store-client',
    kind: 'call-through',
    form: 'overrideProvider',
    target: 'PrismaService',
    files: ['test/widgets-live/support/bootstrap.ts', 'test/widgets-live/support/http-bootstrap.ts'],
  },
  {
    id: 'gateway-submit-scope-wrapper',
    kind: 'call-through',
    form: 'spy',
    target: 'gateway.submit',
    files: ['test/widgets-live/support/http-bootstrap.ts'],
  },
  {
    id: 'yclients-http-client-stub',
    kind: 'external-transport',
    form: 'overrideProvider',
    target: 'YclientsCRMAdapter',
    files: ['test/widgets-live/support/'],
  },
  {
    id: 'link-verifier-challenge-stub',
    kind: 'external-transport',
    form: 'overrideProvider',
    target: 'ClientChannelLinkVerifier',
    files: ['test/widgets-live/support/'],
  },
]);
const MODEL_TRANSPORT = /\b(AiCoreModelService|AI_CORE_MODEL|ModelTransport|decide)\b|ai-core-model/;

/** §0.5 L: the production triggers a record may be minted from (a successor is traced separately; see V-PROV-TRIGGER). */
const PRODUCTION_TRIGGERS = new Set(['T-2b', 'T-2a', 'T-1', 'T-3']);
const L_LABELS = new Set(['[E-MINT]', '[E-HOSTILE]', '[E-DRIFT]']);
const LT_LABEL = /^\[(?:E-TAMPER:[^\]]+|E-INDEP(?:\(mint\))?)\]$/;
const EVIDENCE_LABEL = /^\[(E-MINT|E-HOSTILE|E-DRIFT|E-INDEP(?:\(mint\))?|E-TAMPER:[^\]]+)\]$/;
/** Tamper and independence labels, read without case so a respelling cannot slip past the L-T-only rule. */
const TAMPER_LABEL = /^\[\s*(?:e-tamper|tamper)\s*:([^\]]*)\]$/i;
const INDEP_LABEL = /^\[\s*e-indep\b[^\]]*\]$/i;
const SYNTHETIC_LABELS = new Set(['[synthetic record]', '[g-synth]', '[ri]']);
const HTTP_CLAIM_SOURCE = /^test\/widgets-live\/(?!support\/)(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.live-spec\.ts$/;
const BIN_CLAIM_SOURCE = /^scripts\/widgets-http-proof\/gate[0-9A-Za-z-]+\.cases\.ts$/;

// ── inputs ────────────────────────────────────────────────────────────────────────────────────────────────────
const readJsonl = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((text, index) => ({ text, index: index + 1 }))
    .filter(({ text }) => text.trim() !== '');
};

const violations = [];
const violation = (rule, line, reason) =>
  violations.push({ rule, line: line?.at ?? null, test_id: line?.test_id ?? null, reason });

const inventory = fs.existsSync(inventoryFile) ? JSON.parse(fs.readFileSync(inventoryFile, 'utf8')) : null;
const inventoryKeys = inventory
  ? new Set(inventory.gates.flatMap((g) => g.clauses.map((c) => c.key)))
  : null;

const lines = [];
for (const { text, index } of readJsonl(manifestFile)) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    violation('V-SCHEMA', { at: index }, 'the line is not JSON');
    continue;
  }
  const at = index;
  const ok =
    value?.contract === 'maya.widgets-evidence/1' &&
    typeof value.test_id === 'string' &&
    ['GW', 'HTTP', 'BIN'].includes(value.entry) &&
    typeof value.source === 'string' &&
    (value.record_hash === null || typeof value.record_hash === 'string') &&
    (value.trigger_trace_id === null || typeof value.trigger_trace_id === 'string') &&
    Array.isArray(value.labels) &&
    value.labels.every((label) => typeof label === 'string') &&
    Array.isArray(value.clauses) &&
    [null, 'L', 'L-T', 'U'].includes(value.claim) &&
    Number.isInteger(value.pid);
  if (!ok) {
    violation('V-SCHEMA', { at, test_id: value?.test_id }, 'the line is not a maya.widgets-evidence/1 line');
    continue;
  }
  lines.push({ ...value, at });
}

/** entry → record hash → the captured mint lines for it, each with the capturing process. */
const minted = { HTTP: new Map(), BIN: new Map() };
/** entry → the process ids that wrote a line of that entry (manifest or mint). */
const pidsOf = { GW: new Set(), HTTP: new Set(), BIN: new Set() };
let refusals = 0;
for (const { text, index } of readJsonl(mintFile)) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    violation('V-SCHEMA', { at: `mint:${index}` }, 'a mint provenance line is not JSON');
    continue;
  }
  if (value?.contract === 'maya.widgets-evidence-mint-refused/1') {
    refusals += 1;
    violation(
      'V-PROV-FORGED',
      { at: `mint:${index}` },
      `the ${value.entry} capture point refused a WidgetMintProvenance line: ${String(value.reason).slice(0, 300)}`,
    );
    continue;
  }
  if (
    value?.contract !== 'maya.widgets-evidence-mint/1' ||
    !(value.entry in minted) ||
    !Number.isInteger(value.pid) ||
    value.line?.contract !== 'maya.widget-mint-provenance/1' ||
    typeof value.line.intent_token_hash !== 'string' ||
    typeof value.line.trigger !== 'string' ||
    !(value.line.request_id === null || typeof value.line.request_id === 'string')
  ) {
    violation('V-SCHEMA', { at: `mint:${index}` }, 'a mint provenance line is malformed');
    continue;
  }
  const byHash = minted[value.entry];
  const hash = value.line.intent_token_hash;
  if (!byHash.has(hash)) byHash.set(hash, []);
  byHash.get(hash).push({ ...value.line, pid: value.pid });
  pidsOf[value.entry].add(value.pid);
}
for (const line of lines) pidsOf[line.entry].add(line.pid);

const beforeTeardown = new Set();
for (const { text, index } of readJsonl(databaseFile)) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    violation('V-SCHEMA', { at: `database:${index}` }, 'a database line is not JSON');
    continue;
  }
  if (value?.contract !== 'maya.widgets-evidence-database/1' || !Array.isArray(value.intent_token_hashes)) {
    violation('V-SCHEMA', { at: `database:${index}` }, 'a database line is malformed');
    continue;
  }
  for (const hash of value.intent_token_hashes) beforeTeardown.add(hash);
}

// ── source scans ──────────────────────────────────────────────────────────────────────────────────────────────
const sourceText = new Map();
const readSource = (relative) => {
  if (!sourceText.has(relative)) {
    const file = path.resolve(sourceRoot, relative);
    sourceText.set(
      relative,
      file.startsWith(sourceRoot + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
        ? fs.readFileSync(file, 'utf8')
        : null,
    );
  }
  return sourceText.get(relative);
};

const allowed = (form, target, relative) =>
  OVERRIDE_ALLOWLIST.some(
    (entry) =>
      entry.form === form &&
      entry.target === target &&
      entry.files.some((f) => (f.endsWith('/') ? relative.startsWith(f) : relative === f)),
  );

const REPLACING_MOCK = String.raw`mock(?:Implementation|ReturnValue|ResolvedValue|RejectedValue)(?:Once)?|mockReturnThis|mockReset`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Override and stub findings in one file: `{ rule, reason }[]`. */
const scanOverrides = (relative, text) => {
  const found = [];
  const flag = (form, target, what) => {
    if (MODEL_TRANSPORT.test(target) || MODEL_TRANSPORT.test(what))
      found.push({ rule: 'V-MODEL-STUB', reason: `${relative}: ${what} replaces the model transport` });
    else if (!allowed(form, target, relative))
      found.push({ rule: 'V-OVERRIDE', reason: `${relative}: ${what} is not in the allowlist` });
  };
  // Nest testing overrides.
  for (const m of text.matchAll(/\.override(Provider|Guard|Interceptor|Filter|Pipe|Module)\(\s*([^)]*?)\s*\)/g)) {
    const target = m[2].trim();
    flag(`override${m[1]}`, target, `.override${m[1]}(${target})`);
  }
  // A provider bound in a `providers` array (`{ provide: X, useValue | useClass | useFactory | useExisting }`).
  for (const m of text.matchAll(/\bprovide\s*:\s*([^,}]+?)\s*,[^{}]*?\buse(Value|Class|Factory|Existing)\s*:/g))
    flag('provide', m[1].trim(), `{ provide: ${m[1].trim()}, use${m[2]} }`);
  // Module mocks: none is allowed.
  for (const m of text.matchAll(
    /\bjest\s*\.\s*(mock|doMock|unstable_mockModule|setMock|createMockFromModule|genMockFromModule|enableAutomock)\s*\(\s*([^,)]*)/g,
  ))
    flag('module-mock', m[2].trim(), `jest.${m[1]}(${m[2].trim()})`);
  // A replaced property.
  for (const m of text.matchAll(/\bjest\s*\.\s*replaceProperty\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,/g))
    flag('replaceProperty', `${m[1]}.${m[2].replace(/['"`]/g, '')}`, `jest.replaceProperty(${m[1]}, ${m[2]})`);
  // Spies: a chained replacing mock, or a spy held in a variable and replaced in a later statement.
  const spyTarget = (receiver, method) => `${receiver.trim()}.${method.trim().replace(/^['"`]|['"`]$/g, '')}`;
  for (const m of text.matchAll(
    new RegExp(
      String.raw`\bspyOn\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*(?:,\s*['"\x60]\w+['"\x60]\s*)?\)\s*\.\s*(?:${REPLACING_MOCK})\b`,
      'g',
    ),
  ))
    flag('spy', spyTarget(m[1], m[2]), `a replacing spy on ${spyTarget(m[1], m[2])}`);
  for (const m of text.matchAll(
    /\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:jest\s*\.\s*)?spyOn\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*(?:,\s*['"`]\w+['"`]\s*)?\)\s*;/g,
  ))
    if (new RegExp(String.raw`\b${escapeRegExp(m[1])}\s*\.\s*(?:${REPLACING_MOCK})\s*\(`).test(text))
      flag('spy', spyTarget(m[2], m[3]), `a replacing spy on ${spyTarget(m[2], m[3])} (through ${m[1]})`);
  // A member assigned on a resolved provider, directly or through a variable, or on a prototype.
  for (const m of text.matchAll(/\.(?:get|resolve)\(\s*([\w.]+)[^)]*\)\s*\.\s*(\w+)\s*=(?![=>])/g))
    flag('assign', `${m[1]}.${m[2]}`, `a member assigned on a resolved ${m[1]} (.${m[2]} =)`);
  for (const m of text.matchAll(
    /\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?[\w.]*\.(?:get|resolve)\(\s*([\w.]+)[^)]*\)\s*;/g,
  ))
    for (const a of text.matchAll(new RegExp(String.raw`\b${escapeRegExp(m[1])}\s*\.\s*(\w+)\s*=(?![=>])`, 'g')))
      flag('assign', `${m[2]}.${a[1]}`, `a member assigned on a resolved ${m[2]} through ${m[1]} (.${a[1]} =)`);
  for (const m of text.matchAll(
    /\bObject\s*\.\s*(?:assign|defineProperty|defineProperties)\s*\(\s*[^,]*?\.(?:get|resolve)\(\s*([\w.]+)[^)]*\)/g,
  ))
    flag('assign', m[1], `Object.assign/defineProperty on a resolved ${m[1]}`);
  for (const m of text.matchAll(/\b([A-Z]\w*)\s*\.\s*prototype\s*\.\s*(\w+)\s*=(?![=>])/g))
    flag('assign', `${m[1]}.prototype.${m[2]}`, `${m[1]}.prototype.${m[2]} assigned`);
  if (/\bcontrolledFixtureMode\b/.test(text))
    found.push({ rule: 'V-CONTROLLED', reason: `${relative} sets controlledFixtureMode` });
  return found;
};

const SUPPORT_DIR = 'test/widgets-live/support';
/** Every `.ts` file under a directory, recursively, relative to the source root, sorted. */
const tsFilesUnder = (relativeDir) => {
  const root = path.join(sourceRoot, relativeDir);
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const next = path.join(absolute, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile() && entry.name.endsWith('.ts'))
        out.push(path.relative(sourceRoot, next).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
};
const HARNESS_FILES = [...tsFilesUnder(SUPPORT_DIR), 'scripts/widgets-intent-http-proof.ts'];
for (const relative of HARNESS_FILES) {
  const text = readSource(relative);
  if (text !== null) for (const f of scanOverrides(relative, text)) violation(f.rule, null, f.reason);
}

/** What a claim's source file (or a helper it imports) may not do (V-FIXTURE-WRITE). */
const FIXTURE_WRITES = [
  [/\.\s*widget\s*\(/, 'calls Fixtures.widget'],
  [/\.\s*synthetic\s*\(/, 'calls Fixtures.synthetic'],
  [/\bWidgetEmitterService\b|\bemitter\s*\.\s*emit\s*\(/, 'reaches the widget emitter'],
  [/\brecordWriter\b|\bWidgetRecordWriter\b|\bwriteRecord\s*\(|\bWidgetStoresService\b/, 'reaches the record writer or the stores facade'],
  [
    /\.\s*widget[A-Z]\w*\s*\.\s*(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    'writes a widget model',
  ],
  [/\$(?:executeRaw|queryRaw)(?:Unsafe)?\b/, 'runs raw SQL'],
  [
    /\bnew\s+PrismaClient\b|\bPrismaPg\b|\bfrom\s+['"]pg['"]|\brequire\(\s*['"]pg['"]\s*\)|\bdatabaseUrl\b|\bDATABASE_URL\b/,
    'opens its own database client',
  ],
  [
    /WidgetMintProvenance|WIDGET_MINT_PROVENANCE_CONTEXT|MintProvenanceSink|parseMintProvenance|claimBinStdoutCapture/,
    'names the mint provenance context or its capture',
  ],
  [
    /\bnew\s+(?:Console)?Logger\s*\(|\bLogger\s*\.\s*overrideLogger\b|\buseLogger\s*\(/,
    'constructs or replaces a logger (a mint provenance context can be forged through one)',
  ],
  [
    /\.\s*mintProvenance(?:Refused)?\s*\(\s*['"]|\bdatabaseBeforeTeardown\s*\(|mint-provenance\.jsonl|database-before-teardown\.jsonl|evidence-manifest\.jsonl|\bWIDGETS_EVIDENCE_DIR\b|\bnew\s+EvidenceWriter\b/,
    "touches the evidence directory's files or writer",
  ],
  [/\bJEST_WORKER_ID\b|\bglobalThis\s*\.\s*(?:jest|expect)\b|\brequire\s*\.\s*cache\b/, 'fakes the jest environment or the module cache'],
  [/\beval\s*\(|\bnew\s+Function\s*\(|\bvm\s*\.|\brunIn(?:This|New)?Context\b/, 'loads code dynamically'],
];

/** Relative imports of one file, resolved to files under the source root (outside `support/` and `src/`). */
const importsOf = (relative, text) => {
  const found = [];
  for (const m of text.matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(relative), m[1]));
    const candidate = [base, `${base}.ts`, `${base}.js`, `${base}/index.ts`].find((c) => readSource(c) !== null);
    if (candidate && !candidate.startsWith(`${SUPPORT_DIR}/`) && !candidate.startsWith('src/')) found.push(candidate);
  }
  return found;
};

/** The claim's source and every helper it reaches through relative imports (outside support/ and src/). */
const claimFiles = (source) => {
  const seen = new Set();
  const queue = [source];
  while (queue.length > 0 && seen.size < 50) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    const text = readSource(next);
    if (text === null) continue;
    seen.add(next);
    queue.push(...importsOf(next, text));
  }
  return [...seen];
};

const tamperColumns = (label) =>
  TAMPER_LABEL.exec(label)[1]
    .split(/[,;]/)
    .map((part) => part.split('=')[0].trim())
    .filter((part) => part !== '')
    .map((part) => {
      const pieces = part
        .split('.')
        .map(ident)
        .filter((p) => p !== '');
      return { raw: part, model: pieces.length > 1 ? pieces[pieces.length - 2] : null, column: pieces[pieces.length - 1] };
    })
    .filter((c) => c.column !== undefined);
const sealed = ({ model, column }) =>
  model !== null && SEALED_BY_MODEL.has(model) ? SEALED_BY_MODEL.get(model).has(column) : SEALED_ANYWHERE.has(column);

// ── per-line rules ────────────────────────────────────────────────────────────────────────────────────────────
const clean = new Map(); // `${test id}|${entry}` → sorted clauses of a clean L line with its own record
for (const line of lines) {
  const before = violations.length;
  const claimed = line.claim !== null;
  const strictClaim = line.claim === 'L' || line.claim === 'L-T';

  if (inventoryKeys)
    for (const key of line.clauses)
      if (!inventoryKeys.has(key)) violation('V-INVENTORY', line, `clause ${key} is not in the inventory`);

  if (claimed && line.entry === 'GW') violation('V-GW', line, 'a GW line is never evidence');

  if (strictClaim && line.record_hash === null)
    violation('V-PROV-RECORD', line, `an ${line.claim} claim names no record, so nothing about it can be traced`);

  if (line.record_hash !== null) {
    const mints = minted[line.entry]?.get(line.record_hash) ?? [];
    if (mints.length !== 1)
      violation(
        'V-PROV-MINT',
        line,
        mints.length === 0
          ? `record ${line.record_hash} has no server WidgetMintProvenance line at entry ${line.entry}`
          : `record ${line.record_hash} has ${mints.length} server WidgetMintProvenance lines at entry ${line.entry}, not one`,
      );
    if (!beforeTeardown.has(line.record_hash))
      violation('V-PROV-DB', line, `record ${line.record_hash} was not in the database before teardown`);
    if (claimed && mints.length === 1) {
      const [mint] = mints;
      if (!PRODUCTION_TRIGGERS.has(mint.trigger))
        violation(
          'V-PROV-TRIGGER',
          line,
          mint.trigger === 'successor'
            ? `record ${line.record_hash} is a successor mint; its predecessor is not named, so the skeleton cannot trace it`
            : `record ${line.record_hash} was minted by trigger ${JSON.stringify(mint.trigger)}, not a production trigger`,
        );
      if (line.trigger_trace_id === null || line.trigger_trace_id !== mint.request_id)
        violation(
          'V-PROV-TRACE',
          line,
          `trigger trace ${JSON.stringify(line.trigger_trace_id)} is not the mint line's request id ${JSON.stringify(mint.request_id)}`,
        );
      if (mint.pid !== line.pid)
        violation('V-PROV-PID', line, `the line was written by process ${line.pid}, its mint line captured by ${mint.pid}`);
    }
  }

  if (claimed) {
    if (line.entry === 'HTTP' && !HTTP_CLAIM_SOURCE.test(line.source))
      violation('V-ENTRY-SOURCE', line, `an HTTP claim's source ${line.source} is not a widgets-live spec outside support/`);
    if (line.entry === 'BIN' && !BIN_CLAIM_SOURCE.test(line.source))
      violation('V-ENTRY-SOURCE', line, `a BIN claim's source ${line.source} is not a scripts/widgets-http-proof cases file`);
    const other = line.entry === 'HTTP' ? 'BIN' : line.entry === 'BIN' ? 'HTTP' : null;
    if (other && pidsOf[other].has(line.pid))
      violation('V-PROCESS', line, `process ${line.pid} wrote lines of both ${line.entry} and ${other}`);
  }

  const tamperLabels = line.labels.filter((label) => TAMPER_LABEL.test(label));
  const indepLabels = line.labels.filter((label) => INDEP_LABEL.test(label));
  if (claimed && line.claim !== 'L-T' && tamperLabels.length + indepLabels.length > 0)
    violation(
      'V-LABEL-CLASS',
      line,
      `${[...tamperLabels, ...indepLabels].join(' ')} on an ${line.claim} claim: tamper and independence evidence are L-T only`,
    );
  if (line.claim === 'L' && !line.labels.some((label) => L_LABELS.has(label)))
    violation('V-LABEL-CLASS', line, 'an L claim carries no [E-MINT], [E-HOSTILE] or [E-DRIFT] label');
  if (line.claim === 'L-T' && !line.labels.some((label) => LT_LABEL.test(label)))
    violation('V-LABEL-CLASS', line, 'an L-T claim carries no [E-TAMPER:…] or [E-INDEP] label');

  const columns = tamperLabels.flatMap((label) => {
    const parsed = tamperColumns(label);
    if (parsed.length === 0) violation('V-SCHEMA', line, `${label} names no column`);
    const beyondFloor = parsed.filter((c) => c.column !== FLOOR_COMPANION);
    if (beyondFloor.length > 1)
      violation('V-TAMPER-SHAPE', line, `${label} names ${beyondFloor.length} columns; an E-TAMPER writes one (plus the floor)`);
    return parsed;
  });
  const sealedTampers = columns.filter(sealed);
  const g1aAlone = line.clauses.length > 0 && line.clauses.every((key) => key === 'G1-a');
  if (sealedTampers.length > 0 && !g1aAlone)
    violation(
      'V-TAMPER-SEALED',
      line,
      `E-TAMPER on seal-read column(s) ${sealedTampers.map((c) => c.raw).join(', ')} (only G1-a may)`,
    );

  if (strictClaim && line.labels.some((label) => SYNTHETIC_LABELS.has(label.trim().toLowerCase())))
    violation('V-SYNTH-CLAIM', line, 'a synthetic or RI label on an L/L-T claim');

  if (line.claim === 'L-T' && line.clauses.some((key) => /^(9|10)\./.test(key)))
    violation('V-LT-G9-G10', line, 'L-T is never admitted for Gate 9 or Gate 10');

  if (line.claim === 'U' || line.claim === 'L-T')
    violation('V-UNVERIFIED', line, `${line.claim} claims are not verifiable by the skeleton verifier (A-W5)`);

  if (claimed) {
    if (readSource(line.source) === null) violation('V-SCHEMA', line, `source ${line.source} does not exist`);
    for (const file of claimFiles(line.source)) {
      const text = readSource(file);
      for (const f of scanOverrides(file, text)) violation(f.rule, line, f.reason);
      const writes = FIXTURE_WRITES.filter(([pattern]) => pattern.test(text)).map(([, what]) => what);
      if (writes.length > 0)
        violation(
          'V-FIXTURE-WRITE',
          line,
          `${file}${file === line.source ? '' : ` (imported by ${line.source})`} ${writes.join('; ')}`,
        );
    }
    if (!line.labels.some((label) => EVIDENCE_LABEL.test(label)))
      violation('V-SCHEMA', line, 'a claim carries no evidence label');
  }

  if (violations.length === before && line.claim === 'L' && line.record_hash !== null)
    clean.set(`${line.test_id}|${line.entry}`, [...line.clauses].sort().join(','));
}

for (const line of lines)
  if (line.claim === 'L') {
    const other = line.entry === 'HTTP' ? 'BIN' : 'HTTP';
    const mine = [...line.clauses].sort().join(',');
    if (clean.get(`${line.test_id}|${other}`) !== mine)
      violation(
        'V-L-PAIR',
        line,
        `an L claim needs a clean HTTP line and a clean BIN line for ${line.test_id}, each with its own record and the clauses [${mine}]`,
      );
  }

const report = {
  contract: 'maya.widgets-evidence-verify/1',
  manifest: manifestFile,
  manifest_sha256: fs.existsSync(manifestFile)
    ? crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex')
    : null,
  inventory: inventoryKeys ? inventoryFile : null,
  lines: lines.length,
  claims: lines.filter((l) => l.claim !== null).length,
  captured_mints: {
    HTTP: [...minted.HTTP.values()].flat().length,
    BIN: [...minted.BIN.values()].flat().length,
  },
  refused_mints: refusals,
  records_before_teardown: beforeTeardown.size,
  harness_files_scanned: HARNESS_FILES.filter((f) => readSource(f) !== null).length,
  violations,
};
process.stdout.write(`${JSON.stringify(report)}\n`);
process.stdout.write(
  `WIDGETS EVIDENCE VERIFY: ${lines.length} line(s), ${report.claims} claim(s), ${violations.length} violation(s)\n`,
);
process.exit(violations.length === 0 ? 0 : 1);
