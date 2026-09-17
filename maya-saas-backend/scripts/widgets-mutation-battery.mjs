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

/** `[GW]`, `[HTTP]` or `[BIN]` from the title, else from the innermost describe that carries one; else null. */
export const entryLevel = (test) => {
  for (const text of [test.title, ...[...test.ancestors].reverse()]) {
    const m = /\[(GW|HTTP|BIN)\]/.exec(text);
    if (m) return m[1];
  }
  return null;
};

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
            kills.push({ killer: killer.test, test: t.fullName, step, entry, neutralisers: set, evidence: step === 'live' && entry === 'HTTP' });
          }
        if (killer.test === 'typecheck:widgets-live' && result.outcome.typecheck?.status && !control.outcome.typecheck?.status)
          kills.push({ killer: killer.test, test: null, step: 'typecheck', entry: 'BUILD', neutralisers: set, evidence: false });
        if (killer.test === 'k3' && result.outcome.k3?.status && !control.outcome.k3?.status)
          kills.push({ killer: killer.test, test: null, step: 'k3', entry: 'BUILD', neutralisers: set, evidence: false });
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
