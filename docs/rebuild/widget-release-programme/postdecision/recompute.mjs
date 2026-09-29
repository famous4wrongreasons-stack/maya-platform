#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { check, load, recomputeHeadline } from '../../evidence/maya-chat-first-ux/gate-audit-check.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function applyDecisions(input, decision, disposition) {
  assert.deepEqual(decision.decisions, { 'OD-3': 'A', 'OD-4': 'B', 'OD-5': 'B', 'SB-1': 'A' });
  assert.equal(decision.production_activation, 'FORBIDDEN');
  assert.equal(decision.schema_migration_authorized, false);
  const audit = structuredClone(input);
  const rows = audit.gates.flatMap(g => Object.entries(g.clauses));
  assert.equal(rows.length, 165);
  const falseRows = rows.filter(([, c]) => c.state === 'false');
  assert.deepEqual(falseRows.map(([id]) => id).sort(), disposition.clauses.filter(c => c.after === 'false').map(c => c.id).sort());
  const byClassification = {};
  for (const [id, c] of rows) {
    if (c.state === 'U') {
      assert.ok(c.u_basis && c.u_proof?.basis, `${id}: no certified basis`);
      for (const duty of ['absence', 'refusal', 'mechanism']) assert.ok(c.u_proof[duty]?.source, `${id}: missing ${duty}`);
      assert.ok(c.evidence.some(e => e.claim === 'U' && e.entry === 'HTTP'), `${id}: missing disclosed HTTP U proof`);
      assert.ok(c.mutants.length && c.mutants.every(m => ['build-killed', 'live-killed', 'equivalent'].includes(m.status)), `${id}: incomplete mechanism receipt`);
      c.acceptance = { class: 'ACCEPTABLE_U_CLASS', decision: 'OD-3 A', strict_live: false,
        proof_scope: 'Recorded four-duty provenance retained; approval is not new live-path evidence.' };
    }
    if (id === 'G5-f') {
      assert.equal(c.state, 'U');
      c.historical_waits_on = c.waits_on;
      c.waits_on = [];
      c.current_scope = 'OD-4 B accepted; P-12/deep-link route outside this cycle. Code-only refusal, no early HandoffTarget.';
    }
    if (id === 'G12-R5') {
      assert.equal(c.state, 'L');
      c.historical_waits_on = c.waits_on;
      c.waits_on = [];
      c.note = 'OD-5 B: owner-shaped output accepted. No principal-narrowed row is registered or claimed.';
    }
    if (c.state === 'false') {
      const d = disposition.clauses.find(d => d.id === id);
      assert.ok(d);
      c.current_classification = d.classification;
      c.current_owner = d.implementation_source;
      c.current_blocker = d.boundary;
      byClassification[d.classification] = (byClassification[d.classification] ?? 0) + 1;
    }
  }
  audit.headline = recomputeHeadline(audit);
  audit.owner_decisions = { ...decision, strict_live_unchanged: true, decisions_alone_preserve_false_states: true };
  audit.current_false_classification = byClassification;
  return audit;
}

export function admitActionBoundary(manifestBytes, verification, report, sourceHead) {
  assert.equal(verification.contract, 'maya.widgets-evidence-verify/1');
  assert.deepEqual(verification.violations, []);
  assert.equal(verification.manifest_sha256, hash(manifestBytes));
  const pair = manifestBytes.toString().trim().split('\n').map(JSON.parse).filter(l => l.test_id === 'WR-COMMIT-ACTION-BOUNDARY');
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map(l => l.entry).sort(), ['BIN', 'HTTP']);
  assert.notEqual(pair[0].pid, pair[1].pid);
  for (const line of pair) {
    assert.equal(line.claim, 'L'); assert.equal(line.gates_run, 14); assert.equal(line.stopped_at_gate, '13');
    assert.deepEqual(line.clauses, ['G13-I7']); assert.ok(line.record_hash && line.trigger_trace_id);
  }
  assert.equal(report.contract, 'maya.widgets-mutation-battery/2');
  assert.equal(report.source_head, sourceHead); assert.equal(report.status, 'AS-DECLARED');
  assert.equal(report.mismatches, 0); assert.deepEqual(report.baseline_red, []);
  const controls = Object.values(report.baseline_controls ?? {});
  assert.ok(controls.length);
  for (const control of [...controls, ...Object.values(report.neutraliser_controls ?? {})]) {
    assert.ok(Object.keys(control.exits ?? {}).length);
    assert.ok(Object.values(control.exits).every(v => v === 0));
    assert.deepEqual(control.failed, []); assert.deepEqual(control.problems, []);
  }
  assert.deepEqual(report.mutants.map(m => m.id), ['AB-M1', 'AB-M2']);
  for (const m of report.mutants) { assert.equal(m.status, 'build-killed'); assert.ok(m.kills.length); }
  return pair;
}

