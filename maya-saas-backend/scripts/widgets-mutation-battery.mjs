#!/usr/bin/env node
// The widget gates' mutation battery runner (plan §4.5; GATES-PLAN-V11 I-HAR, review findings 21 and 24).
//
// Follows `docs/rebuild/evidence/maya-chat-first-ux/f88-mutation-battery.sh`: a check that cannot fail is
// not a check, so every declared mutant must turn a named test red. Each gate unit owns its battery in
// `test/widgets-live/mutations/gate<id>.json`; with none declared the runner reports EMPTY, which is not evidence.
//
// A battery file is a JSON array of mutants:
//   { "id": "M1",                                   unique within the file
//     "edits": [{ "file": "src/widgets/gates/gate6.ts", "find": "…", "replace": "…" }, …],
//                                                    one or more textual patches, applied in order; each `find` must
//                                                    occur exactly once in the file AT ITS TURN. A path is relative
//                                                    to maya-saas-backend and may leave it (`../docs/…`), never the
//                                                    repository or `.git`. The single-edit form `file`/`find`/
//                                                    `replace` on the mutant itself is still read.
//     "killers": ["T-PENDING8", { "test": "G2-IN [HTTP] …", "neutralisers": "N2" }, "k3", …],
//                                                    a jest test-title prefix, "k3", "typecheck:widgets-live", or an
//                                                    [E-INDEP] killer naming the neutraliser set it runs on
//     "expect": "live-killed" | "build-killed" | "pending",   what the unit claims (default live-killed)
//     "equivalent": "reason" }                       optional: declared equivalent, never run
//
// Neutraliser sets live beside the batteries in `neutralisers.json`: `{ "N2": { "description": "…", "edits": […] } }`.
// A killer bound to a set runs on a mirror with the set's edits applied FIRST and the mutant's edits after them. The
// set is also run ONCE alone (its control): a killer that already fails on the neutralised-but-unmutated copy proves
// nothing and is reported `vacuous`, never counted as a kill, and failures the neutraliser alone causes are not
// counted as unexpected. Plain killers get the same control: one UNMUTATED mirror per steps set (the baseline). A
// killer already red on the baseline is `vacuous` too, and the baseline's own failures are not unexpected. Without it
// a check that is red in every mirror (a path that resolves differently through the mirror's links, a standing red
// unit test) credited every mutant naming it as killed (CKPT-W0 review finding 4).
//
// A killer names a test by its title's leading words, matched as a whole token: the title equals the killer, or starts
// with it followed by a character that cannot continue an id (not a letter, digit, `_`, `.` or `-`). `TAB-1` therefore
// matches `TAB-1 CHANNEL_TIER …` and never `TAB-10 …` (CKPT-W0 review finding 7).
//
// For each mirror the runner copies maya-saas-backend (node_modules, dist, coverage and .git excepted) to ONE stable
// temporary path, links node_modules and every other top-level entry of the repository (the suites read the
// contract, the workflows, the PWA sources), materialises only the linked path a patch touches, applies the patches
// there, and runs the steps. It never edits the repository. The mirror path and jest's `--cacheDirectory` are stable
// across mutants and runs, so ts-jest reuses its content-hash cache (finding 24 (d)); a lock beside the mirror keeps
// two runners apart.
//
// Steps: `--steps` applies the given steps to every mutant. Without it each mutant runs the steps of its declaration
// (finding 24 (e)): `live` for live-killed and pending mutants, `unit,typecheck,k3` for build-killed ones.
//
// Statuses:
//   live-killed    a declared killer failed in `test:widgets:live`
//   build-killed   a declared killer failed only in `npm test`, `typecheck:widgets-live` or k3
//   pending        the unit declared `expect: "pending"` and nothing failed (its killer is XF/TODO)
//   equivalent     declared, not run
//   SURVIVED       nothing a killer names failed
//   UNEXPECTED     something failed, but no declared killer
// Every kill carries its killer's entry level, read from the failing test's `[GW]`, `[HTTP]` or `[BIN]` tag (title
// first, then the innermost describe); k3/typecheck/unit kills are BUILD. Only an `[HTTP]` kill in the live step is
// marked `evidence: true` (§3.2); a mutant's `live_evidence` says whether it has one.
// Exit 0 when every mutant's status equals its declared expectation; 1 otherwise; 2 on a usage error.
//
//   node scripts/widgets-mutation-battery.mjs [--gate <id>] [--mutations <dir>] [--steps unit,typecheck,k3,live]
//        [--live-tests <path>] [--live-filter <name pattern>] [--unit-tests <path>]
//        [--out <report.json>] [--dry-run] [--keep]
//   node scripts/widgets-mutation-battery.mjs --self-test      (HAR-11; needs DATABASE_URL like a live run)
//   node scripts/widgets-mutation-battery.mjs --shards "<id,id,…>"   prints `gates=<JSON array>` for the CI matrix:
//        the requested battery ids (each must exist), or every declared battery when the list is empty, or ["*"]
//        (one shard running every battery, which reports EMPTY) when none is declared
//   --keep copies the mirror of a mutant whose status differs from its declaration aside, for inspection.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const REPO = path.resolve(BACKEND, '..');
const SKIPPED = new Set(['node_modules', 'dist', 'coverage', '.git']);
const STEPS = ['unit', 'typecheck', 'k3', 'live'];
const KEY = crypto.createHash('sha1').update(BACKEND).digest('hex').slice(0, 10);
const MIRROR_ROOT = path.join(os.tmpdir(), `widgets-mutation-mirror-${KEY}`);
const LOCK = `${MIRROR_ROOT}.lock`;
const JEST_CACHE = path.join(os.tmpdir(), `widgets-mutation-jest-cache-${KEY}`);

