import pathlib,subprocess,json,os,re,time,hashlib
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/final-certification-30fa2469';out=root/'outputs/final-certification-30fa2469/receipts';head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin';env['DATABASE_URL']='[REDACTED DATABASE URL]';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
def run(name,cwd,args,extra={}):
 t=time.time()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
 receipt={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt),flush=True);return r.returncode


assert head=='30fa24698f3ae277c22209e8edfd448c29e4f872'
def check(name,cwd,args,extra={}):
 if run(name,cwd,args,extra):raise SystemExit(1)
# Fresh local proof database, admitted by the existing guard at every application entry.
admin={**env,'DATABASE_URL':'[REDACTED DATABASE URL]'}
script="const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(n!=='maya_widget_gate_proof_final30fa_20261001')throw Error('guard');if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB already exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',script,'maya_widget_gate_proof_final30fa_20261001'],cwd=be,env=admin,check=True)
check('prisma-generate',be,['npm','run','prisma:generate'])
check('proof-db-migration',be,['npx','prisma','migrate','deploy'])
check('backend-build',be,['npm','run','build'])
check('runtime-build',repo/'maya-chat-shell',['npm','run','build'])
check('carrier-build',repo/'maya-carrier-react',['npm','run','build'])
check('carrier-harness',repo/'maya-carrier-react',['node','test/build-harness.mjs'])
built=list((repo/'maya-chat-shell/dist/web/m').iterdir());assert len(built)==1
# Relocate only the original failing probe's compiled-module imports to this candidate's fresh build.
for p in (work/'probes').glob('compiled-*.mjs'):
 s=p.read_text();s=re.sub(r'/maya-chat-shell/dist/web/m/[a-zA-Z0-9]+/', '/maya-chat-shell/dist/web/m/'+built[0].name+'/',s);p.write_text(s)
check('fbe2e-l27-postcommit-dismiss',be,['npm','run','test:widgets:http','--','--cases-dir',str(work/'postcommit-bin-cases')],{'GITHUB_SOURCE_PROBE_OUT':str(out/'l27-postcommit-dismiss-observations.json')})
