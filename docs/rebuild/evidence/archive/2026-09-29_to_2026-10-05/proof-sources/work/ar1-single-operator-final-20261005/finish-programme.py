from pathlib import Path
import datetime,json,subprocess,time
root=Path.cwd();work=root/'work/ar1-single-operator-final-20261005';out=root/'outputs/ar1-single-operator-final-20261005';r=out/'receipts';candidate=(work/'HEAD').read_text().strip()
assert json.loads((out/'FRESH-LOCAL-COMPONENTS-COMPLETE.json').read_text())['status']=='PASS'
subprocess.run(['python3',str(work/'import-hosted-mutations.py')],cwd=root,check=True)
steps=['assemble-complete.py','index-final-proofs.py','finalize-fbe2e.py','index-fresh-artifacts.py','check-final-artifact-stability.py','check-host-environment.py','index-final-orchestration-sources.py','check-final-process-lifecycle.py','finalize-receipts.py']
results=[]
for name in steps:
 print('START '+name,flush=True)
 code=subprocess.run(['python3',str(work/name)],cwd=root).returncode
 results.append({'step':name,'exit':code})
 (out/'FINISH-STATUS.json').write_text(json.dumps({'candidate':candidate,'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':results,'status':'FAIL' if code else ('PASS' if name==steps[-1] else 'IN PROGRESS')},indent=2)+'\n')
 if code:raise SystemExit(code)
print('COMPLETE FRESH CERTIFICATION FINISHED',flush=True)
