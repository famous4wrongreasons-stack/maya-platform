#!/usr/bin/env node
// Decision overlay. Historical receipts remain historical; this is not a release certificate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {check,load,recomputeHeadline} from '../../evidence/maya-chat-first-ux/gate-audit-check.mjs';
import {greenReport,pair,requireTest} from '../final-evidence/recompute.mjs';
import {sha} from '../preintegration/current-audit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),backend=path.join(root,'maya-saas-backend');
const json=p=>JSON.parse(fs.readFileSync(p));
export const batteries=['AR','D8','7','P-allowlist','T-tables','P-render'];
export function promote(audit,lines,uMap,reports){
  const race=pair(lines,'AR-G6-REVOCATION',['G6-13']);
  const money=pair(lines,'AR-FR6D-NONMONEY',['G7-FR6d']);
  const u=lines.filter(l=>l.test_id==='D8-U');
  assert.equal(u.length,1);assert.equal(u[0].entry,'HTTP');assert.equal(u[0].claim,'U');
  assert.deepEqual(u[0].clauses,['G8-3','G8-4','G8-5t','G8-DENY']);
  assert.deepEqual(u[0].labels,['[U-proof]']);assert.equal(u[0].record_hash,null);
  const mutations=names=>names.flatMap(name=>reports[name].mutants.map(m=>({id:m.id,battery:m.battery,status:m.status,report:'mutation-receipts/'+name+'.json'})));
  for(const g of audit.gates)for(const [id,c]of Object.entries(g.clauses)){
    if(['G6-13','G7-FR6d',...u[0].clauses].includes(id)){
      assert.equal(c.state,'false');c.conforms=true;c.built=true;
      c.prior_blocker=c.current_blocker;
      for(const key of ['current_classification','current_blocker','reason','blocked','built_note'])delete c[key];
      if(u[0].clauses.includes(id)){
        c.state='U';c.evidence=u;c.u_candidate=true;c.u_proof=uMap.proofs.find(p=>p.clause===id);
        assert.ok(c.u_proof?.basis.includes('FINAL OWNER DECISIONS'));
        c.u_basis=c.u_proof.basis;c.mutants=mutations(['D8']);
        c.acceptance={class:'ACCEPTABLE_U_CLASS',decision:id+' A / OD-3 A',strict_live:false,scope:'excluded closed-input branches; no production carrier invented'};
      }else{
        c.state='L';c.evidence=id==='G6-13'?race:money;c.mutants=mutations(id==='G6-13'?['AR']:['7','P-allowlist','T-tables']);
        c.acceptance=id==='G6-13'
          ?{basis:'U13c real Gate6 allow, committed entitlement revoke, canonical Gate14 refusal and observed metric; HTTP/BIN'}
          :{basis:'Programme §4.5 Money explicitly permits E-INDEP OR mutation-only negatives; actual non-MONEY COMMIT positive plus full C9a/C9b/F80/startup/table mutation duties',negative_entry:'BUILD/RI; no financial actuation claimed'};
      }
    }
    if(['G6-6','G13-R8'].includes(id)){
      assert.equal(c.state,'false');c.current_classification='ACCEPTED_STOP';
      c.current_blocker='D-H A: HANDOFF STOP preserved for this release; generic receiver forbidden. Still fails the full-165 activation threshold.';
      c.reason=c.current_blocker;
    }
    if(id==='9.6'){assert.equal(c.state,'false');c.current_classification='INTEGRATION_OWNED';}
  }
  return audit;
}
function main(){
  const option=n=>{const i=process.argv.indexOf(n);assert.ok(i>0,n);return path.resolve(process.argv[i+1]);};
  const evidence=option('--evidence'),receipts=option('--receipts');
  const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim(),head=git('rev-parse','HEAD');
  assert.equal(git('status','--porcelain','--','maya-saas-backend','.github/workflows/widgets-live.yml'),'','uncommitted implementation');
  const baseline=fs.readFileSync(path.join(here,'../final-evidence/current-audit.json')),audit=JSON.parse(baseline);
  assert.deepEqual(check({...load(),audit}),[]);
  const bytes=fs.readFileSync(path.join(evidence,'evidence-manifest.jsonl')),lines=bytes.toString().trim().split('\n').map(JSON.parse);
  const verified=json(path.join(evidence,'verification-report.json'));
  assert.equal(verified.contract,'maya.widgets-evidence-verify/1');assert.deepEqual(verified.violations,[]);assert.equal(verified.manifest_sha256,sha(bytes));
  const reports=Object.fromEntries(batteries.map(b=>[b,json(path.join(receipts,b+'.json'))]));
  for(const b of batteries){
    const r=reports[b],f='gate'+b+'.json',declared=fs.readFileSync(path.join(backend,'test/widgets-live/mutations',f));
    greenReport(r,r.source_head,JSON.parse(declared));assert.equal(r.battery_hashes[f],sha(declared));git('merge-base','--is-ancestor',r.source_head,head);
    const delta=git('diff','--name-only',r.source_head,head,'--','maya-saas-backend').split('\n').filter(Boolean);
    const validationOnly=new Set(['maya-saas-backend/scripts/k3-gateway-check.mjs','maya-saas-backend/scripts/widgets-mutation-ci.test.mjs','maya-saas-backend/src/widgets/rendering/refusal-codes-covered.spec.ts']);
    assert.ok(delta.every(p=>validationOnly.has(p)),'runtime, fixture, declaration or killer changed');
    const overlay=json(path.join(here,'validation-overlay.json'));
    for(const p of delta)assert.equal(sha(fs.readFileSync(path.join(root,p))),overlay.files[p],'unreviewed validation bytes');
    r.validation_only_delta=delta;
    // These exact changes only add raw-SQL counterfactual checks and correct the CI inventory count.
    // The current K3/REN controls and P-render battery are rerun; no runtime proof is inherited across changed bytes.
  }
  for(const id of ['AR-M14','AR-M17','AR-M18','AR-M19'])assert.ok(reports.AR.mutants.find(m=>m.id===id)?.kills.some(k=>k.entry==='HTTP'&&k.step==='live'),id);
  for(const [b,id]of [['7','M7-21'],['7','M7-24'],['7','M7-25'],['7','M7-40'],['P-allowlist','AL-M1'],['T-tables','TAB-M6'],['P-render','REN-M6']])
    assert.ok(reports[b].mutants.find(m=>m.id===id)?.kills.length,b+id);
  const unit=json(path.join(receipts,'unit-final.json'));requireTest(unit,'AR-FR6D-SCOPE');requireTest(unit,'D8-ABSENCE');requireTest(unit,'D8-MECHANISM');
  const live=json(path.join(receipts,'proofs.json'));requireTest(live,'D8-U');requireTest(live,'AR-G6-REVOCATION');
  for(const name of ['backend-final','widgets','ar-binary']){const r=json(path.join(receipts,name+'.json'));assert.equal(r.success,true,name);assert.equal(r.numFailedTests,0);assert.equal(r.numFailedTestSuites,0);}
  assert.equal(json(path.join(receipts,'backend-final.json')).numPendingTests,1,'only the carrier artifact integration-only check is excluded');
  const source=fs.readFileSync(path.join(root,'docs/rebuild/evidence/maya-chat-first-ux/recovery-20260919/recovered-gates-programme-v11.md'),'utf8');
  assert.ok(source.includes('Evidence for FR-6d is E-INDEP or mutation only.'));
  promote(audit,lines,json(path.join(here,'u-proofs.json')),reports);
  audit.baseCommit=head;audit.performedAt=new Date().toISOString();audit.unit='Approved release controls and evidence; no production activation';
  audit.builder={phase:'FINAL',skeleton:false,kind:'approved-release-overlay',source_head:head,
    inherited_snapshot_sha256:sha(baseline),inherited_provenance:'Unchanged claims retain historical receipts. Runtime changed: this progress matrix is NOT a freshly certified full release.',
    manifest_sha256:sha(bytes),mutation_reports:Object.fromEntries(batteries.map(b=>[b,{source_head:reports[b].source_head,sha256:sha(fs.readFileSync(path.join(receipts,b+'.json'))),steps:reports[b].steps,restrictions:reports[b].restrictions,validation_only_delta:reports[b].validation_only_delta}]))};
  audit.owner_decisions={...audit.owner_decisions,'D-H':'A','G8-3':'A','G8-4':'A','G8-5t':'A','G8-DENY':'A','AR-1':'A / implementation and synthetic-staging proof only'};
  audit.activation={contract:'APPROVED',writer:'IMPLEMENTED',production:'NOT_AUTHORIZED',certificate_for_current_release:'NOT_ISSUED',handoff:'STOP'};
  audit.counts={gates:audit.gates.length,clauses:0,byState:{}};
  audit.current_false_classification={EVIDENCE_MISSING:0,IMPLEMENTATION_MISSING:0,OWNER_DECISION_REQUIRED:0,INTEGRATION_OWNED:0,ACCEPTED_STOP:0};
  for(const g of audit.gates){g.figures={'L':0,'L-T':0,U:0,false:0,'BLOCKED-DISCHARGE':0,STOPPED:0};
    for(const c of Object.values(g.clauses)){audit.counts.clauses++;audit.counts.byState[c.state]=(audit.counts.byState[c.state]??0)+1;g.figures[c.state]++;
      if(c.state==='false'){assert.ok(c.current_classification in audit.current_false_classification);audit.current_false_classification[c.current_classification]++;}}
    const states=Object.values(g.clauses).map(c=>c.state);g.class=states.every(s=>['L','L-T'].includes(s))?'COMPLETE':states.every(s=>['L','L-T','U'].includes(s))?'COMPLETE-U':'PARTIAL';
  }
  audit.headline=recomputeHeadline(audit);assert.deepEqual(check({...load(),audit}),[]);
  fs.writeFileSync(path.join(here,'current-audit.json'),JSON.stringify(audit,null,2)+'\n');
  const rows=['# Complete current clause matrix','',audit.headline,'','Progress matrix only. HANDOFF accepted STOP remains false. Historical proof rows are not a new full-release certificate.','','| Gate | Clause | State | Classification / basis | Duty |','|---|---|---|---|---|'];
  for(const g of audit.gates)for(const [id,c]of Object.entries(g.clauses))rows.push(`| ${g.n} | ${id} | ${c.state} | ${c.current_classification??c.acceptance?.class??'ADMITTED'} | ${c.text.replaceAll('|','\\|')} |`);
  fs.writeFileSync(path.join(here,'CLAUSE-MATRIX.md'),rows.join('\n')+'\n');
  console.log(JSON.stringify({counts:audit.counts,classifications:audit.current_false_classification,headline:audit.headline}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();

