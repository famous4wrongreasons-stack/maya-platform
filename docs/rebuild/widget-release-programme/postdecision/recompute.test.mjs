import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { applyDecisions } from './recompute.mjs';
const json = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const baseline = () => json('../preintegration/current-audit.json');
const decisions = () => json('./owner-decisions.json');
const disposition = () => json('../preintegration/clause-disposition.json');
test('approved scope changes preserve all 165 states, 19 false clauses and separate strict/U figures', () => {
  const before = baseline(); const after = applyDecisions(before, decisions(), disposition());
  const rows = a => a.gates.flatMap(g => Object.entries(g.clauses));
  assert.deepEqual(rows(before).map(([k,c]) => [k,c.state]), rows(after).map(([k,c]) => [k,c.state]));
  assert.equal(rows(after).filter(([,c]) => c.acceptance?.class === 'ACCEPTABLE_U_CLASS').length,17);
  assert.deepEqual(after.current_false_classification, { OWNER_DECISION_REQUIRED: 6, EVIDENCE_MISSING: 12, IMPLEMENTATION_MISSING: 1 });
  assert.equal(before.gates.flatMap(g => Object.values(g.clauses)).some(c => c.acceptance), false);
});
for (const duty of ['absence', 'refusal', 'mechanism', 'basis']) test(`owner approval cannot waive missing U ${duty}`, () => {
  const a=baseline(); const c=a.gates.flatMap(g=>Object.values(g.clauses)).find(c=>c.state==='U'); delete c.u_proof[duty];
  assert.throws(()=>applyDecisions(a,decisions(),disposition()));
});
test('refuses false-to-U relabel without new evidence and disposition',()=>{
  const a=baseline();a.gates.flatMap(g=>Object.values(g.clauses)).find(c=>c.state==='false').state='U';
  assert.throws(()=>applyDecisions(a,decisions(),disposition()));
});
test('scope cannot silently grant activation or migration',()=>{
  for(const field of ['production_activation','schema_migration_authorized']) {
    const d=decisions();d[field]=true;assert.throws(()=>applyDecisions(baseline(),d,disposition()));
  }
});
test('refuses substituted owner option',()=>{
  const d=decisions();d.decisions['OD-4']='A';assert.throws(()=>applyDecisions(baseline(),d,disposition()));
});

import { createHash } from 'node:crypto';
import { admitActionBoundary } from './recompute.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
function boundary() {
  const lines = ['HTTP','BIN'].map((entry,i)=>({ test_id:'WR-COMMIT-ACTION-BOUNDARY',entry,pid:i+1,claim:'L',gates_run:14,stopped_at_gate:'13',clauses:['G13-I7'],record_hash:`r${i}`,trigger_trace_id:`t${i}` }));
  const bytes=Buffer.from(lines.map(JSON.stringify).join('\n'));
  return { lines, bytes, verification:{contract:'maya.widgets-evidence-verify/1',manifest_sha256:digest(bytes),violations:[]}, report:{contract:'maya.widgets-mutation-battery/2',source_head:'head',status:'AS-DECLARED',mismatches:0,baseline_red:[],baseline_controls:{unit:{exits:{unit:0},failed:[],problems:[]}},mutants:['AB-M1','AB-M2'].map(id=>({id,status:'build-killed',kills:[{}]}))} };
}
const admit=x=>admitActionBoundary(x.bytes,x.verification,x.report,'head');
test('admits a verified independent action-boundary pair with both killed guards',()=>assert.equal(admit(boundary()).length,2));
for(const [label,mutate] of [
  ['red baseline',x=>x.report.baseline_controls.unit.exits.unit=1],
  ['absent baseline',x=>x.report.baseline_controls={}],
  ['surviving source guard',x=>x.report.mutants[1].status='SURVIVED'],
  ['missing architecture guard',x=>x.report.mutants.shift()],
  ['wrong proof target',x=>x.report.source_head='old'],
  ['changed manifest',x=>x.bytes=Buffer.from(x.bytes.toString()+'\n')],
  ['rejected provenance',x=>x.verification.violations=['bad provenance']],
]) test(`refuses action-boundary ${label}`,()=>{const x=boundary();mutate(x);assert.throws(()=>admit(x));});
for(const [label,change] of [
  ['missing BIN',lines=>lines.pop()],
  ['same process',lines=>lines[1].pid=lines[0].pid],
  ['unreviewed clause',lines=>lines[0].clauses.push('9.6')],
]) test(`refuses action-boundary ${label}`,()=>{const x=boundary();change(x.lines);x.bytes=Buffer.from(x.lines.map(JSON.stringify).join('\n'));x.verification.manifest_sha256=digest(x.bytes);assert.throws(()=>admit(x));});
