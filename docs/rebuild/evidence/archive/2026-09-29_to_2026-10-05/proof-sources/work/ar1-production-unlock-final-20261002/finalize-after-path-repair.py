from pathlib import Path
import json,subprocess,datetime
root=Path.cwd();w=root/'work/ar1-production-unlock-final-20261002';o=root/'outputs/ar1-production-unlock-final-20261002';head=(w/'HEAD').read_text().strip()
d=json.loads((o/'COMPLETE-MUTATIONS.json').read_text());assert d['candidate']==head and d['status']=='PASS' and d['applicableKills']==533
steps=['index-final-proofs.py','finalize-fbe2e.py','index-fresh-artifacts.py','check-final-artifact-stability.py','check-host-environment.py','index-final-orchestration-sources.py','check-final-process-lifecycle.py','finalize-receipts.py']
results=[{'step':'assemble-complete.py','exit':0,'receipt':'COMPLETE-MUTATIONS.json; already completed by the current full native programme'}]
for name in steps:
 print('START '+name,flush=True);code=subprocess.run(['python3',str(w/name)],cwd=root).returncode;results.append({'step':name,'exit':code})
 (o/'FINISH-STATUS.json').write_text(json.dumps({'candidate':head,'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':results,'status':'FAIL' if code else ('PASS' if name==steps[-1] else 'IN PROGRESS'),'reportingRepair':'FINAL-REPORT-PATH-REPAIR.json'},indent=2)+'\n')
 if code:raise SystemExit(code)
