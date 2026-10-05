from pathlib import Path
import datetime,hashlib,json,subprocess,time
root=Path.cwd();w=root/'work/ar1-single-operator-final-20261004';o=root/'outputs/ar1-single-operator-final-20261004';r=o/'receipts';candidate=(w/'HEAD').read_text().strip()
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
plan=read(o/'SUSPEND-RECOVERY-PLAN.json');assert plan['candidate']==candidate
assert not (o/'SUSPEND-RECOVERY-EXECUTION.json').exists()
for binding in plan['originalExecutionSources']:assert sha(root/binding['path'])==binding['sha256']
assert len(plan['retryJobs'])==16 and len(plan['retainedWholeParts'])==52
clamshell=subprocess.check_output(['ioreg','-r','-k','AppleClamshellState','-d','4'],text=True)
assert '"AppleClamshellState" = No' in clamshell,'Host lid must be open before recovery'
subprocess.run(['python3',str(w/'suspend-recovery-validation-test.py')],cwd=root,check=True)
sources=[{'path':str((w/name).relative_to(root)),'sha256':sha(w/name)} for name in ['suspend-recovery-runner.py','suspend-recovery-controller.py','suspend-recovery-validation.py','suspend-recovery-validation-test.py','suspend-recovery-preparation.py','r06-child-trace.cjs','index-final-orchestration-sources.py','finalize-receipts.py']]
start=stamp();tick=time.time()
(o/'SUSPEND-RECOVERY-SOURCE-LOCK.json').write_text(json.dumps({'candidate':candidate,'capturedAt':start,'sources':sources,'timeoutsChanged':False,'filtersAdded':False},indent=2)+'\n')
with (w/'suspend-recovery-runner.log').open('w') as log:p=subprocess.run(['python3',str(w/'suspend-recovery-runner.py')],cwd=root,stdout=log,stderr=subprocess.STDOUT)
orch={'candidate':candidate,'startedAt':start,'completedAt':stamp(),'seconds':round(time.time()-tick,2),'exit':p.returncode,'wholeParts':16,'unfilteredTests':True,'productionEffects':0}
(r/'suspend-recovery.orchestration.json').write_text(json.dumps(orch,indent=2)+'\n');print(json.dumps(orch),flush=True)
assert p.returncode==0,'Recovery incomplete; no admission'
for binding in sources:assert sha(root/binding['path'])==binding['sha256']
for retained in plan['retainedWholeParts']:
 for binding in retained['files']:assert sha(o/binding['path'])==binding['sha256']
jobs=[]
for job in plan['retryJobs']:
 p=r/('mutation-'+job['slot']+'.receipt.json');v=read(p);assert v['candidate']==candidate and v['exit']==0 and v['seconds']<10800
 jobs.append({**job,'receipt':{'path':str(p.relative_to(o)),'sha256':sha(p)}})
execution={'candidate':candidate,'status':'PASS','startedAt':start,'completedAt':stamp(),'jobs':jobs,'retainedWholeParts':52,'sleepAffectedWholePartsReexecuted':6,'interruptedPostWakePartReexecuted':0,'neverStartedPartsExecuted':10,'sources':sources,'restrictions':None,'timeoutsChanged':False,'productChanged':False,'productionEffects':0}
(o/'SUSPEND-RECOVERY-EXECUTION.json').write_text(json.dumps(execution,indent=2)+'\n')
# A new aggregation receipt links the intentionally failed original and completed
# whole-part recovery. It never rewrites or admits the original interrupted runs.
aggregate={'candidate':candidate,'startedAt':plan['originalOrchestration']['startedAt'],'completedAt':stamp(),'seconds':round((datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(plan['originalOrchestration']['startedAt'])).total_seconds(),2),'exit':0,'restrictions':None,'historicalReceiptsAdmitted':0,'executionKind':'68 whole-part aggregation: 52 original pre-sleep + 16 fresh recovery executions','originalInterruptedOrchestration':plan['originalOrchestrationBinding'],'recoveryExecution':{'path':'SUSPEND-RECOVERY-EXECUTION.json','sha256':sha(o/'SUSPEND-RECOVERY-EXECUTION.json')}}
(r/'complete-native.orchestration.json').write_text(json.dumps(aggregate,indent=2)+'\n')
with (w/'finish-programme.py.log').open('w') as log:p=subprocess.run(['python3',str(w/'finish-programme.py')],cwd=root,stdout=log,stderr=subprocess.STDOUT)
print(json.dumps({'finishProgrammeExit':p.returncode,'candidate':candidate}),flush=True)
raise SystemExit(p.returncode)
