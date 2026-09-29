#!/usr/bin/env node
// Current evidence overlay. Historical audit and its rebuilding policy remain immutable.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { check, load, recomputeHeadline } from '../../evidence/maya-chat-first-ux/gate-audit-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const promotions = Object.freeze({
  'WR-DRAFT-CREATE': ['G13-R6'],
  'WR-COMMIT-CREATE': ['G6-8', 'G6-9', 'G6-10', 'G6-11', 'G6-12', 'G7-4', 'G7-6', 'G13-R9', 'G14-a', 'G14-b', 'G14-c'],
});
const requiredMutants = { WR: ['WR-M22', 'WR-M23'], 'H-harness': ['R-M10', 'R-M16', 'R-M17'] };

export function admit({ manifestBytes, verify, reports, sourceHead }) {
  assert.equal(verify.contract, 'maya.widgets-evidence-verify/1');
  assert.deepEqual(verify.violations, [], 'Rejected evidence');
  assert.equal(verify.manifest_sha256, sha(manifestBytes), 'Manifest changed after verification');
  const lines = manifestBytes.toString().trim().split('\n').map(JSON.parse);
  const accepted = {};
  for (const [testId, clauses] of Object.entries(promotions)) {
    const pair = lines.filter(l => l.test_id === testId);
    assert.equal(pair.length, 2, `${testId}: expected exactly one HTTP/BIN pair`);
    assert.deepEqual(pair.map(l => l.entry).sort(), ['BIN', 'HTTP']);
    assert.notEqual(pair[0].pid, pair[1].pid, 'Independent processes required');
    for (const l of pair) {
      assert.equal(l.claim, 'L');
      assert.equal(l.gates_run, 14);
      assert.equal(l.stopped_at_gate, '13');
      assert.deepEqual(l.clauses, clauses, 'Undeclared clause promotion');
      assert.ok(l.record_hash && l.trigger_trace_id);
    }
    for (const key of clauses) accepted[key] = pair;
  }
  for (const [gate, ids] of Object.entries(requiredMutants)) {
    const r = reports[gate];
    assert.equal(r?.contract, 'maya.widgets-mutation-battery/2', `${gate}: absent receipt`);
    assert.equal(r.source_head, sourceHead, `${gate}: wrong code target`);
    assert.equal(r.status, 'AS-DECLARED', `${gate}: non-green receipt`);
    assert.equal(r.mismatches, 0);
    assert.deepEqual(r.baseline_red, [], `${gate}: red baseline`);
    const controls = Object.values(r.baseline_controls ?? {});
    assert.ok(controls.length, `${gate}: absent baseline controls`);
    for (const c of [...controls, ...Object.values(r.neutraliser_controls ?? {})]) {
      assert.ok(Object.keys(c.exits ?? {}).length, `${gate}: absent control exits`);
      assert.ok(Object.values(c.exits).every(x => x === 0), `${gate}: non-green control`);
      assert.deepEqual(c.failed, []);
      assert.deepEqual(c.problems, []);
    }
    assert.ok(r.mutants.every(m => m.status === m.expect && !['SURVIVED', 'UNEXPECTED'].includes(m.status)));
    for (const id of ids) {
      const m = r.mutants.find(m => m.id === id);
      assert.ok(m && m.status === m.expect && /killed$/.test(m.status) && m.kills.length, `${id}: no observed killer`);
    }
  }
  return accepted;
}

