// Isolated source copies only. Each counterfactual must fail its named executable proof.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'maya-task-actions-mutations-'));
const mutations=[
 ['binding substitution','shell/own-tasks.ts','inboxId: selected.inboxId','inboxId: selected.key','completion uses exact retained'],
 ['create other user','shell/own-tasks.ts','assignee: context.userId',"assignee: 'caller-user'",'self creation freezes'],
 ['allow create for staff','shell/own-tasks.ts','!context?.canCreate || ','','changed principal/tenant'],
 ['duplicate command','shell/own-tasks.ts',' || busy()','','self creation freezes'],
 ['new retry identity','shell/own-tasks.ts','captured.identity, commandAbort.signal',"retry ? 'companion-task:20000000-0000-4000-8000-000000000002' : captured.identity, commandAbort.signal",'lost response survives'],
 ['cross tenant retry','shell/own-tasks.ts','context.tenantId !== pending.tenantId || ','','changed principal/tenant'],
 ['accept stale session','shell/own-tasks.ts','version !== commandSerial || ','','session replacement/signout'],
 ['no receipt target match','net/own-tasks.ts',"command.kind === 'complete' && r.targetRef !== command.key",'false','receipt proof rejects'],
 ['provider effect admitted','net/own-tasks.ts','r.providerWrites !== 0 || ','','receipt proof rejects'],
 ['invent null locator','net/own-tasks.ts',"r.status === 'OPEN' && r.task_id !== null &&", "r.status === 'OPEN' &&",'action context is explicit'],
 ['drop idempotency header','net/client.ts',"endpoint === 'taskCreate' || endpoint === 'taskComplete' || ",'','typed task commands'],
];
const run=()=>spawnSync(process.execPath,['--test','test/task-actions.test.mjs'],{cwd:temp,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,HOME:os.homedir()}});
const report={candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline:false,mutations:[]};
try {
  fs.cpSync(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
  fs.mkdirSync(path.join(temp,'test'));
  fs.writeFileSync(path.join(temp,'package.json'),'{"type":"module"}');
  fs.copyFileSync(path.join(root,'test/task-actions.test.mjs'),path.join(temp,'test/task-actions.test.mjs'));
  const baseline=run();assert.equal(baseline.status,0,baseline.stdout+baseline.stderr);report.baseline=true;
  for(const [name,relative,from,to,proof] of mutations) {
    const file=path.join(temp,'src',relative), original=fs.readFileSync(file,'utf8');
    assert.equal(original.split(from).length,2,'unique mutation site: '+name);
    fs.writeFileSync(file,original.replace(from,to));
    const result=run();fs.writeFileSync(file,original);
    const namedFailure=result.stdout.split('\n').some(line=>line.startsWith('not ok ')&&line.includes(proof));
    assert.equal(result.status,1,name+' did not fail cleanly: '+result.stderr);
    assert.ok(namedFailure,name+' missed named proof: '+result.stdout);
    report.mutations.push({name,status:'KILLED',proof});
  }
  report.status='PASS';console.log(JSON.stringify(report,null,2));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
