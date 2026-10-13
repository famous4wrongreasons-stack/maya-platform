// Isolated source copies only. Each counterfactual must fail its named executable proof.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'maya-ideas-mutations-'));
const mutations=[
 ['duplicates','net/ideas.ts','ids.has(x.id) || ','','Ideas malformed'],
 ['authority','net/ideas.ts',"boundaries[k] !== false","false",'Ideas malformed'],
 ['prediction','net/ideas.ts'," || x.kind === 'PREDICTION'",'', 'Ideas malformed'],
 ['cap','net/ideas.ts','v.nextCursor !== null','false','Ideas retain only'],
 ['read becomes write','net/client.ts',"endpoint === 'ideas' || ",'','Ideas use one finite'],
 ['foreign selection','shell/ideas.ts','row.key === key && unexpired(row)','unexpired(row)','Ideas loaded selection'],
 ['substitute id','shell/ideas.ts','row.key === selected.key && ','','Ideas loaded selection'],
 ['revision','shell/ideas.ts','row.revision === selected.revision && ','','Ideas loaded selection'],
 ['digest','shell/ideas.ts',' && row.digest === selected.digest','','Ideas loaded selection'],
 ['late response','shell/ideas.ts',' && version === serial','','Ideas late response'],
 ['expiry','shell/ideas.ts','Date.parse(row.expiresAt) > deps.scheduler.now()','true','Ideas expiry'],
 ['expired list','shell/ideas.ts','result.value.rows.filter(unexpired)','result.value.rows','Ideas already expired'],
 ['one flight','shell/ideas.ts',"current.phase === 'loading' || ",'','Ideas lazy load'],
 ['retry','shell/ideas.ts','current.retryAt !== null && current.retryAt > deps.scheduler.now()','false','Ideas rate limit'],
];
const run=()=>spawnSync(process.execPath,['--test','--test-skip-pattern=build admits','test/ideas.test.mjs'],{cwd:temp,encoding:'utf8',timeout:20000,env:{PATH:process.env.PATH,HOME:os.homedir()}});
const report={candidate:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline:false,mutations:[]};
try {
  fs.cpSync(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
  fs.mkdirSync(path.join(temp,'test'));
  fs.writeFileSync(path.join(temp,'package.json'),'{"type":"module"}');
  fs.copyFileSync(path.join(root,'test/ideas.test.mjs'),path.join(temp,'test/ideas.test.mjs'));
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