const usage = (message) => {
  process.stderr.write(`widgets-mutation-battery: ${message}\n`);
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

if (args.includes('--self-test')) selfTest();
if (args.includes('--shards')) shards();

const dryRun = args.includes('--dry-run');
const keep = args.includes('--keep');
const gate = option('--gate');
const mutationsDir = path.resolve(option('--mutations') ?? path.join(BACKEND, 'test/widgets-live/mutations'));
const out = option('--out');
const explicitSteps = option('--steps')?.split(',');
for (const step of explicitSteps ?? []) if (!STEPS.includes(step)) usage(`unknown step ${step}`);
const liveTests = option('--live-tests');
const liveFilter = option('--live-filter');
const unitTests = option('--unit-tests');

// ── edits: validation against the repository (read-only) ─────────────────────────────────────────────────────
const resolveEditTarget = (where, file) => {
  if (typeof file !== 'string' || file === '') usage(`${where}: an edit needs a file`);
  const target = path.resolve(BACKEND, file);
  const inside = (dir) => target === dir || target.startsWith(dir + path.sep);
  if (!inside(REPO) || inside(path.join(REPO, '.git')) || inside(path.join(BACKEND, 'node_modules')))
    usage(`${where}: ${file} is outside the repository or under .git/node_modules`);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) usage(`${where}: ${file} does not exist`);
  return target;
};

const normaliseEdits = (where, value) => {
  if (!Array.isArray(value) || value.length === 0) usage(`${where}: edits must be a non-empty array`);
  return value.map((e, i) => {
    if (typeof e?.find !== 'string' || typeof e?.replace !== 'string' || e.find === '')
      usage(`${where}: edit ${i + 1} needs find and replace`);
    return { file: e.file, find: e.find, replace: e.replace, target: resolveEditTarget(`${where} edit ${i + 1}`, e.file) };
  });
};

/** Applies `edits` in order to virtual file contents; each find must occur exactly once at its turn. */
const simulate = (where, edits) => {
  const contents = new Map();
  for (const e of edits) {
    const text = contents.get(e.target) ?? fs.readFileSync(e.target, 'utf8');
    const occurrences = text.split(e.find).length - 1;
    if (occurrences !== 1) usage(`${where}: find occurs ${occurrences} times in ${e.file} at its turn, not once`);
    contents.set(e.target, text.replace(e.find, () => e.replace));
  }
  return contents;
};

// ── every killer id must resolve to a TEST (CKPT-W1 review finding 9) ─────────────────────────────────────────
//
// A kill is credited by `killerMatches(failingTest.title, killer.test)` — against the `it` TITLE alone,
// never against the `describe` that encloses it. So an id that lives only on a `describe` can never be
// credited: whatever it catches is reported UNEXPECTED with an empty kill list, and a mutant it really
// does kill looks like a mutant nothing kills. That is how `T-SRC-INV30` came to be added to
// `gate-antecedents.inv30.spec.ts` (R8R-3) and written up as carrying `gate8r.json#M21` when it could
// carry nothing at all. A dead `find` anchor already fails the load (`simulate`); a dead killer id now
// fails it the same way, or a battery reports a health it does not have.
//
// The check is a leading-token match over every `it`/`test` title in the repository's specs, using the
// SAME predicate the crediting code uses, so the two cannot disagree.
//
// `it.each` needs one extra step, and it is not a loophole. Jest substitutes the table's row into the
// title, so `it.each([['T-NULL-OBJ', …], ['T-NULL-EMPTY', …]])('%s [GW]: …')` really does produce two
// tests whose titles BEGIN with those ids, and `gate8.json`'s killers name them. The parameter only
// counts when the title actually interpolates (`%s`, `%d`, `$name`, …); a templated title with no
// placeholder, and every plain string in a table that is not interpolated, is ignored. This is why
// `T-SRC-INV30` is still rejected: it appears in a `describe` title, which jest never substitutes.
const NON_TEST_KILLERS = ['typecheck:widgets-live', 'k3'];
const SPEC_ROOTS = ['src', 'test'];
// A quoted literal, with the quote as group `before + 1` and the text as group `before + 2`. The
// offset is not decoration: the back-reference that closes the quote must name its OWN group, and a
// pattern with a capture in front of it renumbers every group after it.
const stringLiteral = (before) => {
  const quote = before + 1; // the group the closing back-reference must name
  return `(['"\`])((?:\\\\.|(?!\\${quote})[^\\\\])*)\\${quote}`;
};
const TITLE_CALL = new RegExp(
  String.raw`\b(?:it|test)(?:\.(?:failing|only|skip|concurrent))?\s*\(\s*` + stringLiteral(0),
  'g',
);
const EACH_CALL = new RegExp(
  String.raw`\b(?:it|test)\.each\s*\(([\s\S]*?)\)\s*\(\s*` + stringLiteral(1),
  'g',
);
const INTERPOLATES = /%[sdifjop#%]|\$[A-Za-z_]/;

const specTitles = () => {
  const titles = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '.git') walk(full);
        continue;
      }
      if (!/\.(?:spec|live-spec)\.ts$/.test(e.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const m of text.matchAll(TITLE_CALL)) titles.push(m[2]);
      for (const m of text.matchAll(EACH_CALL)) {
        const [table, , title] = [m[1], m[2], m[3]];
        titles.push(title);
        // The rows jest will substitute into the title, so a killer may name a row's own id.
        if (INTERPOLATES.test(title))
          for (const row of table.matchAll(new RegExp(stringLiteral(0), 'g'))) titles.push(row[2]);
      }
    }
  };
  for (const root of SPEC_ROOTS) walk(path.join(BACKEND, root));
  return titles;
};

