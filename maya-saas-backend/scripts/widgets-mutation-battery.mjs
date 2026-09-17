#!/usr/bin/env node
// The widget gates' mutation battery runner (plan §4.5; skeleton, U0 item 11).
//
// Follows `docs/rebuild/evidence/maya-chat-first-ux/f88-mutation-battery.sh`: a check that cannot fail is
// not a check, so every declared mutant must turn a named test red. Each gate unit owns its battery in
// `test/widgets-live/mutations/gate<N>.json`; no unit has declared one yet, so today the runner reports
// EMPTY, and an EMPTY report is not evidence of anything.
//
// A battery file is a JSON array of mutants:
//   { "id": "M1",                       unique within the file
//     "file": "src/widgets/gates/gate6.ts",   relative to maya-saas-backend
//     "find": "…", "replace": "…",       a textual patch; `find` must occur exactly once
//     "killers": ["T-PENDING8", …],      test-title prefixes (jest) or "k3" / "typecheck:widgets-live"
//     "expect": "live-killed" | "build-killed" | "pending",   what the unit claims (default live-killed)
//     "equivalent": "reason" }           optional: declared equivalent, never run
//
// For each mutant the runner copies maya-saas-backend into a temporary directory (node_modules, and every
// other top-level entry of the repository the suites read, are linked, not copied), applies the patch
// THERE, and runs `npm test`, `typecheck:widgets-live`, the k3 checks and `test:widgets:live`
// against the proof database. It never edits the repository. Statuses:
//   live-killed    a declared killer failed in `test:widgets:live`
//   build-killed   a declared killer failed only in `npm test`, `typecheck:widgets-live` or k3
//   pending        the unit declared `expect: "pending"` and no killer failed (its killer is XF/TODO)
//   equivalent     declared, not run
//   SURVIVED       nothing a killer names failed
//   UNEXPECTED     something failed, but no declared killer
// Exit 0 when every mutant's status equals its declared expectation; 1 otherwise; 2 on a usage error.
//
//   node scripts/widgets-mutation-battery.mjs [--gate <N>] [--mutations <dir>] [--steps unit,typecheck,k3,live]
//                                             [--out <report.json>] [--dry-run] [--keep]
//   --keep leaves the temporary mirror of a mutant whose status differs from its declaration, for inspection.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BACKEND = path.resolve(HERE, '..');
const REPO = path.resolve(BACKEND, '..');
const SKIPPED = new Set(['node_modules', 'dist', 'coverage', '.git']);
const STEPS = ['unit', 'typecheck', 'k3', 'live'];

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
const dryRun = args.includes('--dry-run');
const keep = args.includes('--keep');
const gate = option('--gate');
const mutationsDir = path.resolve(option('--mutations') ?? path.join(BACKEND, 'test/widgets-live/mutations'));
const out = option('--out');
const steps = (option('--steps') ?? STEPS.join(',')).split(',');
for (const step of steps) if (!STEPS.includes(step)) usage(`unknown step ${step}`);

// ── load and validate the batteries (read-only) ───────────────────────────────────────────────────
const batteryFiles = fs.existsSync(mutationsDir)
  ? fs
      .readdirSync(mutationsDir)
      .filter((name) => /^gate[0-9A-Za-z-]+\.json$/.test(name))
      .filter((name) => gate === undefined || name === `gate${gate}.json`)
      .sort()
  : [];

const mutants = [];
for (const name of batteryFiles) {
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(path.join(mutationsDir, name), 'utf8'));
  } catch (error) {
    usage(`${name} is not JSON: ${error.message}`);
  }
  if (!Array.isArray(entries)) usage(`${name} is not an array of mutants`);
  const ids = new Set();
  for (const m of entries) {
    const where = `${name}#${m?.id ?? '?'}`;
    if (typeof m?.id !== 'string' || ids.has(m.id)) usage(`${where}: missing or duplicate id`);
    ids.add(m.id);
    if (typeof m.equivalent === 'string') {
      mutants.push({ battery: name, ...m });
      continue;
    }
    if (typeof m.file !== 'string' || typeof m.find !== 'string' || typeof m.replace !== 'string')
      usage(`${where}: file, find and replace are required`);
    if (!Array.isArray(m.killers) || m.killers.length === 0) usage(`${where}: killers are required`);
    const expect = m.expect ?? 'live-killed';
    if (!['live-killed', 'build-killed', 'pending'].includes(expect)) usage(`${where}: unknown expect ${expect}`);
    const target = path.join(BACKEND, m.file);
    if (!target.startsWith(BACKEND + path.sep) || !fs.existsSync(target)) usage(`${where}: ${m.file} does not exist`);
    const occurrences = fs.readFileSync(target, 'utf8').split(m.find).length - 1;
    if (occurrences !== 1) usage(`${where}: find occurs ${occurrences} times in ${m.file}, not once`);
    mutants.push({ battery: name, ...m, expect });
  }
}

