import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assemble, DEFAULT_STEPS, plan, registry, selectPartition } from './widgets-mutation-ci.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const declared = registry(path.join(backend, 'test/widgets-live/mutations'));
const head = 'a'.repeat(40);

// Synthetic receipts exercise rejection logic only; they are never release evidence.
function fixture() {
  return plan(declared).matrix.include.map((job) => {
    const b = declared[job.gate];
    const p = job.partition ? selectPartition(b.mutants, job.partition) : null;
    const baseline = {}; const neutralisers = {};
    const mutants = (p?.selected ?? b.mutants).map((m) => {
      const status = m.expect ?? 'live-killed';
      const steps = status === 'build-killed' ? ['unit', 'typecheck', 'k3'] : ['live'];
      const killers = m.killers.map((k) => typeof k === 'string' ? { test: k, neutralisers: null } : k);
      const sets = [...new Set(killers.map((k) => k.neutralisers))];
      const exits = {};
      for (const set of sets) {
        (set ? neutralisers : baseline)[`${set ?? 'baseline'}|${steps.join(',')}`] = {
          set, steps, exits: Object.fromEntries(steps.map((s) => [s, 0])), failed: [], problems: [],
        };
        exits[set ?? 'plain'] = Object.fromEntries(steps.map((s) => [s, 0]));
      }
      const k = killers[0];
      const step = status === 'live-killed' ? 'live' : k.test === 'k3' ? 'k3' : k.test === 'typecheck:widgets-live' ? 'typecheck' : 'unit';
      const kills = status === 'pending' ? [] : [{ killer: k.test, neutralisers: k.neutralisers, step }];
      if (kills.length) exits[k.neutralisers ?? 'plain'][step] = 1;
      return { battery: b.file, id: m.id, expect: status, status, steps, kills, exits, vacuous: [] };
    });
    return {
      contract: 'maya.widgets-mutation-battery/2', source_head: head, batteries: [b.file], battery_hashes: { [b.file]: b.hash },
      partition: p?.metadata ?? null, status: p ? 'PARTITION-AS-DECLARED' : 'AS-DECLARED', mismatches: 0,
      steps: DEFAULT_STEPS, restrictions: { live_tests: null, live_filter: null, unit_tests: null },
      startedAt: '2026-09-19T00:00:00.000Z', finishedAt: '2026-09-19T00:01:00.000Z',
      evidence_rule: { not_verified_here: ['mint provenance', 'paired BIN evidence'] },
      baseline_controls: baseline, neutraliser_controls: neutralisers, mutants,
    };
  });
}

test('25 batteries, 31 jobs: disjoint Gate 7/9 partitions cover the same 288 declarations', () => {
  const p = plan(declared);
  assert.equal(p.gates.length, 25); assert.equal(p.matrix.include.length, 31);
  const r = assemble(declared, fixture(), head);
  assert.equal(r.length, 25); assert.equal(r.reduce((n, b) => n + b.mutants.length, 0), 288);
  for (const report of r) {
    assert.equal(report.status, 'AS-DECLARED');
    assert.deepEqual(report.mutants.map((m) => m.id), declared[report.batteries[0].slice(4, -5)].mutants.map((m) => m.id));
  }
});

test('runner dry-run independently executes the same disjoint partition selection', () => {
  for (const gate of ['7', '9']) {
    const seen = [];
    for (let index = 1; index <= 4; index++) {
      const child = spawnSync(process.execPath, ['scripts/widgets-mutation-battery.mjs', '--gate', gate, '--partition', `${index}/4`, '--dry-run'], { cwd: backend, encoding: 'utf8' });
      assert.equal(child.status, 0, child.stderr);
      const r = JSON.parse(child.stdout);
      assert.equal(r.status, 'DRY-RUN');
      assert.deepEqual(r.partition, selectPartition(declared[gate].mutants, `${index}/4`).metadata);
      assert.equal(r.battery_hashes[`gate${gate}.json`], declared[gate].hash);
      assert.deepEqual(r.mutants.map((m) => m.id), r.partition.mutant_ids);
      for (const m of r.mutants) assert.deepEqual(m.steps, m.expect === 'build-killed' ? ['unit', 'typecheck', 'k3'] : ['live']);
      seen.push(...r.mutants.map((m) => m.id));
    }
    assert.equal(new Set(seen).size, declared[gate].mutants.length);
  }
});

test('invalid partition/gate requests fail before execution', () => {
  for (const value of ['0/4', '5/4', '1/999', '1', '-1/4']) assert.throws(() => selectPartition(declared['7'].mutants, value));
  for (const value of ['no-such-gate', '7,7']) assert.throws(() => plan(declared, value));
  const child = spawnSync(process.execPath, ['scripts/widgets-mutation-battery.mjs', '--partition', '1/4', '--dry-run'], { cwd: backend, encoding: 'utf8' });
  assert.equal(child.status, 2);
});

const counterfactuals = {
  'missing partition': (r) => r.pop(),
  'duplicate partition': (r) => r.push(structuredClone(r[0])),
  'substituted partition': (r) => { r[1] = structuredClone(r[0]); },
  'stale head': (r) => { r[0].source_head = 'b'.repeat(40); },
  'changed declaration': (r) => { r[0].battery_hashes[r[0].batteries[0]] = 'bad'; },
  'incomplete run': (r) => { r[0].finishedAt = null; },
  'partial promoted to complete': (r) => { r.find((p) => p.partition).status = 'AS-DECLARED'; },
  'missing mutant': (r) => r[0].mutants.pop(),
  'duplicate mutant': (r) => r[0].mutants.push(structuredClone(r[0].mutants[0])),
  'surviving mutant': (r) => { r[0].mutants[0].status = 'SURVIVED'; },
  'weakened expectation': (r) => { r[0].mutants[0].expect = r[0].mutants[0].status = 'pending'; },
  'filtered unit tests': (r) => { r[0].restrictions.unit_tests = 'one.spec.ts'; },
  'filtered live tests': (r) => { r[0].restrictions.live_filter = 'one test'; },
  'reduced steps': (r) => { r[0].steps = ['live']; },
  'worker crash': (r) => { r[0].mutants[0].problems = ['SIGSEGV']; },
  'null child exit': (r) => { r[0].mutants[0].exits.plain.unit = null; },
  'vacuous kill': (r) => { r[0].mutants[0].vacuous = [{ killer: 'already-red' }]; },
  'missing control': (r) => { r[0].baseline_controls = {}; },
  'control crash': (r) => { Object.values(r[0].baseline_controls)[0].problems = ['no report']; },
  'red baseline': (r) => { Object.values(r[0].baseline_controls)[0].failed = ['test']; },
  'missing killer': (r) => { r[0].mutants[0].kills = []; },
  'invented killer': (r) => { r[0].mutants[0].kills[0].killer = 'invented'; },
  'silent missing execution step': (r) => { delete r[0].mutants[0].exits.plain.unit; },
};
for (const [name, mutate] of Object.entries(counterfactuals)) test(`receipt fails closed: ${name}`, () => {
  const receipts = fixture(); mutate(receipts);
  assert.throws(() => assemble(declared, receipts, head));
});

test('explicit manual subset remains a subset, never a whole-programme receipt', () => {
  const receipts = fixture().filter((r) => r.batteries[0] === 'gate7.json');
  assert.equal(assemble(declared, receipts, head, '7').length, 1);
  assert.throws(() => assemble(declared, receipts, head));
});
