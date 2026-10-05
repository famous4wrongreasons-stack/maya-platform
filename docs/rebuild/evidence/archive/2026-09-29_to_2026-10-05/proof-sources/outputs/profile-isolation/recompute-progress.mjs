import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), repo = path.join(root, 'work/maya-controlled-integration');
const work = path.join(root, 'work/profile-isolation'), output = path.join(root, 'outputs/profile-isolation');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const head = execFileSync('git', ['rev-parse','HEAD'], {cwd:repo,encoding:'utf8'}).trim();
const baselineFile = path.join(repo,'docs/rebuild/widget-release-programme/approved-release/current-audit.json');
const baseline = fs.readFileSync(baselineFile);
const audit = JSON.parse(baseline);
const evidenceBytes = fs.readFileSync(path.join(work,'final-candidate-evidence/evidence-manifest.jsonl'));
const lines = evidenceBytes.toString().trim().split('\n').map(JSON.parse);
const verification = JSON.parse(fs.readFileSync(path.join(work,'final-evidence-verify-current.log'),'utf8').split('\n')[0]);
assert.deepEqual(verification.violations,[]);
assert.equal(verification.manifest_sha256,sha(evidenceBytes));
const pair = lines.filter(l=>l.test_id==='TURN-CANONICAL' && l.claim==='L');
assert.equal(pair.length,2);
assert.deepEqual(pair.map(l=>l.entry).sort(),['BIN','HTTP']);
for(const line of pair) {
  assert.deepEqual(line.clauses,['9.6']); assert.deepEqual(line.labels,['[E-MINT]']);
  assert(line.record_hash && line.trigger_trace_id);
}
const mutations = JSON.parse(fs.readFileSync(path.join(work,'final-turn-mutants-focused.json')));
assert.equal(mutations.status,'AS-DECLARED');
assert.deepEqual(mutations.baseline_red,[]);
assert.equal(mutations.mutants.length,12);
const declaration = fs.readFileSync(path.join(repo,'maya-saas-backend/test/widgets-live/mutations/gateTURN.json'));
assert.equal(mutations.battery_hashes['gateTURN.json'],sha(declaration));
for(const id of ['TURN-M8','TURN-M9','TURN-M11']) {
  const mutant=mutations.mutants.find(m=>m.id===id);
  assert(mutant.kills.some(k=>k.entry==='HTTP' && k.killer==='TURN-CANONICAL'));
}
const delta=execFileSync('git',['diff','--name-only',mutations.source_head,head],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert(delta.every(file=>file==='maya-saas-backend/scripts/widgets-mutation-ci.test.mjs'));
for(const gate of audit.gates)for(const [id,row]of Object.entries(gate.clauses))if(id==='9.6') {
  assert.equal(row.state,'false');
  row.state='L'; row.conforms=true; row.built=true;
  row.prior_blocker=row.current_blocker;
  for(const key of ['reason','blocked','built_note','current_blocker','current_classification'])delete row[key];
  row.evidence=pair;
  row.mutants=mutations.mutants.map(m=>({id:m.id,battery:m.battery,status:m.status,kills:m.kills}));
  row.acceptance={basis:'One canonical persisted USER writer, ordinary typed / typed widget / native tap; verified clean T-2b HTTP/BIN pair with byte-identical stored content and exact retry identity.',
    scope:'PROGRESS DISPOSITION ONLY',mutationRestriction:mutations.restrictions,fullReleaseCertification:false};
}
const {check,load,recomputeHeadline}=await import(pathToFileURL(path.join(repo,'docs/rebuild/evidence/maya-chat-first-ux/gate-audit-check.mjs')));
audit.baseCommit=head;audit.performedAt=new Date().toISOString();
audit.unit='Controlled integration: fixed profile and canonical USER turn source proof';
audit.builder={phase:'FINAL',skeleton:false,kind:'profile-isolation-progress',source_head:head,
  inherited_snapshot_sha256:sha(baseline),manifest_sha256:sha(evidenceBytes),
  verification:'receipts/evidence-verification.json',mutationSourceHead:mutations.source_head,validationOnlyDelta:delta,
  inherited_provenance:'Other rows retain their prior admitted disposition. Fresh HTTP/BIN revalidation is recorded, but the COMPLETE fresh mutation/CI programme has not been certified. This is NOT a release certificate.'};
audit.counts={gates:audit.gates.length,clauses:0,byState:{}};
audit.current_false_classification={EVIDENCE_MISSING:0,IMPLEMENTATION_MISSING:0,OWNER_DECISION_REQUIRED:0,INTEGRATION_OWNED:0,ACCEPTED_STOP:0};
const rows=[];
for(const g of audit.gates) {
  g.figures={L:0,'L-T':0,U:0,false:0,'BLOCKED-DISCHARGE':0,STOPPED:0};
  for(const [id,c]of Object.entries(g.clauses)) {
    audit.counts.clauses++; audit.counts.byState[c.state]=(audit.counts.byState[c.state]??0)+1;g.figures[c.state]++;
    if(c.state==='false')audit.current_false_classification[c.current_classification]++;
    rows.push({gate:g.n,id,state:c.state,classification:c.current_classification??(c.state==='U'?'ACCEPTABLE_U_CLASS':'ADMITTED'),text:c.text,
      ...(c.current_blocker?{current_boundary:c.current_blocker}:{})});
  }
  const states=Object.values(g.clauses).map(c=>c.state);
  g.class=states.every(s=>['L','L-T'].includes(s))?'COMPLETE':states.every(s=>['L','L-T','U'].includes(s))?'COMPLETE-U':'PARTIAL';
}
audit.headline=recomputeHeadline(audit);
audit.profile={id:'closed-input.no-handoff@1',excludedDuties:['G6-6','G13-R8'],
  globalFalse:rows.filter(r=>r.state==='false').length,
  applicableFalse:rows.filter(r=>r.state==='false'&&!['G6-6','G13-R8'].includes(r.id)).length,
  certifiedForProfile:false,fullContractCertified:false};
audit.activation={contract:'APPROVED',writer:'IMPLEMENTED',production:'NOT_AUTHORIZED',certificate_for_current_release:'NOT_ISSUED',handoff:'STOP'};
assert.deepEqual(check({...load(),audit}),[]);
assert.equal(audit.counts.clauses,165);assert.equal(audit.profile.globalFalse,9);assert.equal(audit.profile.applicableFalse,7);
fs.mkdirSync(path.join(output,'receipts'),{recursive:true});
fs.writeFileSync(path.join(output,'current-audit.json'),JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync(path.join(output,'MATRIX-REVIEW.json'),JSON.stringify({sourceHead:head,counts:audit.counts,profile:audit.profile,rows},null,2)+'\n');
fs.writeFileSync(path.join(output,'CLAUSE-MATRIX.md'),[
  '# Complete current clause matrix','',
  '165 duties. Progress disposition only; this is not a release certificate.',
  '', 'Global false: 9. Profile-applicable false: 7. HANDOFF global STOP: 2. 9.6: L by clean source pair.',
  'Seven remaining evidence duties depend on the two source contract decisions. Complete fresh certification remains mandatory.',
  '', '| Gate | Clause | State | Classification | Duty |','|---|---|---|---|---|',
  ...rows.map(r=>`| ${r.gate} | ${r.id} | ${r.state} | ${r.classification} | ${r.text.replaceAll('|','\\|')} |`),''
].join('\n'));
fs.writeFileSync(path.join(output,'receipts/evidence-verification.json'),JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify({head,counts:audit.counts,classifications:audit.current_false_classification,profile:audit.profile}));
