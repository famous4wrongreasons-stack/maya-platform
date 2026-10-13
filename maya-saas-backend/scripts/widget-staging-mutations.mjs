// Targeted AR-1 counterfactuals, never full release certification. Only a committed
// disposable mirror is edited. Live controls own fresh synthetic clusters/keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(backend),out=process.argv[2];
assert.ok(out&&path.isAbsolute(out)&&!fs.existsSync(out),'new absolute output required');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('status','--porcelain','--','maya-saas-backend'),'','committed source required');
const head=git('rev-parse','HEAD');fs.mkdirSync(out,{mode:0o700});
execFileSync('tar',['-x','-C',out],{input:execFileSync('git',['archive',head,'maya-saas-backend'],{cwd:repo,maxBuffer:128*1024*1024})});
const cwd=path.join(out,'maya-saas-backend');
fs.symlinkSync(path.join(backend,'node_modules'),path.join(cwd,'node_modules'),'dir');
const policy='src/entitlements/widget-release-policy.service.ts',contract='src/entitlements/widget-release-staging.contract.ts',common='src/entitlements/widget-release.contract.ts',writer='src/entitlements/widget-release.service.ts';
const originals=Object.fromEntries([policy,contract,common,writer].map(f=>[f,fs.readFileSync(path.join(cwd,f),'utf8')]));
const hash=v=>createHash('sha256').update(v).digest('hex');
const tests=['src/entitlements/widget-release-staging.spec.ts','test/widgets-live/widget-staging.staging-spec.ts','test/widgets-live/widget-staging-binary.staging-spec.ts'];
const testHashes=tests.map(f=>hash(fs.readFileSync(path.join(cwd,f))));
const mutations=[
  {id:'LSO-M1',phase:'unit',file:contract,find:'v.independentHumanReview !== false',replace:'false',killer:'LSO-CONTRACT'},
  {id:'LSO-M2',phase:'unit',file:common,find:'v.reviewerId !== null',replace:'false',killer:'LSO-CONTRACT'},
  {id:'LSO-M3',phase:'unit',file:common,find:'v.approverId !== v.operatorId',replace:'false',killer:'LSO-CONTRACT'},
  {id:'LSO-M4',phase:'unit',file:policy,find:"db.hostname !== '127.0.0.1'",replace:'false',killer:'LSO-DATABASE'},
  {id:'LSO-M5',phase:'unit',file:policy,find:'stagingSingleOperatorAuthorization,\n        STAGING_SINGLE_OPERATOR_TRUST,',replace:'stagingSingleOperatorAuthorization,\n        undefined,',killer:'LSO-TRUST no fallback'},
  {id:'LSO-M6',phase:'unit',file:policy,find:'releaseHash(value) !== a.certificateDigest',replace:'false',killer:'LSO-SIGNATURE'},
  {id:'LSO-M7',phase:'unit',file:policy,find:'this.buildDigest(a.contract === STAGING_SINGLE_OPERATOR_AUTH)',replace:'this.buildDigest()',killer:'LSO-BYTES'},
  {id:'LSO-M8',phase:'unit',file:policy,find:'return null;\n      if (isProductionAuthorization(a)) this.productionTenant(tenantId);\n      if (a.contract === STAGING_SINGLE_OPERATOR_AUTH)\n        this.stagingTenant(tenantId);',replace:'return null;\n      if (isProductionAuthorization(a)) this.productionTenant(tenantId);',killer:'LSO-READER'},
  {id:'LSO-M9',phase:'unit',file:policy,find:"!verify(null, bytes, publicKey, Buffer.from(v.signature, 'base64url'))",replace:'false',killer:'LSO-FORGED'},
  {id:'LSO-M10',phase:'live',file:writer,find:'if (isProfileExecutionAuthorization(a)) {\n          const recorded',replace:'if (false) {\n          const recorded',killer:'LSO-AUDIT-NOOP'},
  {id:'LSO-M11',phase:'live',file:writer,find:'previousVersion !== a.expectedVersion',replace:'false',killer:'LSO-STALE'},
  {id:'LSO-M12',phase:'live',file:writer,find:'granted.contract === STAGING_SINGLE_OPERATOR_AUTH &&',replace:'false &&',killer:'LSO-REVOKE-VERSION legacy-revokes-staging'},
  {id:'LSO-M13',phase:'live',file:writer,find:'await this.authority(tx, actor);',replace:'/* mutation: skip actual global session authority */',all:3,killer:'LSO-TENANT-SESSION'},
  {id:'LSO-M14',phase:'live',file:policy,find:"if (operation === 'grant') {",replace:"if (operation === 'grant' || a.contract === STAGING_SINGLE_OPERATOR_AUTH) {",killer:'LSO-REVOKE-BOUND'},
];
for(const [file,id,phase] of [['gateSO.json','SO-M6','unit'],['gateSO.json','SO-M7','live'],['gatePU.json','PU-M9','live']]){
  const m=JSON.parse(fs.readFileSync(path.join(cwd,'test/widgets-live/mutations',file))).find(m=>m.id===id);
  assert.ok(m);mutations.push({...m,phase,killer:m.killers[0]});
}
const env={NODE_ENV:'test',LANG:'C',TZ:'UTC'};for(const k of ['PATH','HOME','TMPDIR'])if(process.env[k])env[k]=process.env[k];
const report={qualification:'TARGETED_AR1_STAGING_COUNTERFACTUALS_NOT_RELEASE_CERTIFICATION',head,testHashes,baseline:{},mutations:[],restored:{}};
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
function run(name,phase){
  console.log(name);
  const log=path.join(out,name+'.log'),fd=fs.openSync(log,'wx',0o600),dir=path.join(out,name);
  const args=phase==='unit'?['node_modules/jest/bin/jest.js','--runInBand','--testPathPatterns=entitlements','--json','--outputFile='+dir+'.json']:['scripts/widget-staging-proof.mjs','--run','--output',dir];
  let p;try{p=spawnSync(process.execPath,args,{cwd,env,stdio:['ignore',fd,fd],timeout:240000});}finally{fs.closeSync(fd);}
  assert.equal(p.error,undefined);assert.equal(p.signal,null,'timeouts are not mutation kills');
  const paths=phase==='unit'?[dir+'.json']:[path.join(dir,'staging-http-binary-jest.json'),path.join(dir,'legacy-jest.json')].filter(f=>fs.existsSync(f));
  assert.ok(paths.length,'missing executable receipt');
  const receipts=paths.map(f=>JSON.parse(fs.readFileSync(f)));
  for(const r of receipts)assert.equal(r.numRuntimeErrorTestSuites,0,'load errors are not mutation kills');
  assert.deepEqual(tests.map(f=>hash(fs.readFileSync(path.join(cwd,f)))),testHashes);
  if(phase==='live')assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).clusterStopped,true);
  return {exit:p.status,passed:receipts.reduce((n,r)=>n+r.numPassedTests,0),failed:receipts.reduce((n,r)=>n+r.numFailedTests,0),
    failures:receipts.flatMap(r=>r.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName))),logSha256:hash(fs.readFileSync(log))};
}
const restore=()=>{for(const [f,s]of Object.entries(originals))fs.writeFileSync(path.join(cwd,f),s);};
try{
  for(const phase of ['unit','live']){report.baseline[phase]=run('baseline-'+phase,phase);save();assert.equal(report.baseline[phase].exit,0,'green baseline required');}
  for(const m of mutations){
    restore();const s=originals[m.file];assert.equal(s.split(m.find).length,(m.all??1)+1,m.id+' source anchor');
    fs.writeFileSync(path.join(cwd,m.file),s.split(m.find).join(m.replace));
    const r=run(m.id,m.phase),killed=r.exit===1&&r.failed>0&&r.failures.some(n=>n.includes(m.killer));
    report.mutations.push({id:m.id,phase:m.phase,...r,killed});save();assert.ok(killed,m.id+' named killer required');
  }
}finally{restore();for(const phase of ['unit','live']){report.restored[phase]=run('restored-'+phase,phase);save();}}
for(const r of Object.values(report.restored))assert.equal(r.exit,0);
assert.equal(git('rev-parse','HEAD'),head);
assert.equal(git('status','--porcelain','--','maya-saas-backend'),'');
console.log(JSON.stringify({head,killed:report.mutations.filter(m=>m.killed).length,total:mutations.length}));
