#!/usr/bin/env node
// CI scheduling only: partition mutants, never their test suites or controls.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STEPS = 'per mutant (live for live-killed/pending; unit,typecheck,k3 for build-killed)';
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
export function registry(dir) {
  return Object.fromEntries(fs.readdirSync(dir).sort().flatMap((file) => {
    const gate = /^gate([0-9A-Za-z-]+)\.json$/.exec(file)?.[1];
    if (!gate) return [];
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const mutants = JSON.parse(text);
    assert(mutants.length > 0, `${file}: empty battery is not evidence`);
    assert.equal(new Set(mutants.map((m) => m.id)).size, mutants.length, `${file}: duplicate mutant`);
    return [[gate, { file, hash: digest(text), mutants }]];
  }));
}

export function selectPartition(mutants, value) {
  const match = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(value ?? '');
  assert(match, 'partition must be index/count, both positive');
  const index = Number(match[1]); const count = Number(match[2]);
  assert(index <= count && count <= mutants.length, 'partition is out of range or empty');
  const selected = mutants.filter((_, i) => i % count === index - 1);
  return { selected, metadata: { index, count, total_mutants: mutants.length, mutant_ids: selected.map((m) => m.id) } };
}

export function plan(declared, requested = '') {
  const gates = requested.trim() ? requested.split(',').map((id) => id.trim()) : Object.keys(declared);
  assert(gates.length > 0 && new Set(gates).size === gates.length, 'empty or duplicate requested batteries');
  for (const gate of gates) assert(Object.hasOwn(declared, gate), `undeclared battery ${gate}`);
  const include = gates.flatMap((gate) => {
    // The previous unfiltered Gate 7 run took 214 minutes, the first complete Gate 9 run exceeded
    // three hours, and final-head Gate 6 and Gate 13 jobs were cancelled at the 180-minute budget.
    // P-mint completed at 178 minutes, which is not a repeatable release margin. Partition mutants only:
    // every job retains its full tests and controls, and assemble() refuses incomplete or overlapping
    // coverage. No assertion, killer, control or declared expectation is reduced.
    const count = gate === '6' || gate === '7' || gate === '9' || gate === '13' ? 4 : gate === 'P-mint' ? 2 : 1;
    return Array.from({ length: count }, (_, i) => ({ gate, partition: count === 1 ? '' : `${i + 1}/${count}`, slot: count === 1 ? gate : `${gate}-part-${i + 1}-of-${count}` }));
  });
  return { gates, matrix: { include } };
}

const exact = (actual, expected, context) => assert.deepEqual(actual, expected, context);
const sortedKeys = (value) => Object.keys(value ?? {}).sort();
const defaultSteps = (m) => (m.expect ?? 'live-killed') === 'build-killed' ? ['unit', 'typecheck', 'k3'] : ['live'];
const normalKillers = (m) => m.killers.map((k) => typeof k === 'string' ? { test: k, neutralisers: null } : k);
const controlKey = (set, steps) => `${set ?? 'baseline'}|${steps.join(',')}`;

