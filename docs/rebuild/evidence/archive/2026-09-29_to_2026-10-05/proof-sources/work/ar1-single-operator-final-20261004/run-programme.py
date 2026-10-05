from pathlib import Path
import concurrent.futures,json,subprocess,time
root=Path.cwd(); work=root/'work/ar1-single-operator-final-20261004';out=root/'outputs/ar1-single-operator-final-20261004';rec=out/'receipts'
head=(work/'HEAD').read_text().strip()
def run(script,*args):
 print(json.dumps({'starting':script,'args':args}),flush=True)
 p=subprocess.run(['python3',str(work/script),*args],cwd=root)
 print(json.dumps({'finished':script,'args':args,'exit':p.returncode}),flush=True)
 return p.returncode
results=[]
if run('run-baseline.py','static'):raise SystemExit('static gate failure')
if run('run-baseline.py','surfaces'):raise SystemExit('surface gate failure')
with concurrent.futures.ThreadPoolExecutor(max_workers=9) as pool:
 jobs=[('run-extra.py','python'),('run-baseline.py','backend'),('run-baseline.py','live'),('run-extra.py','events'),('run-extra.py','smoke'),('run-extra.py','frontend-ci'),('run-extra.py','node24'),('run-carrier-selftest.py',),('run-rest.py',)]
 futures=[pool.submit(run,*job) for job in jobs]
 results=[f.result() for f in futures]
(rec/'main-programme-status.json').write_text(json.dumps({'candidate':head,'exits':results,'historicalReceiptsAdmitted':0},indent=2)+'\n')
if any(results):raise SystemExit('component programme failure')
if run('run-l27-mutations.py'):raise SystemExit('L27 mutation failure')
print('FRESH COMPONENT PROGRAMME PASS; full native corpus still required',flush=True)
