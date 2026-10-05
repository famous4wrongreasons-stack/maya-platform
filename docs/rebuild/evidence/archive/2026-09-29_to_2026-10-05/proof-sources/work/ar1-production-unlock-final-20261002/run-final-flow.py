from pathlib import Path
import subprocess,json,time,datetime,shutil
root=Path.cwd();w=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002';r=out/'receipts';head=(w/'HEAD').read_text().strip()
main=r/'main-programme-status.json'; l27=r/'l27-runtime-mutations.json'
while not main.exists() or not l27.exists():
 if main.exists():
  data=json.loads(main.read_text());assert data['candidate']==head and all(c==0 for c in data['exits']),data
 time.sleep(2)
assert json.loads(l27.read_text())['status']=='PASS'
for name in ['prove-requested-baselines.py','check-ci-postconditions.py','index-fresh-artifacts.py']:
 print('START '+name,flush=True)
 subprocess.run(['python3',str(w/name)],cwd=root,check=True)
shutil.copyfile(out/'ARTIFACT-HASH-PARITY.json',out/'INITIAL-ARTIFACT-HASH-PARITY.json')
(out/'INITIAL-SNAPSHOT-PROVENANCE.json').write_text(json.dumps({'candidate':head,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'After complete component and browser proofs; before unrestricted mutation programme. No earlier candidate receipts admitted.'},indent=2)+'\n')
for name in ['run-complete-native.py','finish-programme.py']:
 print('START '+name,flush=True)
 subprocess.run(['python3',str(w/name)],cwd=root,check=True)
