from pathlib import Path
import hashlib,json,difflib,datetime
root=Path.cwd();w=root/'work/release-packaging-final-20261003';out=root/'outputs/release-packaging-final-20261003'
changes=[]
def change(name,a,b):
 p=w/name;s=p.read_text();assert a in s,name;t=s.replace(a,b,1);p.write_text(t)
 changes.append({'path':str(p.relative_to(root)),'before':hashlib.sha256(s.encode()).hexdigest(),'after':hashlib.sha256(t.encode()).hexdigest(),'diff':''.join(difflib.unified_diff(s.splitlines(True),t.splitlines(True),fromfile=name+' before',tofile=name+' after'))})
change('check-host-environment.py',"(out/'HOST-ENVIRONMENT-CHECK.json').write_text",'''if sleep and (out/'SUSPEND-RECOVERY-PLAN.json').exists():
 import importlib.util
 spec=importlib.util.spec_from_file_location('suspend_recovery',work/'suspend-recovery-validation.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 try:
  proof=module.validate(root,events,now)
  (out/'SUSPEND-RECOVERY-PROOF.json').write_text(json.dumps(proof,indent=2)+'\\n')
  result.update(status='PASS',reexecutionRequired=False,recoveryProof={'path':'SUSPEND-RECOVERY-PROOF.json','sha256':hashlib.sha256((out/'SUSPEND-RECOVERY-PROOF.json').read_bytes()).hexdigest()},admittedSleepOverlaps=0)
 except (AssertionError,FileNotFoundError) as error:
  result['recoveryRefusal']=str(error) or 'Recovery is incomplete or fails immutable binding checks'
(out/'HOST-ENVIRONMENT-CHECK.json').write_text''')
change('check-host-environment.py',"print(json.dumps(result));assert not sleep,", "print(json.dumps(result));assert result['status']=='PASS' and not result['reexecutionRequired'],")
change('check-final-process-lifecycle.py',"prefixes = {str(work.resolve()), str(repo.resolve())}","prefixes = {str(work.resolve()), str(repo.resolve()), str((root/'work/release-packaging-recovery-20261003').resolve())}")
p=w/'finalize-receipts.py';s=p.read_text();a=s[s.index('child_traces=[]'):s.index("assert all(x['localMarginTo180Minutes']")]
b='''child_traces=[]
if (out/'SUSPEND-RECOVERY-PLAN.json').exists():
 recovery=checked('SUSPEND-RECOVERY-PROOF.json')
 assert recovery['admittedSleepOverlaps']==0 and recovery['admittedPartitions']==67 and len(recovery['wholePartitionsReexecuted'])==2
 for d in recovery['admittedRawR06Traces']:
  assert sha(out/d['path'])==d['sha256'] and d['admittedExecutions']>0
  child_traces.append(d)
 assert len(child_traces)==8
else:
 for p in sorted(r.glob('r06-native-worker-*.jsonl')):
  rows=[json.loads(line) for line in p.read_text().splitlines()]
  assert rows and all(d['status']==0 and d['signal'] is None and d['error'] is None and d['timeout']==20000 for d in rows),(p.name,rows)
  child_traces.append({'file':ref(p),'executions':len(rows),'maxElapsedMs':max(d['elapsedMs'] for d in rows)})
 assert len(child_traces)==6
(out/'R06-CURRENT-CORPUS-DIAGNOSTICS.json').write_text(json.dumps({'candidate':candidate,'status':'PASS','currentCorpus':child_traces,'originalTimeoutMs':20000,'timeoutsChanged':False,'historicalReceiptsAdmitted':0,'invalidatedAttemptsAreDiagnosticOnly':True},indent=2)+'\\n')
'''
change('finalize-receipts.py',a,b)
change('index-final-orchestration-sources.py',"(out/'FINAL-ORCHESTRATION-SOURCES.json').write_text",'''if (out/'SUSPEND-RECOVERY-PLAN.json').exists():
 recovery=read(out/'SUSPEND-RECOVERY-EXECUTION.json');assert recovery['candidate']==candidate and recovery['status']=='PASS'
 for row in recovery['sources']:assert sha(root/row['path'])==row['sha256']
 result['explicitRecoveryExecutionSources']=recovery['sources']
 result['recoveryBoundary']='Two complete sleep-overlapped WR partitions only; original execution sources unchanged; canonical unrestricted test commands and timeouts retained.'
 result['recoveryProof']={'path':'SUSPEND-RECOVERY-PROOF.json','sha256':sha(out/'SUSPEND-RECOVERY-PROOF.json')}
(out/'FINAL-ORCHESTRATION-SOURCES.json').write_text''')
(out/'SUSPEND-REPORTING-CHANGES.json').write_text(json.dumps({'candidate':'77ecb3f5696583389e75592141f46fd0664d33d8','changedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Reporting only: admit recovery only after exact old/new hash linkage, whole canonical partition execution and zero sleep overlap for all admitted receipts. No product, test, timeout, threshold or canonical collector change.','changes':changes},indent=2)+'\n')
