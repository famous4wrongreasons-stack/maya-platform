from pathlib import Path
import datetime,json,subprocess,time
root=Path.cwd();work=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002';r=out/'receipts';candidate=(work/'HEAD').read_text().strip()
p=r/'complete-native.orchestration.json'
while not p.exists():time.sleep(2)
native=json.loads(p.read_text())
assert native['candidate']==candidate and native['exit']==0,'Complete native programme failed; no certification attempted'
steps=['assemble-complete.py','index-final-proofs.py','finalize-fbe2e.py','index-fresh-artifacts.py','check-final-artifact-stability.py','check-host-environment.py','index-final-orchestration-sources.py','check-final-process-lifecycle.py','finalize-receipts.py']
results=[]
for name in steps:
 print('START '+name,flush=True)
 code=subprocess.run(['python3',str(work/name)],cwd=root).returncode
 results.append({'step':name,'exit':code})
 (out/'FINISH-STATUS.json').write_text(json.dumps({'candidate':candidate,'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':results,'status':'FAIL' if code else ('PASS' if name==steps[-1] else 'IN PROGRESS')},indent=2)+'\n')
 if code:raise SystemExit(code)
print('COMPLETE FRESH CERTIFICATION FINISHED',flush=True)
