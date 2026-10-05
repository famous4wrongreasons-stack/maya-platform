from pathlib import Path
import subprocess,json,os,re,time,concurrent.futures,datetime
root=Path.cwd();w=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002/receipts/r06-diagnosis';repo=root/'work/maya-controlled-integration'
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['PYTHONDONTWRITEBYTECODE']='1'
code="const {spawnSync}=require('child_process');const t=Date.now();const r=spawnSync('python3',['-m','unittest','test_package5_operational_delivery'],{cwd:process.argv[1],env:process.env,encoding:'utf8',timeout:20000});console.log(JSON.stringify({elapsedMs:Date.now()-t,status:r.status,signal:r.signal,error:r.error?{code:r.error.code,errno:r.error.errno,message:r.error.message}:null,stdout:r.stdout,stderr:r.stderr}));"
def trial(tag,i):
 cwd=w/f'mutation-isolated-worker-{i}/ai администратор';r=subprocess.run([node+'/node','-e',code,str(cwd)],env=env,capture_output=True,text=True);d=json.loads(r.stdout);d.update(tag=tag,worker=i,wrapperExit=r.returncode,at=datetime.datetime.now(datetime.timezone.utc).isoformat());(out/f'{tag}-{i}.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({k:d[k] for k in ['tag','worker','elapsedMs','status','signal','error']}),flush=True);return d
results=[]
for i in range(1,4):results.append(trial('isolated',i))
for wave in range(1,3):
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results.extend(pool.map(lambda i:trial(f'eight-way-{wave}',i),range(1,9)))
(out/'load-comparison.json').write_text(json.dumps(results,indent=2)+'\n')
