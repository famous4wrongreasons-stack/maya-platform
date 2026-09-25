#!/usr/bin/env node
// Gate-audit builder for A-W5 and the conservative FINAL re-audit. A-W5 may promote only admitted evidence. FINAL
// additionally retires the temporary BLOCKED-DISCHARGE classification: a clause without admitted §0.5 evidence is
// downgraded to false rather than being claimed live.
//
//   node gate-audit-build.mjs --verify-report <verify.json> --manifest <manifest.jsonl>
//        --mutation-report <report.json> [--mutation-report <report.json> ...]
//        [--u-proofs <e1-u-proofs.json>] [--baseline <audit.json>] [--out <file>]

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { check, load, recomputeHeadline } from './gate-audit-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');

const usage = (message) => {
  process.stderr.write(`gate-audit-build: ${message}\n`);
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
const options = (name) =>
  args.flatMap((value, i) =>
    value === name && args[i + 1] && !args[i + 1].startsWith('--')
      ? [args[i + 1]]
      : [],
  );
const phase = option('--phase') ?? 'A-W5';
if (phase !== 'A-W5' && phase !== 'FINAL') usage('--phase must be A-W5 or FINAL');

const manifestFile = option('--manifest');
const verifyFile = option('--verify-report');
if (!manifestFile || !verifyFile) usage('--manifest and --verify-report are required');

const base = load();
if (option('--baseline'))
  base.audit = JSON.parse(fs.readFileSync(path.resolve(option('--baseline')), 'utf8'));
const baselineProblems = check(base);
if (baselineProblems.length > 0)
  usage(
    `the baseline audit does not pass gate-audit-check: ${baselineProblems
      .map((problem) => `${problem.rule} ${problem.detail}`)
      .join('; ')}`,
  );

const manifestBytes = fs.existsSync(manifestFile)
  ? fs.readFileSync(manifestFile)
  : Buffer.alloc(0);
const verify = JSON.parse(fs.readFileSync(verifyFile, 'utf8').split('\n')[0]);
if (verify?.contract !== 'maya.widgets-evidence-verify/1')
  usage('the verify report is not maya.widgets-evidence-verify/1');
if (!Array.isArray(verify.violations) || verify.violations.length > 0)
  usage(
    `the verifier reported ${verify.violations?.length ?? '?'} violation(s); nothing is built from a rejected manifest`,
  );
const manifestSha = fs.existsSync(manifestFile)
  ? crypto.createHash('sha256').update(manifestBytes).digest('hex')
  : null;
if (verify.manifest_sha256 !== manifestSha)
  usage('the verify report was made for other manifest bytes');

const manifest = manifestBytes
  .toString('utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

const mutationReports = options('--mutation-report').map((file) => ({
  file: path.basename(file),
  report: JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')),
}));
if (mutationReports.length === 0) usage('at least one --mutation-report is required');
for (const { file, report } of mutationReports) {
  if (report?.contract !== 'maya.widgets-mutation-battery/2')
    usage(`${file} is not a maya.widgets-mutation-battery/2 report`);
  const bad = (report.mutants ?? []).filter((mutant) =>
    ['SURVIVED', 'UNEXPECTED'].includes(mutant.status),
  );
  if (bad.length > 0)
    usage(`${file} has unexpected mutants: ${bad.map((mutant) => mutant.id).join(', ')}`);
}

const uProofFile = path.resolve(
  option('--u-proofs') ?? path.join(HERE, 'wave5/e1-u-proofs.json'),
);
const uProofMap = JSON.parse(fs.readFileSync(uProofFile, 'utf8'));
if (uProofMap?.contract !== 'maya.widgets-u-proof-map/1')
  usage('the U proof map is not maya.widgets-u-proof-map/1');
const uProofs = new Map(uProofMap.proofs.map((proof) => [proof.clause, proof]));

const batteryAliases = (gate) => {
  if (gate === '1' || gate === '5') return ['gate1-5.json'];
  if (gate === '3') return ['gateP-principal.json'];
  if (gate === '8-R') return ['gate8r.json'];
  return [`gate${gate}.json`];
};
const allMutants = mutationReports.flatMap(({ file, report }) =>
  (report.mutants ?? []).map((mutant) => ({ ...mutant, report: file })),
);
const reportHasBattery = (battery) =>
  mutationReports.some(({ report }) => (report.batteries ?? []).includes(battery));
const mutantsFor = (batteries) =>
  allMutants
    .filter((mutant) => batteries.includes(mutant.battery))
    .map((mutant) => ({
      id: mutant.id,
      battery: mutant.battery,
      status: mutant.status,
      kills: mutant.kills ?? [],
      report: mutant.report,
    }));

const claimsFor = (key, claim) =>
  manifest.filter(
    (line) => line.claim === claim && Array.isArray(line.clauses) && line.clauses.includes(key),
  );
const evidenceView = (line) => ({
  test_id: line.test_id,
  entry: line.entry,
  source: line.source,
  record_hash: line.record_hash,
  trigger_trace_id: line.trigger_trace_id,
  stopped_at_gate: line.stopped_at_gate,
  gates_run: line.gates_run,
  labels: line.labels,
  claim: line.claim,
});
const hasPair = (key) => {
  const lines = claimsFor(key, 'L');
  return lines.some(
    (left) =>
      (left.entry === 'HTTP' || left.entry === 'BIN') &&
      lines.some(
        (right) =>
          right.test_id === left.test_id &&
          right.entry === (left.entry === 'HTTP' ? 'BIN' : 'HTTP'),
      ),
  );
};

const audit = JSON.parse(JSON.stringify(base.audit));
for (const gate of audit.gates) {
  for (const [key, clause] of Object.entries(gate.clauses)) {
    const live = claimsFor(key, 'L');
    const tamper = claimsFor(key, 'L-T');
    const unreachable = claimsFor(key, 'U');
    clause.evidence = [...live, ...tamper, ...unreachable].map(evidenceView);

    const batteries = new Set(batteryAliases(gate.n));
    const uProof = uProofs.get(key);
    if (uProof?.mechanism?.battery) batteries.add(uProof.mechanism.battery);
    clause.mutants = mutantsFor([...batteries]);

    if (gate.n === '14' && phase !== 'FINAL') continue;
    if (tamper.length > 0) {
      if (!hasPair(key)) usage(`${key} has L-T evidence without a clean HTTP/BIN L pair`);
      if (!tamper.some((line) => line.entry === 'HTTP'))
        usage(`${key} has no HTTP L-T evidence`);
      if (![...batteries].every(reportHasBattery))
        usage(`${key} has L-T evidence but not every declared mutation battery was run`);
      clause.state = 'L-T';
      clause.conforms = true;
      clause.built = true;
      continue;
    }
    if (unreachable.length > 0) {
      if (!uProof) usage(`${key} has a U claim without a proof-map entry`);
      if (!reportHasBattery(uProof.mechanism.battery))
        usage(`${key} U proof battery ${uProof.mechanism.battery} is absent from the mutation reports`);
      const basis = clause.u_basis ?? clause.u_candidate_scope;
      if (
        clause.u_candidate !== true ||
        typeof basis !== 'string' ||
        !uProof.basis.includes(basis)
      )
        usage(`${key} is not a certified U candidate with a quoted basis`);
      if (!clause.u_basis) clause.u_basis = uProof.basis;
      clause.u_proof = uProof;
      clause.state = 'U';
      clause.conforms = true;
      clause.built = true;
      continue;
    }
    if (live.length > 0) {
      if (!hasPair(key)) usage(`${key} has no clean HTTP/BIN L pair`);
      clause.state = 'L';
      clause.conforms = true;
      clause.built = true;
    }
  }

  if (phase === 'FINAL') {
    for (const [key, clause] of Object.entries(gate.clauses)) {
      if (clause.state === 'BLOCKED-DISCHARGE') {
        clause.state = 'false';
        clause.conforms = false;
        clause.built = true;
        clause.reason = 'discharge complete; no production-triggered HTTP/BIN evidence pair admitted for this whole clause';
      }
      if (['G12-R1b', 'G12-I11', 'G13-R2'].includes(key) && clause.state === 'false')
        clause.reason = 'DEV-1 closed by OD-1/U12c/U13d; no production-triggered HTTP/BIN evidence pair admitted for this whole clause';
    }
  }

  const states = Object.values(gate.clauses).map((clause) => clause.state);
  if (gate.figures) {
    for (const state of ['L', 'L-T', 'U', 'BLOCKED-DISCHARGE', 'false'])
      gate.figures[state] = states.filter((candidate) => candidate === state).length;
    gate.figures.STOPPED = states.filter(
      (candidate) => typeof candidate === 'string' && candidate.startsWith('STOPPED:'),
    ).length;
  }
}

audit.headline = recomputeHeadline(audit);
const expectedHeadline = phase === 'A-W5'
  ? 'GATES LIVE CONTRACT-COMPLETE 3/15 · WITH U-CLASS 6/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 25'
  : 'GATES LIVE CONTRACT-COMPLETE 3/15 · WITH U-CLASS 6/15 · STOPPED CLAUSES 0 · BLOCKED-DISCHARGE CLAUSES 0';
if (audit.headline !== expectedHeadline) usage(`${phase} expected ${expectedHeadline}, built ${audit.headline}`);
audit.builder = {
  skeleton: false,
  phase,
  manifest_sha256: manifestSha,
  verifier: path.basename(verifyFile),
  u_proofs: path.relative(REPO, uProofFile),
  mutation_reports: mutationReports.map((report) => report.file),
};

const problems = check({ ...base, audit });
if (problems.length > 0)
  usage(
    `the built audit does not pass gate-audit-check: ${problems
      .map((problem) => `${problem.rule} ${problem.detail}`)
      .join('; ')}`,
  );
const text = `${JSON.stringify(audit, null, 2)}\n`;
const out = option('--out');
if (out) fs.writeFileSync(path.resolve(out), text);
else process.stdout.write(text);
process.stderr.write(`GATE AUDIT BUILD (${phase}): ${audit.headline}; ${manifest.length} manifest line(s) accepted\n`);
