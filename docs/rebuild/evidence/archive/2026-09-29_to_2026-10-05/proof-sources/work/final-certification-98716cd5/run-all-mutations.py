import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-98716cd5';out=root/'outputs/final-certification-98716cd5/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode

import sys

import shutil,concurrent.futures,threading,queue,signal
parts=out/'mutation-parts';parts.mkdir(exist_ok=True)
plan_text=subprocess.check_output(['node','scripts/widgets-mutation-ci.mjs','plan',''],cwd=be,env=env,text=True)
plan=dict(line.split('=',1) for line in plan_text.strip().splitlines())
jobs=json.loads(plan['matrix'])['include']
(out/'mutation-plan.json').write_text(json.dumps({'candidate':head,'jobs':jobs,'workers':8,'restrictions':'none; canonical default steps; full unfiltered tests'},indent=2)+'\n')
priority=['BS','TURN','AR','SV2','SB1','SBV','SCOPE','PROFILE']
jobs.sort(key=lambda j:(priority.index(j['gate']) if j['gate'] in priority else len(priority),j['slot']))
jobs=[j for j in jobs if j['gate']!='NS']
q=queue.Queue()
for j in jobs:q.put(j)
stopped=threading.Event()
def worker(i):
 wr=work/('mutation-worker-'+str(i));wb=wr/'maya-saas-backend';wr.mkdir(exist_ok=True)
 if not wb.exists():
  shutil.copytree(be,wb,ignore=shutil.ignore_patterns('node_modules','dist','coverage','.git','.env','.env.local','*.tsbuildinfo'))
  (wb/'node_modules').symlink_to(be/'node_modules',target_is_directory=True)
  for p in repo.iterdir():
   if p.name!='maya-saas-backend':(wr/p.name).symlink_to(p,target_is_directory=p.is_dir())
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=wr,text=True).strip()==head
 db='maya_widget_gate_proof_final98716_worker'+str(i)
 ee={**env,'DATABASE_URL':'[REDACTED DATABASE URL]'+db}
 script="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(!/^maya_widget_gate_proof_final98716_worker[1-8]$/.test(n))throw Error('guard');if(!(await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
 subprocess.run(['node','-e',script,db],cwd=be,env=env,check=True)
 with (out/('mutation-worker-'+str(i)+'-migration.log')).open('w') as log:subprocess.run(['npx','prisma','migrate','deploy'],cwd=wb,env=ee,stdout=log,stderr=subprocess.STDOUT,check=True)
 while not stopped.is_set():
  try:j=q.get_nowait()
  except queue.Empty:return
  slot=j['slot'];args=['node','scripts/widgets-mutation-battery.mjs','--gate',j['gate']]
  if j['partition']:args+=['--partition',j['partition']]
  args+=['--out',str(parts/('widgets-mutation-part-'+slot+'.json'))]
  t=time.time();print(json.dumps({'started':slot,'worker':i}),flush=True)
  with (out/('mutation-'+slot+'.log')).open('w') as log:p=subprocess.Popen(args,cwd=wb,env=ee,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);(work/('worker-'+str(i)+'-pid')).write_text(str(p.pid));rc=p.wait()
  receipt={'candidate':head,'name':'mutation-'+slot,'command':args,'cwd':str(wb),'exit':rc,'seconds':round(time.time()-t,2)}
  (out/('mutation-'+slot+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
  if rc:stopped.set();return
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 list(pool.map(worker,range(1,9)))
print(json.dumps({'stopped':stopped.is_set(),'remainingShards':q.qsize()}),flush=True)
