import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const base='/tmp/maya-actual-ocr-20261008';
const backend='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
const mode=process.argv[2];assert.ok(['default','cpu'].includes(mode));
const out=base+'/diagnostic-'+mode+'-attempt1.json';assert.ok(!fs.existsSync(out));
const require=createRequire(backend+'/package.json');const sharp=require('sharp');
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(base+'/actual-attempt1/fixtures/russian.png');
assert.equal(hash(original),'c1a15056196967887b421e612893b3669af21f8b7a9c3594af1fa0790a3f43e9');
const png=await sharp(original,{limitInputPixels:12000000,failOn:'warning',sequentialRead:true}).rotate().flatten({background:'#ffffff'}).removeAlpha().resize({width:2600,height:2600,fit:'inside',withoutEnlargement:true}).png().timeout({seconds:5}).toBuffer();
const binary=base+'/diagnostic-build2/diagnostic';
const report={syntheticOnly:true,mode,originalSha256:hash(original),normalizedSha256:hash(png),binarySha256:hash(fs.readFileSync(binary)),pid:null,closed:false,stdout:'',stderr:''};
let timer;
try {
 await new Promise((resolve,reject)=>{
  const child=spawn(binary,['--synthetic-diagnostic',hash(png),...(mode==='cpu'?['--cpu']:[])],{shell:false,stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8'}});
  report.pid=child.pid;timer=setTimeout(()=>{report.timedOut=true;child.kill('SIGKILL');},15000);
  for(const name of ['stdout','stderr']) child[name].on('data',chunk=>{ report[name]+=chunk.toString('utf8'); if(Buffer.byteLength(report[name])>(name==='stdout'?262144:32000)){report.overflow=true;child.kill('SIGKILL');}chunk.fill(0);});
  child.on('error',e=>{report.error=e.message;});child.stdin.on('error',()=>{});
  child.once('close',(code,signal)=>{report.closed=true;report.exitCode=code;report.signal=signal;resolve();});child.stdin.end(png);
 });
} finally {clearTimeout(timer);original.fill(0);png.fill(0);fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify({path:out,exit:report.exitCode,stderr:report.stderr,stdoutBytes:Buffer.byteLength(report.stdout)}));
