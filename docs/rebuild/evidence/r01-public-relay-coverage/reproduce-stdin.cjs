const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const root='/tmp/maya-b29-contour/ai администратор';
let trials=[];
for(let i=0;i<100;i++){
 const file=['database.py','webhook_server.py','subscriptions.py'][i%3];
 const payload=JSON.stringify({root,overrides:{[file]:fs.readFileSync(path.join(root,file),'utf8')}});
 const r=spawnSync('python3',['-I','-B','-c','import sys,json; r=json.load(sys.stdin); print(len(r["overrides"]))'],{input:payload,encoding:'utf8',timeout:10000});
 trials.push({i,bytes:Buffer.byteLength(payload),status:r.status,error:r.error?.code,signal:r.signal});
 if(r.status!==0){fs.writeFileSync(process.argv[2],JSON.stringify({node:process.version,trials},null,2));process.exitCode=1;break;}
}
fs.writeFileSync(process.argv[2],JSON.stringify({node:process.version,trials},null,2));
