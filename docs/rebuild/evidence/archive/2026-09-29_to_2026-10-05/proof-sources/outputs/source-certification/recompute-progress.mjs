import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),repo=path.join(root,'work/maya-controlled-integration'),output=path.join(root,'outputs/source-certification'),receipt=path.join(output,'receipts');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),'');
const baselineBytes=fs.readFileSync(path.join(root,'outputs/profile-isolation/current-audit.json')),audit=JSON.parse(baselineBytes);
const bytes=fs.readFileSync(path.join(receipt,'evidence/evidence-manifest.jsonl')),lines=bytes.toString().trim().split('\n').map(JSON.parse);
const verification=JSON.parse(fs.readFileSync(path.join(receipt,'evidence-verifier.log'),'utf8').split('\n').find(l=>l.startsWith('{')));
assert.deepEqual(verification.violations,[]);assert.equal(verification.manifest_sha256,sha(bytes));
const freshReceipts=['backend','widgets-live','http-bin','release-binary','typecheck','scripts-typecheck','live-typecheck','lint','k3','contract-compile','contract-check','npm-audit','runtime-test','carrier-test'];
for(const n of freshReceipts){const j=JSON.parse(fs.readFileSync(path.join(receipt,n+'.receipt.json')));assert.equal(j.candidate,head,n);assert.equal(j.exit,0,n);}
const reports=Object.fromEntries(['BS','NS'].map(id=>[id,JSON.parse(fs.readFileSync(path.join(receipt,id+'-mutations-focused.json')))]));
for(const [id,r]of Object.entries(reports)){assert.equal(r.source_head,head);assert.equal(r.status,'AS-DECLARED');assert.deepEqual(r.baseline_red,[]);assert.equal(r.mutants.length,5);const file='gate'+id+'.json';assert.equal(r.battery_hashes[file],sha(fs.readFileSync(path.join(repo,'maya-saas-backend/test/widgets-live/mutations',file))));for(const m of r.mutants)assert.equal(m.status,m.expect);}
const obligations={BS:['G7-5','G7-BOOK1','G11-I9','G13-I3'],NS:['G12-R1b','G12-I11','G13-R2']};
const pair=(testId,clauses)=>{const p=lines.filter(l=>l.test_id===testId&&l.claim==='L');assert.equal(p.length,2,testId);assert.deepEqual(p.map(l=>l.entry).sort(),['BIN','HTTP']);for(const l of p){assert.deepEqual(l.clauses,clauses);assert.deepEqual(l.labels,['[E-MINT]']);assert(l.record_hash&&l.trigger_trace_id);}return p;};
const proofs={BS:[...pair('BS-SOURCE-RESCHEDULE',obligations.BS),...pair('BS-SOURCE-CANCEL',obligations.BS)],NS:pair('NS-SOURCE',obligations.NS)};
const turn=pair('TURN-CANONICAL',['9.6']);
for(const g of audit.gates)for(const [id,c]of Object.entries(g.clauses)){
 if(id==='9.6'){c.evidence=turn;c.current_revalidation={sourceHead:head,scope:'Fresh canonical HTTP/BIN USER-turn source pair; prior progress mutation disposition retained, NOT full current release certification'};}
 const group=Object.entries(obligations).find(([,ids])=>ids.includes(id))?.[0];if(!group)continue;
 assert.equal(c.state,'false');c.prior_blocker=c.current_blocker;c.state='L';c.conforms=true;c.built=true;
 for(const k of ['reason','blocked','built_note','current_blocker','current_classification'])delete c[k];
 c.evidence=proofs[group];c.mutants=reports[group].mutants.map(m=>({id:m.id,battery:m.battery,status:m.status,kills:m.kills}));
 c.acceptance={basis:group==='BS'?'Exact personal own-list source, canonical appointment/producer/COMMIT identity, consumed records and replay no-second-effect proof, reschedule and cancel HTTP/BIN pairs.':'Exact journal source, retained-date reread and exact parent return HTTP/BIN pair, current-authority/erasure/retention/seal negatives.',scope:'BACKEND SOURCE PROGRESS DISPOSITION ONLY',sourceHead:head,mutationRestriction:reports[group].restrictions,carrierCertification:false,fullReleaseCertification:false};
}
const {check,load,recomputeHeadline}=await import(pathToFileURL(path.join(repo,'docs/rebuild/evidence/maya-chat-first-ux/gate-audit-check.mjs')));
audit.baseCommit=head;audit.performedAt=new Date().toISOString();audit.unit='BS-1 / NS-1 approved backend sources; actual carrier dependency remains open';
audit.builder={phase:'FINAL',skeleton:false,kind:'approved-sources-progress',source_head:head,inherited_snapshot_sha256:sha(baselineBytes),manifest_sha256:sha(bytes),inherited_provenance:'Prior rows retain progress dispositions; source pairs are freshly revalidated. Full mutation/CI/FBE2E certification is NOT complete. This is NOT a release certificate.'};
audit.counts={gates:audit.gates.length,clauses:0,byState:{}};audit.current_false_classification={EVIDENCE_MISSING:0,IMPLEMENTATION_MISSING:0,OWNER_DECISION_REQUIRED:0,INTEGRATION_OWNED:0,ACCEPTED_STOP:0};const rows=[];
for(const g of audit.gates){g.figures={L:0,'L-T':0,U:0,false:0,'BLOCKED-DISCHARGE':0,STOPPED:0};for(const [id,c]of Object.entries(g.clauses)){audit.counts.clauses++;audit.counts.byState[c.state]=(audit.counts.byState[c.state]??0)+1;g.figures[c.state]++;if(c.state==='false')audit.current_false_classification[c.current_classification]++;rows.push({gate:g.n,id,state:c.state,classification:c.current_classification??(c.state==='U'?'ACCEPTABLE_U_CLASS':'ADMITTED'),text:c.text});}const s=Object.values(g.clauses).map(c=>c.state);g.class=s.every(s=>['L','L-T'].includes(s))?'COMPLETE':s.every(s=>['L','L-T','U'].includes(s))?'COMPLETE-U':'PARTIAL';}
audit.headline=recomputeHeadline(audit);audit.profile={id:'closed-input.no-handoff@1',excludedDuties:['G6-6','G13-R8'],globalFalse:rows.filter(r=>r.state==='false').length,applicableFalse:rows.filter(r=>r.state==='false'&&!['G6-6','G13-R8'].includes(r.id)).length,certifiedForProfile:false,fullContractCertified:false};
audit.activation={contract:'APPROVED',writer:'IMPLEMENTED',production:'NOT_AUTHORIZED',certificate_for_current_release:'NOT_ISSUED',handoff:'STOP'};
audit.integration_dependency={id:'I-SRC-1',status:'OPEN',packet:'INTEGRATION-DEPENDENCY.md',carrierProbe:'receipts/source-carrier-observations.json'};
assert.deepEqual(check({...load(),audit}),[]);assert.equal(audit.counts.clauses,165);assert.equal(audit.profile.globalFalse,2);assert.equal(audit.profile.applicableFalse,0);
fs.writeFileSync(path.join(output,'current-audit.json'),JSON.stringify(audit,null,2)+'\n');fs.writeFileSync(path.join(output,'MATRIX-REVIEW.json'),JSON.stringify({sourceHead:head,counts:audit.counts,profile:audit.profile,rows},null,2)+'\n');
fs.writeFileSync(path.join(output,'CLAUSE-MATRIX.md'),['# Complete current clause matrix','','Progress disposition only. No release certificate. The source evidence matrix has zero profile-applicable false duties; the carrier integration probe fails and the complete 502-declaration mutation programme is not certified.','','| Gate | Clause | State | Classification | Duty |','|---|---|---|---|---|',...rows.map(r=>`| ${r.gate} | ${r.id} | ${r.state} | ${r.classification} | ${r.text.replaceAll('|','\\|')} |`),''].join('\n'));
console.log(JSON.stringify({head,counts:audit.counts,classifications:audit.current_false_classification,profile:audit.profile}));
