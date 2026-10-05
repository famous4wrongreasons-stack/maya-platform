import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-fed5f7df';out=root/'outputs/final-certification-fed5f7df/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


code="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();console.log(JSON.stringify({max: (await c.query('SHOW max_connections')).rows,activity:(await c.query(\"select datname,state,wait_event_type,wait_event,count(*)::int as connections from pg_stat_activity group by 1,2,3,4 order by 1,2\")).rows}));await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',code],cwd=be,env=env,check=True)