function main() {
  const rawPath = process.argv[2];
  assert.ok(rawPath, 'Pass the source/evidence-recomputed current audit JSON');
  const bytes = fs.readFileSync(rawPath);
  const raw = JSON.parse(bytes);
  const decisionsBytes = fs.readFileSync(path.join(here, 'owner-decisions.json'));
  const disposition = JSON.parse(fs.readFileSync(path.join(here, '../preintegration/clause-disposition.json')));
  const audit = applyDecisions(raw, JSON.parse(decisionsBytes), disposition);
  const option = name => process.argv[process.argv.indexOf(name) + 1];
  // A later pass can retain a distinct snapshot without rewriting this packet.
  const output = process.argv.includes('--out-dir') ? path.resolve(option('--out-dir')) : here;
  assert.ok(fs.statSync(output).isDirectory(), 'Output directory must exist');
  if (process.argv.includes('--boundary-evidence')) {
    for (const flag of ['--boundary-report', '--source-head']) assert.ok(process.argv.includes(flag));
    const root = path.resolve(here, '../../../..'); const backend = path.join(root, 'maya-saas-backend');
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const sourceHead = option('--source-head');
    assert.equal(git('rev-parse', `${sourceHead}^{commit}`), sourceHead);
    assert.equal(git('diff', sourceHead, '--', 'maya-saas-backend'), '', 'Proof target differs from backend bytes');
    assert.equal(git('ls-files', '--others', '--exclude-standard', '--', 'maya-saas-backend'), '');
    // Prior SB-1 and twelve live admissions remain valid at their exact source target.
    // This additional unit may change tests/proof observation only, never application bytes.
    const delta = git('diff', '--name-only', raw.baseCommit, sourceHead, '--', 'maya-saas-backend').split('\n').filter(Boolean);
    const permitted = new Set([
      'maya-saas-backend/src/widgets/routing/g13-action-boundary.architecture.spec.ts',
      'maya-saas-backend/test/widgets-live/support/fixtures.ts',
      'maya-saas-backend/src/widgets/owner-ports/commit-booking.adapter.spec.ts',
      'maya-saas-backend/test/widgets-live/support/release-booking-proof.ts',
      'maya-saas-backend/test/widgets-live/wr-release.live-spec.ts',
      'maya-saas-backend/test/widgets-live/mutations/gateAB.json',
      'maya-saas-backend/scripts/widgets-mutation-ci.test.mjs',
    ]);
    assert.ok(delta.every(file => permitted.has(file)), 'Runtime drift invalidates inherited proofs');
    const evidence = path.resolve(option('--boundary-evidence'));
    const manifest = fs.readFileSync(path.join(evidence, 'evidence-manifest.jsonl'));
    const verified = JSON.parse(execFileSync(process.execPath, ['scripts/widgets-evidence-verify.mjs', '--dir', evidence], { cwd: backend, encoding: 'utf8' }).split('\n')[0]);
    const reportBytes = fs.readFileSync(path.resolve(option('--boundary-report')));
    const report = JSON.parse(reportBytes);
    assert.equal(report.battery_hashes['gateAB.json'], hash(fs.readFileSync(path.join(backend, 'test/widgets-live/mutations/gateAB.json'))));
    const pair = admitActionBoundary(manifest, verified, report, sourceHead);
    const g = audit.gates.find(g => Object.hasOwn(g.clauses, 'G13-I7'));
    const c = g.clauses['G13-I7']; assert.equal(c.state, 'false');
    c.state = 'L'; c.conforms = true; c.built = true; c.evidence = pair;
    c.current_proof = 'ACTION-BOUNDARY-PROOF.md: paired production COMMIT, durable source/policy, forged-metadata refusal and whole-tree F76/source-guard mutations.';
    c.proof_source_head = sourceHead;
    for (const key of ['blocked','reason','current_classification','current_blocker']) delete c[key];
    audit.current_false_classification.EVIDENCE_MISSING--;
    audit.counts.byState.false--; audit.counts.byState.L++;
    g.figures.false--; g.figures.L++;
    audit.headline = recomputeHeadline(audit);
    audit.builder.action_boundary = { source_head: sourceHead, manifest_sha256: verified.manifest_sha256, mutation_report_sha256: hash(reportBytes), application_runtime_unchanged_from: raw.baseCommit };
    audit.owner_decisions.decisions_alone_preserve_false_states = true; // The one promotion is executable evidence, not a decision.
  }
  audit.builder.owner_decision_overlay = { source_audit_sha256: hash(bytes), owner_decisions_sha256: hash(decisionsBytes) };
  assert.deepEqual(check({ ...load(), audit }), []);
  fs.writeFileSync(path.join(output, 'current-audit.json'), JSON.stringify(audit, null, 2) + '\n');
  const matrix = ['# Complete clause matrix after owner decisions', '', audit.headline, '',
    'Every one of the 165 clauses is listed. No false clause is promoted by an owner scope decision. Historical provenance is retained; the current builder identifies separately refreshed HTTP/BIN claims.', '',
    '| Gate | Clause | State | Acceptance / remaining classification | Contract duty |', '|---|---|---|---|---|'];
  const escape = s => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
  for (const g of audit.gates) for (const [id, c] of Object.entries(g.clauses))
    matrix.push(`| ${g.n} | ${id} | ${c.state} | ${escape(c.current_classification ?? c.acceptance?.class ?? 'LIVE')} | ${escape(c.text)} |`);
  fs.writeFileSync(path.join(output, 'CLAUSE-MATRIX.md'), matrix.join('\n') + '\n');
  console.log(JSON.stringify({ counts: audit.counts, headline: audit.headline, classifications: audit.current_false_classification, activation: 'FORBIDDEN' }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
