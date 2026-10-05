import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkNativeConfig, verifyParity, verifyNativeFiles } from '../tools/release.mjs';
import { readTree, assertFiles, assertTree } from '../tools/payload-files.mjs';
import { nativeApiTarget, parseDevelopmentApi, xcodeDevelopmentApi } from '../tools/native-api-target.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), REPO=path.dirname(ROOT);
const web=readTree(path.join(ROOT,'dist/web')),cap=readTree(path.join(ROOT,'dist/capacitor'));
const config=JSON.parse(fs.readFileSync(path.join(REPO,'maya-ios-carrier/capacitor.config.json')));
test('RPK positive: complete real React PWA and native payload parity',()=>{
  checkNativeConfig(config);verifyParity(web,cap);
  const manifest=web.get('manifest.webmanifest');
  assert.ok(manifest.equals(fs.readFileSync(path.join(REPO,'maya-chat-shell/entry/manifest.webmanifest'))));
  assert.equal(JSON.parse(manifest).id,'/maya-chat-shell/');
  assert.ok(web.get('index.html').toString().includes('<link rel="manifest" href="./manifest.webmanifest">'));
  for(const [n,b] of web)if(n.startsWith('icons/'))assert.ok(b.equals(fs.readFileSync(path.join(REPO,'maya-chat-shell/brand',n))));
});
test('RPK explicit development API preserves production default and refuses unsafe shapes',()=>{
  assert.equal(nativeApiTarget().apiBase,'https://mayaos.ru/api');
  const api='https://maya-proof.invalid:3443/api';
  assert.equal(nativeApiTarget(api).connectSrc,"'self' https://maya-proof.invalid:3443");
  assert.equal(xcodeDevelopmentApi('Debug',api),api);
  assert.equal(xcodeDevelopmentApi('Release',undefined),undefined);
  assert.throws(()=>xcodeDevelopmentApi('Release',api));
  assert.throws(()=>xcodeDevelopmentApi(undefined,api));
  for(const bad of ['', 'http://localhost:3310/api', 'https://mayaos.ru/api', 'https://www.mayaos.ru/api',
    'https://mayaos.ru./api', 'https://www.mayaos.ru./api',
    'https://name:password@maya-proof.invalid/api', 'https://maya-proof.invalid/api?token=test',
    'https://maya-proof.invalid/api#test', 'https://maya-proof.invalid/other', 'https://maya-proof.invalid/api/'])
    assert.throws(()=>nativeApiTarget(bad),bad);
  assert.throws(()=>parseDevelopmentApi(['--development-api='+api,'--development-api='+api]));
});
for(const dir of ['../maya-chat-shell/dist/capacitor','../maya-chat-shell/dist/web','www','../maya-carrier-react/dist/web'])
  test('RPK old/alternate native payload refused: '+dir,()=>assert.throws(()=>checkNativeConfig({...config,webDir:dir})));
