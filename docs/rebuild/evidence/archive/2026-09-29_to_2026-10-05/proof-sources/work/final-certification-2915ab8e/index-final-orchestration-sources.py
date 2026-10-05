from pathlib import Path
import datetime,hashlib,json
root=Path.cwd();work=root/'work/final-certification-2915ab8e';out=root/'outputs/final-certification-2915ab8e';candidate='2915ab8e7c089e2c1f39848cb795940e5267c119'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
complete=json.loads((out/'COMPLETE-MUTATIONS.json').read_text());assert complete['candidate']==candidate and complete['status']=='PASS'
p=out/'ORCHESTRATION-CURRENT-SOURCES.json';initial=json.loads(p.read_text());assert initial['candidate']==candidate
files=[];changes=[]
for row in initial['files']:
 path=work/row['path'];digest=sha(path);files.append({'path':row['path'],'sha256':digest})
 if digest!=row['sha256']:changes.append({'path':row['path'],'before':row['sha256'],'after':digest})
assert {row['path'] for row in changes} == {'index-final-orchestration-sources.py','finalize-receipts.py','check-host-environment.py','assemble-complete.py'},changes
new_helpers=['run-missing-builds.py','run-additional-carrier-harness.py','launch-current-suspend-reverification.py']
for name in new_helpers:files.append({'path':name,'sha256':sha(work/name)})
addenda=json.loads((out/'PROGRAMME-ADDENDA.json').read_text());assert addenda['candidate']==candidate and addenda['status']=='PASS'
recovery_path=out/'SUSPEND-EXECUTION-SOURCES.json';recovery=json.loads(recovery_path.read_text());assert recovery['candidate']==candidate
for row in recovery['files']:assert sha(root/row['path'])==row['sha256'],row
retry=json.loads((out/'SUSPEND-REEXECUTION.json').read_text());assert retry['candidate']==candidate and retry['status']=='PASS'
assert all(recovery['capturedAt'] < e['startedAt'] for e in retry['executions'])
result={'candidate':candidate,'status':'PASS','capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'comparisonSource':p.name,'comparisonSourceSha256':sha(p),'comparisonCapturedAt':initial['capturedAt'],'scope':'Inventory captured after setup and collector diagnostic, before ordinary suites and full mutation programme. Original mutation and ordinary executors are unchanged.','executionSourcesChangedSinceCapture':[],'reportingOnlyChanges':[c for c in changes if c['path']!='check-host-environment.py'],'admissionChanges':[c for c in changes if c['path']=='check-host-environment.py'],'admissionChangeReason':'Observed host sleep requires exact full-part replacement and retained-original hash verification before admission; no interrupted result waived.','additionalExecutionHelpers':new_helpers,'additionalExecutionDisclosure':'PROGRAMME-ADDENDA.json','suspendRecoveryDisclosure':recovery_path.name,'suspendRecoveryDisclosureSha256':sha(recovery_path),'files':files,'productCandidateChanged':False}
(out/'FINAL-ORCHESTRATION-SOURCES.json').write_text(json.dumps(result,indent=2)+'\n');print('Orchestration source integrity: PASS')
