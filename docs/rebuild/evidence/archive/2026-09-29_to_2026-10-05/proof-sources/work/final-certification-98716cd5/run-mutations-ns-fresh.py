import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-98716cd5';out=root/'outputs/final-certification-98716cd5/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


assert head=='98716cd5b9440d01e4272ea0778f93db26f065e6'
db='maya_widget_gate_proof_final98716_ns_fresh'
script="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(n!=='maya_widget_gate_proof_final98716_ns_fresh')throw Error('guard');if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB already exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',script,db],cwd=be,env=env,check=True)
env['DATABASE_URL']='[REDACTED DATABASE URL]'+db
if run('ns-fresh-db-migration',be,['npx','prisma','migrate','deploy']):raise SystemExit(1)
raise SystemExit(run('mutations-NS-fresh',be,['node','scripts/widgets-mutation-battery.mjs','--gate','NS','--out',str(out/'mutation-parts/widgets-mutation-part-NS.json')]))
