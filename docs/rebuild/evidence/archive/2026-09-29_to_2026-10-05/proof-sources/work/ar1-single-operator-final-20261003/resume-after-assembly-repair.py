from pathlib import Path
import datetime, hashlib, json, shutil, subprocess

root=Path.cwd(); work=root/'work/ar1-single-operator-final-20261003'; out=root/'outputs/ar1-single-operator-final-20261003'; receipts=out/'receipts'
repo=root/'work/maya-controlled-integration'; head=(work/'HEAD').read_text().strip()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
original=json.loads((receipts/'main-programme-status.json').read_text())
assert original['candidate']==head and original['exits']==[0,0,0,0,0,0,0,0,1]
assert 'ALL INTEGRATION PROBES COMPLETE' in (work/'run-rest-repaired.log').read_text()
names=['fbe2e-canonical-net-roundtrip','fbe2e-canonical-net-turn','fbe2e-canonical-net-bin','fbe2e-compiled-net-bin','fbe2e-compiled-receipt-net-bin','fbe2e-l27-postcommit-dismiss','ns1-16-step','l27-17-step']
fresh=[]
for name in names:
    p=receipts/(name+'.receipt.json'); d=json.loads(p.read_text())
    assert d['candidate']==head and d['exit']==0,name
    fresh.append({'path':str(p.relative_to(out)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
diagnostics=out/'diagnostics/missing-probe-assembly'
shutil.copyfile(receipts/'main-programme-status.json',diagnostics/'main-programme-status.original.json')
shutil.copyfile(work/'certification.log',diagnostics/'certification.original.log')
shutil.copyfile(work/'run-rest-repaired.log',diagnostics/'complete-integration-rerun.log')
repair=json.loads((out/'HARNESS-PROBE-ASSEMBLY-REPAIR.json').read_text())
repair.update(status='PASS',after='Complete integration block re-executed successfully on unchanged committed candidate; both initial failures retained as inadmissible discovery diagnostics.',freshIntegrationReceipts=fresh)
(out/'HARNESS-PROBE-ASSEMBLY-REPAIR.json').write_text(json.dumps(repair,indent=2)+'\n')
status={**original,'exits':[0]*9,'integrationRecovery':'HARNESS-PROBE-ASSEMBLY-REPAIR.json','originalFailureRetained':'diagnostics/missing-probe-assembly/main-programme-status.original.json','freshIntegrationReceipts':fresh,'reason':'Only omitted scratch harness drivers restored. Product, assertions, timeout budgets and candidate unchanged. All component executions are fresh at this HEAD.'}
(receipts/'main-programme-status.json').write_text(json.dumps(status,indent=2)+'\n')

def run(name):
    print('START '+name,flush=True)
    with (work/(name+'.log')).open('w') as log:
        result=subprocess.run(['python3',str(work/name)],cwd=root,stdout=log,stderr=subprocess.STDOUT)
    print(json.dumps({'step':name,'exit':result.returncode}),flush=True)
    if result.returncode: raise RuntimeError(name+' failed; no certification admitted')

for script in ['run-l27-mutations.py','prove-requested-baselines.py','check-ci-postconditions.py','index-fresh-artifacts.py']:
    run(script)
shutil.copyfile(out/'ARTIFACT-HASH-PARITY.json',out/'INITIAL-ARTIFACT-HASH-PARITY.json')
(out/'INITIAL-SNAPSHOT-PROVENANCE.json').write_text(json.dumps({'candidate':head,'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'Complete fresh components, packaging, browser and release rehearsal; restored integration drivers all re-executed; before unrestricted mutation corpus','historicalReceiptsAdmitted':0},indent=2)+'\n')
for script in ['run-complete-native.py','finish-programme.py']:
    run(script)
print('COMPLETE FRESH LOCAL CERTIFICATION PASS',flush=True)
