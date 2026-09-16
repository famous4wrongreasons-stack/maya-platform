#!/usr/bin/env node
// K16 — the cutover evaluator. It READS the K1 parity harness; it does not replace it.
//
// A first version of this file built its own eighty-row ledger with its own six checks. That was a
// second implementation of something K1 already owns: `k1/k1-parity-harness.json` carries all 795
// rows with exactly the six fields the owner named — `successorExists`, `parity`, `authority`,
// `accessibility`, `darkWindow`, `deepLinkHandoff` — under its own rule:
//
//   "emitted RED by default. A row turns green only when its evidence exists — a passing test, a
//    recorded probe, a signed dossier — and the harness reads the evidence, never a checkbox.
//    NO PACKAGE MAY MARK ITS OWN ROW GREEN."
//
// So this script consumes it. For each row it looks for the evidence the harness would need and
// reports what it found. It writes nothing back — K16 "consumes evidence and produces none", and
// the harness's own rule forbids K16 marking a K16 row green in any case.
//
// It deletes nothing, and it will not call a row retirable while any field is RED.
//
// Run: node docs/rebuild/evidence/maya-chat-first-ux/k16-cutover-evaluator.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(repo, p));

const E = 'docs/rebuild/evidence/maya-chat-first-ux/';
const harness = readJson(E + 'k1/k1-parity-harness.json');
const rows = harness.rows;

// ── the evidence each field needs, and whether it is here ────────────────────────────────────────
//
// Every one of these is a question about an ARTEFACT, not a judgement. Two read a STRUCTURED record
// rather than prose, because an earlier version grepped for phrases like "dark window" and found
// three documents that DESCRIBE the requirement — then reported it met. A description of a dark
// window is not an observation of one, and prose must not be able to become one by accident.

const OBSERVATION_FILE = E + 'dark-window-observations.json';
const ROLLBACK_FILE = E + 'rollback-register.json';
const DEEP_LINK_FILE = E + 'deep-link-map.json';
const PROBE_FILE = E + 'maya-os-site-unreachable-probe.json';

const structured = (file, required) => {
  if (!exists(file)) return [];
  let parsed;
  try { parsed = readJson(file); } catch { return []; }
  return Array.isArray(parsed)
    ? parsed.filter((o) => required.every((f) => o[f] !== undefined && o[f] !== null))
    : [];
};

const observations = structured(OBSERVATION_FILE, ['surface', 'windowStart', 'windowEnd', 'requestsObserved']);
const rollbacks = structured(ROLLBACK_FILE, ['surface', 'exercisedAt', 'outcome']);
const deepLinks = structured(DEEP_LINK_FILE, ['surface', 'resolvesTo']);

// The successor side: what is actually built.
const shellSrc = exists('maya-chat-shell/src/routes/registry.ts')
  ? read('maya-chat-shell/src/routes/registry.ts')
  : '';
const listOf = (n) => {
  const m = new RegExp(`export const ${n} = \\[([\\s\\S]*?)\\] as const;`).exec(shellSrc);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};
const ALL_ROUTES = [...listOf('BASE_ROUTES'), ...listOf('SHELL_ROUTES'), ...listOf('FULLSCREEN_ROUTES')];

// The parity corpus: fixtures that name a surface.
const specs = [];
const walkSpecs = (dir) => {
  const abs = path.join(repo, dir);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) walkSpecs(path.join(dir, e.name));
    else if (/\.(spec|test)\.ts$/.test(e.name))
      specs.push({ file: path.join(dir, e.name), text: read(path.join(dir, e.name)) });
  }
};
walkSpecs('maya-saas-backend/src/widgets');
walkSpecs('maya-chat-shell/src');

const a11ySuiteExists = ['maya-chat-shell/src/a11y', 'maya-chat-shell/test/a11y'].some(exists);

// The successor shell's authority cleanliness, computed once — it is the same answer for every row.
const shellFiles = [];
const walkTs = (dir) => {
  const abs = path.join(repo, dir);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) walkTs(path.join(dir, e.name));
    else if (e.name.endsWith('.ts')) shellFiles.push(read(path.join(dir, e.name)));
  }
};
walkTs('maya-chat-shell/src');
const shellText = shellFiles.join('\n');
const AUTHORITY_TOKENS = ['me_is_staff', '__meRole', '__meIsStaff', '__meIsMaster', '__meIsFounder', '__panelInfo'];
const successorAuthorityClean =
  AUTHORITY_TOKENS.every((t) => !shellText.includes(t)) &&
  !/localStorage|sessionStorage|document\.cookie/.test(shellText);

