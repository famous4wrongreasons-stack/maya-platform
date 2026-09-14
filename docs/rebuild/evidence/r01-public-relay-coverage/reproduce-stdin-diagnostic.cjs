const {spawnSync}=require('node:child_process');const fs=require('node:fs');
const payload=JSON.stringify({root:'/tmp/maya-b29-contour/ai администратор',overrides:{'database.py':fs.readFileSync('/tmp/maya-b29-contour/ai администратор/database.py','utf8')}});
let trials=[];const script=`import os,sys,json
n=0;parts=[]
while True:
 b=os.read(0,65536)
 if not b:break
 parts.append(b);n+=len(b);os.write(2,(str(n)+'\\n').encode())
os.write(2,b'EOF\\n');print(len(json.loads(b''.join(parts))['overrides']))`;
for(let i=0;i<150;i++){
 const r=spawnSync('python3',['-I','-B','-c',script],{input:payload,encoding:'utf8',timeout:5000});
 trials.push({i,bytes:Buffer.byteLength(payload),status:r.status,error:r.error?.code,signal:r.signal,readProgress:r.stderr});
 if(r.status!==0)break;
}
fs.writeFileSync(process.argv[2],JSON.stringify({node:process.version,trials},null,2));
