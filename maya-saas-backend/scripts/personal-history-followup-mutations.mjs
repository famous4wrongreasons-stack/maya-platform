// Counterfactuals in a disposable committed-source copy. No real keys/providers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(backend), out=process.argv[2];
assert.ok(out && path.isAbsolute(out) && !fs.existsSync(out));
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('diff','HEAD','--name-only','--','maya-saas-backend/src','maya-saas-backend/scripts'),'');
const head=git('rev-parse','HEAD'), prior='3671a0db85047c2b888862894ff45d802872041d';
fs.mkdirSync(out,{mode:0o700});
execFileSync('tar',['-x','-C',out],{input:execFileSync('git',['archive',head,
  'maya-saas-backend/src','maya-saas-backend/scripts','maya-saas-backend/package.json',
  'maya-saas-backend/tsconfig.json','maya-chat-shell/dev'],{cwd:repo,maxBuffer:128*1024*1024})});
const cwd=path.join(out,'maya-saas-backend');
for(const name of ['node_modules','dist'])fs.symlinkSync(path.join(backend,name),path.join(cwd,name),'dir');
const files={model:'src/ai-tools/ai-core-model.service.ts',
  instructions:'src/conversation-intelligence/conversation-intelligence.service.ts',
  guard:'scripts/local-owner-history-review-policy.mjs'};
const original=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,fs.readFileSync(path.join(cwd,f),'utf8')]));
const env={NODE_ENV:'test',TZ:'UTC',LANG:'C'};
for(const key of ['PATH','HOME','TMPDIR'])if(process.env[key])env[key]=process.env[key];
const hash=b=>createHash('sha256').update(b).digest('hex');
const spec='src/ai-tools/personal-history-followup.spec.ts';
const report={qualification:'OFFLINE_WIRE_COUNTERFACTUALS_NOT_MODEL_LANGUAGE_ACCEPTANCE',head,prior,
  specSha256:hash(fs.readFileSync(path.join(cwd,spec))),baseline:null,mutations:[],restored:null};
const save=()=>fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
function run(name,policy=false){
  const log=path.join(out,name+'.log'), receipt=path.join(out,name+'.json');
  const fd=fs.openSync(log,'wx',0o600);let child;
  try{child=spawnSync(process.execPath,policy?['--test','--test-reporter=tap','scripts/local-owner-history-review.test.mjs']:
    ['node_modules/jest/bin/jest.js','--runInBand','--runTestsByPath',spec,'--json','--outputFile='+receipt],
    {cwd,env,stdio:['ignore',fd,fd],timeout:60000});}finally{fs.closeSync(fd);}
  assert.equal(child.error,undefined);assert.equal(child.signal,null);
  const text=fs.readFileSync(log,'utf8');
  const result=policy?null:JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(result)assert.equal(result.numRuntimeErrorTestSuites,0);
  const total=policy?Number(text.match(/^# tests (\d+)$/m)?.[1]):result.numTotalTests;
  const failed=policy?Number(text.match(/^# fail (\d+)$/m)?.[1]):result.numFailedTests;
  assert.equal(total,policy?7:4);
  assert.equal(hash(fs.readFileSync(path.join(cwd,spec))),report.specSha256);
  return {exit:child.status,total,failed,passed:total-failed,logSha256:hash(text),
    ...(result?{failures:result.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>t.fullName))}:{})};
}
const restore=()=>{for(const [key,file] of Object.entries(files))fs.writeFileSync(path.join(cwd,file),original[key]);};
function replace(key,before,after){assert.equal(original[key].split(before).length,2);fs.writeFileSync(path.join(cwd,files[key]),original[key].replace(before,after));}
function mutation(name,expected,policy=false){const result=run(name,policy);report.mutations.push({name,...result,killed:result.exit===1&&result.failed===expected});save();assert.ok(report.mutations.at(-1).killed);restore();}
try{
  report.baseline={wire:run('baseline'),guard:run('guard-baseline',true)};save();
  assert.equal(report.baseline.wire.exit,0);assert.equal(report.baseline.guard.exit,0);
  for(const key of ['model','instructions'])fs.writeFileSync(path.join(cwd,files[key]),git('show',prior+':maya-saas-backend/'+files[key])+'\n');
  mutation('exact-prior-planner',3);
  replace('model',"input.messages.findLast((message) => message.role === 'user')","input.messages.find((message) => message.role === 'user')");
  mutation('first-user-instead-of-current',3);
  replace('model',"input.messages.findLast((message) => message.role === 'user')\n          ?.content ?? null","input.conversationPlan?.parent_request ?? null");
  mutation('retained-parent-instead-of-current',3);
  replace('guard',"\n    && input.current_user_request === input.conversation.at(-1).content",'');
  mutation('unchecked-private-or-stale-current-request',1,true);
}finally{
  restore();report.restored={wire:run('restored'),guard:run('guard-restored',true)};save();
}
assert.equal(report.restored.wire.exit,0);assert.equal(report.restored.guard.exit,0);
assert.equal(git('rev-parse','HEAD'),head);
console.log(JSON.stringify(report,null,2));
