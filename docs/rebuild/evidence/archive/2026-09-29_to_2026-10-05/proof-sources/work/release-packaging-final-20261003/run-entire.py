from pathlib import Path
import subprocess,json,datetime,hashlib,time
root=Path.cwd();w=root/'work/release-packaging-final-20261003';out=root/'outputs/release-packaging-final-20261003';head=(w/'HEAD').read_text().strip()
# The component programme is already owned by the packaging chain. Wait for its explicit result.
while True:
 m=out/'receipts/main-programme-status.json'; l=out/'receipts/l27-runtime-mutations.json'
 if m.exists():assert all(x==0 for x in json.loads(m.read_text())['exits'])
 d=json.loads(l.read_text()) if l.exists() else {}
 assert d.get('status')!='FAIL',d
 if m.exists() and d.get('status')=='PASS':break
 time.sleep(2)
assert json.loads((out/'receipts/l25-browser.receipt.json').read_text())['exit']==0
while not (out/'CLEAN-PACKAGING-CI.json').exists():time.sleep(2)
assert json.loads((out/'CLEAN-PACKAGING-CI.json').read_text())['status']=='PASS'
p=out/'ORCHESTRATION-SOURCES.json'
files=[x for x in w.rglob('*') if x.is_file() and not any(s.startswith(('mutation-','runtime-l27','packaging-mutation','ios-final','ios-clean-ci','clean-packaging-ci','.playwright')) for s in x.relative_to(w).parts) and x.suffix in ['.py','.mjs','.js','.cjs','.json']]
p.write_text(json.dumps({'candidate':head,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'All harness sources frozen before complete native admission; current components and packaging captured on the same exact candidate','files':[{'path':str(x.relative_to(w)),'sha256':hashlib.sha256(x.read_bytes()).hexdigest()} for x in sorted(files)]},indent=2)+'\n')
subprocess.run(['python3',str(w/'run-final-flow.py')],cwd=root,check=True)
