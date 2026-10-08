import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { runOwnedStage } from '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/scripts/conversation-qualification/owned-child-cleanup.mjs';
const root='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration',backend=path.join(root,'maya-saas-backend');
const phase=process.argv[2];assert.match(phase,/^checks[1-9]$/);
const output=path.join('/tmp/maya-core-runner-20261008',phase);fs.mkdirSync(output,{mode:0o700});
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_OPTIONS:'--max-old-space-size=3072 --require=/tmp/maya-c9-failure-20261008/loopback-only.cjs',TZ:'UTC',LANG:'C',LC_ALL:'C'};
const spec=(name,args)=>({name,args,cwd:backend,command:process.execPath,timeoutMs:240000});
const scripts='scripts/conversation-qualification/';
let commands=[spec('node-tests',['--test','--test-concurrency=1',...['current-candidate.test.mjs','core-conversation-admission.test.mjs','core-conversation-source.test.mjs','core-conversation-socket.test.mjs','current-candidate-dry-broker.test.mjs','owned-child-cleanup.test.mjs','proof-broker-contract.test.mjs','replay.test.mjs'].map(n=>scripts+n)]),spec('proof-types',['node_modules/typescript/bin/tsc','--project','/tmp/maya-core-runner-20261008/tsconfig.proof.json']),spec('lint',['node_modules/eslint/bin/eslint.js','test/widgets-live/core-conversation-http.probe-spec.ts'])];
if(process.argv.length>3)commands=commands.filter(c=>process.argv.slice(3).includes(c.name));
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','maya-saas-backend/scripts/conversation-qualification','maya-saas-backend/test/widgets-live/core-conversation-http.probe-spec.ts','maya-saas-backend/test/widgets-live/support/core-conversation-mjs-transform.cjs','maya-saas-backend/test/jest-core-conversation-http.json'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const hash=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const report={contract:'maya.core-runner-checks/1',status:'running',commands,completed:[],sourceHashes:Object.fromEntries(files.map(f=>[f,hash(f)]))};
const control={cancelled:null,terminateActive:null};for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{control.cancelled??=signal;control.terminateActive?.();});
try{for(const s of commands){console.log('START '+s.name);await runOwnedStage(s,env,output,control,report);report.completed.push(s.name);console.log('PASS '+s.name);}report.status='passed';}catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;}finally{report.sourcesUnchanged=Object.entries(report.sourceHashes).every(([f,h])=>hash(f)===h);fs.copyFileSync(new URL(import.meta.url),path.join(output,'local-gates.mjs'));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
