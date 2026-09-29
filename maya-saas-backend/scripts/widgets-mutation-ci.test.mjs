import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assemble,
  DEFAULT_STEPS,
  describeRedBaselines,
  plan,
  redBaselineControls,
  registry,
  selectPartition,
  shardStatus,
} from './widgets-mutation-ci.mjs';

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
      if (typeof m.equivalent === 'string') {
        return { battery: b.file, id: m.id, status: 'equivalent', reason: m.equivalent };
      }
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
      baseline_controls: baseline, neutraliser_controls: neutralisers, baseline_red: [], mutants,
    };
  });
}

test('32 batteries, 53 jobs: disjoint Gate 6/7/9/10/13 and P-mint partitions cover the same 394 declarations', () => {
  const p = plan(declared);
  assert.equal(p.gates.length, 32); assert.equal(p.matrix.include.length, 53);
  const r = assemble(declared, fixture(), head);
  assert.equal(r.length, 32); assert.equal(r.reduce((n, b) => n + b.mutants.length, 0), 394);
  for (const report of r) {
    assert.equal(report.status, 'AS-DECLARED');
    assert.deepEqual(report.mutants.map((m) => m.id), declared[report.batteries[0].slice(4, -5)].mutants.map((m) => m.id));
  }
});

test('runner dry-run independently executes the same disjoint partition selection', () => {
  for (const [gate, count] of [['6', 4], ['7', 4], ['9', 4], ['10', 4], ['13', 4], ['P-mint', 4], ['WR', 4]]) {
    const seen = [];
    for (let index = 1; index <= count; index++) {
      const child = spawnSync(process.execPath, ['scripts/widgets-mutation-battery.mjs', '--gate', gate, '--partition', `${index}/${count}`, '--dry-run'], { cwd: backend, encoding: 'utf8' });
      assert.equal(child.status, 0, child.stderr);
      const r = JSON.parse(child.stdout);
      assert.equal(r.status, 'DRY-RUN');
      assert.deepEqual(r.partition, selectPartition(declared[gate].mutants, `${index}/${count}`).metadata);
      assert.equal(r.battery_hashes[`gate${gate}.json`], declared[gate].hash);
      assert.deepEqual(r.mutants.map((m) => m.id), r.partition.mutant_ids);
      for (const m of r.mutants) {
        if (typeof m.equivalent === 'string') {
          assert.equal(m.steps, undefined);
        } else {
          assert.deepEqual(m.steps, m.expect === 'build-killed' ? ['unit', 'typecheck', 'k3'] : ['live']);
        }
      }
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
  // The same hole with no failing ASSERTION to point at: `typecheck:widgets-live` and k3 write no
  // jest report, so a red baseline there is visible only in the step's exit code.
  'red baseline visible only in a step exit': (r) => {
    const c = Object.values(r[0].baseline_controls)[0];
    c.exits[c.steps.at(-1)] = 2;
  },
  'receipt declares its own red baseline': (r) => {
    r[0].baseline_red = [{ control: 'baseline|live', steps: ['live'], nonzero_exits: { live: 1 }, failed: ['a test'], problems: [] }];
  },
  'shard promoted a red baseline to AS-DECLARED': (r) => {
    const c = Object.values(r[0].baseline_controls)[0];
    c.exits[c.steps[0]] = 1;
    c.failed = ['some baseline test'];
    r[0].status = r[0].partition ? 'PARTITION-AS-DECLARED' : 'AS-DECLARED';
    r[0].mismatches = 0;
    r[0].baseline_red = [];
  },
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

// ── the baseline-control gate (FBE2E receipt integrity) ──────────────────────────────────────────
//
// A shard whose UNMUTATED baseline was red measured nothing it can be trusted on, and until this gate
// it said AS-DECLARED and exited 0. Run 36262327428 shipped seven such shards. These tests pin both
// halves of the repair: the status/exit a shard derives, and the part an assembly refuses.

test('gate: a baseline control is red on a non-zero step exit, a failed assertion, or a missing report', () => {
  const green = { 'baseline|live': { set: null, steps: ['live'], exits: { live: 0 }, failed: [], problems: [] } };
  assert.deepEqual(redBaselineControls(green), []);
  assert.deepEqual(redBaselineControls({}), []);
  assert.deepEqual(redBaselineControls(undefined), []);

  const byExit = redBaselineControls({ 'baseline|unit,typecheck,k3': { set: null, steps: ['unit', 'typecheck', 'k3'], exits: { unit: 0, typecheck: 2, k3: 0 }, failed: [], problems: [] } });
  assert.equal(byExit.length, 1);
  assert.deepEqual(byExit[0].nonzero_exits, { typecheck: 2 });

  const byAssertion = redBaselineControls({ 'baseline|live': { set: null, steps: ['live'], exits: { live: 0 }, failed: ['E2 something'], problems: [] } });
  assert.equal(byAssertion.length, 1, 'a failed assertion with a 0 exit is still a red baseline');

  const byProblem = redBaselineControls({ 'baseline|live': { set: null, steps: ['live'], exits: { live: 0 }, failed: [], problems: ['jest wrote no report'] } });
  assert.equal(byProblem.length, 1, 'a control whose report never arrived is red, not innocent');

  // NEUTRALISER controls are exempt by construction: the function is only ever given the baselines.
  // A neutraliser set exists to switch a check off, so red is its declared job and vacuity accounts
  // for it; the gate would otherwise refuse every battery that declares a neutraliser.
  const receipts = fixture();
  const withNeutralisers = receipts.filter((r) => Object.keys(r.neutraliser_controls).length > 0);
  assert.ok(withNeutralisers.length > 0, 'the declared batteries include neutraliser sets');
  for (const r of withNeutralisers) {
    for (const c of Object.values(r.neutraliser_controls)) { c.exits[c.steps[0]] = 1; c.failed = ['red on the neutralised copy']; }
    assert.deepEqual(redBaselineControls(r.baseline_controls), []);
  }
  assert.equal(assemble(declared, receipts, head).length, 32, 'a red neutraliser control is not a red baseline');
});

test('gate: a red baseline is a distinct shard status and a non-zero exit, and never hides a mismatch', () => {
  const red = [{ control: 'baseline|live', steps: ['live'], nonzero_exits: { live: 1 }, failed: ['E2 something'], problems: [] }];
  assert.deepEqual(shardStatus({ red: [], mismatches: 0, partition: null }), { status: 'AS-DECLARED', exit: 0 });
  assert.deepEqual(shardStatus({ red: [], mismatches: 0, partition: { index: 1, count: 2 } }), { status: 'PARTITION-AS-DECLARED', exit: 0 });
  assert.deepEqual(shardStatus({ red: [], mismatches: 3, partition: null }), { status: 'MISMATCH', exit: 1 });
  // The whole point: mismatches === 0 no longer buys AS-DECLARED, and a partition does not soften it.
  assert.deepEqual(shardStatus({ red, mismatches: 0, partition: null }), { status: 'BASELINE-RED', exit: 1 });
  assert.deepEqual(shardStatus({ red, mismatches: 0, partition: { index: 1, count: 2 } }), { status: 'BASELINE-RED', exit: 1 });
  assert.deepEqual(shardStatus({ red, mismatches: 2, partition: null }), { status: 'BASELINE-RED+MISMATCH', exit: 1 });
  for (const status of ['BASELINE-RED', 'BASELINE-RED+MISMATCH', 'MISMATCH'])
    assert.notEqual(status, 'AS-DECLARED');
});

test('gate: the refusal names the control, the steps and every failing baseline test', () => {
  // P-f88's receipt from run 36262327428, reduced to the fields that matter.
  const K9 = 'K9 — the finance fence shell.pay carries ONE opaque session_ref and nothing else';
  const red = redBaselineControls({
    'baseline|live': { set: null, steps: ['live'], exits: { live: 0 }, failed: [], problems: [] },
    'baseline|unit,typecheck,k3': { set: null, steps: ['unit', 'typecheck', 'k3'], exits: { unit: 1, typecheck: 0, k3: 0 }, failed: [K9], problems: [] },
  });
  assert.equal(red.length, 1);
  const text = describeRedBaselines(red);
  assert.match(text, /baseline\|unit,typecheck,k3/);
  assert.match(text, /"unit":1/);
  assert.ok(text.includes(K9), 'the failing baseline test is named');
  assert.ok(!text.includes('baseline|live'), 'a green control is not reported');
});

test('gate: the assembly refuses the exact P-f88 part, AS-DECLARED and mismatch-free as it was written', () => {
  const K9 = 'K9 — the finance fence shell.pay carries ONE opaque session_ref and nothing else';
  const receipts = fixture();
  // Pick a part that really runs a unit baseline, and red it exactly as P-f88 was red: one failing
  // assertion in the unit step, no killer among the failures, every mutant AS-DECLARED, mismatches 0.
  const part = receipts.find((r) => r.baseline_controls['baseline|unit,typecheck,k3']);
  assert.ok(part, 'some declared battery runs a unit,typecheck,k3 baseline');
  const control = part.baseline_controls['baseline|unit,typecheck,k3'];
  control.exits.unit = 1;
  control.failed = [K9];
  assert.equal(part.status === 'AS-DECLARED' || part.status === 'PARTITION-AS-DECLARED', true);
  assert.equal(part.mismatches, 0);
  assert.throws(() => assemble(declared, receipts, head), (error) => error.message.includes(K9) && /red baseline control/.test(error.message));
});