let SPEC_TITLES = null;
const killerResolves = (killer) => {
  if (NON_TEST_KILLERS.includes(killer)) return true;
  SPEC_TITLES ??= specTitles();
  return SPEC_TITLES.some((title) => killerMatches(title, killer));
};

// ── load and validate the batteries and the neutraliser sets (read-only) ──────────────────────────────────────
const readJson = (file, what) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return usage(`${what} is not JSON: ${error.message}`);
  }
};

const neutraliserFile = path.join(mutationsDir, 'neutralisers.json');
const neutralisers = {};
if (fs.existsSync(neutraliserFile)) {
  const sets = readJson(neutraliserFile, 'neutralisers.json');
  if (!sets || typeof sets !== 'object' || Array.isArray(sets)) usage('neutralisers.json is not an object of sets');
  for (const [name, set] of Object.entries(sets)) {
    if (!/^[A-Za-z0-9-]+$/.test(name)) usage(`neutraliser set name ${JSON.stringify(name)} is not an id`);
    neutralisers[name] = { description: set?.description ?? '', edits: normaliseEdits(`neutralisers.json#${name}`, set?.edits) };
    simulate(`neutralisers.json#${name}`, neutralisers[name].edits);
  }
}

const batteryFiles = fs.existsSync(mutationsDir)
  ? fs
      .readdirSync(mutationsDir)
      .filter((name) => /^gate[0-9A-Za-z-]+\.json$/.test(name))
      .filter((name) => gate === undefined || name === `gate${gate}.json`)
      .sort()
  : [];

// A battery requested by name must exist. `--shards` already refuses an id it cannot find; the run path did not,
// so the filter above selected nothing, `mutants` stayed empty, and the runner reported EMPTY and exited 0 — a
// mistyped or stale id (`--gate gate7` for `--gate 7`, a renamed battery) read as a battery that had run green.
// That is the "check that cannot fail" this file exists to forbid, and it is how gate 7's battery was recorded
// as run when it never ran (CKPT-W1 closing regression). EMPTY stays exit 0 only when nothing is DECLARED.
if (gate !== undefined && batteryFiles.length === 0) usage(`no battery gate${gate}.json is declared`);

const mutants = [];
for (const name of batteryFiles) {
  const entries = readJson(path.join(mutationsDir, name), name);
  if (!Array.isArray(entries)) usage(`${name} is not an array of mutants`);
  const ids = new Set();
  for (const m of entries) {
    const where = `${name}#${m?.id ?? '?'}`;
    if (typeof m?.id !== 'string' || ids.has(m.id)) usage(`${where}: missing or duplicate id`);
    ids.add(m.id);
    if (typeof m.equivalent === 'string') {
      mutants.push({ battery: name, id: m.id, equivalent: m.equivalent });
      continue;
    }
    const edits = normaliseEdits(where, m.edits ?? (m.file === undefined ? undefined : [{ file: m.file, find: m.find, replace: m.replace }]));
    if (!Array.isArray(m.killers) || m.killers.length === 0) usage(`${where}: killers are required`);
    const killers = m.killers.map((k) => {
      if (typeof k === 'string' && k !== '') return { test: k, neutralisers: null };
      if (typeof k?.test === 'string' && k.test !== '' && typeof k.neutralisers === 'string') {
        if (!(k.neutralisers in neutralisers)) usage(`${where}: killer ${k.test} names unknown neutraliser set ${k.neutralisers}`);
        return { test: k.test, neutralisers: k.neutralisers };
      }
      return usage(`${where}: a killer is a string or { test, neutralisers }`);
    });
    for (const k of killers)
      if (!killerResolves(k.test))
        usage(
          `${where}: killer ${k.test} names no test — no it()/test() title in src/ or test/ begins with it as a whole token (an id on a describe cannot be credited)`,
        );
    const expect = m.expect ?? 'live-killed';
    if (!['live-killed', 'build-killed', 'pending'].includes(expect)) usage(`${where}: unknown expect ${expect}`);
    const sets = [...new Set(killers.map((k) => k.neutralisers))];
    for (const set of sets) simulate(`${where}${set ? ` on ${set}` : ''}`, [...(set ? neutralisers[set].edits : []), ...edits]);
    const steps = explicitSteps ?? (expect === 'build-killed' ? ['unit', 'typecheck', 'k3'] : ['live']);
    mutants.push({ battery: name, id: m.id, edits, killers, expect, steps });
  }
}

