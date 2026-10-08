import { runOwnedStage } from './owned-stage.mjs';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend=path.join(root,'maya-saas-backend');
const output=process.argv[2];
assert.match(output??'', /^\/tmp\/maya-exact-time-validation-20261008\/http-attempt[1-9][0-9]*$/);
assert.equal(fs.existsSync(output),false);fs.mkdirSync(output,{mode:0o700});
fs.copyFileSync('/tmp/maya-exact-time-validation-20261008/loopback-only.cjs',path.join(output,'loopback-only.cjs'));
const require=createRequire(path.join(backend,'package.json'));
require('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
const {WIDGETS_LIVE_TEST_LITERALS}=require(path.join(backend,'test/widgets-live/support/environment.ts'));
const {runCommand}=await import(path.join(backend,'scripts/c9-occupancy-proof.mjs'));
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}),'');
for(const file of ['.env','.env.local'])assert.equal(fs.existsSync(path.join(backend,file)),false);
const pgBin='/opt/homebrew/opt/postgresql@16/bin';
const cluster=path.join(output,'pg');assert.equal(fs.existsSync(cluster),false);
async function freePort(){const server=net.createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;await new Promise((r,j)=>server.close(e=>e?j(e):r()));assert.ok(![5432,55611,4177].includes(port));return port;}
const port=await freePort();
const baseEnv={LC_ALL:'C',LANG:'C',PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,...WIDGETS_LIVE_TEST_LITERALS,NODE_OPTIONS:`--max-old-space-size=3072 --require=${output}/loopback-only.cjs`,PRISMA_HIDE_UPDATE_MESSAGE:'1',CHECKPOINT_DISABLE:'1'};
const dbs=['maya_widget_gate_proof_exact_time'];
const dbEnv=db=>({...baseEnv,DATABASE_URL:`postgresql://maya_gate@127.0.0.1:${port}/${db}`,...(db.startsWith('maya_widget')?{WIDGET_GATEWAY_PG:'required'}:{})});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={contract:'maya.exact-time-http-pg/1',source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),status:'RUNNING',started:new Date().toISOString(),port,cluster,databases:dbs,externalNodeNetwork:'loopback-only preload',launcherSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),nodeFenceSha256:createHash('sha256').update(fs.readFileSync(path.join(output,'loopback-only.cjs'))).digest('hex'),supervisorSha256:hash(new URL('./owned-stage.mjs',import.meta.url)),runCommandSha256:hash(path.join(backend,'scripts/c9-occupancy-proof.mjs')),heapMb:3072,pgSharedBuffersMb:64,pgWorkMemMb:4,pgMaxConnections:30,commands:[],completed:[],failures:[]};
const reportPath=path.join(output,'pg-report.json');assert.equal(fs.existsSync(reportPath),false);
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const control={cancelled:null,terminateActive:null,activeCleanup:false};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{control.cancelled??=signal;if(!control.activeCleanup)control.terminateActive?.();});
const node=(name,args,timeoutMs=180000)=>({name,command:process.execPath,args,cwd:backend,timeoutMs});
async function run(spec,env=baseEnv,allowFailure=false){report.commands.push(spec);save();process.stdout.write('START '+spec.name+'\n');const start=Date.now();try{if(spec.command===process.execPath)await runOwnedStage(spec,env,output,control,report);else await runCommand(spec,env,output,control);report.completed.push({name:spec.name,durationMs:Date.now()-start});process.stdout.write('PASS '+spec.name+'\n');}catch(e){report.failures.push({name:spec.name,error:e.message,durationMs:Date.now()-start});process.stdout.write('FAIL '+spec.name+'\n');const group=report.groups?.[spec.name];if(!allowFailure||(group&&(group.closed!==true||group.groupAbsent!==true)))throw e;}finally{save();}}
const pg=(name,cmd,args)=>({name,command:path.join(pgBin,cmd),args,cwd:backend,timeoutMs:90000});
let startAttempted=false;save();