// ── evaluate one row ─────────────────────────────────────────────────────────────────────────────
//
// EVERY field asks for a PER-ROW record. That is the harness's rule — "the harness reads the
// evidence, never a checkbox" — and it is also what a first version of this evaluator got wrong in
// two places, both in the over-generous direction:
//
//   successorExists matched a route name as a loose substring of a surface name, so "MAYA chat FAB"
//                   counted the route 'maya' as its successor. A route whose name appears inside a
//                   surface's name is a coincidence, not a succession.
//   parity          matched a fixture containing the string "/client" and called that parity for
//                   "/client — client dossier lookup (retired)".
//
// Programme-level facts — that the successor shell holds no client-side authority value, that it
// reads no client storage — are real and are reported SEPARATELY below. They are not per-row
// evidence, and folding them in would turn one true statement about the shell into 795 unearned
// greens.

const SUCCESSOR_FILE = E + 'successor-map.json';
const PARITY_FILE = E + 'parity-fixtures.json';
const A11Y_FILE = E + 'a11y-conformance.json';
const AUTHORITY_FILE = E + 'authority-proofs.json';

const successors = structured(SUCCESSOR_FILE, ['surface', 'successor']);
const parityFixtures = structured(PARITY_FILE, ['surface', 'fixture', 'passing']);
const a11yProofs = structured(A11Y_FILE, ['surface', 'criticalFindings', 'keyboardTraversal']);
const authorityProofs = structured(AUTHORITY_FILE, ['surface', 'serverDerived']);

const evaluate = (row) => {
  const v = {};

  const succ = successors.find((o) => o.surface === row.name);
  v.successorExists = succ && ALL_ROUTES.includes(succ.successor)
    ? { green: true, why: `successor '${succ.successor}' recorded` }
    : { green: false, why: succ ? `recorded successor '${succ.successor}' is not a route the shell has` : 'no successor recorded for this row' };

  const fx = parityFixtures.find((o) => o.surface === row.name);
  v.parity = fx && fx.passing === true
    ? { green: true, why: `passing fixture ${fx.fixture}` }
    : { green: false, why: fx ? `fixture ${fx.fixture} is not passing` : 'no passing fixture recorded for this surface' };

  const au = authorityProofs.find((o) => o.surface === row.name);
  v.authority = au && au.serverDerived === true
    ? { green: true, why: 'authority proven server-derived for this surface' }
    : { green: false, why: 'no per-surface authority proof recorded' };

  const ax = a11yProofs.find((o) => o.surface === row.name);
  v.accessibility = ax && Number(ax.criticalFindings) === 0 && ax.keyboardTraversal === 'PASS'
    ? { green: true, why: '0 critical findings, keyboard traversal PASS' }
    : { green: false, why: '\u00a78: WCAG 2.2 AA is [UNENFORCEABLE-TODAY]; no per-surface conformance record' };

  // §7.1's three conditions, each named separately when missing.
  const obs = observations.find((o) => o.surface === row.name);
  const rb = rollbacks.find((o) => o.surface === row.name);
  const missing = [];
  if (!v.parity.green) missing.push('(1) parity green on this commit');
  if (!rb) missing.push('(2) a rollback exercised at least once');
  if (!obs) missing.push('(3) observed unused for the agreed window \u2014 a PRODUCTION observation');
  else if (Number(obs.requestsObserved) !== 0)
    missing.push(`(3) observed ${obs.requestsObserved} times \u2014 it is in use`);
  v.darkWindow = missing.length
    ? { green: false, why: `open: missing ${missing.join('; ')}` }
    : { green: true, why: `unused ${obs.windowStart}..${obs.windowEnd}; rollback ${rb.exercisedAt}` };

  const dl = deepLinks.find((o) => o.surface === row.name);
  v.deepLinkHandoff =
    dl && ALL_ROUTES.includes(dl.resolvesTo)
      ? { green: true, why: `deep links resolve to '${dl.resolvesTo}'` }
      : { green: false, why: dl ? `map sends this to '${dl.resolvesTo}', not a route the shell has` : 'no deep-link map entry' };

  const allGreen = Object.values(v).every((x) => x.green);
  return { ...row, evaluated: v, wouldBeRetirable: allGreen && row.retirementCondition.startsWith('RETIRE') };
};

