from pathlib import Path
import subprocess,concurrent.futures,json,datetime
root=Path.cwd();w=root/'work/ar1-single-operator-20261003';out=root/'outputs/ar1-single-operator-20261003';head=(w/'HEAD').read_text().strip()
def run(name):
 print('START '+name,flush=True)
 with (w/(name+'.log')).open('w') as f:p=subprocess.run(['python3',str(w/name)],cwd=root,stdout=f,stderr=subprocess.STDOUT)
 print(json.dumps({'step':name,'exit':p.returncode}),flush=True)
 if p.returncode:raise RuntimeError(name+' failed; no certification admitted')
for script in ['run-final-rehearsal.py','run-packaging-proof.py']:run(script)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 futures=[pool.submit(run,name) for name in ['run-programme.py','run-packaging-clean-ci.py','run-packaging-mutations.py','run-browser-proof.py']]
 for future in concurrent.futures.as_completed(futures):future.result()
for script in ['prove-requested-baselines.py','check-ci-postconditions.py','index-fresh-artifacts.py']:run(script)
import shutil
shutil.copyfile(out/'ARTIFACT-HASH-PARITY.json',out/'INITIAL-ARTIFACT-HASH-PARITY.json')
(out/'INITIAL-SNAPSHOT-PROVENANCE.json').write_text(json.dumps({'candidate':head,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'Complete fresh components, packaging, browser and release rehearsal; before unrestricted mutation corpus','historicalReceiptsAdmitted':0},indent=2)+'\n')
for script in ['run-complete-native.py','finish-programme.py']:run(script)
print('COMPLETE FRESH LOCAL CERTIFICATION PASS',flush=True)
