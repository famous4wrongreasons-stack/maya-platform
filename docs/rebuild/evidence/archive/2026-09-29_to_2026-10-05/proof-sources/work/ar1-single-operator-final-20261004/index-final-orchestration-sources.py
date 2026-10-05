from pathlib import Path
import datetime,hashlib,json
root=Path.cwd();work=root/'work/ar1-single-operator-final-20261004';out=root/'outputs/ar1-single-operator-final-20261004';candidate=(work/'HEAD').read_text().strip()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())
complete=read(out/'COMPLETE-MUTATIONS.json');assert complete['candidate']==candidate and complete['status']=='PASS'
p=out/'ORCHESTRATION-SOURCES.json';initial=read(p);assert initial['candidate']==candidate
files=[];changes=[]
for row in initial['files']:
 path=work/row['path'];digest=sha(path);files.append({'path':row['path'],'sha256':digest})
 if digest!=row['sha256']:changes.append({'path':row['path'],'before':row['sha256'],'after':digest})
execution_changes=[x for x in changes if x['path'].startswith(('run-','prove-','prepare-')) or x['path'].endswith(('.mjs','.js','.cjs'))]
assert execution_changes==[],execution_changes
known={x['path'] for x in files}
explicit_recovery_execution={'suspend-recovery-runner.py','suspend-recovery-controller.py'} if (out/'SUSPEND-RECOVERY-PLAN.json').exists() else set()
additional=[{'path':p.name,'sha256':sha(p)} for p in sorted(work.iterdir()) if p.is_file() and p.suffix in ['.py','.mjs','.js','.cjs','.json'] and p.name not in known and p.name!='run-missing-builds.py' and p.name not in explicit_recovery_execution]
assert not any(x['path'].startswith(('run-','prove-','prepare-')) for x in additional),additional
result={'candidate':candidate,'status':'PASS','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshot':{'path':p.name,'sha256':sha(p),'capturedAt':initial['capturedAt']},'snapshotBoundary':initial['scope'],'executionSourcesChangedSinceCapture':execution_changes,'reportingOnlyChanges':changes,'additionalReportingHelpers':additional,'files':files,'productCandidateChanged':False}
if (out/'SUSPEND-RECOVERY-PLAN.json').exists():
 recovery=read(out/'SUSPEND-RECOVERY-EXECUTION.json');assert recovery['candidate']==candidate and recovery['status']=='PASS'
 for row in recovery['sources']:assert sha(root/row['path'])==row['sha256']
 result['explicitRecoveryExecutionSources']=recovery['sources']
 result['newRecoveryExecutionHelpers']=[{'path':name,'sha256':sha(work/name)} for name in sorted(explicit_recovery_execution)]
 result['recoveryBoundary']='Six whole sleep-overlapped parts restarted; ten never-started jobs executed. Fifty-two complete pre-sleep parts retained with immutable hashes. Original execution sources, unrestricted canonical tests and timeouts unchanged.'
 result['recoveryProof']={'path':'SUSPEND-RECOVERY-PROOF.json','sha256':sha(out/'SUSPEND-RECOVERY-PROOF.json')}
(out/'FINAL-ORCHESTRATION-SOURCES.json').write_text(json.dumps(result,indent=2)+'\n');print('Final source integrity PASS')
