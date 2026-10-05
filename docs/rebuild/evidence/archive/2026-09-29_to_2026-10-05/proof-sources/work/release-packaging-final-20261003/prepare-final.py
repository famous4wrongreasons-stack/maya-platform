from pathlib import Path
import subprocess,json,os,re,time,datetime,hashlib
root=Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';work=root/'work/release-packaging-final-20261003';out=root/'outputs/release-packaging-final-20261003';rec=out/'receipts'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
assert not (out/'CANDIDATE.json').exists()
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
env['DATABASE_URL']='[REDACTED DATABASE URL]'
meta={'candidate':head,'base':'76df1766a74212f2c8a06ab879386fc8e4468d73','branch':subprocess.check_output(['git','branch','--show-current'],cwd=repo,text=True).strip(),'clean':True,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'historicalReceiptsAdmitted':0,'effects':{'production':0,'realOTP':0,'realYclients':0},'scope':'closed-input.no-handoff@1','fullContractCertified':False}
(out/'CANDIDATE.json').write_text(json.dumps(meta,indent=2)+'\n')
(out/'IMPLEMENTATION.patch').write_bytes(subprocess.check_output(['git','diff',meta['base'],head],cwd=repo))
(out/'CHANGED-PATHS.json').write_text(json.dumps(subprocess.check_output(['git','diff','--name-only',meta['base'],head],cwd=repo,text=True).splitlines(),indent=2)+'\n')
admin={**env,'DATABASE_URL':'[REDACTED DATABASE URL]'}
code="const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n='maya_widget_gate_proof_pkgfinal_20261003';if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',code],cwd=be,env=admin,check=True)
def run(name,cwd,args):
 start=time.time()
 with (rec/(name+'.log')).open('w') as f:r=subprocess.run(args,cwd=cwd,env=env,stdout=f,stderr=subprocess.STDOUT)
 row={'candidate':head,'name':name,'command':args,'cwd':str(cwd),'exit':r.returncode,'seconds':round(time.time()-start,2)}
 (rec/(name+'.receipt.json')).write_text(json.dumps(row,indent=2)+'\n');print(json.dumps(row),flush=True);assert r.returncode==0,name
for name,args in [('prisma-generate',['npx','prisma','generate']),('proof-db-migration',['npx','prisma','migrate','deploy'])]:run(name,be,args)
run('backend-build',be,['npm','run','build'])
run('runtime-build',repo/'maya-chat-shell',['npm','run','build'])
run('carrier-build',repo/'maya-carrier-react',['npm','run','build'])
run('carrier-harness',repo/'maya-carrier-react',['node','test/build-harness.mjs'])
run('l25-browser-fixtures',repo/'maya-carrier-react',['node','dev/build-gallery.mjs'])
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
manifest=json.loads((repo/'maya-chat-shell/dist/manifest.json').read_text())
for f in (work/'probes').glob('*.mjs'):
 if 'compiled' in f.name:
  s=re.sub(r'dist/web/m/[a-f0-9]{16}/','dist/web/'+manifest['web']['modulePath'],f.read_text());f.write_text(s)
subprocess.run(['python3',str(work/'prepare-extra-dbs.py')],cwd=root,check=True)
(out/'INITIAL-ARTIFACTS.json').write_text(json.dumps({'candidate':head,'files':[{'path':str(p.relative_to(repo)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for folder in ['maya-chat-shell/dist','maya-carrier-react/dist'] for p in sorted((repo/folder).rglob('*')) if p.is_file()]},indent=2)+'\n')
(work/'HEAD').write_text(head+'\n')
print('PREPARED '+head,flush=True)
