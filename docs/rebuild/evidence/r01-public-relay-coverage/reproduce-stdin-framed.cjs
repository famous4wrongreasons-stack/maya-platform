const {spawnSync}=require('node:child_process'), fs=require('node:fs');
const payload=JSON.stringify({root:'/tmp/maya-b29-contour/ai администратор',overrides:{'database.py':fs.readFileSync('/tmp/maya-b29-contour/ai администратор/database.py','utf8')}});
let trials=[];const size=Buffer.byteLength(payload);
const script=`import sys,os,json
b=sys.stdin.buffer.read(${size})
os.write(2,('READ_BYTES:'+str(len(b))+'\\n').encode())
rest=sys.stdin.buffer.read()
os.write(2,('EOF:'+str(len(rest))+'\\n').encode())
print(len(json.loads(b+rest)['overrides']))`;
for(let i=0;i<300;i++){
 const r=spawnSync('python3',['-I','-B','-c',script],{input:payload,encoding:'utf8',timeout:5000});
 trials.push({i,bytes:size,status:r.status,error:r.error?.code,signal:r.signal,readProgress:r.stderr});
 if(r.status!==0)break;
}
fs.writeFileSync(process.argv[2],JSON.stringify({node:process.version,trials},null,2));
