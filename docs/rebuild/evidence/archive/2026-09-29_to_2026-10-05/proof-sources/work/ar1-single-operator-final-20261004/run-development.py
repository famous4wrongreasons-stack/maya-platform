from pathlib import Path
import os,re,subprocess,json,time
root=Path.cwd();be=root/'work/maya-controlled-integration/maya-saas-backend';out=root/'outputs/ar1-single-operator-final-20261004/development';out.mkdir(exist_ok=True)
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
env['DATABASE_URL']='[REDACTED DATABASE URL]'
admin={**env,'DATABASE_URL':'[REDACTED DATABASE URL]'}
code="const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n='maya_widget_gate_proof_singleop_dev_20261003';if(!(await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node','-e',code],cwd=be,env=admin,check=True)
commands=[('migrate',['npx','prisma','migrate','deploy']),('typecheck',['npm','run','typecheck:widgets-live']),('lint',['npm','run','lint']),('build',['npm','run','build']),('unit',['npm','test','--','--runInBand','--testPathPatterns=widget-release']),('live',['npm','run','test:widgets:live','--','--testPathPatterns=widget-single-operator','--json','--outputFile='+str(out/'live.json')]),('binary',['npm','run','test:widgets:release-binary','--','--testPathPatterns=widget-single-operator','--json','--outputFile='+str(out/'binary.json')]),('operator',['node','--test','scripts/widget-release-operator.test.cjs','scripts/widget-release-operator.compiled-test.cjs'])]
for name,args in commands:
 t=time.time()
 with (out/(name+'.log')).open('w') as f:r=subprocess.run(args,cwd=be,env=env,stdout=f,stderr=subprocess.STDOUT)
 row={'scope':'development only; uncommitted candidate; not certification','name':name,'exit':r.returncode,'seconds':round(time.time()-t,2)};(out/(name+'.receipt.json')).write_text(json.dumps(row)+'\n');print(json.dumps(row),flush=True)
 if r.returncode:raise SystemExit(1)
