import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='/tmp/maya-linux-ocr-20261008/downloaded-models';
const commit='87416418657359cb625c412a48b6e1d6d41c29bd';
const files=[{name:'eng.traineddata',size:4113088,gitBlob:'bbef4675053b5b468cdb477053e28b1c698ba08e'},{name:'rus.traineddata',size:3861738,gitBlob:'b146cb2263acbc6383f8e92ea0ce759537687bb8'},{name:'LICENSE',size:11358,gitBlob:'d645695673349e3947e8e5ae42332d0ac3164cd7'}];
assert.equal(fs.existsSync(root),false);fs.mkdirSync(root,{mode:0o700});
const report={contract:'maya.local-ocr-model-download/1',status:'running',sourceCommit:commit,license:'Apache-2.0',outboundPayload:'public GET only; no image/document/credentials',files:[]};
try{
 for(const item of files){
  const url='https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/'+commit+'/'+item.name;
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
  const chunks=[];let size=0;for await(const part of response.body){size+=part.length;assert.ok(size<=item.size);chunks.push(Buffer.from(part));}
  const bytes=Buffer.concat(chunks);assert.equal(size,item.size);
  assert.equal(createHash('sha1').update(Buffer.from('blob '+size+'\0')).update(bytes).digest('hex'),item.gitBlob);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(root,item.name),bytes,{flag:'wx',mode:0o600});
  report.files.push({...item,url,sha256});console.log(item.name+' '+size+' bytes '+sha256);
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
finally{fs.writeFileSync(root+'/manifest.json',JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}
