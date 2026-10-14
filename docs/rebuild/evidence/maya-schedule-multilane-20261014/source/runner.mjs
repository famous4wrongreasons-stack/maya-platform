import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const source='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010';
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim(),'');
const root='/private/tmp/maya-schedule-multilane-final01-20261014';
fs.mkdirSync(root,{mode:0o700});fs.copyFileSync(process.argv[1],path.join(root,'runner.mjs'));
const repo=path.join(root,'candidate'),backend=path.join(repo,'maya-saas-backend'),carrier=path.join(repo,'maya-carrier-react');
const home=path.join(root,'home'),tmp=path.join(root,'tmp');fs.mkdirSync(home);fs.mkdirSync(tmp);
const env={PATH:path.dirname(process.execPath)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',HOME:home,TMPDIR:tmp,LANG:'en_US.UTF-8',TZ:'UTC',npm_config_userconfig:'/dev/null'};
const manifest={contract:'maya.schedule-multilane-source-proof/1',head,startedAt:new Date().toISOString(),status:'RUNNING',steps:[],freshSyntheticDatabase:true,retainedDatabaseAccess:false,realProviderEffects:0,certificate:'NOT_ISSUED'};
const save=()=>fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
let pgStarted=false;
async function run(name,cmd,args,cwd=backend,extra={}) {
 const entry={name,command:[cmd,...args],cwd,startedAt:new Date().toISOString()};manifest.steps.push(entry);save();
 const log=path.join(root,name+'.log'),fd=fs.openSync(log,'wx',0o600);
 try { await new Promise((resolve,reject)=>{
  const p=spawn(cmd,args,{cwd,env:{...env,...extra},stdio:['ignore',fd,fd],detached:true});
  const timer=setTimeout(()=>{entry.timeout=true;process.kill(-p.pid,'SIGTERM');},240000);
  p.once('error',e=>{clearTimeout(timer);reject(e)});
  p.once('close',(code,signal)=>{clearTimeout(timer);Object.assign(entry,{exit:code,signal,finishedAt:new Date().toISOString()});save();code===0&&!entry.timeout?resolve():reject(Error(name+' failed '+code+'/'+signal));});
 }); } finally {fs.closeSync(fd);entry.sha256=createHash('sha256').update(fs.readFileSync(log)).digest('hex');save();}
 console.log(name+' PASS');
}
const pgBin='/opt/homebrew/opt/postgresql@16/bin',cluster=path.join(root,'pgdata'),pg=n=>path.join(pgBin,n);
const profile=path.join(root,'loopback.sb');fs.writeFileSync(profile,'(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))\n');
const local=(name,args,extra={},cwd=backend)=>run(name,'/usr/bin/sandbox-exec',['-f',profile,process.execPath,...args],cwd,extra);
try {
 await run('clone','git',['clone','--shared','--no-checkout',source,repo],root);
 await run('checkout','git',['checkout','--detach',head],repo);
 await run('backend-dependencies','/bin/cp',['-cR',path.join(source,'maya-saas-backend/node_modules'),path.join(backend,'node_modules')],root);
 await run('carrier-dependencies','/bin/cp',['-cR',fs.realpathSync(path.join(source,'maya-carrier-react/node_modules')),path.join(carrier,'node_modules')],root);
 for(const n of ['.env','.env.local']) assert(!fs.existsSync(path.join(backend,n)));
 for(const k of Object.keys(process.env))delete process.env[k];Object.assign(process.env,env);process.chdir(backend);
 const req=createRequire(path.join(backend,'package.json'));req(path.join(backend,'node_modules/ts-node/register/transpile-only'));
 Object.assign(env,req(path.join(backend,'test/widgets-live/support/environment')).WIDGETS_LIVE_TEST_LITERALS,{WIDGET_GATEWAY_PG:'required'});
 const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));
 const database='maya_widget_gate_proof_journal_names';manifest.database={host:'127.0.0.1',port,name:database};save();
 await run('pg-init',pg('initdb'),['-D',cluster,'--auth=trust','--username=widget_proof','--encoding=UTF8','--locale=C']);
 pgStarted=true;await run('pg-start',pg('pg_ctl'),['-D',cluster,'-w','-t','30','-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c max_connections=30`,'start']);
 await run('createdb',pg('createdb'),['--host=127.0.0.1','--port='+port,'--username=widget_proof',database]);
 env.DATABASE_URL=`postgresql://widget_proof@127.0.0.1:${port}/${database}`;
 const guard="const net=require('node:net'),assert=require('node:assert/strict');const x=net.connect(443,'198.51.100.1');x.setTimeout(1500,()=>{throw Error('denial not immediate')});x.on('error',e=>{assert.equal(e.code,'EPERM');console.log('external connection refused EPERM')});";
 await local('network-fence',['-e',guard]);
 await local('prisma-generate',['node_modules/prisma/build/index.js','generate']);
 await local('backend-types',['node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.build.json','--incremental','false']);
 await local('live-types',['node_modules/typescript/bin/tsc','--noEmit','--project','test/tsconfig.widgets-live.json','--incremental','false']);
 await local('scoped-lint',['node_modules/eslint/bin/eslint.js','test/widgets-live/source-carrier.probe-spec.ts']);
 await local('test-only-migrations',['node_modules/prisma/build/index.js','migrate','deploy']);
 await local('runtime-build',['../maya-chat-shell/build.mjs']);
 await local('carrier-harness',['test/build-harness.mjs'],{},carrier);
 await local('source-carrier',['node_modules/jest/bin/jest.js','--config','test/jest-widgets-live.json','--testRegex','widgets-live/source-carrier\\.probe-spec\\.ts$','--runInBand','--json','--outputFile='+path.join(root,'source-carrier-jest.json')],{GITHUB_SOURCE_PROBE_OUT:path.join(root,'source-observation')});
 assert.equal(execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),'');
 const result=JSON.parse(fs.readFileSync(path.join(root,'source-carrier-jest.json')));
 manifest.results={passed:result.numPassedTests,failed:result.numFailedTests,skipped:result.numPendingTests};assert.equal(result.numFailedTests,0);assert.equal(result.numPassedTests,4);
 manifest.status='PASS';
} catch(e) {manifest.status='FAIL';manifest.failure=e.message;process.exitCode=1;}
finally {
 if(pgStarted)try {await run('pg-stop',pg('pg_ctl'),['-D',cluster,'-w','-t','30','-m','fast','stop']);manifest.clusterStopped=!fs.existsSync(path.join(cluster,'postmaster.pid'));}catch(e){manifest.clusterStopped=false;manifest.stopFailure=e.message;process.exitCode=1;}
 manifest.finishedAt=new Date().toISOString();save();
}
console.log(JSON.stringify({status:manifest.status,head,root,failure:manifest.failure}));