const report = {
  contract: 'maya.widgets-mutation-battery/1',
  startedAt: new Date().toISOString(),
  batteries: batteryFiles,
  steps,
  mutants: [],
};

const finish = (code) => {
  report.finishedAt = new Date().toISOString();
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (out) fs.writeFileSync(out, text);
  process.stdout.write(text);
  process.exit(code);
};

if (mutants.length === 0) {
  report.status = 'EMPTY';
  report.note = 'no battery is declared; nothing ran and nothing is evidenced';
  finish(0);
}
if (dryRun) {
  report.status = 'DRY-RUN';
  report.mutants = mutants.map(({ battery, id, file, expect, equivalent }) => ({ battery, id, file, expect, equivalent }));
  finish(0);
}

// ── the proof-database guard, the same module the jest harness uses ─────────────────────────────────
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

// ── one mutant in one temporary mirror ──────────────────────────────────────────────────────────────
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

const failedTitles = (jsonFile) => {
  if (!fs.existsSync(jsonFile)) return [];
  const result = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  return result.testResults.flatMap((file) =>
    file.assertionResults.filter((a) => a.status === 'failed').map((a) => a.title),
  );
};

const run = (cwd, command, commandArgs) => {
  const r = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, tail: `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').slice(-20).join('\n') };
};

const named = (titles, killers) => killers.filter((k) => titles.some((title) => title.startsWith(k)));

let mismatches = 0;
for (const m of mutants) {
  if (typeof m.equivalent === 'string') {
    report.mutants.push({ battery: m.battery, id: m.id, status: 'equivalent', reason: m.equivalent });
    continue;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'widgets-mutant-'));
  try {
    const backend = path.join(root, 'maya-saas-backend');
    copyTree(BACKEND, backend);
    fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(backend, 'node_modules'), 'dir');
    // The suites read repository files beside the backend (the contract, the workflows, the PWA sources).
    // Those are linked, never copied or patched: a mutant changes only the copied backend.
    for (const entry of fs.readdirSync(REPO))
      if (entry !== 'maya-saas-backend' && entry !== '.git')
        fs.symlinkSync(path.join(REPO, entry), path.join(root, entry));
    const target = path.join(backend, m.file);
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(m.find, m.replace));

    const unitJson = path.join(root, 'unit.json');
    const liveJson = path.join(root, 'live.json');
    const outcome = {};
    if (steps.includes('unit')) outcome.unit = run(backend, 'npx', ['jest', '--runInBand', '--json', `--outputFile=${unitJson}`]);
    if (steps.includes('typecheck')) outcome.typecheck = run(backend, 'npm', ['run', '-s', 'typecheck:widgets-live']);
    if (steps.includes('k3')) outcome.k3 = run(backend, process.execPath, ['scripts/k3-gateway-check.mjs']);
    if (steps.includes('live'))
      outcome.live = run(backend, 'npx', ['jest', '--config', './test/jest-widgets-live.json', '--runInBand', '--json', `--outputFile=${liveJson}`]);

    const liveKillers = named(failedTitles(liveJson), m.killers);
    const buildKillers = [
      ...named(failedTitles(unitJson), m.killers),
      ...(outcome.typecheck?.status && m.killers.includes('typecheck:widgets-live') ? ['typecheck:widgets-live'] : []),
      ...(outcome.k3?.status && m.killers.includes('k3') ? ['k3'] : []),
    ];
    const anyFailure = Object.values(outcome).some((o) => o.status !== 0);
    const status =
      liveKillers.length > 0
        ? 'live-killed'
        : buildKillers.length > 0
          ? 'build-killed'
          : anyFailure
            ? 'UNEXPECTED'
            : m.expect === 'pending'
              ? 'pending'
              : 'SURVIVED';
    if (status !== m.expect) mismatches += 1;
    report.mutants.push({
      battery: m.battery,
      id: m.id,
      file: m.file,
      expect: m.expect,
      status,
      killedBy: [...liveKillers, ...buildKillers],
      exits: Object.fromEntries(Object.entries(outcome).map(([k, o]) => [k, o.status])),
      ...(status === m.expect ? {} : { tails: Object.fromEntries(Object.entries(outcome).map(([k, o]) => [k, o.tail])) }),
    });
  } finally {
    const last = report.mutants[report.mutants.length - 1];
    if (keep && last?.id === m.id && last.status !== m.expect) last.keptMirror = root;
    else fs.rmSync(root, { recursive: true, force: true });
  }
}

report.status = mismatches === 0 ? 'AS-DECLARED' : 'MISMATCH';
report.mismatches = mismatches;
finish(mismatches === 0 ? 0 : 1);
