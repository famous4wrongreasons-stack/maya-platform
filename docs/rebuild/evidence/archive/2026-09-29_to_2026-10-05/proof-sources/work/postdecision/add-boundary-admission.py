from pathlib import Path
p=Path(__file__).resolve().parents[2]/'work/widget-release/docs/rebuild/widget-release-programme/postdecision/recompute.mjs'
s=p.read_text().replace("import { fileURLToPath } from 'node:url';", "import { fileURLToPath } from 'node:url';\nimport { execFileSync } from 'node:child_process';")
insert='''
export function admitActionBoundary(manifestBytes, verification, report, sourceHead) {
  assert.equal(verification.contract, 'maya.widgets-evidence-verify/1');
  assert.deepEqual(verification.violations, []);
  assert.equal(verification.manifest_sha256, hash(manifestBytes));
  const pair = manifestBytes.toString().trim().split('\\n').map(JSON.parse).filter(l => l.test_id === 'WR-COMMIT-ACTION-BOUNDARY');
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
'''
s=s.replace('function main() {',insert+'\nfunction main() {')
anchor="  audit.builder.owner_decision_overlay ="
pos=s.index(anchor)
block='''  const option = name => process.argv[process.argv.indexOf(name) + 1];
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
    const delta = git('diff', '--name-only', raw.baseCommit, sourceHead, '--', 'maya-saas-backend').split('\\n').filter(Boolean);
    const permitted = new Set([
      'maya-saas-backend/src/widgets/routing/g13-action-boundary.architecture.spec.ts',
      'maya-saas-backend/test/widgets-live/support/fixtures.ts',
      'maya-saas-backend/test/widgets-live/support/release-booking-proof.ts',
      'maya-saas-backend/test/widgets-live/wr-release.live-spec.ts',
      'maya-saas-backend/test/widgets-live/mutations/gateAB.json',
    ]);
    assert.ok(delta.every(file => permitted.has(file)), 'Runtime drift invalidates inherited proofs');
    const evidence = path.resolve(option('--boundary-evidence'));
    const manifest = fs.readFileSync(path.join(evidence, 'evidence-manifest.jsonl'));
    const verified = JSON.parse(execFileSync(process.execPath, ['scripts/widgets-evidence-verify.mjs', '--dir', evidence], { cwd: backend, encoding: 'utf8' }).split('\\n')[0]);
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
    audit.owner_decisions.false_states_unchanged = true; // The one promotion is executable evidence, not a decision.
  }
'''
s=s[:pos]+block+s[pos:]
p.write_text(s)
