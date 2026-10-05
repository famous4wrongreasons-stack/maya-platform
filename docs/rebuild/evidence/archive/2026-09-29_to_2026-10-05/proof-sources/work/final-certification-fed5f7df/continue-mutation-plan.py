import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-fed5f7df';out=root/'outputs/final-certification-fed5f7df/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


import concurrent.futures,threading,queue
parts=out/'mutation-parts';plan=json.loads((out/'mutation-plan.json').read_text())['jobs']
initial={1:'AR',2:'NS',3:'BS',4:'SB1',5:'TURN',6:'1-5',7:'SBV',8:'SV2'}
jobs=[j for j in plan if j['slot'] not in initial.values()];assert len(jobs)==57
q=queue.Queue()
for j in jobs:q.put(j)
stopped=threading.Event()
def worker(i):
 initial_receipt=out/('mutation-'+initial[i]+'.receipt.json')
 while not initial_receipt.exists():
  if stopped.is_set():return
  time.sleep(1)
 first=json.loads(initial_receipt.read_text())
 if first['exit']!=0:
  print(json.dumps({'blockedWorker':i,'initialPart':initial[i],'receipt':str(initial_receipt)}),flush=True);stopped.set();return
 # The original orchestration ceases dispatch after AR's abandoned red baseline. Only this queue
 # gives each completed fixed input snapshot more jobs; native parts remain canonical/unfiltered.
 wb=work/('mutation-isolated-worker-'+str(i))/'maya-saas-backend'
 while not stopped.is_set():
  try:j=q.get_nowait()
  except queue.Empty:return
  slot=j['slot'];db='maya_widget_gate_proof_finalfed5_job_'+slot.lower().replace('-','_')
  assert len(db)<64 and re.fullmatch(r'[a-z0-9_]+',db)
  ee={**env,'DATABASE_URL':'[REDACTED DATABASE URL]'+db}
  script="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(!/^maya_widget_gate_proof_finalfed5_job_[a-z0-9_]+$/.test(n))throw Error('guard');if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB already exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
  subprocess.run(['node','-e',script,db],cwd=be,env=env,check=True)
  with (out/('mutation-'+slot+'-migration.log')).open('w') as log:subprocess.run(['npx','prisma','migrate','deploy'],cwd=wb,env=ee,stdout=log,stderr=subprocess.STDOUT,check=True)
  args=['node','scripts/widgets-mutation-battery.mjs','--gate',j['gate']]
  if j['partition']:args+=['--partition',j['partition']]
  args+=['--out',str(parts/('widgets-mutation-part-'+slot+'.json'))]
  print(json.dumps({'started':slot,'worker':i}),flush=True);t=time.time()
  with (out/('mutation-'+slot+'.log')).open('w') as log:
   p=subprocess.Popen(args,cwd=wb,env=ee,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   (work/('worker-'+str(i)+'-pid')).write_text(str(p.pid));rc=p.wait()
  receipt={'candidate':head,'name':'mutation-'+slot,'command':args,'cwd':str(wb),'exit':rc,'seconds':round(time.time()-t,2)}
  (out/('mutation-'+slot+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
  if rc:stopped.set();return
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(worker,range(1,9)))
print(json.dumps({'stopped':stopped.is_set(),'remainingShards':q.qsize()}),flush=True)
raise SystemExit(1 if stopped.is_set() else 0)
