// Isolated source copies only. Each counterfactual must fail its named executable proof.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'maya-own-tasks-mutations-'));
const mutations=[
  ['projection cap','net/own-tasks.ts','possiblyCapped: rows.length === 50','possiblyCapped: false','A23 read projection'],
  ['duplicate identity','net/own-tasks.ts','ids.has(r.work_item_id) || ','','malformed rows'],
  ['unknown status','net/own-tasks.ts',"(r.status !== 'OPEN' && r.status !== 'COMPLETED')",'false','malformed rows'],
  ['read becomes write','net/client.ts',"endpoint === 'ownTasks' || ",'','only GET current-user'],
  ['late response accepted','shell/own-tasks.ts','version !== serial || ','','close / signout'],
  ['old rows survive reset','shell/own-tasks.ts','all = []; current = empty(); publish({});','all = []; publish({});','lazy one-flight'],
  ['duplicate refresh','shell/own-tasks.ts',"current.phase === 'loading' || ",'','lazy one-flight'],
  ['rate limit ignored','shell/own-tasks.ts','current.retryAt !== null && current.retryAt > deps.scheduler.now()','false','refresh clears old snapshot'],
  ['workspace not cleared','shell/shell.ts','&& !state.workspace','', 'workspace has no WidgetRoute'],
];
const run=()=>spawnSync(process.execPath,['--test','test/own-tasks.test.mjs'],{cwd:temp,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,HOME:os.homedir()}});
const report={candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline:false,mutations:[]};
try {
  fs.cpSync(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
  fs.mkdirSync(path.join(temp,'test'));
  fs.writeFileSync(path.join(temp,'package.json'),'{"type":"module"}');
  fs.copyFileSync(path.join(root,'test/own-tasks.test.mjs'),path.join(temp,'test/own-tasks.test.mjs'));
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
