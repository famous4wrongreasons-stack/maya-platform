import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
const repo='/private/tmp/maya-ci-packaging-cfea53a8-20261015/candidate';
const out='/private/tmp/maya-first-phone-payload-cfea53a8-20261015';
const sha='cfea53a8fc745bb43e025d2556d37bdf9d5d0781';
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),sha);assert.equal(git('status','--porcelain'),'');
assert.equal(JSON.parse(fs.readFileSync('/private/tmp/maya-first-phone-final-surfaces-20261015-01/manifest.json','utf8')).status,'passed');
assert(!fs.existsSync(out));fs.mkdirSync(out,{mode:0o700});fs.copyFileSync(process.argv[1],out+'/executed-runner.mjs');
const api='https://phone-test.mayaos.ru/api';
const env={PATH:path.dirname(process.execPath)+':/opt/homebrew/opt/python@3.11/libexec/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',HOME:'/private/tmp/maya-ci-packaging-cfea53a8-20261015/home',TMPDIR:out,LANG:'en_US.UTF-8',TZ:'UTC'};
const manifest={sourceHead:sha,kind:'unsigned-device-build-for-phone-test',endpoint:api,status:'running',steps:[],signed:false,installed:false,serverChanges:0,certificate:'NOT_ISSUED'};
const save=()=>fs.writeFileSync(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');save();
let active;
const cancel=()=>{try{process.kill(-active.pid,'SIGTERM')}catch{}};process.on('SIGTERM',cancel);process.on('SIGINT',cancel);
async function run(name,cmd,args){console.log(name);const item={name,cmd,args,started:new Date().toISOString()};manifest.steps.push(item);save();const fd=fs.openSync(out+'/'+name+'.log','wx',0o600);try{await new Promise((resolve,reject)=>{const child=spawn(cmd,args,{cwd:repo,env,detached:true,stdio:['ignore',fd,fd]});active=child;let kill;const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}kill=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},5000)},1200000);child.once('error',reject);child.once('close',(code,signal)=>{clearTimeout(timer);clearTimeout(kill);active=null;Object.assign(item,{exit:code,signal,finished:new Date().toISOString()});save();code===0?resolve():reject(Error(name+' failed '+code))})})}finally{fs.closeSync(fd)}}
try{
 await run('sync-phone-payload',process.execPath,['maya-carrier-react/tools/release.mjs','sync','--development-api='+api]);
 await run('unsigned-device-build','/usr/bin/xcodebuild',['-project','maya-ios-carrier/ios/App/App.xcodeproj','-scheme','App','-configuration','Debug','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath',out+'/ios-device-build','CODE_SIGNING_ALLOWED=NO','MAYA_DEVELOPMENT_API='+api,'build']);
 await run('verify-actual-device-app',process.execPath,['maya-carrier-react/tools/release.mjs','verify-app',out+'/ios-device-build/Build/Products/Debug-iphoneos/App.app','--development-api='+api]);
 assert.equal(git('rev-parse','HEAD'),sha);assert.equal(git('status','--porcelain'),'');manifest.status='passed';
}catch(e){manifest.status='failed';manifest.failure=e.message;process.exitCode=1}finally{save()}
console.log(JSON.stringify({status:manifest.status,sourceHead:sha,installed:false}));
