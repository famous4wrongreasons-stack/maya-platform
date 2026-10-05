from pathlib import Path
import subprocess,json,time,datetime,hashlib,shutil
root=Path.cwd();w=root/'work/ar1-production-unlock-final-20261002';out=root/'outputs/ar1-production-unlock-final-20261002';r=out/'receipts';head=(w/'HEAD').read_text().strip()
main=r/'main-programme-status.json'
while not main.exists():time.sleep(2)
data=json.loads(main.read_text());assert data['candidate']==head
assert data['exits']==[0,0,0,0,0,1,0,0,0,0],data
prior=r/'main-programme-prebuild-smoke-status.json';shutil.copyfile(main,prior)
for name in ['backend-build','synthetic-smoke-migration','synthetic-smoke-seed','platform-http-smoke']:
 d=json.loads((r/(name+'.receipt.json')).read_text());assert d['candidate']==head and d['exit']==0
assert 'Cannot find module' in (r/'attempts/prebuild-smoke/platform-http-smoke.log').read_text()
assert 'HTTP smoke passed:' in (r/'platform-http-smoke.log').read_text()
proof={'candidate':head,'status':'PASS','classification':'orchestration dependency: smoke started before compiled backend entry existed','before':{'receipt':'receipts/attempts/prebuild-smoke/platform-http-smoke.receipt.json','exit':1,'symptom':'MODULE_NOT_FOUND dist/src/main'},'repair':'smoke explicitly depends on successful exact-candidate backend build and main.js presence','after':{'receipt':'receipts/platform-http-smoke.receipt.json','exit':0},'productCodeChanged':False,'timeoutsChanged':False,'previousCandidateReceiptsAdmitted':0,'priorMainStatusSha256':hashlib.sha256(prior.read_bytes()).hexdigest()}
(out/'HARNESS-SMOKE-ORDER.json').write_text(json.dumps(proof,indent=2)+'\n')
data['exits'][5]=0;data['retryProof']='HARNESS-SMOKE-ORDER.json';data['initialAttemptStatus']='receipts/main-programme-prebuild-smoke-status.json';data['statusMeaning']='All fresh components on same unchanged SHA; smoke repeated only after its required build. Original failure retained.'
main.write_text(json.dumps(data,indent=2)+'\n')
subprocess.run(['python3',str(w/'run-l27-mutations.py')],cwd=root,check=True)
subprocess.run(['python3',str(w/'run-final-flow.py')],cwd=root,check=True)
