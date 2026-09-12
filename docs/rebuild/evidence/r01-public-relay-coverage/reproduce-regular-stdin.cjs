const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root='/tmp/maya-b29-contour/ai администратор';let trials=[];const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maya-retention-stress-'));
try{
for(let i=0;i<300;i++){
 const file=['database.py','webhook_server.py','subscriptions.py'][i%3];
 const payload=JSON.stringify({root,overrides:{[file]:fs.readFileSync(path.join(root,file),'utf8')}});
 const p=path.join(dir,'request.json');fs.writeFileSync(p,payload,{mode:0o600});const fd=fs.openSync(p,'r');let r;
 try{r=spawnSync('python3',['-I','-B','-c','import sys,json; r=json.load(sys.stdin); print(len(r["overrides"]))'],{stdio:[fd,'pipe','pipe'],encoding:'utf8',timeout:10000});}finally{fs.closeSync(fd);}
 trials.push({i,bytes:Buffer.byteLength(payload),status:r.status,error:r.error?.code,signal:r.signal});
 if(r.status!==0)break;
}
}finally{fs.rmSync(dir,{recursive:true});}
fs.writeFileSync(process.argv[2],JSON.stringify({node:process.version,trials,remainingTempDirectory:fs.existsSync(dir)},null,2));