test('RPK remote server override refuses',()=>assert.throws(()=>checkNativeConfig({...config,server:{url:'https://mayaos.ru'}})));
test('RPK legacy shell replacing native www refuses even if supplied with an inventory',()=>{
  const old=readTree(path.join(REPO,'maya-chat-shell/dist/web'));
  assert.throws(()=>verifyNativeFiles(old,cap));
  old.set('release-inventory.json',Buffer.from(JSON.stringify([...old.keys()])));
  assert.throws(()=>verifyNativeFiles(old,cap));
});
for(const [name,edit] of [
  ['missing manifest',m=>m.delete('manifest.webmanifest')],
  ['altered icon',m=>m.set('icons/maya-192.png',Buffer.from('changed'))],
  ['extra script',m=>m.set('unexpected.js',Buffer.from('old shell'))],
  ['altered main',m=>m.set([...m.keys()].find(k=>k.endsWith('/main.js')),Buffer.from('old shell'))],
])test('RPK '+name+' refuses',()=>{const m=new Map(cap);edit(m);assert.throws(()=>verifyNativeFiles(m,cap));});
test('RPK only empty generated bridge placeholders admitted',()=>{
  const m=new Map(cap);m.set('cordova.js',Buffer.alloc(0));m.set('cordova_plugins.js',Buffer.alloc(0));verifyNativeFiles(m,cap);
  m.set('cordova.js',Buffer.from('unexpected executable'));assert.throws(()=>verifyNativeFiles(m,cap));
});
test('RPK endpoint/CSS/identity divergence refuses',()=>{
  for(const name of ['styles.css','manifest.webmanifest', [...cap.keys()].find(k=>k.endsWith('/main.js'))]){
    const m=new Map(cap);m.set(name,Buffer.concat([m.get(name),Buffer.from('changed')]));assert.throws(()=>verifyParity(web,m));
  }
});
test('RPK symlink payload refuses',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'maya-payload-'));try{fs.symlinkSync(path.join(ROOT,'dist/web/index.html'),path.join(d,'index.html'));assert.throws(()=>readTree(d));}finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('RPK Xcode and sync are bound to the same refusing release entry',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(REPO,'maya-ios-carrier/package.json')));
  assert.equal(pkg.scripts.sync,'node ../maya-carrier-react/tools/release.mjs sync');
  const x=fs.readFileSync(path.join(REPO,'maya-ios-carrier/ios/App/App.xcodeproj/project.pbxproj'),'utf8');
  assert.ok(x.includes('maya-carrier-react/tools/release.mjs\\\" verify-native'));
  assert.ok(x.includes('A11AFE0001000000000000A2 /* Verify canonical React AChat payload */,'));
});
test('RPK verifier rebuilds expected bytes, refuses a swapped artifact, does not repair it',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'maya-packaging-'));try{
    const carrier=path.join(d,'maya-carrier-react');fs.cpSync(ROOT,carrier,{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/dev/dist')});
    fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(carrier,'node_modules'),'dir');
    for(const n of ['maya-saas-backend','maya-chat-shell'])fs.symlinkSync(path.join(REPO,n),path.join(d,n),'dir');
    const build=spawnSync(process.execPath,['build.mjs','--target=web'],{cwd:carrier,encoding:'utf8'});
    assert.equal(build.status,0,build.stderr);
    const good=spawnSync(process.execPath,['build.mjs','--target=web','--verify-output'],{cwd:carrier,encoding:'utf8'});
    assert.equal(good.status,0,good.stderr);
    const api='https://maya-proof.invalid:3443/api';
    const devArgs=['--target=capacitor','--development-api='+api];
    const dev=spawnSync(process.execPath,['build.mjs',...devArgs],{cwd:carrier,encoding:'utf8'});
    assert.equal(dev.status,0,dev.stderr);
    const devVerify=spawnSync(process.execPath,['build.mjs',...devArgs,'--verify-output'],{cwd:carrier,encoding:'utf8'});
    assert.equal(devVerify.status,0,devVerify.stderr);
    const w=readTree(path.join(carrier,'dist/web')),c=readTree(path.join(carrier,'dist/capacitor'));
    verifyParity(w,c,api);
    assert.throws(()=>verifyParity(w,c),'development payload cannot pass production parity');
    assert.throws(()=>verifyParity(w,c,'https://different.invalid/api'),'development endpoint mismatch refuses');
    const prodVerify=spawnSync(process.execPath,['build.mjs','--target=capacitor','--verify-output'],{cwd:carrier,encoding:'utf8'});
    assert.notEqual(prodVerify.status,0,'default verifier must refuse development bytes');
    verifyParity(w,readTree(path.join(carrier,'dist/capacitor')),api); // refusal did not repair the artifact
    const file=path.join(carrier,'dist/web/index.html');fs.writeFileSync(file,'old shell');
    const r=spawnSync(process.execPath,['build.mjs','--target=web','--verify-output'],{cwd:carrier,encoding:'utf8'});
    assert.notEqual(r.status,0);assert.match(r.stderr,/payload bytes differ/);assert.equal(fs.readFileSync(file,'utf8'),'old shell');
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
