import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {runOwnedStage} from '/tmp/maya-c9-failure-20261008/owned-stage.mjs';
const repo='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend=path.join(repo,'maya-saas-backend');
const output=path.join('/tmp/maya-core-conversation-20261008','preflight');
fs.mkdirSync(output,{mode:0o700});
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['scripts/conversation-qualification/replay.mjs','scripts/conversation-qualification/replay.test.mjs','datasets/conversation-intelligence/core-diagnostic-20261008.json'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(backend,f)))]));
const batch=JSON.parse(fs.readFileSync(path.join(backend,files[2])));
assert.equal(batch.dialogs,3);assert.equal(batch.userTurns,5);assert.equal(batch.cases.length,3);
assert.deepEqual(batch.cases.map(c=>c.role),['client','owner','admin']);
assert.equal(batch.cases.reduce((n,c)=>n+c.userTurns.length,0),5);
assert.equal(batch.paidAuthorized,false);assert.equal(batch.limitsExecutable,false);
for(const row of Object.values(batch.sourcePaths))assert.equal(hash(execFileSync('git',['show',row.observedCommit+':'+row.path],{cwd:repo})),row.sha256);
for(const row of batch.cases) {
 assert.equal(row.userTurns.length,row.provenance.turns.length);
 for(const [i,turn] of row.userTurns.entries())assert.equal(hash(Buffer.from(turn)),row.provenance.turns[i].textSha256);
 assert.ok(!Object.keys(row).some(k=>/^(assistant|expected|gold|reply)/.test(k)));
}
const specs=[{name:'metadata-preflight',command:process.execPath,args:['scripts/conversation-qualification/current-candidate-http.mjs','--preflight','--pg-bin','/opt/homebrew/opt/postgresql@16/bin','--profile-metadata',path.join(backend,'scripts/conversation-qualification/current-candidate-profile-metadata.example.json')],cwd:backend,timeoutMs:30000}];
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,TZ:'UTC',NODE_OPTIONS:'--max-old-space-size=3072 --require=/tmp/maya-c9-failure-20261008/loopback-only.cjs'};
const report={contract:'maya.core-conversation-mechanical/1',status:'running',sourceHashes:hashes(),provenanceAndFiveTurnsVerified:true,modelCalls:0,providerCalls:0,paidAuthorized:false,qualification:'LOCAL_TEST_ADAPTER_RESPONSES_ONLY_NOT_DIALOGUE_OR_MODEL_ACCEPTANCE',completed:[],groups:{}};
const control={cancelled:null,terminateActive:null};for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{control.cancelled??=sig;control.terminateActive?.();});
try{for(const spec of specs){console.log('START '+spec.name);await runOwnedStage(spec,env,output,control,report);report.completed.push(spec.name);console.log('PASS '+spec.name);}report.status='passed';}catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}finally{report.sourceUnchanged=JSON.stringify(hashes())===JSON.stringify(report.sourceHashes);if(!report.sourceUnchanged){report.status='source-drift';process.exitCode=1;}fs.copyFileSync(new URL(import.meta.url),path.join(output,'mechanical.mjs'));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
