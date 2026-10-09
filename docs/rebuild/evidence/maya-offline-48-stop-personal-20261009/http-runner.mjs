import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { proofCommands, proofEnvironment, runCommand } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics/maya-saas-backend/scripts/c9-occupancy-proof.mjs';
const backend = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics/maya-saas-backend';
const output = process.argv[2];
assert.ok(output && path.isAbsolute(output) && !fs.existsSync(output));
for (const name of ['.env','.env.local']) assert.ok(!fs.existsSync(path.join(backend,name)));
fs.mkdirSync(output,{mode:0o700});
const privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'maya-stop-personal-'));
const cluster=path.join(privateRoot,'pg');
const server=net.createServer();
await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
const port=server.address().port; await new Promise(r=>server.close(r));
const database='maya_widget_gate_proof_c9occ_'+randomBytes(6).toString('hex');
const pgBin='/opt/homebrew/opt/postgresql@16/bin';
const env={...proofEnvironment(process.env,`postgresql://c9_proof@127.0.0.1:${port}/${database}`),NODE_OPTIONS:'--max-old-space-size=2048'};
const control={cancelled:null,terminateActive:null,activeCleanup:false};
const commands=proofCommands({pgBin,cluster,log:path.join(output,'postgres.log'),port,database,receipt:path.join(privateRoot,'unused.json'),output}).slice(0,4);
commands.push({name:'target-http',command:process.execPath,args:['node_modules/jest/bin/jest.js','--config','test/jest-widgets-live.json','--testRegex','conversation-stop-personal\\.probe-spec\\.ts$','--runInBand','--runTestsByPath','test/widgets-live/conversation-stop-personal.probe-spec.ts','--json','--outputFile='+path.join(output,'target-http-jest.json')],env:{JEST_STOP_PERSONAL_REPORT:path.join(output,'actual-responses.json')}});
const files=['src/ai-tools/ai-core.service.ts','src/ai-tools/ai-tool-handler.service.ts','src/crm/client-appointment-read.service.ts','src/widgets/stores/timeline.store.ts','test/widgets-live/conversation-stop-personal.probe-spec.ts'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(backend,f))).digest('hex')]));
const manifest={qualification:'SYNTHETIC_SCRIPTED_TARGET_HTTP_PG',sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:backend,encoding:'utf8'}).trim(),sourceHashes:hashes(),workingTreeDelta:true,status:'running',completed:[],cluster,database,port,realModelAcceptance:false,externalProviderAcceptance:false,resources:{nodeHeapMb:2048,jestWorkers:1,pgSharedBuffersMb:64}};
fs.writeFileSync(path.join(output,'source-delta.patch'),execFileSync('git',['diff','--',...files],{cwd:backend}));
const save=()=>fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const cancel=s=>{control.cancelled??=s;save();if(!control.activeCleanup)control.terminateActive?.();};
process.on('SIGINT',cancel); process.on('SIGTERM',cancel);
let started=false;save();
try {for(const spec of commands){if(spec.name==='pg-start')started=true;console.log(spec.name);await runCommand({...spec,cwd:backend},env,output,control);manifest.completed.push(spec.name);save();}manifest.status='passed';}
catch(e){manifest.status='failed';throw e;}
finally {if(started){await runCommand({name:'pg-stop',command:path.join(pgBin,'pg_ctl'),args:['-D',cluster,'-m','fast','-w','-t','30','stop']},env,output,control);manifest.clusterStopped=true;manifest.pidAbsent=!fs.existsSync(path.join(cluster,'postmaster.pid'));}manifest.sourceUnchanged=JSON.stringify(hashes())===JSON.stringify(manifest.sourceHashes);save();}
