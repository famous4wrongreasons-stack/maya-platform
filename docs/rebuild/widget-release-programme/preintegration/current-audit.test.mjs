import assert from 'node:assert/strict';
import { test } from 'node:test';
import { admit, promotions, sha } from './current-audit.mjs';

function fixture() {
  const lines = Object.entries(promotions).flatMap(([test_id, clauses]) => ['HTTP', 'BIN'].map((entry, i) => ({
    test_id, clauses: [...clauses], entry, pid: i + 1, claim: 'L', gates_run: 14, stopped_at_gate: '13', record_hash: `record-${i}`, trigger_trace_id: `trace-${i}`,
  })));
  const manifestBytes = Buffer.from(lines.map(JSON.stringify).join('\n'));
  const reports = Object.fromEntries(Object.entries({ WR: ['WR-M22', 'WR-M23'], 'H-harness': ['R-M10', 'R-M16', 'R-M17'] }).map(([g, ids]) => [g, {
    contract: 'maya.widgets-mutation-battery/2', source_head: 'code', status: 'AS-DECLARED', mismatches: 0, baseline_red: [],
    baseline_controls: { live: { exits: { live: 0 }, failed: [], problems: [] } },
    mutants: ids.map(id => ({ id, status: 'live-killed', expect: 'live-killed', kills: [{}] })),
  }]));
  return { sourceHead: 'code', manifestBytes, verify: { contract: 'maya.widgets-evidence-verify/1', violations: [], manifest_sha256: sha(manifestBytes) }, reports };
}
const changeLines = (x, fn) => {
  const lines = x.manifestBytes.toString().split('\n').map(JSON.parse);
  fn(lines);
  x.manifestBytes = Buffer.from(lines.map(JSON.stringify).join('\n'));
  x.verify.manifest_sha256 = sha(x.manifestBytes);
};
test('admits exactly the twelve declared paired claims', () => assert.equal(Object.keys(admit(fixture())).length, 12));
for (const [name, mutate] of [
  ['missing BIN', x => changeLines(x, lines => lines.splice(1, 1))],
  ['same process', x => changeLines(x, lines => { lines[1].pid = lines[0].pid; })],
  ['unreviewed clause', x => changeLines(x, lines => { lines[0].clauses.push('9.6'); })],
  ['changed manifest', x => { x.manifestBytes = Buffer.from(x.manifestBytes.toString() + '\n'); }],
  ['verifier refusal', x => { x.verify.violations = ['V-PROV-TRIGGER']; }],
  ['red baseline summary', x => { x.reports.WR.baseline_red = ['live']; }],
  ['red hidden control', x => { x.reports.WR.baseline_controls.live.exits.live = 1; }],
  ['absent controls', x => { x.reports.WR.baseline_controls = {}; }],
  ['non-green receipt', x => { x.reports.WR.status = 'BASELINE-RED'; }],
  ['wrong source target', x => { x.reports.WR.source_head = 'other'; }],
  ['surviving lineage guard', x => { x.reports['H-harness'].mutants[0].status = 'SURVIVED'; }],
  ['missing declared guard', x => { x.reports.WR.mutants.pop(); }],
]) test(`refuses ${name}`, () => { const x = fixture(); mutate(x); assert.throws(() => admit(x)); });
