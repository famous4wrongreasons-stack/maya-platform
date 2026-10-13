// Isolated source copies only. Each counterfactual must fail its named executable proof.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'maya-workspace-reads-mutations-'));
const mutations=[
  ['mark POST becomes GET','net/client.ts',"const reading = endpoint === 'ideas'", "const reading = endpoint === 'feedRead' || endpoint === 'ideas'",'mark read uses the exact'],
  ['mark invalid key','net/client.ts','if (!feedKey(key))','if (false)','mark read uses the exact'],
  ['mark forged acceptance','net/client.ts','value.ok === true','Boolean(value.ok)','mark read transport rejects'],
  ['mark extra acceptance fields','net/client.ts',' && Object.keys(value).length === 1','','mark read transport rejects'],
  ['mark foreign selection','shell/workspace-reads.ts','current.feed.find(row => row.key === key && row.unread)','current.feed.find(row => row.unread)','mark read requires current visible'],
  ['mark already read','shell/workspace-reads.ts','row.key === key && row.unread','row.key === key','mark read requires current visible'],
  ['mark exact confirmation','shell/workspace-reads.ts','row.key === selected.key && !row.unread','!row.unread','mark read requires exact persisted'],
  ['mark persisted unread','shell/workspace-reads.ts','row.key === selected.key && !row.unread','row.key === selected.key','mark read requires exact persisted'],
  ['mark deny boundary','shell/workspace-reads.ts',"accepted.failure.reason === 'forbidden' || ",'','mark read denial clears'],
  ['mark concurrent flight','shell/workspace-reads.ts',"current.phase !== 'ready' || current.markingRead !== null || ","current.phase !== 'ready' || ",'mark read requires current visible'],

  ['feed cap','net/workspace-reads.ts','possiblyCapped: rows.length === 50','possiblyCapped: false','feed projection is text-only'],
  ['feed duplicate','net/workspace-reads.ts','ids.has(r.id) || ','','feed malformed'],
  ['report duplicate','net/workspace-reads.ts','ids.has(r.runId) || ','','report list refuses'],
  ['substituted detail','net/workspace-reads.ts','v.runId !== selected.key || ','','report projection binds'],
  ['changed period','net/workspace-reads.ts','v.periodLocalDate !== selected.period || ','','report projection binds'],
  ['read becomes write','net/client.ts',"endpoint === 'feed' || ",'','finite authenticated GETs'],
  ['report read becomes write','net/client.ts',"endpoint === 'reportSnapshot' || ",'','finite authenticated GETs'],
  ['late response accepted','shell/workspace-reads.ts','version === serial && ','','late detail cannot overwrite'],
  ['foreign key accepted','shell/workspace-reads.ts','allReports.find(row => row.key === key)','allReports[0]','only current loaded report keys'],
  ['deny retains titles','shell/workspace-reads.ts',"phase: 'failed', feed: [], reports: [], detail: null", "phase: 'failed', feed: [], detail: null",'denied detail clears'],
  ['duplicate refresh','shell/workspace-reads.ts',"current.phase === 'loading' || ",'','lazy one-flight lists'],
  ['rate limit ignored','shell/workspace-reads.ts','current.retryAt !== null && current.retryAt > deps.scheduler.now()','false','denied detail clears'],
  ['same session replacement retains','shell/workspace-reads.ts','deps.session.subscribe(() => { clear(); watch(); })','deps.session.subscribe(() => { watch(); })','late detail cannot overwrite'],
];
const run=()=>spawnSync(process.execPath,['--test','--test-skip-pattern=build admits','test/workspace-reads.test.mjs'],{cwd:temp,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,HOME:os.homedir()}});
const report={candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline:false,mutations:[]};
try {
  fs.cpSync(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
  fs.mkdirSync(path.join(temp,'test'));
  fs.writeFileSync(path.join(temp,'package.json'),'{"type":"module"}');
  fs.copyFileSync(path.join(root,'test/workspace-reads.test.mjs'),path.join(temp,'test/workspace-reads.test.mjs'));
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