const report = {
  contract: 'maya.widgets-mutation-battery/2',
  startedAt: new Date().toISOString(),
  batteries: batteryFiles,
  neutraliser_sets: Object.keys(neutralisers),
  steps: explicitSteps ?? 'per mutant (live for live-killed/pending; unit,typecheck,k3 for build-killed)',
  restrictions: { live_tests: liveTests ?? null, live_filter: liveFilter ?? null, unit_tests: unitTests ?? null },
  mirror: MIRROR_ROOT,
  jest_cache: JEST_CACHE,
  neutraliser_controls: {},
  baseline_controls: {},
  mutants: [],
};

const finish = (code) => {
  report.finishedAt = new Date().toISOString();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (out) fs.writeFileSync(out, text);
  process.stdout.write(text);
  releaseLock();
  process.exit(code);
};

let locked = false;
function releaseLock() {
  if (locked) fs.rmSync(LOCK, { recursive: true, force: true });
  locked = false;
}

if (mutants.length === 0) {
  report.status = 'EMPTY';
  report.note = 'no battery is declared; nothing ran and nothing is evidenced';
  finish(0);
}
if (dryRun) {
  report.status = 'DRY-RUN';
  report.mutants = mutants.map(({ battery, id, edits, killers, expect, steps, equivalent }) => ({
    battery,
    id,
    expect,
    equivalent,
    steps,
    edits: edits?.map((e) => e.file),
    killers,
  }));
  finish(0);
}

// ── the proof-database guard, the same module the jest harness uses ─────────────────────────────────────────
const guard = spawnSync(
  process.execPath,
  [
    path.join(BACKEND, 'node_modules/ts-node/dist/bin.js'),
    '--project',
    path.join(BACKEND, 'tsconfig.scripts.json'),
    '--transpile-only',
    '-e',
    "require('./test/widgets-live/support/proof-db-guard').assertProofDatabase(process.env)",
  ],
  { cwd: BACKEND, encoding: 'utf8', env: process.env },
);
if (guard.status !== 0) usage(`the proof-database guard refused DATABASE_URL:\n${guard.stderr}`);

// ── the lock: one runner per mirror path ─────────────────────────────────────────────────────────────────────
try {
  fs.mkdirSync(LOCK);
} catch {
  const holder = Number(fs.readFileSync(path.join(LOCK, 'pid'), { encoding: 'utf8', flag: 'a+' }) || 0);
  let alive = false;
  try {
    alive = holder > 0 && process.kill(holder, 0);
  } catch {
    alive = false;
  }
  if (alive) usage(`another battery runner (pid ${holder}) holds ${LOCK}`);
  fs.rmSync(LOCK, { recursive: true, force: true });
  fs.mkdirSync(LOCK);
}
locked = true;
fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
process.on('exit', releaseLock);

// ── one mirror ───────────────────────────────────────────────────────────────────────────────────────────────
const copyTree = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
};

/** Replaces the linked components of `target`'s path under `root` by real directories of links, and the file by a copy. */
const materialise = (root, target) => {
  const parts = path.relative(root, target).split(path.sep);
  let current = root;
  parts.forEach((part, i) => {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isSymbolicLink()) return;
    const real = fs.realpathSync(current);
    fs.unlinkSync(current);
    if (i === parts.length - 1) fs.copyFileSync(real, current);
    else {
      fs.mkdirSync(current);
      for (const child of fs.readdirSync(real)) fs.symlinkSync(path.join(real, child), path.join(current, child));
    }
  });
};

const buildMirror = (edits) => {
  fs.rmSync(MIRROR_ROOT, { recursive: true, force: true });
  const backend = path.join(MIRROR_ROOT, 'maya-saas-backend');
  copyTree(BACKEND, backend);
  fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(backend, 'node_modules'), 'dir');
  // The suites read repository files beside the backend. Those are linked, never copied, except the one path a
  // patch touches, which is materialised so the patch changes the mirror only.
  for (const entry of fs.readdirSync(REPO))
    if (entry !== 'maya-saas-backend' && entry !== '.git') fs.symlinkSync(path.join(REPO, entry), path.join(MIRROR_ROOT, entry));
  for (const e of edits) {
    const target = path.join(MIRROR_ROOT, path.relative(REPO, e.target));
    materialise(MIRROR_ROOT, target);
    const text = fs.readFileSync(target, 'utf8');
    if (text.split(e.find).length - 1 !== 1) throw new Error(`mirror: find does not occur once in ${e.file}`);
    fs.writeFileSync(target, text.replace(e.find, () => e.replace));
  }
  return backend;
};

/**
 * The failing tests of one jest `--json --outputFile` report, and what is wrong with the report itself.
 * A report that was never written, or that does not parse, is NOT an empty failure list: a jest run that dies
 * (a killed worker, an out-of-memory child) exits non-zero and writes nothing, and reading that as "nothing
 * failed" turns a crash into a SURVIVED mutant. Every such case is returned as a problem, and the caller makes
 * the mutant UNEXPECTED. A suite that could not run at all (`testExecError`, or a failed file with no failed
 * assertion) is a problem too: its tests never reported, so no killer in it could fail.
 */
