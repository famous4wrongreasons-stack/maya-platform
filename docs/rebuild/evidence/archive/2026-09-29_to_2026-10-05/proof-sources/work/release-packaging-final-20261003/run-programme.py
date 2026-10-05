from pathlib import Path
import concurrent.futures,json,subprocess,time
root=Path.cwd(); work=root/'work/release-packaging-final-20261003';out=root/'outputs/release-packaging-final-20261003';rec=out/'receipts'
head=(work/'HEAD').read_text().strip()
def run(script,*args):
 print(json.dumps({'starting':script,'args':args}),flush=True)
 p=subprocess.run(['python3',str(work/script),*args],cwd=root)
 print(json.dumps({'finished':script,'args':args,'exit':p.returncode}),flush=True)
 return p.returncode
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
 static=pool.submit(run,'run-baseline.py','static'); surfaces=pool.submit(run,'run-baseline.py','surfaces'); python=pool.submit(run,'run-extra.py','python')
 if surfaces.result()!=0:raise SystemExit('surface gate failure')
 jobs=[('run-baseline.py','backend'),('run-baseline.py','live'),('run-extra.py','events'),('run-extra.py','smoke'),('run-extra.py','frontend-ci'),('run-extra.py','node24'),('run-carrier-selftest.py',),('run-rest.py',)]
 futures=[pool.submit(run,*job) for job in jobs]
 results=[static.result(),python.result(),*[f.result() for f in futures]]
(rec/'main-programme-status.json').write_text(json.dumps({'candidate':head,'exits':results,'historicalReceiptsAdmitted':0},indent=2)+'\n')
if any(results):raise SystemExit('component programme failure')
if run('run-l27-mutations.py'):raise SystemExit('L27 mutation failure')
print('FRESH COMPONENT PROGRAMME PASS; full native corpus still required',flush=True)
