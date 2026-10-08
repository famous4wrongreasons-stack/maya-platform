import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runOwnedStage } from './owned-stage.mjs';
const output='/tmp/maya-exact-time-validation-20261008/supervisor-probe';
assert.equal(fs.existsSync(output),false);fs.mkdirSync(output,{mode:0o700});
const env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_OPTIONS:'--max-old-space-size=128 --require=/tmp/maya-exact-time-validation-20261008/loopback-only.cjs'};
const report={contract:'maya.owned-stage-cleanup-probe/1',qualification:'Harmless synthetic Node child/grandchild only; no database or product acceptance',status:'RUNNING',supervisorSha256:createHash('sha256').update(fs.readFileSync(new URL('./owned-stage.mjs',import.meta.url))).digest('hex'),cases:[],groups:{}};
for(const scenario of ['normal-parent-exit','timeout','cancel-during-cleanup']){
 const control={cancelled:null,terminateActive:null,activeCleanup:false};
 const grandchild=scenario==='timeout'?'setInterval(()=>{},1000)':'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)';
 const script=`const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore',env:process.env});c.unref();setTimeout(()=>{console.log('owned-grandchild-started');${scenario==='timeout'?'setInterval(()=>{},1000)':'process.exit(0)'}},100);`;
 const command={name:scenario,command:process.execPath,args:['-e',script],cwd:output,timeoutMs:scenario==='timeout'?350:10000};
 const timer=scenario==='cancel-during-cleanup'?setTimeout(()=>{control.cancelled='SIGTERM';control.terminateActive?.();},400):null;
 let error=null;try{await runOwnedStage(command,env,output,control,report);}catch(e){error=e.message;}finally{clearTimeout(timer);}
 assert.ok(fs.readFileSync(path.join(output,scenario+'.log'),'utf8').includes('owned-grandchild-started'));
 assert.equal(report.groups[scenario].closed,true);assert.equal(report.groups[scenario].groupAbsent,true);
 if(scenario==='normal-parent-exit'){assert.equal(error,null);assert.equal(report.groups[scenario].killSent,true);}
 else if(scenario==='timeout'){assert.equal(error,'owned_stage_timeout');assert.equal(report.groups[scenario].termSent,true);}
 else{assert.equal(error,'SIGTERM');assert.equal(report.groups[scenario].killSent,true);}
 report.cases.push({scenario,result:'PASS',observedError:error});
}
report.status='PASS';fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write('PASS owned child/grandchild cleanup: normal exit, timeout, cancellation during cleanup\n');
