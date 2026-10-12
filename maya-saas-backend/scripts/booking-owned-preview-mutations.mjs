// Narrow offline counterfactuals in a disposable committed-source copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(backend), out=process.argv[2];
assert.ok(out&&path.isAbsolute(out)&&!fs.existsSync(out));
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('status','--porcelain','--','maya-saas-backend/src','maya-saas-backend/scripts'),'');
const head=git('rev-parse','HEAD'), prior='06bc12e3719caebb5c2485b059fe40093fb453d3';
fs.mkdirSync(out,{mode:0o700});
execFileSync('tar',['-x','-C',out],{input:execFileSync('git',['archive',head,'maya-saas-backend/src','maya-saas-backend/package.json','maya-saas-backend/tsconfig.json'],{cwd:repo,maxBuffer:128*1024*1024})});
const cwd=path.join(out,'maya-saas-backend');
fs.symlinkSync(path.join(backend,'node_modules'),path.join(cwd,'node_modules'),'dir');
const adapter='src/widgets/owner-ports/booking-preview.adapter.ts', minter='src/widgets/emission/booking-confirmation-minter.service.ts';
const specs=['src/widgets/owner-ports/booking-owned-preview.spec.ts','src/widgets/emission/booking-confirmation-minter.service.spec.ts'];
const original=Object.fromEntries([adapter,minter].map(file=>[file,fs.readFileSync(path.join(cwd,file),'utf8')]));
const hash=b=>createHash('sha256').update(b).digest('hex');
const specHashes=specs.map(f=>hash(fs.readFileSync(path.join(cwd,f))));
const env={NODE_ENV:'test',TZ:'UTC',LANG:'C'};
for(const key of ['PATH','HOME','TMPDIR'])if(process.env[key])env[key]=process.env[key];
const report={qualification:'OFFLINE_TARGETED_PREVIEW_MUTATIONS_NOT_RELEASE_CERTIFICATION',head,prior,specHashes,baseline:null,mutations:[],restored:null};
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
function run(name){
  const output=path.join(out,name+'.json'), log=path.join(out,name+'.log');
  const fd=fs.openSync(log,'wx',0o600);let p;
  try{p=spawnSync(process.execPath,['node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',...specs,'--json','--outputFile='+output],{cwd,env,stdio:['ignore',fd,fd],timeout:60000});}finally{fs.closeSync(fd);}
  assert.equal(p.error,undefined);assert.equal(p.signal,null);
  const result=JSON.parse(fs.readFileSync(output));
  assert.equal(result.numRuntimeErrorTestSuites,0);
  assert.deepEqual(specs.map(f=>hash(fs.readFileSync(path.join(cwd,f)))),specHashes);
  return {exit:p.status,total:result.numTotalTests,passed:result.numPassedTests,failed:result.numFailedTests,
    failures:result.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName)),logSha256:hash(fs.readFileSync(log))};
}
const restore=()=>{for(const [file,source] of Object.entries(original))fs.writeFileSync(path.join(cwd,file),source);};
function replace(file,before,after){assert.equal(original[file].split(before).length,2);fs.writeFileSync(path.join(cwd,file),original[file].replace(before,after));}
function mutation(name,expected){const result=run(name);const killed=result.exit===1&&result.failed>0&&result.total===report.baseline.total&&expected.every(s=>result.failures.some(f=>f.includes(s)));report.mutations.push({name,...result,killed});save();assert.ok(killed,name);restore();}
save();
try{
  report.baseline=run('baseline');save();assert.equal(report.baseline.exit,0);
  fs.writeFileSync(path.join(cwd,adapter),git('show',prior+':maya-saas-backend/'+adapter)+'\n');
  mutation('exact-prior-adapter',['cancel shows names','reschedule shows names']);
  const current="const current = await this.cancel.readOwnedCancelTarget(\n      input.routing.tenantId,\n      input.actorUserId,\n      appointmentId,\n    );";
  assert.equal(original[adapter].split(current).length,3);
  fs.writeFileSync(path.join(cwd,adapter),original[adapter].replace(current,"const current = { ...quoted, alreadyCancelled: false, target: { ...quoted.target, branchSourceRevision: quoted.prepared.branchSourceRevision } };"));
  mutation('skip-reschedule-current-authority',['reschedule refuses revocation','refuses source drift']);
  const at=original[adapter].lastIndexOf(current);
  fs.writeFileSync(path.join(cwd,adapter),original[adapter].slice(0,at)+'const current = quoted;'+original[adapter].slice(at+current.length));
  mutation('skip-cancel-current-authority',['cancel refuses revocation','refuses source drift']);
  const start=original[adapter].indexOf('    if (\n      !row ||');
  const end=original[adapter].indexOf("      throw new Error('booking_preview_display_changed');",start);
  assert.ok(start>0&&end>start);
  fs.writeFileSync(path.join(cwd,adapter),original[adapter].slice(0,start)+'    if (!row)\n'+original[adapter].slice(end));
  mutation('skip-exact-display-snapshot',['refuses substituted/stale display projection']);
  replace(adapter,"const zone = isUsableTimezone(timezone) ? timezone.trim() : 'UTC';","const zone = 'UTC';");
  mutation('force-UTC-display',['cancel shows names','reschedule shows names']);
  replace(minter,'formatted: p.whenPreviousFormatted ?? p.whenPrevious,','formatted: p.whenPrevious,');
  mutation('discard-previous-local-time',['keeps both reschedule instants unchanged']);
}finally{restore();report.restored=run('restored');save();}
assert.equal(report.restored.exit,0);assert.equal(git('rev-parse','HEAD'),head);
console.log(JSON.stringify({head,baseline:report.baseline.passed,killed:report.mutations.filter(m=>m.killed).length,restored:report.restored.passed}));
