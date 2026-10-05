import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/ar1-single-operator-final-20261004';out=root/'outputs/ar1-single-operator-final-20261004/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


script="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();for(const n of process.argv.slice(1)){if(!/^maya_(events_proof|gates_smoke)_singleopcert_20261004$/.test(n))throw Error('guard');if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB already exists');await c.query('CREATE DATABASE '+n)}await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',script,'maya_events_proof_singleopcert_20261004','maya_gates_smoke_singleopcert_20261004'],cwd=be,env=env,check=True)
assert run('events-db-migration',be,['npx','prisma','migrate','deploy'],{'DATABASE_URL':'[REDACTED DATABASE URL]'})==0
