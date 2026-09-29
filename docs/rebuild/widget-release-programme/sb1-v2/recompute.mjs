#!/usr/bin/env node
// Replays historical widget scope rulings, then appends the new identity decision/proofs.
// Identity verification never promotes a widget clause by itself.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../..');
const arg=name=>{const i=process.argv.indexOf(name); assert.ok(i>0,`Missing ${name}`);return process.argv[i+1];};
const evidence=path.resolve(arg('--evidence')), mutations=path.resolve(arg('--mutations'));
const tests=path.resolve(arg('--tests')), head=arg('--source-head'), output=path.resolve(arg('--out-dir'));
fs.mkdirSync(output,{recursive:true});
const run=(script,args)=>execFileSync(process.execPath,[path.join(root,script),...args],{cwd:root,encoding:'utf8'});
const raw=path.join(output,'runtime-audit.json');
run('docs/rebuild/widget-release-programme/preintegration/current-audit.mjs',['--evidence',evidence,'--mutations',mutations,'--source-head',head,'--out',raw]);
run('docs/rebuild/widget-release-programme/postdecision/recompute.mjs',[raw,'--boundary-evidence',evidence,'--boundary-report',path.join(mutations,'AB.json'),'--source-head',head,'--out-dir',output]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const receiptBytes=fs.readFileSync(tests), receipt=JSON.parse(receiptBytes);
assert.equal(receipt.numFailedTests,0);assert.equal(receipt.success,true);
const claims=receipt.testResults.flatMap(s=>s.assertionResults);
for(let n=1;n<=12;n++){
 const id=`SV2-${String(n).padStart(2,'0')}`;
 const found=claims.filter(t=>t.title.startsWith(id+' '));
 assert.equal(found.length,1,`${id} unique receipt`);assert.equal(found[0].status,'passed',id);
}
const mutantBytes=fs.readFileSync(path.join(mutations,'SV2.json')), mutant=JSON.parse(mutantBytes);
// A subsequent commit changes only the migration-count test. Preserve the actual
// proof target; do not rewrite a receipt or repeat identical runtime experiments.
execFileSync('git',['merge-base','--is-ancestor',mutant.source_head,head],{cwd:root});
const identityDelta=execFileSync('git',['diff','--name-only',mutant.source_head,head,'--','maya-saas-backend'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.ok(identityDelta.every(p=>p==='maya-saas-backend/src/widgets/i-mig2.schema.spec.ts'),'Identity proof application/declaration drift');
assert.equal(mutant.status,'AS-DECLARED');assert.equal(mutant.mismatches,0);
assert.deepEqual(mutant.baseline_red,[]);assert.equal(mutant.mutants.length,13);
assert.ok(mutant.mutants.every(m=>['live-killed','build-killed'].includes(m.status)));
assert.equal(mutant.battery_hashes['gateSV2.json'],sha(fs.readFileSync(path.join(root,'maya-saas-backend/test/widgets-live/mutations/gateSV2.json'))));
const decisionBytes=fs.readFileSync(path.join(here,'owner-decisions.json'));
const decision=JSON.parse(decisionBytes);
assert.deepEqual(decision.schema.required_immutable_v2_fields,['mayaUserId','mayaSubjectHash','verificationChannel','predecessorLinkId']);
assert.equal(decision.production_activation,'FORBIDDEN');
assert.equal(decision.schema.new_tables,false);assert.equal(decision.schema.new_sql_columns,false);
const auditFile=path.join(output,'current-audit.json'), audit=JSON.parse(fs.readFileSync(auditFile));
audit.historical_widget_scope_decisions=audit.owner_decisions;
audit.owner_decisions=decision;
audit.identity_verification={scope:'Separate identity mechanism; no widget clause promotion',source_head:mutant.source_head,current_head:head,proof_only_delta:identityDelta,
 self_booking_contract:'IMPLEMENTED',new_verified_binding_path:'READY',json_v2:'PASS',successor_proofs:'12/12',
 decision_sha256:sha(decisionBytes),tests_sha256:sha(receiptBytes),mutation_receipt_sha256:sha(mutantBytes),production_user_reverified:false};
fs.writeFileSync(auditFile,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({counts:audit.counts,classifications:audit.current_false_classification,identity:audit.identity_verification}));
