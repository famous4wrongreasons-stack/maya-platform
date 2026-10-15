import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const source='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010';
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
assert.equal(head,'cfea53a8fc745bb43e025d2556d37bdf9d5d0781');
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim(),'');
assert.ok(process.version.startsWith('v22.'));
const root='/private/tmp/maya-ci-packaging-cfea53a8-20261015';
assert(!fs.existsSync(root)); fs.mkdirSync(root,{mode:0o700});
const repo=path.join(root,'candidate'), backend=path.join(repo,'maya-saas-backend');
fs.copyFileSync(process.argv[1],path.join(root,'executed-runner.mjs'));
const ownHome=path.join(root,'home');fs.mkdirSync(ownHome,{mode:0o700});
const env={PATH:path.dirname(process.execPath)+':/opt/homebrew/opt/python@3.11/libexec/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',HOME:ownHome,TMPDIR:root,LANG:'en_US.UTF-8',TZ:'UTC',NODE_OPTIONS:'--max-old-space-size=3072',npm_config_userconfig:'/dev/null',npm_config_cache:'/private/tmp/maya-ci-packaging-a6d9c12d-20261013/npm-cache'};
const manifest={kind:'fresh-ci-packaging-followup',sourceHead:head,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:source,encoding:'utf8'}).trim(),node:process.version,host:'macOS-local-equivalent-not-GitHub-hosted',status:'running',steps:[],productionEffects:0,realProviderEffects:0,ownerDatabaseAccessed:false,certificate:'NOT_ISSUED'};
const save=()=>fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
let active=null,cancelled=false,started=false;
const stop=()=>{cancelled=true; if(active)try{process.kill(-active.pid,'SIGTERM');}catch{}};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
async function run(name,command,args,cwd=backend,extra={},timeout=1_500_000){
  assert(!cancelled||name==='pg-stop');
  console.log(name); const stage={name,started:new Date().toISOString(),command,args,cwd};manifest.steps.push(stage);save();
  const fd=fs.openSync(path.join(root,name+'.log'),'wx',0o600);
  try{await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env:{...env,...extra},detached:true,stdio:['ignore',fd,fd]});active=child;
    let killTimer;const timer=setTimeout(()=>{stage.timeout=true;try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},5000)},timeout);
    child.once('error',reject); child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(killTimer);active=null;Object.assign(stage,{finished:new Date().toISOString(),exit:code,signal});save();code===0?resolve():reject(new Error(name+' failed '+code+'/'+signal));});
  });}finally{fs.closeSync(fd);}
}
async function freePort(){const s=net.createServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const pgBin='/opt/homebrew/opt/postgresql@16/bin',cluster=path.join(root,'pgdata');
const pg=name=>path.join(pgBin,name);
save();
try{
  await run('clone','git',['clone','--shared','--no-checkout',source,repo],root);
  await run('checkout','git',['checkout','--detach',head],repo);
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),head);
  for(const dir of [backend,path.join(repo,'ai администратор')])for(const n of ['.env','.env.local'])assert(!fs.existsSync(path.join(dir,n)));
  // Fresh dependencies: never generate/install through another worktree's symlink.
  await run('backend-npm-ci','npm',['ci','--no-audit','--no-fund']);
  await run('dependency-audit','npm',['audit','--omit=dev','--audit-level=high','--json']);
  for(const name of ['maya-carrier-react','maya-ios-carrier'])await run(name+'-npm-ci','npm',['ci','--ignore-scripts','--no-audit','--no-fund'],path.join(repo,name));
  for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
  process.chdir(backend);
  const require=createRequire(path.join(backend,'package.json'));require(path.join(backend,'node_modules/ts-node/register/transpile-only'));
  const literals=require(path.join(backend,'test/widgets-live/support/environment'));
  Object.assign(env,literals.PLATFORM_CI_TEST_LITERALS);
  const port=await freePort(),httpPort=await freePort(),database='maya_gates_smoke_cfea53a8';
  manifest.database={cluster,port,database,synthetic:true};save();
  env.DATABASE_URL=`postgresql://ci_proof@127.0.0.1:${port}/${database}`;
  await run('pg-init',pg('initdb'),['-D',cluster,'--auth=trust','--username=ci_proof','--encoding=UTF8','--locale=C']);
  started=true;
  await run('pg-start',pg('pg_ctl'),['-D',cluster,'-w','-t','30','-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c max_connections=30`,'start']);
  const dbArgs=['--host=127.0.0.1','--port='+port,'--username=ci_proof'];
  await run('create-db',pg('createdb'),[...dbArgs,database]);
  await run('prisma-generate','npm',['run','prisma:generate']);
  await run('prisma-validate',process.execPath,['node_modules/prisma/build/index.js','validate']);
  await run('migration-clean-replay',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
  await run('migration-idempotent-replay',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy']);
  await run('seed','npm',['run','prisma:seed']);
  for(const n of ['typecheck','typecheck:scripts','lint'])await run(n.replace(':','-'),'npm',['run',n],backend,n==='lint'?{NODE_OPTIONS:'--max-old-space-size=6144'}:{});
  await run('k3',process.execPath,['scripts/k3-gateway-check.mjs']);
  await run('contract-types',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--project','tsconfig.widget-contract.json','--incremental','false']);
  await run('contract',process.execPath,['scripts/widget-contract-check.mjs']);
  assert(JSON.parse(fs.readFileSync(path.join(backend,'tsconfig.build.json'),'utf8')).exclude.includes('src/widget-contract'));
  await run('k1-dossier',process.execPath,['docs/rebuild/evidence/maya-chat-first-ux/k1/k1-dossier-check.mjs'],repo);
  await run('runtime-artifact',process.execPath,['../maya-chat-shell/build.mjs']);
  await run('full-unit',process.execPath,['node_modules/jest/bin/jest.js','--runInBand','--json','--outputFile='+path.join(root,'full-unit.json')]);
  await run('e2e',process.execPath,['node_modules/jest/bin/jest.js','--config','test/jest-e2e.json','--runInBand','--json','--outputFile='+path.join(root,'e2e.json')]);
  const eventDb='maya_events_proof_cfea53a8',eventEnv={DATABASE_URL:`postgresql://ci_proof@127.0.0.1:${port}/${eventDb}`};
  await run('events-create-db',pg('createdb'),[...dbArgs,eventDb]);
  await run('events-migrate',process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],backend,eventEnv);
  await run('events-live',process.execPath,['node_modules/jest/bin/jest.js','--config','test/jest-events-live.json','--runInBand','--json','--outputFile='+path.join(root,'events-live.json')],backend,eventEnv);
  await run('full-build','npm',['run','build']);
  await run('http-smoke','npm',['run','test:http'],backend,{...literals.WIDGETS_LIVE_EXTRA_LITERALS,HTTP_SMOKE_PORT:String(httpPort)});
  await run('frontend-parse',process.execPath,['scripts/verify-frontend-bundles.mjs','сайт и приложение/app.html','сайт и приложение/maya-admin.html','сайт и приложение/maya-start.html','сайт и приложение/oauth-callback.html'],repo);
  await run('prepublication',process.execPath,['scripts/verify-prepublication-contracts.mjs'],repo);
  await run('prepublication-tests',process.execPath,['--test','scripts/verify-prepublication-contracts.test.mjs'],repo);
  await run('release-sync','npm',['run','sync'],path.join(repo,'maya-ios-carrier'));
  await run('carrier-full','npm',['test'],path.join(repo,'maya-carrier-react'));
  await run('release-packaging-tests','npm',['run','test:release'],path.join(repo,'maya-carrier-react'));
  await run('operator-tests',process.execPath,['--test','scripts/widget-release-operator.test.cjs']);
  await run('operator-compiled',process.execPath,['--test','scripts/widget-release-operator.compiled-test.cjs']);
  await run('ios-unsigned-build','/usr/bin/xcodebuild',['-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphonesimulator','-derivedDataPath',path.join(root,'ios-build'),'CODE_SIGNING_ALLOWED=NO','build'],repo);
  await run('ios-built-app-verify',process.execPath,['maya-carrier-react/tools/release.mjs','verify-app',path.join(root,'ios-build/Build/Products/Debug-iphonesimulator/App.app')],repo);
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),head);
  assert.equal(execFileSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'}).trim(),'');
  const mirrorDiff=execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim();
  manifest.mirrorDiff=mirrorDiff;assert.equal(mirrorDiff,'','Generated packaging must not change committed sources');
  manifest.status='passed';
}catch(e){manifest.status='failed';manifest.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{if(started){try{await run('pg-stop',pg('pg_ctl'),['-D',cluster,'-w','-t','30','-m','fast','stop'],backend,{},45000);manifest.clusterStopped=!fs.existsSync(path.join(cluster,'postmaster.pid'));}catch{manifest.clusterStopped=false;process.exitCode=1;}}save();}
console.log(JSON.stringify({status:manifest.status,root,failure:manifest.failure}));
