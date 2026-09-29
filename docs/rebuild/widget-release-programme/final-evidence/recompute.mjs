#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {check,load,recomputeHeadline} from '../../evidence/maya-chat-first-ux/gate-audit-check.mjs';
import {admit,sha} from '../preintegration/current-audit.mjs';
import {admitActionBoundary} from '../postdecision/recompute.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../../../..');
const backend=path.join(root,'maya-saas-backend');
const json=p=>JSON.parse(fs.readFileSync(p));
export const gates=['WF','P-pairing','8r','7','WR','H-harness','AB'];
export function greenReport(r,head,declared){
  assert.equal(r.contract,'maya.widgets-mutation-battery/2');
  assert.equal(r.source_head,head); assert.equal(r.status,'AS-DECLARED');
  assert.equal(r.mismatches,0); assert.deepEqual(r.baseline_red,[]);
  assert.deepEqual(r.mutants.map(m=>m.id),declared.map(m=>m.id),'incomplete declaration coverage');
  const controls=Object.values(r.baseline_controls??{}); assert.ok(controls.length);
  for(const c of [...controls,...Object.values(r.neutraliser_controls??{})]){
    assert.ok(Object.values(c.exits??{}).length);assert.ok(Object.values(c.exits).every(n=>n===0));
    assert.deepEqual(c.failed,[]);assert.deepEqual(c.problems,[]);
  }
  for(const m of r.mutants){assert.equal(m.expect,declared.find(d=>d.id===m.id).expect,'declared status changed');assert.equal(m.status,m.expect); assert.ok(['build-killed','live-killed'].includes(m.status));assert.ok(m.kills.length);}
}
export function pair(lines,id,clauses,claim='L',gate='13',count=14){
  const p=lines.filter(l=>l.test_id===id);assert.equal(p.length,2,id);
  assert.deepEqual(p.map(l=>l.entry).sort(),['BIN','HTTP']); assert.notEqual(p[0].pid,p[1].pid);
  for(const l of p){assert.equal(l.claim,claim); assert.deepEqual(l.clauses,clauses);
    assert.equal(l.stopped_at_gate,gate);assert.equal(l.gates_run,count);assert.ok(l.record_hash&&l.trigger_trace_id);
    assert.deepEqual(l.labels,claim==='L'?['[E-MINT]']:['[E-TAMPER:confirmationJson]']);}
  return p;
}
export function requireTest(receipt,prefix){
  assert.equal(receipt.success,true);assert.equal(receipt.numFailedTests,0);assert.equal(receipt.numFailedTestSuites,0);
  const found=receipt.testResults.flatMap(s=>s.assertionResults).filter(t=>t.title.startsWith(prefix));
  assert.equal(found.length,1,prefix);assert.equal(found[0].status,'passed');
}
export function promote(audit,lines,verification,bytes,unit,scope,uMap){
  assert.equal(verification.contract,'maya.widgets-evidence-verify/1');assert.deepEqual(verification.violations,[]);
  assert.equal(verification.manifest_sha256,sha(bytes));
  requireTest(unit,'WF-PAIR-ALL');requireTest(unit,'WF-U-R1A-ABSENCE');requireTest(scope,'WF-U-R1A');
  const pairing=pair(lines,'WF-PAIRING',['G7-FR6b']);
  const positive=pair(lines,'WF-READBACK-POSITIVE',['R-1a']);
  const negative=pair(lines,'WF-READBACK-DIVERGENCE',['R-1a'],'L-T','8-R',9);
  const u=lines.filter(l=>l.test_id==='WF-U-R1A');assert.equal(u.length,1);
  assert.equal(u[0].entry,'HTTP');assert.equal(u[0].claim,'U');assert.deepEqual(u[0].clauses,['R-1a']);
  assert.deepEqual(u[0].labels,['[U-proof]']); assert.equal(u[0].record_hash,null);assert.equal(u[0].stopped_at_gate,null);assert.equal(u[0].gates_run,null);
  const proof=uMap.proofs.find(p=>p.clause==='R-1a');assert.ok(proof?.basis.includes('OD-3 A'));
  assert.equal(proof.candidate_scope,'SPOKEN recompute-true only; typed half L plus labelled E-TAMPER');
  assert.equal(audit.historical_widget_scope_decisions.decisions['OD-3'],'A');
  for(const g of audit.gates) for(const [id,c] of Object.entries(g.clauses)){
    if(id==='G7-FR6b'||id==='R-1a'){
      assert.equal(c.state,'false');c.state=id==='G7-FR6b'?'L':'U';c.conforms=true;c.built=true;
      c.evidence=id==='G7-FR6b'?pairing:[...positive,...negative,...u];
      for(const key of ['blocked','built_note','reason','current_classification','current_blocker'])delete c[key];
      if(id==='R-1a'){
        assert.equal(c.u_candidate,true);c.u_basis=proof.basis;c.u_proof=proof;
        c.acceptance={class:'ACCEPTABLE_U_CLASS',decision:'OD-3 A',strict_live:false,
          proof_scope:'Typed production COMMIT L + labelled tamper refusal; SPOKEN half U with explicit RI, never strict.'};
      }
    }
    if(id==='9.6')c.current_classification='INTEGRATION_OWNED';
    if(c.state==='false'){
      c.historical_admission_metadata=Object.fromEntries(['blocked','built_note','reason'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
      delete c.blocked;delete c.built_note;c.reason=c.current_blocker;
    }
  }
  return audit;
}
function main(){
 const option=n=>{const i=process.argv.indexOf(n);assert.ok(i>0,n);return path.resolve(process.argv[i+1]);};
 const evidence=option('--evidence'),mutations=option('--mutations'),receipts=option('--receipts');
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
 const head=git('rev-parse','HEAD'), proofHead=json(path.join(mutations,'WF.json')).source_head;
 assert.equal(git('status','--porcelain','--','maya-saas-backend'),'','uncommitted backend');
 git('merge-base','--is-ancestor',proofHead,head);
 const delta=git('diff','--name-only',proofHead,head,'--','maya-saas-backend').split('\n').filter(Boolean);
 assert.deepEqual(delta,['maya-saas-backend/test/widgets-live/final-u-scope.live-spec.ts']);
 // The added U ledger test is the only backend delta. No runtime, existing killer,
 // fixture, declaration or registry byte may differ from the fresh mutation target.
 const baselineBytes=fs.readFileSync(path.join(here,'../sb1-v2/current-audit.json'));
 const audit=JSON.parse(baselineBytes);assert.deepEqual(check({...load(),audit}),[]);
 const runtimeDelta=git('diff','--name-only',audit.baseCommit,head,'--','maya-saas-backend/src','maya-saas-backend/prisma','maya-saas-backend/package.json','maya-saas-backend/package-lock.json').split('\n').filter(Boolean);
 assert.ok(runtimeDelta.every(p=>p==='maya-saas-backend/src/widgets/gates/release-evidence.spec.ts'),'runtime changed; inheritance invalid');
 const verified=JSON.parse(execFileSync(process.execPath,['scripts/widgets-evidence-verify.mjs','--dir',evidence,'--u-proofs',path.join(here,'u-proofs.json')],{cwd:backend,encoding:'utf8'}).split('\n')[0]);
 const bytes=fs.readFileSync(path.join(evidence,'evidence-manifest.jsonl')),lines=bytes.toString().trim().split('\n').map(JSON.parse);
 const reports=Object.fromEntries(gates.map(g=>[g,json(path.join(mutations,g+'.json'))]));
 for(const g of gates){const f='gate'+g+'.json',db=fs.readFileSync(path.join(backend,'test/widgets-live/mutations',f));git('merge-base','--is-ancestor',reports[g].source_head,head);const proofDelta=git('diff','--name-only',reports[g].source_head,head,'--','maya-saas-backend').split('\n').filter(Boolean);assert.ok(proofDelta.every(p=>p==='maya-saas-backend/test/widgets-live/final-u-scope.live-spec.ts'),'Mutation target bytes changed');greenReport(reports[g],reports[g].source_head,JSON.parse(db));assert.equal(reports[g].battery_hashes[f],sha(db));}
 for(const id of ['WF-M1','WF-M2'])assert.ok(reports.WF.mutants.find(m=>m.id===id).kills.some(k=>k.entry==='HTTP'&&k.step==='live'));
 const oldClaims=admit({manifestBytes:bytes,verify:verified,reports,sourceHead:reports.WR.source_head});
 oldClaims['G13-I7']=admitActionBoundary(bytes,verified,reports.AB,reports.AB.source_head);
 for(const g of audit.gates)for(const [id,c]of Object.entries(g.clauses))if(oldClaims[id]){assert.equal(c.state,'L');c.evidence=oldClaims[id];c.proof_source_head=proofHead;}
 promote(audit,lines,verified,bytes,json(path.join(receipts,'unit.json')),json(path.join(receipts,'u-scope.json')),json(path.join(here,'u-proofs.json')));
 for(const g of audit.gates)for(const [id,c]of Object.entries(g.clauses))if(['G7-FR6b','R-1a'].includes(id)){
   const selection=id==='R-1a'?['WF','8r']:['WF','7','P-pairing'];
   c.mutants=selection.flatMap(gate=>reports[gate].mutants.map(m=>({id:m.id,battery:m.battery,status:m.status,report:'mutation-receipts/'+gate+'.json'})));
   c.proof_source_head=proofHead;c.scope_ledger_source_head=head;
 }
 audit.baseCommit=head;audit.performedAt=new Date().toISOString();audit.unit='Final independent evidence pass; no runtime changes or activation';
 audit.builder={phase:'FINAL',skeleton:false,kind:'final-evidence-overlay',source_head:head,proof_source_head:proofHead,
   proof_only_delta:delta,inherited_snapshot_sha256:sha(baselineBytes),inherited_provenance:'Unrefreshed clauses retain their exact historical receipts; not blanket recertification',
   manifest_sha256:sha(bytes),u_map_sha256:sha(fs.readFileSync(path.join(here,'u-proofs.json'))),test_receipts:Object.fromEntries(['unit','backend-scope','widgets','http','u-scope'].map(n=>[n,sha(fs.readFileSync(path.join(receipts,n+'.json')))])),sidecars:Object.fromEntries(['mint-provenance.jsonl','database-before-teardown.jsonl'].map(f=>[f,sha(fs.readFileSync(path.join(evidence,f)))])),
   mutation_reports:Object.fromEntries(gates.map(g=>[g,{sha256:sha(fs.readFileSync(path.join(mutations,g+'.json'))),source_head:reports[g].source_head,restrictions:reports[g].restrictions}]))};
 audit.counts={gates:audit.gates.length,clauses:0,byState:{}};audit.current_false_classification={EVIDENCE_MISSING:0,IMPLEMENTATION_MISSING:0,OWNER_DECISION_REQUIRED:0,INTEGRATION_OWNED:0};
 for(const g of audit.gates){g.figures={'L':0,'L-T':0,'U':0,'false':0,'BLOCKED-DISCHARGE':0,STOPPED:0};
   for(const c of Object.values(g.clauses)){audit.counts.clauses++;audit.counts.byState[c.state]=(audit.counts.byState[c.state]??0)+1;g.figures[c.state]++;
     if(c.state==='false')audit.current_false_classification[c.current_classification]++;}
   const s=Object.values(g.clauses).map(c=>c.state);g.class=s.every(x=>['L','L-T'].includes(x))?'COMPLETE':s.every(x=>['L','L-T','U'].includes(x))?'COMPLETE-U':'PARTIAL';}
 audit.headline=recomputeHeadline(audit);assert.deepEqual(check({...load(),audit}),[]);
 fs.writeFileSync(path.join(here,'current-audit.json'),JSON.stringify(audit,null,2)+'\n');
 fs.writeFileSync(path.join(evidence,'verification-report.json'),JSON.stringify(verified,null,2)+'\n');
 const matrix=['# Current complete clause matrix','',audit.headline,'','Strict and with-U remain separate. 9.6 is still false, now explicitly INTEGRATION_OWNED. All historical audit snapshots remain unchanged.','','| Gate | Clause | State | Classification / acceptance | Duty |','|---|---|---|---|---|'];
 for(const g of audit.gates)for(const [id,c]of Object.entries(g.clauses))matrix.push(`| ${g.n} | ${id} | ${c.state} | ${c.current_classification??c.acceptance?.class??'LIVE'} | ${c.text.replaceAll('|','\\|')} |`);
 fs.writeFileSync(path.join(here,'CLAUSE-MATRIX.md'),matrix.join('\n')+'\n');
 console.log(JSON.stringify({counts:audit.counts,classifications:audit.current_false_classification,headline:audit.headline}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
