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
 ['rule extra fields','net/ideas.ts','Object.keys(value).length === names.length && ','','Ideas parameters reject missing'],
 ['rule unit','net/ideas.ts',"!['day', 'calendar_month'].includes(window.unit as string) || ",'','Ideas parameters reject missing'],
 ['rule integer','net/ideas.ts','!Number.isSafeInteger(window.count) || ','','Ideas parameters reject missing'],
 ['rule zero','net/ideas.ts','(window.count as number) < 1','(window.count as number) < 0','Ideas parameters reject missing'],
 ['rule evidence','net/ideas.ts',"p.evidence !== 'proven_attendance' || ",'','Ideas parameters reject missing'],
 ['rule coverage','net/ideas.ts',"!['COMPLETE', 'PARTIAL'].includes(p.minimumCoverage as string)",'false','Ideas parameters reject missing'],
 ['rule scope bound','net/ideas.ts','(scope.count as number) > 100 || ','','Ideas parameters require consistent'],
 ['rule scope consistency','net/ideas.ts',' || scope.restricted !== ((scope.count as number) > 0)','','Ideas parameters require consistent'],
 ['rule timezone binding','net/ideas.ts',' || p.timezone !== sourcePeriod.timezone.trim()','','Ideas parameters require consistent'],
 ['rule timezone valid','net/ideas.ts',"try { new Intl.DateTimeFormat('ru-RU', { timeZone: p.timezone }); } catch { return null; }",'','Ideas parameters require consistent'],
 ['rule comparison substitution','net/ideas.ts',"comparison: p.comparison as 'gt' | 'gte'","comparison: 'gt'",'Ideas parameters preserve exact'],

 ['value availability','net/ideas.ts',"!x.current || !x.available || ",'','Ideas values require current'],
 ['value qualification','net/ideas.ts'," || x.qualification === 'UNQUALIFIED'",'','Ideas values require current'],
 ['value version','net/ideas.ts',"rule.version !== 1 || ",'','Ideas values require current'],
 ['value count','net/ideas.ts',"x.values.length !== 1","x.values.length < 1",'Ideas values reject missing'],
 ['value dimension','net/ideas.ts',"v.basis !== x.basis || v.currency !== x.currency","false",'Ideas values reject missing'],
 ['value scalar','net/ideas.ts',"v.type !== 'observed' || !integral(v.value)","v.type !== 'observed'",'Ideas values reject missing'],
 ['value unit','net/ideas.ts',"v.unit !== (count ? 'count' : 'money_minor') || ",'','Ideas values reject missing'],
 ['policy scope','net/ideas.ts',"scope !== 'client' || ",'','Ideas policy uses literal'],
 ['policy boolean','net/ideas.ts',"typeof v.value !== 'boolean'","false",'Ideas policy uses literal'],
 ['scenario scope','net/ideas.ts',"scope !== 'appointment' || ",'','Ideas scenario is exact'],
 ['scenario horizon','net/ideas.ts'," || x.horizonEnd <= (x.asOf as string)",'','Ideas scenario is exact'],
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
