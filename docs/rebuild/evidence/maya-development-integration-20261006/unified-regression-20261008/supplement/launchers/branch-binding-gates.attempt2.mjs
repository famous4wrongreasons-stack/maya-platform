import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend=path.join(root,'maya-saas-backend');
const output='/tmp/maya-unified-branch-binding-20261008-attempt2';
const pgBin='/opt/homebrew/opt/postgresql@16/bin';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(git('status','--porcelain'),'');assert.equal(fs.existsSync(output),false);
for(const n of ['.env','.env.local'])assert.equal(fs.existsSync(path.join(backend,n)),false);
const {proofEnvironment,proofCommands,runCommand}=await import(pathToFileURL(path.join(backend,'scripts/c9-occupancy-proof.mjs')));
const listener=net.createServer();await new Promise((r,j)=>{listener.once('error',j);listener.listen(0,'127.0.0.1',r);});
const port=listener.address().port;await new Promise((r,j)=>listener.close(e=>e?j(e):r()));assert.ok(![5432,55611,4177].includes(port));
fs.mkdirSync(output,{mode:0o700});const cluster=path.join(output,'pg');
const database='maya_widget_gate_proof_c9occ_4baefee2';
const fence='/tmp/maya-unified-regression-20261008/loopback-only.cjs';
const env={...proofEnvironment(process.env,`postgresql://c9_proof@127.0.0.1:${port}/${database}`),LC_ALL:'C',NODE_OPTIONS:`--max-old-space-size=3072 --require=${fence}`};
const report={source:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),status:'RUNNING',started:new Date().toISOString(),port,database,cluster,launcherSha256:sha(new URL(import.meta.url)),nodeFenceSha256:sha(fence),runnerSha256:sha(path.join(backend,'scripts/c9-occupancy-proof.mjs')),qualification:'Existing finite native branch-binding HTTP/PG restart proof with synthetic provider transport; no real provider/model acceptance',externalNodeNetwork:'loopback-only TCP preload; not a measured external call count',commands:[],completed:[]};
const save=()=>fs.writeFileSync(path.join(output,'wrapper-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const control={cancelled:null,terminateActive:null,activeCleanup:false};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{control.cancelled??=signal;if(!control.activeCleanup)control.terminateActive?.();});
let startAttempted=false;save();
try{for(const spec of proofCommands({pgBin,cluster,log:path.join(output,'postgres-private.log'),port,database,receipt:path.join(output,'private-restart.json'),output,branchBinding:true})){if(spec.name==='pg-start')startAttempted=true;report.commands.push(spec);save();process.stdout.write('START '+spec.name+'\n');await runCommand(spec,env,output,control);report.completed.push(spec.name);save();process.stdout.write('PASS '+spec.name+'\n');}report.status='PASS';}
catch(e){report.status='FAIL';report.error=e.message;process.exitCode=1;}
finally{if(startAttempted){try{await runCommand({name:'pg-stop',command:path.join(pgBin,'pg_ctl'),args:['-D',cluster,'-m','fast','-w','-t','30','stop']},env,output,control);report.clusterStopped=!fs.existsSync(path.join(cluster,'postmaster.pid'));}catch(e){report.status='FAIL';report.cleanupError=e.message;process.exitCode=1;}}report.sourceAtEnd=git('rev-parse','HEAD');report.dirtyAtEnd=git('status','--porcelain');if(report.sourceAtEnd!==report.source||report.dirtyAtEnd){report.status='FAIL_SOURCE_CHANGED';process.exitCode=1;}report.finished=new Date().toISOString();save();}