const failedTests = (jsonFile, ran) => {
  if (!ran) return { failed: [], problems: [] };
  if (!fs.existsSync(jsonFile))
    return { failed: [], problems: [`${path.basename(jsonFile)}: jest wrote no report; the run did not finish`] };
  let result;
  try {
    result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  } catch (error) {
    return { failed: [], problems: [`${path.basename(jsonFile)}: the report does not parse (${String(error)})`] };
  }
  const files = result.testResults ?? [];
  return {
    failed: files.flatMap((file) =>
      file.assertionResults
        .filter((a) => a.status === 'failed')
        .map((a) => ({ title: a.title, ancestors: a.ancestorTitles ?? [], fullName: a.fullName ?? a.title })),
    ),
    problems: files
      .filter(
        (file) =>
          file.testExecError ||
          (file.status === 'failed' && !file.assertionResults.some((a) => a.status === 'failed')),
      )
      .map((file) => `${path.basename(jsonFile)}: the suite ${file.name} did not run to a result`),
  };
};

const run = (cwd, command, commandArgs) => {
  const r = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status ?? 1, tail: `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').slice(-20).join('\n') };
};

/** Whether a failing test's title is the one a killer names: the killer as a whole leading token (see the header). */
// A function declaration, so `selfTest()` (called before this line runs) can use it.
export function killerMatches(title, killer) {
  return title === killer || (title.startsWith(killer) && !/^[A-Za-z0-9_.-]/.test(title.slice(killer.length)));
}

/**
 * The entry tag from the title, else from the innermost describe that carries one; else null.
 *
 * CKPT-W1 review finding 7 widened the vocabulary past `[GW]`/`[HTTP]`/`[BIN]`. §1.0 declares five
 * more tags, and `[RI]` and `[G-SYNTH]` are the two that matter here: §0.5 says they never count as
 * evidence. Reading only three of the eight left an `[RI]` killer recorded as `entry: null`, which
 * reads as "unknown" when the test in fact SAYS what it is — 13 of gate 8-R's live-killed mutants
 * are killed by `[RI]` killers alone, and nothing in the artifact said so. A tag that is declared is
 * recorded; `null` now means the test really carries no tag.
 */
const ENTRY_TAGS = /\[(GW|HTTP|BIN|RI|G-SYNTH|BUILD|U)\]/;
export const entryLevel = (test) => {
  for (const text of [test.title, ...[...test.ancestors].reverse()]) {
    const m = ENTRY_TAGS.exec(text);
    if (m) return m[1];
  }
  return null;
};

/**
 * Why a kill is, or is not, marked `evidence` — CKPT-W1 review finding 7.
 *
 * The flag itself is right as far as it goes: §3.2 says "a live kill counts toward L/L-T only when
 * the failing killer is an `[HTTP]` test", and that is exactly what it reads. What it does NOT read
 * is the rest of §0.5's L: the record under test must be MINTED BY A PRODUCTION TRIGGER with D-17
 * provenance, and an L claim needs an HTTP line and a BIN line for the same test id. In Wave 1 no
 * such record exists anywhere — `test:widgets:http` reports `mint_provenance.captured = 0`, and
 * every `[HTTP]` killer here runs on a `Fixtures.widget`-minted record, which §0.5 L and §3.2 forbid
 * as evidence. So a reader of this artifact could take `live_evidence: true` for an L claim on
 * eleven mutants that carry none. The flag keeps its meaning and gains a BASIS that states the
 * meaning, so the artifact cannot be read for more than it measured.
 */
const evidenceBasis = (step, entry) =>
  step === 'live' && entry === 'HTTP'
    ? 'http-entry; §0.5 L also requires a trigger-minted record (D-17 provenance) and a BIN line for the same test id — NEITHER is verified by this runner'
    : null;

const runSteps = (edits, steps) => {
  const backend = buildMirror(edits);
  const unitJson = path.join(MIRROR_ROOT, 'unit.json');
  const liveJson = path.join(MIRROR_ROOT, 'live.json');
  // Never read a previous run's report: if this run's jest dies before writing, the file must be absent.
  for (const stale of [unitJson, liveJson]) fs.rmSync(stale, { force: true });
  const cache = `--cacheDirectory=${JEST_CACHE}`;
  const outcome = {};
  if (steps.includes('unit'))
    outcome.unit = run(backend, 'npx', ['jest', '--runInBand', cache, '--json', `--outputFile=${unitJson}`, ...(unitTests ? [unitTests] : [])]);
  if (steps.includes('typecheck')) outcome.typecheck = run(backend, 'npm', ['run', '-s', 'typecheck:widgets-live']);
  if (steps.includes('k3')) outcome.k3 = run(backend, process.execPath, ['scripts/k3-gateway-check.mjs']);
  if (steps.includes('live'))
    outcome.live = run(backend, 'npx', [
      'jest',
      '--config',
      './test/jest-widgets-live.json',
      '--runInBand',
      cache,
      '--json',
      `--outputFile=${liveJson}`,
      ...(liveFilter ? ['-t', liveFilter] : []),
      ...(liveTests ? [liveTests] : []),
    ]);
  const unit = failedTests(unitJson, steps.includes('unit'));
  const live = failedTests(liveJson, steps.includes('live'));
  return {
    outcome,
    unitFailed: unit.failed,
    liveFailed: live.failed,
    problems: [...unit.problems, ...live.problems],
  };
};

const controls = new Map();
/** The control of one killer group: the neutraliser set alone, or for plain killers (`set === null`) the unmutated baseline. */
const controlFor = (set, steps) => {
  const key = `${set ?? 'baseline'}|${steps.join(',')}`;
  if (!controls.has(key)) {
    const result = runSteps(set ? neutralisers[set].edits : [], steps);
    controls.set(key, result);
    (set ? report.neutraliser_controls : report.baseline_controls)[key] = {
      set,
      steps,
      exits: Object.fromEntries(Object.entries(result.outcome).map(([k, o]) => [k, o.status])),
      failed: [...result.unitFailed, ...result.liveFailed].map((t) => t.fullName),
      problems: result.problems,
    };
  }
  return controls.get(key);
};

let mismatches = 0;
for (const m of mutants) {
  if (typeof m.equivalent === 'string') {
    report.mutants.push({ battery: m.battery, id: m.id, status: 'equivalent', reason: m.equivalent });
    continue;
  }
  const kills = [];
  const vacuous = [];
  const tails = {};
  const exits = {};
  const problems = [];
  let unexplained = false;
  try {
    for (const set of [...new Set(m.killers.map((k) => k.neutralisers))]) {
      const group = m.killers.filter((k) => k.neutralisers === set);
      const control = controlFor(set, m.steps);
      const result = runSteps([...(set ? neutralisers[set].edits : []), ...m.edits], m.steps);
      const label = set ?? 'plain';
      exits[label] = Object.fromEntries(Object.entries(result.outcome).map(([k, o]) => [k, o.status]));
      tails[label] = Object.fromEntries(Object.entries(result.outcome).map(([k, o]) => [k, o.tail]));

      const controlTests = [...control.unitFailed, ...control.liveFailed];
      const controlFailed = new Set(controlTests.map((t) => t.fullName));
      for (const killer of group) {
        const onControl = controlTests.some((t) => killerMatches(t.title, killer.test));
        if (onControl) {
          vacuous.push({
            killer: killer.test,
            neutralisers: set,
            reason: set ? 'fails on the neutralised copy without the mutant' : 'fails on the unmutated baseline',
          });
          continue;
        }
        for (const [step, failed] of [
          ['live', result.liveFailed],
          ['unit', result.unitFailed],
        ])
          for (const t of failed.filter((x) => killerMatches(x.title, killer.test))) {
            const entry = step === 'live' ? entryLevel(t) : 'BUILD';
            const basis = evidenceBasis(step, entry);
            kills.push({ killer: killer.test, test: t.fullName, step, entry, neutralisers: set, evidence: basis !== null, evidence_basis: basis });
          }
        if (killer.test === 'typecheck:widgets-live' && result.outcome.typecheck?.status && !control.outcome.typecheck?.status)
          kills.push({ killer: killer.test, test: null, step: 'typecheck', entry: 'BUILD', neutralisers: set, evidence: false, evidence_basis: null });
        if (killer.test === 'k3' && result.outcome.k3?.status && !control.outcome.k3?.status)
          kills.push({ killer: killer.test, test: null, step: 'k3', entry: 'BUILD', neutralisers: set, evidence: false, evidence_basis: null });
      }

      // A report this run did not produce (a dead jest) makes the mutant unreadable, not innocent.
      problems.push(
        ...result.problems.map((p) => `${label}: ${p}`),
        ...control.problems.map((p) => `${label} control: ${p}`),
      );
      const newlyFailed = [...result.unitFailed, ...result.liveFailed].filter((t) => !controlFailed.has(t.fullName));
      const failingSteps = Object.entries(result.outcome).filter(
        ([step, o]) => o.status !== 0 && control.outcome[step]?.status === 0,
      );
      if (newlyFailed.length > 0 || failingSteps.length > 0 || result.problems.length > 0 || control.problems.length > 0)
        unexplained = true;
    }
  } catch (error) {
    tails.runner = String(error?.stack ?? error);
    unexplained = true;
  }

  const live = kills.some((k) => k.step === 'live');
  const status = live
    ? 'live-killed'
    : kills.length > 0
      ? 'build-killed'
      : unexplained
        ? 'UNEXPECTED'
        : m.expect === 'pending'
          ? 'pending'
          : 'SURVIVED';
  if (status !== m.expect) mismatches += 1;
  const entry = {
    battery: m.battery,
    id: m.id,
    files: [...new Set(m.edits.map((e) => e.file))],
    edits_applied: m.edits.length,
    neutralisers: [...new Set(m.killers.map((k) => k.neutralisers).filter(Boolean))],
    steps: m.steps,
    expect: m.expect,
    status,
    killedBy: [...new Set(kills.map((k) => k.killer))],
    kills,
    vacuous,
    ...(problems.length > 0 ? { problems } : {}),
    live_evidence: kills.some((k) => k.evidence),
    // The entry level of every killer that bit, counted. §0.5: a `[GW]`, `[RI]`, `[G-SYNTH]` or `[U]`
    // kill never counts as evidence, and `live_evidence` above says only that ONE killer was `[HTTP]`.
    // Printed per mutant so "25 live-killed" cannot be read as "25 killed at the route" — 13 of gate
    // 8-R's are killed by `[RI]` killers alone (CKPT-W1 review finding 7).
    kills_by_entry: kills.reduce((acc, k) => ({ ...acc, [k.entry ?? 'untagged']: (acc[k.entry ?? 'untagged'] ?? 0) + 1 }), {}),
    exits,
    ...(status === m.expect ? {} : { tails }),
  };
  if (keep && status !== m.expect) {
    const kept = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-mutant-kept-'));
    fs.cpSync(MIRROR_ROOT, kept, { recursive: true, verbatimSymlinks: true });
    entry.keptMirror = kept;
  }
  report.mutants.push(entry);
}
fs.rmSync(MIRROR_ROOT, { recursive: true, force: true });

report.status = mismatches === 0 ? 'AS-DECLARED' : 'MISMATCH';
report.mismatches = mismatches;
report.live_evidence_mutants = report.mutants.filter((x) => x.live_evidence).map((x) => `${x.battery}#${x.id}`);
// CKPT-W1 review finding 7: what `live_evidence` above does and does not assert, stated IN the artifact
// rather than in a report beside it, because the artifact is what a §3.3 re-audit reads.
report.evidence_rule = {
  flag_means: 'a declared killer tagged [HTTP] failed in the live step (§3.2)',
  not_verified_here: [
    "the record under test was minted by a production trigger, with D-17 provenance (§0.5 L) — in Wave 1 `test:widgets:http` reports mint_provenance.captured = 0 and every [HTTP] killer runs on a Fixtures.widget-minted record",
    'an L claim also needs a BIN line for the same test id (§0.5 L)',
  ],
  therefore: 'live_evidence is NOT an L or L-T claim on its own; `scripts/widgets-evidence-verify.mjs` over the WIDGETS_EVIDENCE manifest is what decides that (§3.3)',
};
finish(mismatches === 0 ? 0 : 1);

// ── the CI shard list (widgets-mutation.yml) ─────────────────────────────────────────────────────────────────
function shards() {
  const at = args.indexOf('--shards');
  const requested = (args[at + 1] ?? '').trim();
  const dir = path.join(BACKEND, 'test/widgets-live/mutations');
  const declared = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .map((name) => /^gate([0-9A-Za-z-]+)\.json$/.exec(name)?.[1])
        .filter(Boolean)
        .sort()
    : [];
  let ids;
  if (requested === '') ids = declared.length > 0 ? declared : ['*'];
  else {
    ids = [...new Set(requested.split(',').map((id) => id.trim()).filter(Boolean))];
    for (const id of ids) {
      if (!/^[0-9A-Za-z-]+$/.test(id)) usage(`shard id ${JSON.stringify(id)} is not a battery id`);
      if (!declared.includes(id)) usage(`no battery gate${id}.json is declared`);
    }
  }
  process.stdout.write(`gates=${JSON.stringify(ids)}\n`);
  process.exit(0);
}

// ── HAR-11: the runner's own self-test ───────────────────────────────────────────────────────────────────────
function selfTest() {
  const dir = path.join(BACKEND, 'test/widgets-live/mutations/selftest');
  const reportFile = path.join(os.tmpdir(), `widgets-mutation-selftest-${process.pid}.json`);
  const child = spawnSync(
    process.execPath,
    [
      path.join(HERE, 'widgets-mutation-battery.mjs'),
      '--mutations',
      dir,
      '--live-tests',
      'test/widgets-live/harness.live-spec.ts',
      '--live-filter',
      'HAR-11 probe',
      '--out',
      reportFile,
    ],
    { cwd: BACKEND, encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024 },
  );
  const checks = [];
  const expectThat = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  // Killer matching is by whole leading token (CKPT-W0 review finding 7): pure checks, no mirror needed.
  const matcherCases = [
    ['TAB-1 CHANNEL_TIER is total', 'TAB-1', true],
    ['TAB-10 no kind admits c', 'TAB-1', false],
    ['G6-15 totality', 'G6-1', false],
    ['T-DIV-10 row', 'T-DIV-1', false],
    ['HAR-3 [GW] the recorder', 'HAR-3 [GW]', true],
    ['HAR-11 probe [GW]: the target', 'HAR-11 probe [GW]', true],
    ['sees a model write, a raw write', 'sees a model write', true],
    ['10.R10 row', '10.R1', false],
    ['HAR-5', 'HAR-5', true],
    ['HAR-5b extra', 'HAR-5', false],
  ];
  const wrong = matcherCases.filter(([title, killer, expected]) => killerMatches(title, killer) !== expected);
  expectThat('killers match whole leading tokens only (TAB-1 never matches TAB-10)', wrong.length === 0, JSON.stringify(wrong));
  let r = null;
  try {
    r = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch {
    r = null;
  } finally {
    fs.rmSync(reportFile, { force: true });
  }
  expectThat('runner exit 0 and AS-DECLARED', child.status === 0 && r?.status === 'AS-DECLARED', `exit ${child.status}, ${r?.status}`);
  const byId = (id) => r?.mutants.find((x) => x.id === id);
  const m1 = byId('H11-M1');
  expectThat('H11-M1 two edits applied after neutraliser set NH', m1?.edits_applied === 2 && m1?.neutralisers?.join() === 'NH', JSON.stringify(m1?.neutralisers));
  expectThat('H11-M1 is live-killed by the probe', m1?.status === 'live-killed' && m1?.kills?.length === 1, m1?.status);
  expectThat(
    'H11-M1 kill tagged [GW], not evidence',
    m1?.kills?.[0]?.entry === 'GW' && m1?.kills?.[0]?.evidence === false && m1?.live_evidence === false,
    JSON.stringify(m1?.kills),
  );
  expectThat(
    'NH control ran once and the probe passed on it (not vacuous)',
    Object.keys(r?.neutraliser_controls ?? {}).length === 1 &&
      Object.values(r?.neutraliser_controls ?? {})[0]?.failed?.length === 0 &&
      (m1?.vacuous ?? []).length === 0,
    JSON.stringify(r?.neutraliser_controls),
  );
  expectThat(
    'the baseline control ran once for the plain killer and the probe passed on it',
    Object.keys(r?.baseline_controls ?? {}).length === 1 &&
      Object.values(r?.baseline_controls ?? {})[0]?.failed?.length === 0 &&
      (byId('H11-M3')?.vacuous ?? ['?']).length === 0,
    JSON.stringify(r?.baseline_controls),
  );
  expectThat('H11-M2 one edit on NH survives (pending): both edits are needed', byId('H11-M2')?.status === 'pending', byId('H11-M2')?.status);
  expectThat('H11-M3 both edits without NH survive (pending): the set is needed', byId('H11-M3')?.status === 'pending', byId('H11-M3')?.status);
  expectThat('no [GW] kill counted as live evidence', (r?.live_evidence_mutants ?? ['?']).length === 0, JSON.stringify(r?.live_evidence_mutants));
  // CKPT-W1 review finding 7: the artifact says what its evidence flag does NOT assert, and a kill
  // that is not [HTTP] carries no basis at all.
  expectThat(
    'the report states the evidence rule and its two unverified duties',
    (r?.evidence_rule?.not_verified_here ?? []).length === 2 && typeof r?.evidence_rule?.flag_means === 'string',
    JSON.stringify(r?.evidence_rule?.not_verified_here?.length),
  );
  expectThat(
    'a [GW] kill carries a null evidence_basis, and its entry is counted',
    m1?.kills?.[0]?.evidence_basis === null && m1?.kills_by_entry?.GW === 1,
    JSON.stringify({ basis: m1?.kills?.[0]?.evidence_basis, byEntry: m1?.kills_by_entry }),
  );
  // CKPT-W1 review finding 9: a killer id that names no `it` must be a usage error, exactly as a dead
  // `find` anchor is. Run as a subprocess, because the check lives in the runner's load path (which
  // this self-test has not reached) and because it is the WHOLE declared set that must be clean, not
  // the self-test's toy battery. A planted id that resolves to no test must be refused with exit 2.
  const spawnRunner = (extra, mutations) =>
    spawnSync(
      process.execPath,
      [path.join(HERE, 'widgets-mutation-battery.mjs'), ...(mutations ? ['--mutations', mutations] : []), '--dry-run', ...extra],
      { cwd: BACKEND, encoding: 'utf8', env: process.env, maxBuffer: 256 * 1024 * 1024 },
    );
  const allClean = spawnRunner([]);
  expectThat('every declared battery dry-runs clean: no dead anchor, no dead killer id', allClean.status === 0, `exit ${allClean.status}`);

  const plantedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-battery-deadkiller-'));
  try {
    fs.writeFileSync(
      path.join(plantedDir, 'gateZZ-deadkiller.json'),
      `${JSON.stringify(
        [
          {
            id: 'ZZ-1',
            edits: [{ file: 'package.json', find: '"name"', replace: '"name"' }],
            // An id that exists only as a `describe` title in the repository: the exact shape of the defect.
            killers: ['T-SRC-INV30'],
            expect: 'build-killed',
          },
        ],
        null,
        2,
      )}\n`,
    );
    const planted = spawnRunner([], plantedDir);
    expectThat(
      'an id that lives only on a describe is refused with exit 2',
      planted.status === 2 && /names no test/.test(planted.stderr ?? ''),
      `exit ${planted.status}: ${(planted.stderr ?? '').trim().slice(0, 120)}`,
    );
  } finally {
    fs.rmSync(plantedDir, { recursive: true, force: true });
  }

  // CKPT-W1 closing regression: a `--gate` id naming no declared battery must be a usage error too. Before the
  // check in the load path it selected nothing, reported EMPTY and exited 0, so a mistyped or stale id read as a
  // battery that had run green — how gate 7's battery was recorded as run while it never ran. `--shards` refuses
  // the same id with exit 2; these two checks pin both halves, so the run path cannot drift from the matrix path.
  const unknownGate = spawnRunner(['--gate', 'nonesuch']);
  expectThat(
    'an unknown --gate id is refused with exit 2, as --shards refuses it',
    unknownGate.status === 2 && /no battery gatenonesuch\.json is declared/.test(unknownGate.stderr ?? ''),
    `exit ${unknownGate.status}: ${(unknownGate.stderr ?? '').trim().slice(0, 120)}`,
  );
  const knownGate = spawnRunner(['--gate', '7']);
  expectThat(
    'a known --gate id still loads its battery (the check refuses only what is undeclared)',
    knownGate.status === 0,
    `exit ${knownGate.status}`,
  );

  for (const c of checks) process.stdout.write(`${c.ok ? 'ok  ' : 'BAD '} ${c.id} (${c.detail})\n`);
  const bad = checks.filter((c) => !c.ok).length;
  if (bad > 0 && child.stderr) process.stdout.write(child.stderr.split('\n').slice(-20).join('\n') + '\n');
  process.stdout.write(
    bad === 0
      ? `WIDGETS MUTATION RUNNER SELF-TEST: PASS (${checks.length} checks)\n`
      : `WIDGETS MUTATION RUNNER SELF-TEST: FAIL (${bad} of ${checks.length})\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}