function main() {
  const args = process.argv.slice(2);
  const option = name => args[args.indexOf(name) + 1];
  for (const name of ['--evidence', '--mutations', '--source-head', '--out'])
    assert.ok(args.includes(name) && option(name) && !option(name).startsWith('--'), `Required ${name}`);
  const evidence = path.resolve(option('--evidence'));
  const mutations = path.resolve(option('--mutations'));
  const sourceHead = option('--source-head');
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(git('rev-parse', `${sourceHead}^{commit}`), sourceHead);
  // Evidence is pinned to code bytes, even when a later commit only packages documentation.
  assert.equal(git('diff', sourceHead, '--', 'maya-saas-backend'), '', 'Backend differs from the proof target');
  assert.equal(git('ls-files', '--others', '--exclude-standard', '--', 'maya-saas-backend'), '', 'Untracked backend source is outside the proof target');
  const manifestBytes = fs.readFileSync(path.join(evidence, 'evidence-manifest.jsonl'));
  const result = execFileSync(process.execPath, ['scripts/widgets-evidence-verify.mjs', '--dir', evidence],
    { cwd: path.join(root, 'maya-saas-backend'), encoding: 'utf8' });
  const verify = JSON.parse(result.split('\n')[0]);
  const reports = Object.fromEntries(Object.keys(requiredMutants).map(g => [g,
    JSON.parse(fs.readFileSync(path.join(mutations, `${g}.json`), 'utf8'))]));
  for (const [gate, r] of Object.entries(reports)) {
    const battery = `gate${gate}.json`;
    assert.equal(r.battery_hashes[battery], sha(fs.readFileSync(path.join(root,
      'maya-saas-backend/test/widgets-live/mutations', battery))), `${gate}: declaration drift`);
  }
  const accepted = admit({ manifestBytes, verify, reports, sourceHead });
  const base = load();
  assert.deepEqual(check(base), []);
  const audit = {
    contract: base.audit.contract,
    performedAt: new Date().toISOString(),
    unit: 'Widget Release Programme — current evidence overlay; no activation authority',
    baseCommit: sourceHead,
    against: base.audit.against,
    clauseStates: base.audit.clauseStates,
    builder: { phase: 'FINAL', skeleton: false, kind: 'current-overlay',
      historical_audit_sha256: sha(fs.readFileSync(path.join(root,
        'docs/rebuild/evidence/maya-chat-first-ux/gate-conformance-audit.json'))),
      inherited_evidence: 'Unchanged states retain historical provenance; not freshly recertified by this overlay.',
      source_head: sourceHead, manifest_sha256: verify.manifest_sha256,
      sidecars: Object.fromEntries(['mint-provenance.jsonl', 'database-before-teardown.jsonl'].map(f =>
        [f, sha(fs.readFileSync(path.join(evidence, f)))])),
      mutation_reports: Object.fromEntries(Object.entries(reports).map(([g, r]) => [g, {
        sha256: sha(fs.readFileSync(path.join(mutations, `${g}.json`))),
        status: r.status, restrictions: r.restrictions,
      }])),
      mutation_scope: 'Individual declared killers with green controls; restricted receipts are NOT a full CI mutation certificate.',
    },
    // Old per-gate notes/ceilings describe I-AUD0, not the current implementation.
    gates: base.audit.gates.map(g => ({ n: g.n, name: g.name, clauses: structuredClone(g.clauses) })),
  };
  const disposition = JSON.parse(fs.readFileSync(path.join(here, 'clause-disposition.json'), 'utf8'));
  assert.deepEqual(disposition.clauses.filter(c => c.after === 'L').map(c => c.id).sort(), Object.keys(accepted).sort());
  for (const g of audit.gates) {
    for (const [key, c] of Object.entries(g.clauses)) {
      // The pinned historical audit retains full kill traces. Avoid repeating them once per clause.
      c.mutants = (c.mutants ?? []).map(({ id, battery, status, report }) => ({ id, battery, status, report }));
      if (accepted[key]) {
        assert.equal(c.state, 'false', `${key}: not a baseline false clause`);
        c.state = 'L'; c.conforms = true; c.built = true; c.evidence = accepted[key];
        for (const obsolete of ['blocked', 'blocked_part', 'false_part', 'reason', 'note', 'waits_on', 'built_evidence', 'built_note']) delete c[obsolete];
        c.built_evidence = disposition.clauses.find(r => r.id === key).implementation_source;
        c.current_proof = 'Real HTTP/BIN internal-calendar create journey; server-minted successor lineage. No external provider effect or carrier acceptance claim.';
      }
      if (['G12-R1b', 'G12-I11', 'G13-R2'].includes(key)) {
        c.built = true;
        c.reason = 'Implementation present (OD-1/U12c/U13d); whole NAVIGATE target-class HTTP/BIN proof still absent.';
        c.built_evidence = 'NAVIGATE-CURRENT-EVIDENCE.md';
        delete c.built_note;
      }
    }
    const states = Object.values(g.clauses).map(c => c.state);
    g.figures = Object.fromEntries(['L', 'L-T', 'U', 'false', 'BLOCKED-DISCHARGE'].map(s => [s, states.filter(x => x === s).length]));
    g.figures.STOPPED = states.filter(s => s.startsWith('STOPPED:')).length;
    g.class = states.every(s => ['L', 'L-T'].includes(s)) ? 'COMPLETE' : states.every(s => ['L', 'L-T', 'U'].includes(s)) ? 'COMPLETE-U' : 'PARTIAL';
  }
  audit.headline = recomputeHeadline(audit);
  audit.counts = { gates: audit.gates.length, clauses: 0, byState: {} };
  for (const g of audit.gates) for (const c of Object.values(g.clauses)) {
    audit.counts.clauses++;
    audit.counts.byState[c.state] = (audit.counts.byState[c.state] ?? 0) + 1;
  }
  assert.deepEqual(check({ ...base, audit }), []);
  fs.writeFileSync(path.resolve(option('--out')), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({ headline: audit.headline, counts: audit.counts, promoted: Object.keys(accepted), activation: 'FORBIDDEN' }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
