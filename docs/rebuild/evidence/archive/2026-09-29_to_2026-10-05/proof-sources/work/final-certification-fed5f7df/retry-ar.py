import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-fed5f7df';out=root/'outputs/final-certification-fed5f7df/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


import signal
wb=work/'mutation-isolated-worker-1/maya-saas-backend'
db='maya_widget_gate_proof_finalfed5_ar_retry'
script="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(n!=='maya_widget_gate_proof_finalfed5_ar_retry')throw Error('guard');if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB already exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',script,db],cwd=be,env=env,check=True)
extra={'DATABASE_URL':'[REDACTED DATABASE URL]'+db}
assert run('ar-retry-migration',wb,['npx','prisma','migrate','deploy'],extra)==0
args=['node','scripts/widgets-mutation-battery.mjs','--gate','AR','--out',str(out/'mutation-parts/widgets-mutation-part-AR.json')]
t=time.time()
with (out/'mutation-AR.log').open('w') as log:
 p=subprocess.Popen(args,cwd=wb,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (work/'worker-1-pid').write_text(str(p.pid));rc=p.wait()
receipt={'candidate':head,'name':'mutation-AR','command':args,'cwd':str(wb),'exit':rc,'seconds':round(time.time()-t,2),'attempt':'fresh full retry after unmodified 405/405 diagnostic; earlier red baseline retained and excluded'}
(out/'mutation-AR.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True)
raise SystemExit(rc)
