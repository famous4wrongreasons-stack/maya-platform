import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runOwnedStage} from '/tmp/maya-exact-time-validation-20261008/owned-stage.mjs';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend=path.join(root,'maya-saas-backend');
const mode=process.argv[2];assert.ok(['red','green'].includes(mode));
const out=process.argv[3];assert.match(out??'',/^\/tmp\/maya-time-correction-validation-20261008\/(red|green)-[1-9][0-9]*$/);assert.ok(!fs.existsSync(out));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
for(const name of ['.env','.env.local'])assert.ok(!fs.existsSync(path.join(backend,name)));
assert.ok(fs.realpathSync(path.join(backend,'node_modules')).startsWith(backend+'/'));
const require=createRequire(path.join(backend,'package.json'));require('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
const {WIDGETS_LIVE_TEST_LITERALS}=require(path.join(backend,'test/widgets-live/support/environment.ts'));
const fence='/tmp/maya-exact-time-validation-20261008/loopback-only.cjs';
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LC_ALL:'C',LANG:'C',TZ:'UTC',...WIDGETS_LIVE_TEST_LITERALS,NODE_OPTIONS:`--max-old-space-size=3072 --require=${fence}`,DATABASE_URL:'postgresql://maya_gate@127.0.0.1:55991/maya_time_correction_unstarted',PRISMA_HIDE_UPDATE_MESSAGE:'1',CHECKPOINT_DISABLE:'1'};
const files=['src/ai-tools/ai-core.service.ts','src/ai-tools/ai-core.service.spec.ts','src/conversation-intelligence/conversation-intelligence.service.ts','src/conversation-intelligence/conversation-intelligence.service.spec.ts','src/conversation-intelligence/semantic-slot-normalization.ts','src/conversation-intelligence/semantic-slot-normalization.spec.ts'];
const hash=b=>createHash('sha256').update(b).digest('hex');const fileHash=p=>hash(fs.readFileSync(p));
const hashes=()=>Object.fromEntries(files.map(p=>[p,fileHash(path.join(backend,p))]));
const source=()=>({head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),dirty:git('status','--porcelain'),patchSha256:hash(git('diff','HEAD','--','maya-saas-backend')),fileHashes:hashes()});
const spec=(name,args)=>({name,command:process.execPath,args,cwd:backend,timeoutMs:180000});
const tests=mode==='red'?['src/ai-tools/ai-core.service.spec.ts']:['src/ai-tools/ai-core.service.spec.ts','src/conversation-intelligence/conversation-intelligence.service.spec.ts','src/conversation-intelligence/semantic-slot-normalization.spec.ts'];
const commands=[spec('targeted-unit',['node_modules/jest/bin/jest.js','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--runTestsByPath',...tests,...(mode==='red'?['--testNamePattern=replaces an earlier exact clock with the current time_of_day correction']:[]),'--json',`--outputFile=${out}/targeted-unit.json`])];
if(mode==='green')commands.push(spec('backend-types',['node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.build.json','--incremental','false']),spec('changed-lint',['node_modules/eslint/bin/eslint.js',...files.filter(p=>!p.startsWith('src/conversation-intelligence/semantic-slot-normalization'))]),spec('k3',['scripts/k3-gateway-check.mjs']));
fs.mkdirSync(out,{mode:0o700});
const harnessFiles=[new URL(import.meta.url),new URL('file:///tmp/maya-exact-time-validation-20261008/owned-stage.mjs'),new URL('file://'+fence)];
const harness=()=>harnessFiles.map(p=>({path:p.pathname,sha256:fileHash(p)}));
const report={contract:'maya.time-correction-local-proof/1',mode,started:new Date().toISOString(),source:source(),harness:harness(),commands,completed:[],status:'RUNNING',qualification:'Scripted semantic selection; mocked timeline/catalog/runtime; real AiCore and semantic validator. No model/provider/browser/HTTP/PG/restart acceptance.'};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const control={cancelled:null,terminateActive:null,activeCleanup:false};for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{control.cancelled??=signal;control.terminateActive?.();});save();
try {for(const cmd of commands){process.stdout.write(`START ${cmd.name}\n`);await runOwnedStage(cmd,env,out,control,report);report.completed.push(cmd.name);save();process.stdout.write(`PASS ${cmd.name}\n`);}report.status='PASS';}
catch(error){report.status='FAIL';report.failure=error.message;process.exitCode=1;}
finally{report.sourceAtEnd=source();report.harnessAtEnd=harness();report.sourceStable=JSON.stringify(report.source)===JSON.stringify(report.sourceAtEnd);report.harnessStable=JSON.stringify(report.harness)===JSON.stringify(report.harnessAtEnd);report.cancelled=control.cancelled;report.finished=new Date().toISOString();if(!report.sourceStable||!report.harnessStable||control.cancelled){report.status='INVALID_CHANGED_OR_CANCELLED';process.exitCode=1;}save();process.stdout.write(`RESULT ${report.status}\n`);}
