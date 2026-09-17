#!/usr/bin/env node
// gate-audit-build — build the schema /2 gate conformance audit from the clause inventory, the evidence manifest and
// the mutation report (GATES-PLAN-V11 I-HAR skeleton; §3.3 step 5). A-W5 and FINAL complete and run it.
//
//   node gate-audit-build.mjs --verify-report <widgets-evidence-verify output line> --manifest <evidence-manifest.jsonl>
//        [--mutation-report <widgets-mutation report.json>]... [--baseline <audit.json>] [--out <file>]
//
// What the skeleton does, and only that:
//   - starts from the baseline audit (default: the committed gate-conformance-audit.json), which must pass
//     gate-audit-check against the inventory and the contract;
//   - refuses to build unless the verifier report (`maya.widgets-evidence-verify/1`) has 0 violations and names the
//     same manifest bytes (sha256) it is given;
//   - attaches, per clause key, every manifest line offered for that key (`evidence`), and to every clause of a gate the
//     mutant ids, statuses and kills (with their entry levels) of that gate's battery (`gate<id>.json`) and the report
//     they came from (`mutants`; A-W5 narrows them to the mutants declared for the clause);
//   - recomputes the per-gate state figures and the headline from the clause states (tally and counts are unchanged,
//     because no state changes);
//   - writes the result to `--out` (default stdout) and checks it with gate-audit-check before writing.
// What it does NOT do: flip a state. Every state is copied from the baseline. The flipping rules of §0.5 (L needs a clean
// HTTP line and a clean BIN line on a production-minted record; L-T needs an L positive and `[HTTP]` kills in the shard
// artifacts; U needs the four duties and the quoted basis) are A-W5's, applied with the independent re-audit (§3.3
// step 6). The output carries `builder: { skeleton: true }` so it cannot be mistaken for a re-audit.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { check, load, recomputeHeadline } from './gate-audit-check.mjs';

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
  args.flatMap((value, i) => (value === name && args[i + 1] && !args[i + 1].startsWith('--') ? [args[i + 1]] : []));

const manifestFile = option('--manifest');
const verifyFile = option('--verify-report');
if (!manifestFile || !verifyFile) usage('--manifest and --verify-report are required');

const base = load();
if (option('--baseline')) base.audit = JSON.parse(fs.readFileSync(path.resolve(option('--baseline')), 'utf8'));
const baselineProblems = check(base);
if (baselineProblems.length > 0)
  usage(`the baseline audit does not pass gate-audit-check: ${baselineProblems.map((p) => `${p.rule} ${p.detail}`).join('; ')}`);

const manifestExists = fs.existsSync(manifestFile);
const manifestBytes = manifestExists ? fs.readFileSync(manifestFile) : Buffer.alloc(0);
const verify = JSON.parse(fs.readFileSync(verifyFile, 'utf8').split('\n')[0]);
if (verify?.contract !== 'maya.widgets-evidence-verify/1') usage('the verify report is not maya.widgets-evidence-verify/1');
if (!Array.isArray(verify.violations) || verify.violations.length > 0)
  usage(`the verifier reported ${verify.violations?.length ?? '?'} violation(s); nothing is built from a rejected manifest`);
const manifestSha = manifestExists ? crypto.createHash('sha256').update(manifestBytes).digest('hex') : null;
if (verify.manifest_sha256 !== manifestSha) usage('the verify report was made for other manifest bytes');

const manifest = manifestBytes
  .toString('utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

const mutationReports = options('--mutation-report').map((file) => ({
  file: path.basename(file),
  report: JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')),
}));

const audit = JSON.parse(JSON.stringify(base.audit));
for (const gate of audit.gates) {
  const battery = `gate${gate.n}.json`;
  for (const [key, clause] of Object.entries(gate.clauses)) {
    clause.evidence = manifest
      .filter((line) => Array.isArray(line.clauses) && line.clauses.includes(key))
      .map((line) => ({
        test_id: line.test_id,
        entry: line.entry,
        source: line.source,
        record_hash: line.record_hash,
        stopped_at_gate: line.stopped_at_gate,
        gates_run: line.gates_run,
        labels: line.labels,
        claim: line.claim,
      }));
    clause.mutants = mutationReports.flatMap(({ file, report }) =>
      (report.mutants ?? [])
        .filter((m) => m.battery === battery)
        .map((m) => ({ id: m.id, status: m.status, kills: m.kills ?? [], report: file })),
    );
  }
  const states = Object.values(gate.clauses).map((c) => c.state);
  if (gate.figures)
    for (const state of ['L', 'L-T', 'U', 'BLOCKED-DISCHARGE', 'false'])
      gate.figures[state] = states.filter((s) => s === state).length;
}
audit.headline = recomputeHeadline(audit);
audit.builder = {
  skeleton: true,
  note: 'gate-audit-build skeleton (I-HAR): evidence and mutants attached, no state flipped; not a re-audit',
  manifest_sha256: manifestSha,
  mutation_reports: mutationReports.map((r) => r.file),
};

const problems = check({ ...base, audit });
if (problems.length > 0) usage(`the built audit does not pass gate-audit-check: ${problems.map((p) => p.rule).join(', ')}`);
const text = `${JSON.stringify(audit, null, 2)}\n`;
const out = option('--out');
if (out) fs.writeFileSync(path.resolve(out), text);
else process.stdout.write(text);
process.stderr.write(`GATE AUDIT BUILD (skeleton): ${audit.headline}; ${manifest.length} manifest line(s) attached\n`);
