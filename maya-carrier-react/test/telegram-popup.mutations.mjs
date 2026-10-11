// Focused counterfactuals over private source copies; no source in the working tree is edited.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=process.argv[2];assert.match(output??'',/^\/(?:private\/)?tmp\/maya-telegram-mutations-[\w-]+$/);assert.equal(fs.existsSync(output),false);fs.mkdirSync(output,{mode:0o700});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'maya-telegram-mutant-'));
const session='maya-chat-shell/src/net/session.ts', host='maya-carrier-react/src/runtime/telegramPopup.ts', callback='maya-saas-backend/deploy/platform/beget-edge/oauth-callback.html';
const sources=Object.fromEntries([session,host,callback].map(p=>[p,fs.readFileSync(path.join(repo,p),'utf8')]));
const cases=[
 ['state-binding',session,"if (callback === null || expected === null || callback.state !== expected)","if (callback === null)",'net'],
 ['auth-cancellation',session,'    cancelTelegram();\n    onboardingGeneration += 1;','    onboardingGeneration += 1;','net'],
 ['close-before-complete',session,'    held?.close();','    // mutated close omitted','net'],
 ['exact-origin',host,'held.location.origin === origin && ','','popup'],
 ['exact-path',host,"held.location.pathname === '/oauth-callback.html' && ",'','popup'],
 ['erase-query-before-read',host," && held.location.search === ''",'','popup'],
 ['disown-opener',host,'      popup.opener = null;','      // mutated opener retained','popup'],
 ['erase-before-delivery',host,"            held.history.replaceState(null, '', '/oauth-callback.html');",'            // mutated erasure omitted','popup'],
 ['duplicate-state',callback,"q.getAll('state').length !== 1 || ",'','popup'],
 ['malformed-query-erasure',callback,"    history.replaceState(null, '', location.pathname);",'    // mutated erasure omitted','popup'],
];
const report={contract:'maya.telegram-web-return.mutations/1',sourceHashes:Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,createHash('sha256').update(s).digest('hex')])),baseline:{},results:[]};
const run=(name,suite)=>{
 const target=suite==='net'?'maya-chat-shell/test/net.test.mjs':'maya-carrier-react/test/telegram-popup.test.mjs';
 const r=spawnSync(process.execPath,['--test',target],{cwd:temp,encoding:'utf8',timeout:20000});
 fs.writeFileSync(path.join(output,name+'.log'),r.stdout+r.stderr);
 return r;
};
try{
 fs.cpSync(path.join(repo,'maya-chat-shell/src'),path.join(temp,'maya-chat-shell/src'),{recursive:true});
 fs.cpSync(path.join(repo,'maya-chat-shell/dev/fixtures'),path.join(temp,'maya-chat-shell/dev/fixtures'),{recursive:true});
 for(const f of [host,callback,'maya-chat-shell/build.mjs','maya-chat-shell/package.json','maya-carrier-react/package.json','maya-chat-shell/test/net.test.mjs','maya-carrier-react/test/telegram-popup.test.mjs']){
  fs.mkdirSync(path.dirname(path.join(temp,f)),{recursive:true});fs.copyFileSync(path.join(repo,f),path.join(temp,f));
 }
 fs.symlinkSync(path.join(repo,'maya-carrier-react/node_modules'),path.join(temp,'maya-carrier-react/node_modules'),'dir');
 fs.symlinkSync(path.join(repo,'maya-saas-backend/src'),path.join(temp,'maya-saas-backend/src'),'dir');
 fs.symlinkSync(path.join(repo,'maya-saas-backend/node_modules'),path.join(temp,'maya-saas-backend/node_modules'),'dir');
 for(const dir of ['maya-chat-shell','maya-saas-backend']) for(const f of fs.readdirSync(path.join(repo,dir)).filter(n=>/^tsconfig.*\.json$/.test(n))) fs.copyFileSync(path.join(repo,dir,f),path.join(temp,dir,f));
 for(const suite of ['net','popup']){const r=run('baseline-'+suite,suite);report.baseline[suite]=r.status;assert.equal(r.status,0,'baseline '+suite);}
 for(const [name,file,before,after,suite] of cases){
  const source=sources[file];assert.equal(source.split(before).length,2,'unique mutant '+name);
  fs.writeFileSync(path.join(temp,file),source.replace(before,after));
  const r=run(name,suite);const killed=r.status===1&&r.stdout.includes('AssertionError');
  report.results.push({name,killed,status:r.status,signal:r.signal});fs.writeFileSync(path.join(temp,file),source);
  assert.equal(killed,true,'survived or invalid: '+name);
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{fs.rmSync(temp,{recursive:true,force:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
