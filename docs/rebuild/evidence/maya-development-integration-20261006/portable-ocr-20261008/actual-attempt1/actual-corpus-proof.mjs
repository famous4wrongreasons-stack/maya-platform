import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {evaluateCorpus} from './assert-corpus.mjs';
const backend='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
const base='/tmp/maya-linux-ocr-20261008';
const output=process.argv[2];assert.match(output??'',/^\/tmp\/maya-linux-ocr-20261008\/actual-attempt[1-9][0-9]*$/);assert.ok(!fs.existsSync(output));fs.mkdirSync(output,{mode:0o700});
assert.equal(fs.realpathSync(process.cwd()),fs.realpathSync(backend));
const require=createRequire(backend+'/package.json');const cp=require('node:child_process');
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
const binary='/opt/homebrew/bin/tesseract';
const files=['src/ai-tools/goods-photo-parser.service.ts','src/ai-tools/goods-photo-tesseract.ts','src/ai-tools/goods-photo-ocr-rows.ts','scripts/goods-photo-ocr-models.json','scripts/prepare-goods-photo-ocr-models.mjs','ocr-assets/eng.traineddata','ocr-assets/rus.traineddata','ocr-assets/LICENSE','package.json','package-lock.json'].map(f=>path.join(backend,f));
files.push(binary,...['actual-corpus-proof.mjs','corpus-plan.mjs','generate-corpus.mjs','assert-corpus.mjs'].map(f=>path.join(base,f)));
const hashes=Object.fromEntries(files.map(f=>[f,fileHash(f)]));
fs.writeFileSync(output+'/source-hashes.json',JSON.stringify(hashes,null,2)+'\n');
fs.copyFileSync(base+'/actual-corpus-proof.mjs',output+'/actual-corpus-proof.mjs');
const observations={contract:'maya.synthetic-goods-photo-observations/1',actualProcessor:{engine:'Tesseract native CLI rus+eng fast LSTM',platform:process.platform,executionMode:'actual-image-bytes'},cases:[]};
const report={contract:'maya.native-tesseract-actual-corpus-proof/1',status:'running',observer:'REAL_SPAWN_CALL_THROUGH_UNCHANGED',scriptedOcr:false,modelApiCalls:0,providerCalls:0,unexpectedNodeNetwork:0,workers:[],version:cp.execFileSync(binary,['--version'],{encoding:'utf8',timeout:10000,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'}}).split('\n').slice(0,4),observations};
const originalSpawn=cp.spawn,originalConnect=net.Socket.prototype.connect,originalFetch=globalThis.fetch;let activeKey;
cp.spawn=function(...args){
 assert.equal(args[0],binary);assert.deepEqual(args[1],['stdin','stdout','--tessdata-dir',backend+'/ocr-assets','-l','rus+eng','--oem','1','--psm','6','--dpi','300','-c','tessedit_create_tsv=1']);
 assert.equal(args[2].shell,false);assert.deepEqual(args[2].env,{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',OMP_THREAD_LIMIT:'1',OMP_NUM_THREADS:'1'});
 const child=Reflect.apply(originalSpawn,this,args);const record={key:activeKey,pid:child.pid,exited:false,stdoutBytes:0,stderrBytes:0};const chunks=[];report.workers.push(record);
 child.stdout.on('data',chunk=>{record.stdoutBytes+=chunk.length;if(record.stdoutBytes<=262144)chunks.push(Buffer.from(chunk));});
 child.stderr.on('data',chunk=>{record.stderrBytes+=chunk.length;});
 child.once('close',(code,signal)=>{record.exited=true;record.exitCode=code;record.signal=signal;const all=Buffer.concat(chunks);record.stdoutSha256=hash(all);record.syntheticTsv=all.toString('utf8');all.fill(0);for(const c of chunks)c.fill(0);});return child;
};
globalThis.fetch=()=>{report.unexpectedNodeNetwork++;throw new Error('No network in actual corpus');};net.Socket.prototype.connect=function(){report.unexpectedNodeNetwork++;throw new Error('No socket in actual corpus');};
try{
 require('reflect-metadata');require('ts-node').register({project:backend+'/tsconfig.json',transpileOnly:true});
 const {ConfigService}=require('@nestjs/config');const {GoodsPhotoParser}=require(backend+'/src/ai-tools/goods-photo-parser.service.ts');
 const parser=new GoodsPhotoParser(new ConfigService({GOODS_PHOTO_OCR_PROVIDER:'tesseract'}));
 const manifest=JSON.parse(fs.readFileSync(base+'/corpus-attempt1/manifest.json','utf8'));
 for(const fixture of manifest.fixtures){
  activeKey=fixture.key;const bytes=fs.readFileSync(base+'/corpus-attempt1/'+fixture.filename);assert.equal(hash(bytes),fixture.imageSha256);const started=Date.now();let outcome;
  try{const result=await parser.parse(bytes);outcome={status:'parsed',lines:result.lines};}
  catch(error){outcome={status:'refused',errorCode:error.getResponse?.().message??'UNEXPECTED_EXCEPTION'};}
  finally{bytes.fill(0);}
  observations.cases.push({key:fixture.key,imageSha256:fixture.imageSha256,outcome});console.log(fixture.key+' '+outcome.status+' '+(outcome.errorCode??'')+' '+(Date.now()-started)+'ms');
 }
 report.evaluation=evaluateCorpus(manifest,observations);
 assert.equal(report.workers.length,manifest.fixtures.length);assert.ok(report.workers.every(w=>w.exited&&w.exitCode===0&&w.signal===null));assert.equal(report.unexpectedNodeNetwork,0);
 report.sourceUnchanged=Object.entries(hashes).every(([file,digest])=>fileHash(file)===digest);assert.ok(report.sourceUnchanged);
 report.status=report.evaluation.status==='qualified'?'passed':'failed';if(report.status!=='passed')process.exitCode=1;
}catch(error){report.status='failed';report.failure=error.message;process.exitCode=1;}
finally{cp.spawn=originalSpawn;net.Socket.prototype.connect=originalConnect;globalThis.fetch=originalFetch;fs.writeFileSync(output+'/actual-corpus.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log('RESULT '+report.status+'; failures '+JSON.stringify(report.evaluation?.failures??report.failure));
