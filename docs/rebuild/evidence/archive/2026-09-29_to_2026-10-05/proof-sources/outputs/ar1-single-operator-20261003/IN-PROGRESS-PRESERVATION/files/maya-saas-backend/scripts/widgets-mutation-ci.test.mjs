import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import {
  assemble,
  admitRelease,
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

test('L2 release admission refuses a broken real contract and admits its restored bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-l2-contract-'));
  const copy = path.join(root, 'maya-saas-backend');
  fs.mkdirSync(copy);
  try {
    for (const item of fs.readdirSync(backend)) {
      if (item === 'src' || item === 'scripts') continue;
      if (item === 'tsconfig.build.json') fs.copyFileSync(path.join(backend, item), path.join(copy, item));
      else fs.symlinkSync(path.join(backend, item), path.join(copy, item));
    }
    for (const dir of ['src', 'scripts']) {
      fs.mkdirSync(path.join(copy, dir));
      for (const item of fs.readdirSync(path.join(backend, dir))) {
        const from = path.join(backend, dir, item), to = path.join(copy, dir, item);
        if (item === 'widget-contract' || item === 'widget-contract-check.mjs') fs.cpSync(from, to, { recursive: true });
        else fs.symlinkSync(from, to);
      }
    }
    fs.symlinkSync(path.resolve(backend, '../docs'), path.join(root, 'docs'));
    const target = path.join(copy, 'src/widget-contract/kinds.ts');
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, original + '\nconst l2BrokenContract: never = "must refuse";\n');
    assert.throws(() => admitRelease(declared, fixture(), head, copy), /Command failed/);
    fs.writeFileSync(target, original);
    assert.equal(admitRelease(declared, fixture(), head, copy).length, Object.keys(declared).length);
    const buildPath = path.join(copy, 'tsconfig.build.json');
    const buildBytes = fs.readFileSync(buildPath, 'utf8');
    const brokenBuild = JSON.parse(buildBytes);
    brokenBuild.exclude = brokenBuild.exclude.filter(x => x !== 'src/widget-contract');
    fs.writeFileSync(buildPath, JSON.stringify(brokenBuild));
    assert.throws(() => admitRelease(declared, fixture(), head, copy), /build-exclusion fence missing/);
    fs.writeFileSync(buildPath, buildBytes);
    assert.equal(admitRelease(declared, fixture(), head, copy).length, Object.keys(declared).length);
    const workflow = fs.readFileSync(path.resolve(backend, '../.github/workflows/widget-contract.yml'), 'utf8');
    assert.doesNotMatch(workflow, /continue-on-error:/);
    assert.match(fs.readFileSync(path.resolve(backend, '../.github/workflows/widgets-mutation.yml'), 'utf8'),
      /widgets-mutation-ci\.mjs release mutation-parts/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

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
      // The runner always measures an unmutated live reference, including when
      // every live killer in a partition uses a deliberately red neutraliser.
      if (steps.includes('live')) baseline['baseline|live'] = {
        set: null, steps: ['live'], exits: { live: 0 }, failed: [], problems: [],
      };
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

test('47 batteries, 68 jobs: AR1 single-operator governance covers 544 declarations', () => {
  const p = plan(declared);
  assert.equal(p.gates.length, 47); assert.equal(p.matrix.include.length, 68);
  assert.deepEqual(declared.PU.mutants.map(m => m.id), Array.from({ length: 12 }, (_, i) => `PU-M${i + 1}`));
  assert.deepEqual(declared.SO.mutants.map(m => m.id), Array.from({ length: 8 }, (_, i) => `SO-M${i + 1}`));
  assert.equal(declared.FB.mutants.length, 15);
  assert.deepEqual(declared.SB1.mutants.map(m => m.id), Array.from({ length: 10 }, (_, i) => `SB1-M${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(declared.AB.mutants.map(m => m.id), ['AB-M1', 'AB-M2']);
  assert.deepEqual(declared.SV2.mutants.map(m => m.id), Array.from({ length: 13 }, (_, i) => `SV2-M${i + 1}`));
  assert.deepEqual(declared.SBV.mutants.map(m => m.id), Array.from({ length: 8 }, (_, i) => `SBV-M${i + 1}`));
  assert.deepEqual(declared.WF.mutants.map(m => m.id), ['WF-M1', 'WF-M2', 'WF-M3']);
  assert.deepEqual(declared.TURN.mutants.map(m => m.id), Array.from({ length: 14 }, (_, i) => `TURN-M${i + 1}`));
  assert.equal(declared['H-harness'].mutants.filter(m => m.id === 'H-LOOPBACK-1').length, 1);
  assert.equal(declared['H-harness'].mutants.filter(m => m.id === 'H-R02-LOOPBACK-1').length, 1);
  assert.equal(declared['H-harness'].mutants.filter(m => m.id === 'H-ADMIN-LOOPBACK-1').length, 1);
  assert.equal(declared['H-harness'].mutants.filter(m => m.id === 'H-BOOT-LOOPBACK-1').length, 1);
  assert.equal(declared['H-harness'].mutants.filter(m => m.id === 'H-P408-CLOCK-1').length, 1);
  const r = assemble(declared, fixture(), head);
  assert.equal(r.length, 47); assert.equal(r.reduce((n, b) => n + b.mutants.length, 0), 544);
  for (const report of r) {
    assert.equal(report.status, 'AS-DECLARED');
    assert.deepEqual(report.mutants.map((m) => m.id), declared[report.batteries[0].slice(4, -5)].mutants.map((m) => m.id));
  }
});

test('assembly accepts the mandatory plain live reference of a neutralised-only live battery', () => {
  const receipts = fixture().filter(r => r.batteries[0] === 'gate4.json');
  const live = receipts[0].mutants.filter(m => m.steps.includes('live'));
  assert.ok(live.length > 0);
  assert.ok(live.every(m => !Object.hasOwn(m.exits, 'plain')));
  const report = assemble(declared, receipts, head, '4')[0];
  assert.equal(report.baseline_controls['4:baseline|live'].exits.live, 0);
  assert.ok(Object.keys(report.neutraliser_controls).length > 0);
});

for (const [name, alter] of Object.entries({
  missing: r => { delete r.baseline_controls['baseline|live']; },
  'missing exit': r => { r.baseline_controls['baseline|live'].exits = {}; },
  'missing steps': r => { r.baseline_controls['baseline|live'].steps = []; },
  'neutraliser substituted': r => { r.baseline_controls['baseline|live'].set = 'N4'; },
  'missing assertion list': r => { delete r.baseline_controls['baseline|live'].failed; },
  'missing problems list': r => { delete r.baseline_controls['baseline|live'].problems; },
  'red exit': r => { r.baseline_controls['baseline|live'].exits.live = 1; },
  'failed assertion': r => { r.baseline_controls['baseline|live'].failed = ['unmutated live failure']; },
  'extra control': r => { r.baseline_controls['baseline|invented'] = structuredClone(r.baseline_controls['baseline|live']); },
})) test(`mandatory neutralised-live reference fails closed: ${name}`, () => {
  const receipts = fixture().filter(r => r.batteries[0] === 'gate4.json');
  alter(receipts[0]);
  assert.throws(() => assemble(declared, receipts, head, '4'));
});

const timelineMutationOwners = [
  ...Array.from({ length: 7 }, (_, i) => ({ gate: '9', id: `M9-${i + 27}`, method: 'appendUserTurn', killer: 'T9-WRITE-1' })),
  ...['TURN-M13', 'TURN-M14'].map(id => ({ gate: 'TURN', id, method: 'ensureAssistantExecutionTurn', killer: 'TURN-ASSISTANT-INDEX' })),
];
for (const { gate, id, method, killer } of timelineMutationOwners) test(`${id} changes only its declared timeline writer ${method}`, () => {
  const mutant = declared[gate].mutants.find(m => m.id === id);
  assert.equal(mutant.file, 'src/widgets/stores/timeline.store.ts');
  assert.equal(mutant.expect, id === 'M9-30' ? 'live-killed' : 'build-killed');
  assert.ok(mutant.killers.includes(killer));
  const source = fs.readFileSync(path.join(backend, mutant.file), 'utf8');
  const parsed = ts.createSourceFile(mutant.file, source, ts.ScriptTarget.Latest, true);
  const store = parsed.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'TimelineStore');
  const writer = store?.members.find(n => ts.isMethodDeclaration(n) && n.name?.getText(parsed) === method);
  assert.ok(writer?.body, 'the declared timeline writer must exist');
  const at = source.indexOf(mutant.find);
  assert.ok(at >= 0 && source.indexOf(mutant.find, at + 1) === -1, 'the edit must have one exact target');
  assert.ok(at >= writer.body.getStart(parsed) && at + mutant.find.length <= writer.body.end,
    `${id} must edit ${method}; a matching query in another writer is the wrong mutation`);
  const changed = source.replace(mutant.find, () => mutant.replace);
  assert.equal(changed.slice(0, writer.body.getStart(parsed)), source.slice(0, writer.body.getStart(parsed)));
  const sizeDelta = mutant.replace.length - mutant.find.length;
  assert.equal(changed.slice(writer.body.end + sizeDelta), source.slice(writer.body.end),
    'the mutation must leave all other methods unchanged');
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
  'archival receipt': (r) => { r[0].archival_only = true; },
  'unverified receipt': (r) => { r[0].release_admissible = false; },
  'manual historical audit': (r) => { r[0] = { contract: 'maya.gate-audit/1', archival_only: true }; },
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
  'filtered unit titles': (r) => { r[0].restrictions.unit_filter = 'one test'; },
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
  assert.equal(assemble(declared, receipts, head).length, 47, 'a red neutraliser control is not a red baseline');
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
