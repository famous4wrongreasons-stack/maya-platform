import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend=path.join(root,'maya-saas-backend');
const output='/tmp/maya-unified-goods-ui-20261008';
const wrapperOutput='/tmp/maya-unified-goods-ui-wrapper-20261008';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(git('status','--porcelain'),'');
assert.equal(fs.existsSync(output),false);assert.equal(fs.existsSync(wrapperOutput),false);
for(const n of ['.env','.env.local'])assert.equal(fs.existsSync(path.join(backend,n)),false);
fs.mkdirSync(wrapperOutput,{mode:0o700});
const {runCommand}=await import(pathToFileURL(path.join(backend,'scripts/c9-occupancy-proof.mjs')));
const report={source:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),status:'RUNNING',started:new Date().toISOString(),output,launcherSha256:sha(new URL(import.meta.url)),runnerSha256:sha(path.join(backend,'scripts/goods-ui-proof.mjs')),qualification:'Existing goods React/HTTP/PG restart probe with synthetic adapter and scripted model. Harness counters are scoped to fixtures; no global egress count or real provider/model acceptance.'};
const save=()=>fs.writeFileSync(path.join(wrapperOutput,'wrapper-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const control={cancelled:null,terminateActive:null,activeCleanup:false};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{control.cancelled??=signal;if(!control.activeCleanup)control.terminateActive?.();});
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:'C',LC_ALL:'C',TZ:'UTC',NODE_OPTIONS:'--max-old-space-size=256'};
report.command={name:'goods-ui',command:process.execPath,args:['scripts/goods-ui-proof.mjs','--run','--output='+output],cwd:backend,timeoutMs:720000};save();
try{await runCommand(report.command,env,wrapperOutput,control);const proof=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));report.proofStatus=proof.status;report.clusterStopped=proof.clusterStopped;report.pidfileAbsent=!fs.existsSync(path.join(proof.cluster,'postmaster.pid'));assert.equal(proof.status,'passed');assert.equal(proof.clusterStopped,true);assert.equal(report.pidfileAbsent,true);report.status='PASS';}
catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;if(fs.existsSync(path.join(output,'manifest.json'))){const proof=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));report.proofStatus=proof.status;report.clusterStopped=proof.clusterStopped;report.pidfileAbsent=!fs.existsSync(path.join(proof.cluster,'postmaster.pid'));}}
finally{report.sourceAtEnd=git('rev-parse','HEAD');report.dirtyAtEnd=git('status','--porcelain');if(report.sourceAtEnd!==report.source||report.dirtyAtEnd){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}report.finished=new Date().toISOString();save();}