try{
 await run(pg('pg-init','initdb',['-D',cluster,'--auth=trust','--username=maya_gate','--encoding=UTF8','--locale=C']));
 startAttempted=true;
 await run(pg('pg-start','pg_ctl',['-D',cluster,'-w','-t','30','-l',path.join(output,'postgres-private.log'),'-o',`-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`,'start']));
 for(const db of dbs){await run(pg(db+'-create','createdb',['-h','127.0.0.1','-p',String(port),'-U','maya_gate',db]));
  for(const [suffix,args] of [['validate',['validate']],['migrate',['migrate','deploy']],['status',['migrate','status']],['diff',['migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code']]])await run(node(db+'-'+suffix,['node_modules/prisma/build/index.js',...args]),dbEnv(db),suffix==='diff');
 }
 const sql={guest_migrations:`SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NULL AS active FROM "_prisma_migrations" WHERE migration_name LIKE '%public_booking%' ORDER BY migration_name`,guest_constraints:`SELECT c.relname,t.conname,t.confdeltype,t.confupdtype,t.condeferrable,t.condeferred,t.convalidated,pg_get_constraintdef(t.oid) FROM pg_constraint t JOIN pg_class c ON c.oid=t.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.contype='f' AND c.relname IN ('PublicBookingSession','PublicBookingQuote','PublicBookingAttempt') ORDER BY 1,2`};
 for(const [name,query]of Object.entries(sql))await run(pg('schema-'+name,'psql',['-h','127.0.0.1','-p',String(port),'-U','maya_gate','-d',dbs[0],'-X','-v','ON_ERROR_STOP=1','-Atc',query]));
 await run(node('carrier-harness',['../maya-carrier-react/test/build-harness.mjs']),dbEnv(dbs[0]));
 await run(node('booking-and-capture-target',['node_modules/jest/bin/jest.js','--config','test/jest-widgets-live.json','--maxWorkers=1','--workerIdleMemoryLimit=768MB','--runTestsByPath','test/widgets-live/chat-catalog-booking.live-spec.ts','test/widgets-live/semantic-slot-captures.live-spec.ts','test/widgets-live/e2-booking.live-spec.ts','--json','--outputFile='+output+'/booking-and-capture-target.json'],180000),dbEnv(dbs[0]));
 report.functionalStatus=report.completed.some(r=>r.name==='booking-and-capture-target')?'PASS':'NOT_RUN';
 report.schemaDiffStatus=report.failures.some(r=>r.name.endsWith('-diff'))?'FAIL':'PASS';
 report.status=report.failures.length?'FAIL':'PASS';
}catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{if(startAttempted){try{await run(pg('pg-stop','pg_ctl',['-D',cluster,'-m','fast','-w','-t','30','stop']));report.clusterStopped=!fs.existsSync(path.join(cluster,'postmaster.pid'));}catch(e){report.clusterStopped=false;report.error=e.message;report.status='FAIL';}}report.sourceAtEnd=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.dirtyAtEnd=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});if(report.sourceAtEnd!==report.source||report.dirtyAtEnd){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}report.launcherSha256AtEnd=hash(new URL(import.meta.url));report.nodeFenceSha256AtEnd=hash(path.join(output,'loopback-only.cjs'));report.supervisorSha256AtEnd=hash(new URL('./owned-stage.mjs',import.meta.url));report.runCommandSha256AtEnd=hash(path.join(backend,'scripts/c9-occupancy-proof.mjs'));report.harnessUnchanged=report.launcherSha256===report.launcherSha256AtEnd&&report.nodeFenceSha256===report.nodeFenceSha256AtEnd&&report.supervisorSha256===report.supervisorSha256AtEnd&&report.runCommandSha256===report.runCommandSha256AtEnd;if(!report.harnessUnchanged){report.status='FAIL_HARNESS_CHANGED';process.exitCode=1;}report.cancelled=control.cancelled;if(control.cancelled){report.status='CANCELLED';process.exitCode=1;}report.pidfileAbsent=!fs.existsSync(path.join(cluster,'postmaster.pid'));report.finished=new Date().toISOString();save();process.stdout.write('FUNCTIONAL '+(report.functionalStatus??'FAIL')+'; SCHEMA '+(report.schemaDiffStatus??'UNQUALIFIED')+'; OVERALL '+report.status+'\n');if(report.status!=='PASS')process.exitCode=1;}