export function assemble(declared, receipts, head, requested = '') {
  assert(/^[0-9a-f]{40}$/.test(head), 'exact source HEAD required');
  const expected = plan(declared, requested);
  exact(receipts.length, expected.matrix.include.length, 'missing or extra partition receipt');
  const result = [];
  const used = new Set();
  for (const gate of expected.gates) {
    const battery = declared[gate];
    const rows = []; const parts = []; const baseline = {}; const neutralisers = {};
    for (const job of expected.matrix.include.filter((j) => j.gate === gate)) {
      const partition = job.partition ? selectPartition(battery.mutants, job.partition) : null;
      const candidates = receipts.filter((r) => r.batteries?.length === 1 && r.batteries[0] === battery.file &&
        (partition ? r.partition?.index === partition.metadata.index && r.partition?.count === partition.metadata.count : r.partition === null));
      exact(candidates.length, 1, `${job.slot}: missing or duplicate receipt`);
      const r = candidates[0]; assert(!used.has(r)); used.add(r);
      exact(r.contract, 'maya.widgets-mutation-battery/2', `${job.slot}: runner contract`);
      exact(r.source_head, head, `${job.slot}: stale source`);
      exact(r.battery_hashes, { [battery.file]: battery.hash }, `${job.slot}: declaration changed`);
      exact(r.partition, partition?.metadata ?? null, `${job.slot}: partition manifest`);
      exact(r.status, partition ? 'PARTITION-AS-DECLARED' : 'AS-DECLARED', `${job.slot}: incomplete/failed run`);
      exact(r.mismatches, 0, `${job.slot}: status mismatch`);
      exact(r.steps, DEFAULT_STEPS, `${job.slot}: reduced steps`);
      exact(r.restrictions, { live_tests: null, live_filter: null, unit_tests: null }, `${job.slot}: restricted tests`);
      assert(Number.isFinite(Date.parse(r.startedAt)) && Date.parse(r.finishedAt) >= Date.parse(r.startedAt), `${job.slot}: unfinished`);
      assert.equal(r.evidence_rule?.not_verified_here?.length, 2, `${job.slot}: evidence limits missing`);
      const selected = partition?.selected ?? battery.mutants;
      exact(r.mutants.map((m) => m.id), selected.map((m) => m.id), `${job.slot}: wrong/missing/duplicate mutants`);
      const expectedBaseline = new Set(); const expectedNeutralisers = new Set();
      for (const [i, m] of r.mutants.entries()) {
        const source = selected[i];
        exact(m.battery, battery.file, `${m.id}: battery`);
        if (typeof source.equivalent === 'string') {
          exact(m.status, 'equivalent', `${m.id}: equivalence`); exact(m.reason, source.equivalent); continue;
        }
        const status = source.expect ?? 'live-killed'; const steps = defaultSteps(source);
        exact(m.expect, status, `${m.id}: declared expectation`); exact(m.status, status, `${m.id}: survived or unexpected`);
        exact(m.steps, steps, `${m.id}: missing steps`);
        exact(m.problems ?? [], [], `${m.id}: process/report crash`);
        exact(m.vacuous, [], `${m.id}: vacuous kill`);
        const killers = normalKillers(source); const sets = [...new Set(killers.map((k) => k.neutralisers))];
        exact(sortedKeys(m.exits), sets.map((s) => s ?? 'plain').sort(), `${m.id}: missing execution`);
        for (const set of sets) {
          const key = controlKey(set, steps);
          (set ? expectedNeutralisers : expectedBaseline).add(key);
          const c = (set ? r.neutraliser_controls : r.baseline_controls)?.[key];
          assert(c, `${m.id}: missing control ${key}`);
          exact(c.set, set); exact(c.steps, steps); exact(c.problems, [], `${m.id}: control crash`);
          exact(sortedKeys(c.exits), [...steps].sort(), `${m.id}: incomplete control`);
          exact(sortedKeys(m.exits[set ?? 'plain']), [...steps].sort(), `${m.id}: incomplete mutant`);
          for (const step of steps) {
            assert([0, 1, 2].includes(c.exits[step]), `${m.id}: abnormal control exit`);
            assert([0, 1, 2].includes(m.exits[set ?? 'plain'][step]), `${m.id}: abnormal mutant exit`);
            if (!set) exact(c.exits[step], 0, `${m.id}: baseline red`);
          }
          if (!set) exact(c.failed, [], `${m.id}: baseline red assertions`);
        }
        if (status === 'pending') { exact(m.kills, [], `${m.id}: pending is not killed`); }
        else {
          assert(m.kills.length > 0, `${m.id}: missing killer`);
          for (const kill of m.kills) {
            assert(killers.some((k) => k.test === kill.killer && k.neutralisers === kill.neutralisers), `${m.id}: undeclared killer`);
            assert(steps.includes(kill.step) && m.exits[kill.neutralisers ?? 'plain'][kill.step] !== 0, `${m.id}: no failing killer step`);
          }
          exact(m.kills.some((k) => k.step === 'live'), status === 'live-killed', `${m.id}: wrong kill class`);
        }
      }
      exact(sortedKeys(r.baseline_controls), [...expectedBaseline].sort(), `${job.slot}: baseline coverage`);
      exact(sortedKeys(r.neutraliser_controls), [...expectedNeutralisers].sort(), `${job.slot}: neutraliser coverage`);
      for (const [key, c] of Object.entries(r.baseline_controls)) baseline[`${job.slot}:${key}`] = c;
      for (const [key, c] of Object.entries(r.neutraliser_controls)) neutralisers[`${job.slot}:${key}`] = c;
      rows.push(...r.mutants); parts.push(r);
    }
    exact(rows.length, battery.mutants.length, `${gate}: coverage`);
    const byId = new Map(rows.map((m) => [m.id, m])); exact(byId.size, rows.length, `${gate}: duplicate mutant`);
    result.push({
      ...parts[0], status: 'AS-DECLARED', partition: null,
      startedAt: parts.map((r) => r.startedAt).sort()[0], finishedAt: parts.map((r) => r.finishedAt).sort().at(-1),
      assembly: { contract: 'maya.widgets-mutation-ci/1', partitions: parts.length, all_declared_mutants: true, unrestricted_tests: true },
      baseline_controls: baseline, neutraliser_controls: neutralisers,
      mutants: battery.mutants.map((m) => byId.get(m.id)),
      live_evidence_mutants: rows.filter((m) => m.live_evidence).map((m) => `${m.battery}#${m.id}`),
    });
  }
  exact(used.size, receipts.length, 'unexpected receipt');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const declared = registry(path.join(backend, 'test/widgets-live/mutations'));
    const [command, ...args] = process.argv.slice(2);
    if (command === 'plan') {
      const p = plan(declared, args[0] ?? '');
      process.stdout.write(`gates=${JSON.stringify(p.gates)}\nmatrix=${JSON.stringify(p.matrix)}\n`);
    } else {
      assert.equal(command, 'assemble', 'expected plan or assemble');
      const [input, output, head, requested = ''] = args;
      const receipts = fs.readdirSync(input).filter((f) => /^widgets-mutation-part-.*\.json$/.test(f)).sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(input, f), 'utf8')));
      const reports = assemble(declared, receipts, head, requested);
      fs.mkdirSync(output, { recursive: true });
      for (const report of reports) fs.writeFileSync(path.join(output, `widgets-mutation-report-${report.batteries[0].slice(4, -5)}.json`), JSON.stringify(report, null, 2) + '\n');
      process.stdout.write(`COMPLETE BATTERIES: ${reports.length}; mutants: ${reports.reduce((n, r) => n + r.mutants.length, 0)}\n`);
    }
  } catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; }
}
