import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const base=fs.realpathSync('/tmp/maya-linux-ocr-20261008');
const backend='/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
const output=path.join(base,'assets-guard-attempt1');assert.ok(!fs.existsSync(output));fs.mkdirSync(output,{mode:0o700});
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const scripts=['prepare-goods-photo-ocr-models.mjs','goods-photo-ocr-models.json'];
const report={contract:'maya.ocr-assets-guards/1',status:'running',networkAllowed:false,sourceHashes:Object.fromEntries(scripts.map(f=>[f,hash(backend+'/scripts/'+f)])),cases:[]};
const fence=path.join(output,'deny-network.cjs');fs.writeFileSync(fence,"require('node:https').request=()=>{throw new Error('unexpected_network')}; require('node:net').Socket.prototype.connect=()=>{throw new Error('unexpected_network')};\n");
const cases=[
 ['valid-verify',()=>{},['--verify'],0,''],
 ['existing-valid-fetch',()=>{},['--fetch'],0,''],
 ['missing-mode',()=>{},[],1,'mode_required'],
 ['unrecognized-mode',()=>{},['--fetch','https://example.invalid'],1,'mode_required'],
 ['tampered-model',b=>{const f=b+'/ocr-assets/rus.traineddata';const d=fs.readFileSync(f);d[0]^=1;fs.writeFileSync(f,d);},['--fetch'],1,'checksum_mismatch'],
 ['short-model',b=>fs.truncateSync(b+'/ocr-assets/eng.traineddata',16),['--verify'],1,'checksum_mismatch'],
 ['extra-file',b=>fs.writeFileSync(b+'/ocr-assets/unexpected','x'),['--verify'],1,'unexpected_files'],
 ['symlink-directory',b=>{fs.renameSync(b+'/ocr-assets',b+'/other');fs.symlinkSync(b+'/other',b+'/ocr-assets');},['--verify'],1,'unsafe_directory'],
 ['symlink-file',b=>{fs.renameSync(b+'/ocr-assets/rus.traineddata',b+'/other');fs.symlinkSync(b+'/other',b+'/ocr-assets/rus.traineddata');},['--verify'],1,'unsafe_file'],
 ['hardlinked-file',b=>fs.linkSync(b+'/ocr-assets/rus.traineddata',b+'/other'),['--verify'],1,'unsafe_file'],
];
try {for(const [name,mutate,args,expected,code] of cases){
 const b=path.join(output,name);fs.mkdirSync(b);fs.mkdirSync(b+'/scripts');for(const f of scripts)fs.copyFileSync(backend+'/scripts/'+f,b+'/scripts/'+f);
 fs.cpSync(backend+'/ocr-assets',b+'/ocr-assets',{recursive:true});mutate(b);
 const paths=fs.readdirSync(b+'/ocr-assets').map(f=>b+'/ocr-assets/'+f),before=Object.fromEntries(paths.map(f=>[f,hash(f)]));
 const child=spawnSync(process.execPath,[b+'/scripts/prepare-goods-photo-ocr-models.mjs',...args],{cwd:b,timeout:10000,maxBuffer:16384,encoding:'utf8',env:{PATH:'/usr/bin:/bin',NODE_OPTIONS:'--require='+fence}});
 const row={name,status:child.status,signal:child.signal,stdout:child.stdout,stderr:child.stderr,unchanged:paths.every(f=>hash(f)===before[f])};report.cases.push(row);
 assert.equal(child.status,expected);assert.equal(child.signal,null);assert.ok(row.unchanged);assert.ok(!child.stderr.includes('unexpected_network'));if(code)assert.equal(child.stderr.trim(),'goods_photo_ocr_assets_'+code);else assert.equal(JSON.parse(child.stdout).downloaded,false);
 // Only the exact scratch fixture created above; retain logs, not duplicate models.
 fs.rmSync(b,{recursive:true});console.log('PASS '+name);
}report.status='passed';}catch(error){report.status='failed';report.failure=error.message;process.exitCode=1;}finally{fs.writeFileSync(output+'/report.json',JSON.stringify(report,null,2)+'\n');fs.copyFileSync(new URL(import.meta.url),output+'/assets-guard-proof.mjs');}