const evaluated = rows.map(evaluate);
const FIELDS = ['successorExists', 'parity', 'authority', 'accessibility', 'darkWindow', 'deepLinkHandoff'];

const toRetire = evaluated.filter((r) => r.retirementCondition.startsWith('RETIRE'));
const k16Rows = toRetire.filter((r) => /K16/.test(r.retirementCondition));
const k15Rows = toRetire.filter((r) => /K15/.test(r.retirementCondition));
const retirableNow = toRetire.filter((r) => r.wouldBeRetirable);

const byField = {};
for (const f of FIELDS) byField[f] = evaluated.filter((r) => r.evaluated[f].green).length;

// The harness's own stored verdict, printed beside the evaluation so drift between them is visible.
const harnessGreen = {};
for (const f of FIELDS) harnessGreen[f] = rows.filter((r) => r[f] === 'GREEN').length;

const summary = {
  harnessContract: harness.contract,
  rows: rows.length,
  toRetire: toRetire.length,
  k16Rows: k16Rows.length,
  k15Rows: k15Rows.length,
  retirableNow: retirableNow.length,
  deletionsPerformed: 0,
  byField,
  harnessGreen,
  observationRecords: observations.length,
  rollbackRecords: rollbacks.length,
  deepLinkRecords: deepLinks.length,
  unreachabilityProbeRecorded: exists(PROBE_FILE),
  // True of the SHELL, not of any row. Reported so it is visible without being counted as evidence.
  programmeLevel: {
    successorShellHoldsNoClientAuthorityValue: successorAuthorityClean,
    shellRoutes: ALL_ROUTES.length,
    fixturesInCorpus: specs.length,
    rendererConformanceSuite: a11ySuiteExists,
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, rows: evaluated }, null, 2));
} else {
  console.log('K16 CUTOVER EVALUATOR  —  reads k1-parity-harness.json, writes nothing back');
  console.log('='.repeat(78));
  console.log(`harness contract: ${summary.harnessContract}`);
  console.log(`harness rule:     ${harness.rule.split('.')[0]}.`);
  console.log();
  console.log(`rows in the harness:                  ${summary.rows}`);
  console.log(`  rows whose condition is RETIRE:     ${summary.toRetire}   (K16 ${summary.k16Rows}, K15 ${summary.k15Rows})`);
  console.log();
  console.log('EVIDENCE FOUND, per field, over all 795 rows:');
  for (const f of FIELDS)
    console.log(
      `  ${f.padEnd(18)} evaluated GREEN ${String(byField[f]).padStart(3)} / ${rows.length}` +
        `      harness stored GREEN ${String(harnessGreen[f]).padStart(3)}`,
    );
  console.log();
  console.log('PROGRAMME-LEVEL FACTS (true of the shell, NOT per-row evidence):');
  console.log(`  successor shell holds no client-side authority value: ${summary.programmeLevel.successorShellHoldsNoClientAuthorityValue}`);
  console.log(`  shell routes: ${summary.programmeLevel.shellRoutes}   fixtures in the corpus: ${summary.programmeLevel.fixturesInCorpus}`);
  console.log(`  renderer conformance suite: ${summary.programmeLevel.rendererConformanceSuite ? 'present' : 'ABSENT'}`);
  console.log();
  console.log(
    `  structured records: ${summary.observationRecords} observations, ` +
      `${summary.rollbackRecords} rollbacks, ${summary.deepLinkRecords} deep links, ` +
      `probe ${summary.unreachabilityProbeRecorded ? 'recorded' : 'NOT RECORDED'}`,
  );
  console.log();
  console.log(`  ROWS RETIRABLE TODAY:               ${summary.retirableNow}`);
  console.log(`  DELETIONS PERFORMED:                ${summary.deletionsPerformed}`);
  console.log();
  if (!summary.retirableNow && toRetire.length) {
    console.log(`  EXACT CUTOVER CONDITION, identical for every one of the ${summary.toRetire} rows:`);
    console.log('    ' + toRetire[0].evaluated.darkWindow.why);
    console.log();
    console.log('  Condition (3) is a statement about what real users did not do, over wall-clock');
    console.log('  time, against a surface that was live and logging. No artefact a repository can');
    console.log('  hold is that observation. PRODUCTION EFFECTS FOR PROOF: 0, so it was not sought.');
  }
}

// No process.exit here: it truncates a pending stdout write, and --json emits megabytes.
