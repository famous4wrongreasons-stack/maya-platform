from pathlib import Path
import json,subprocess,time,concurrent.futures
root=Path.cwd();work=root/'work/final-certification-dac4072d';out=root/'outputs/final-certification-dac4072d/receipts'
def call(script,*args):
 r=subprocess.run(['python3',str(work/script),*args],cwd=root)
 print(json.dumps({'script':script,'args':args,'exit':r.returncode}),flush=True)
 return r.returncode
for name in ['k1-dossier','k5-exit']:
 f=out/(name+'.receipt.json')
 while not f.exists():time.sleep(1)
 if json.loads(f.read_text())['exit']!=0:raise SystemExit('surface gate failed: '+name)
assert call('prepare-extra-dbs.py')==0
jobs=[('run-baseline.py','backend'),('run-baseline.py','static'),('run-baseline.py','live'),
      ('run-extra.py','events'),('run-extra.py','smoke'),('run-extra.py','frontend-ci'),
      ('run-extra.py','node24'),('run-carrier-selftest.py',),('run-rest.py',)]
with concurrent.futures.ThreadPoolExecutor(max_workers=len(jobs)) as pool:
 results=list(pool.map(lambda args:call(*args),jobs))
(out/'main-programme-status.json').write_text(json.dumps({'candidate':'dac4072dd17ec222fe36cc603863965919039708','jobs':jobs,'exits':results},indent=2)+'\n')
raise SystemExit(1 if any(results) else 0)
