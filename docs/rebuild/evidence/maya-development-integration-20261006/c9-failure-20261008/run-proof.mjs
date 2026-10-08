// Finite adapter around the existing C9 owned-cluster command plan and reviewed
// process-group supervisor. No ambient DATABASE_URL or credentials are reused.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runOwnedStage } from './owned-stage.mjs';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend=path.join(root,'maya-saas-backend');
const scratch=path.dirname(new URL(import.meta.url).pathname);
const {proofCommands,proofEnvironment}=await import(pathToFileURL(path.join(backend,'scripts/c9-occupancy-proof.mjs')).href);
export function commandsFor(input) {
  return proofCommands(input).filter(spec=>spec.name!=='carrier-bundle').map(spec=>{
    if(['prepare','resume'].includes(spec.name)) return {name:spec.name,command:process.execPath,cwd:backend,timeoutMs:480000,args:['node_modules/jest/bin/jest.js','--config','test/jest-widgets-live.json','--testRegex','c9-lifecycle-failure-restart\\.probe-spec\\.ts$','--runInBand','--runTestsByPath','test/widgets-live/c9-lifecycle-failure-restart.probe-spec.ts','--testTimeout=420000','--json','--outputFile='+path.join(input.output,spec.name+'-jest.json')],env:{JEST_C9_FAILURE_STAGE:spec.name,JEST_C9_FAILURE_RECEIPT:input.receipt,JEST_C9_FAILURE_OUTPUT:input.output}};
    return {...spec,cwd:spec.cwd??backend,timeoutMs:180000};
  });
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function sourceBindings(){
  const tracked=execFileSync('git',['ls-files','-z','--','maya-saas-backend/src','maya-saas-backend/prisma','maya-saas-backend/test/widgets-live/support','maya-saas-backend/test/jest-widgets-live.json','maya-saas-backend/scripts/c9-occupancy-proof.mjs','maya-saas-backend/package.json','maya-saas-backend/package-lock.json','maya-saas-backend/prisma.config.ts','maya-saas-backend/tsconfig.json','maya-saas-backend/tsconfig.build.json','maya-saas-backend/test/tsconfig.widgets-live.json'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const proof=['maya-saas-backend/test/widgets-live/c9-lifecycle-failure-restart.probe-spec.ts'];
  return Object.fromEntries([...new Set([...tracked,...proof])].sort().map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
}
export async function main(args){
 const {values}=parseArgs({args,options:{run:{type:'boolean'},output:{type:'string'}},strict:true});
 assert.equal(values.run,true,'Explicit parent-authorized local proof only');
 assert.ok(values.output&&path.isAbsolute(values.output)&&!fs.existsSync(values.output),'New absolute output required');
 for(const file of ['.env','.env.local'])assert.equal(fs.existsSync(path.join(backend,file)),false,'No ambient env files');
 const sources=sourceBindings();
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const harnessBindings=()=>Object.fromEntries(['run-proof.mjs','owned-stage.mjs','loopback-only.cjs'].map(file=>[file,sha(fs.readFileSync(path.join(scratch,file)))]));
 const harness=harnessBindings();
 fs.mkdirSync(values.output,{mode:0o700});
 for(const file of Object.keys(harness))fs.copyFileSync(path.join(scratch,file),path.join(values.output,file));
 const privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'maya-c9-failure-'));fs.chmodSync(privateRoot,0o700);
 const cluster=path.join(privateRoot,'pg'), pgBin='/opt/homebrew/opt/postgresql@16/bin';
 for(const name of ['initdb','pg_ctl','createdb'])fs.accessSync(path.join(pgBin,name),fs.constants.X_OK);
 const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 const database='maya_widget_gate_proof_c9occ_'+randomBytes(6).toString('hex');
 const env=proofEnvironment(process.env,`postgresql://c9_proof@127.0.0.1:${port}/${database}`);
 env.NODE_OPTIONS+=' --require='+path.join(scratch,'loopback-only.cjs');
 env.JEST_C9_FAILURE_SOURCE_HEAD=head;
 env.JEST_C9_FAILURE_SOURCE_DIGEST=sha(JSON.stringify(sources));
 const commands=commandsFor({pgBin,cluster,port,database,log:path.join(values.output,'postgres.log'),receipt:path.join(privateRoot,'private-restart.json'),output:values.output});
 const manifest={contract:'maya.c9-failure-owned-http-pg-proof/1',status:'running',sourceHead:head,sourceBindings:sources,sourceDigest:env.JEST_C9_FAILURE_SOURCE_DIGEST,harnessBindings:harness,cluster,database,port,commands,completed:[],groups:{},resources:{nodeHeapMb:3072,pgSharedBuffersMb:64,pgWorkMemMb:4,pgMaxConnections:30,jestWorkers:1,maxConcurrentBrowsers:0},qualification:{syntheticSourceFacts:true,scriptedPlanner:true,realModelAcceptance:false,realProviderAcceptance:false,c10Complete:false,websiteTouched:false}};
 const save=()=>fs.writeFileSync(path.join(values.output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 const control={cancelled:null,terminateActive:null};let cleanup=false,startAttempted=false;
 const cancel=signal=>{control.cancelled??=signal;manifest.cancelledBy=signal;save();if(!cleanup)control.terminateActive?.(signal);};
 const onInt=()=>cancel('SIGINT'),onTerm=()=>cancel('SIGTERM');process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
 save();
 try{
  for(const spec of commands){
   assert.deepEqual(sourceBindings(),sources,'Sources changed during proof');
   assert.deepEqual(harnessBindings(),harness,'Harness changed during proof');
   if(spec.name==='pg-start')startAttempted=true;
   console.log('START '+spec.name);
   await runOwnedStage(spec,env,values.output,control,manifest);
   manifest.completed.push(spec.name);
   save();console.log('PASS '+spec.name);
  }
  manifest.status='passed';
 }catch(error){manifest.status='failed';manifest.failure=error.message;process.exitCode=1;}
 finally{
  cleanup=true;
  if(startAttempted){
   const cleanupControl={cancelled:null,terminateActive:null};
   try{await runOwnedStage({name:'pg-stop',command:path.join(pgBin,'pg_ctl'),args:['-D',cluster,'-m','fast','-w','-t','30','stop'],cwd:backend,timeoutMs:45000},env,values.output,cleanupControl,manifest);manifest.clusterStopped=true;manifest.postmasterPidAbsent=!fs.existsSync(path.join(cluster,'postmaster.pid'));assert.equal(manifest.postmasterPidAbsent,true);}
   catch(error){manifest.status='failed-owned-cluster-stop';manifest.clusterStopped=false;manifest.cleanupFailure=error.message;process.exitCode=1;}
  }
  manifest.sourcesUnchanged=JSON.stringify(sourceBindings())===JSON.stringify(sources);
  if(!manifest.sourcesUnchanged){manifest.status='failed-source-drift';process.exitCode=1;}
  manifest.harnessUnchanged=JSON.stringify(harnessBindings())===JSON.stringify(harness);
  if(!manifest.harnessUnchanged){manifest.status='failed-artifact-drift';process.exitCode=1;}
  save();process.off('SIGINT',onInt);process.off('SIGTERM',onTerm);
 }
 console.log(JSON.stringify({status:manifest.status,clusterStopped:manifest.clusterStopped,output:values.output}));
}
if(process.argv[1]&&fs.realpathSync(new URL(import.meta.url))===fs.realpathSync(process.argv[1]))await main(process.argv.slice(2));
