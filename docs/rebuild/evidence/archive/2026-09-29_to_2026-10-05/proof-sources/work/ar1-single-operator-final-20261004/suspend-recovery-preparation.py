from pathlib import Path
import json,datetime,hashlib,shutil,subprocess,re
root=Path.cwd();w=root/'work/ar1-single-operator-final-20261004';o=root/'outputs/ar1-single-operator-final-20261004';r=o/'receipts';old=root/'work/ar1-single-operator-final-20261003';candidate=(w/'HEAD').read_text().strip()
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();stamp=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
assert not (o/'SUSPEND-RECOVERY-PLAN.json').exists()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root/'work/maya-controlled-integration',text=True).strip()==candidate
assert not subprocess.check_output(['git','status','--porcelain'],cwd=root/'work/maya-controlled-integration',text=True).strip()
events=read(o/'HOST-SLEEP-DIAGNOSTIC-20261004T1809.json')['events'];first=events[0]['utc'];wake=events[-1]['utc'];assert events[0]['event']=='Sleep' and events[-1]['event']=='Wake'
d=o/'diagnostics/host-suspend-20261004';(d/'snapshot.json').write_text(json.dumps({'capturedAt':stamp(),'events':events},indent=2)+'\n')
active=read(d/'interruption-before.json')['active'];jobs=read(r/'mutation-plan.json')['jobs'];retained=[];windows=[];invalid=[];affected=[]
for j in jobs:
 p=r/'mutation-parts'/('widgets-mutation-part-'+j['slot']+'.json')
 if p.exists():
  v=read(p);assert v['source_head']==candidate and v['status'] in ['AS-DECLARED','PARTITION-AS-DECLARED'] and not v['baseline_red'] and v['mismatches']==0
  assert datetime.datetime.fromisoformat(v['finishedAt'].replace('Z','+00:00'))<datetime.datetime.fromisoformat(first)
  paths=[p,r/('mutation-'+j['slot']+'.receipt.json'),r/('mutation-'+j['slot']+'.log')]
  retained.append({'slot':j['slot'],'files':[{'path':str(x.relative_to(o)),'sha256':sha(x)} for x in paths]})
for row in active:
 cmd=row['command'];gate=cmd.split('--gate ',1)[1].split()[0];partition=cmd.split('--partition ',1)[1].split()[0] if '--partition ' in cmd else ''
 job=next(j for j in jobs if j['gate']==gate and j['partition']==partition);slot=job['slot'];affected.append(slot)
 receipt=r/('mutation-'+slot+'.receipt.json');v=read(receipt);assert v['candidate']==candidate and v['exit']==-15
 start=datetime.datetime.fromtimestamp((w/f"worker-{row['worker']}-pid").stat().st_mtime,datetime.timezone.utc);finish=datetime.datetime.fromtimestamp(receipt.stat().st_mtime,datetime.timezone.utc)
 assert start<datetime.datetime.fromisoformat(first)<datetime.datetime.fromisoformat(wake)<finish
 windows.append({'slot':slot,'worker':row['worker'],'startedAt':start.isoformat(),'finishedAt':finish.isoformat(),'source':'Verified owned process-group leader + immutable worker PID-file start time. Actual exit -15 was intentional host-suspend quarantine, not a mutant kill.'})
 dst=r/'suspend-invalidated'/slot;dst.mkdir(parents=True);files=[]
 for p in [r/'mutation-parts'/('widgets-mutation-part-'+slot+'.json'),receipt,r/('mutation-'+slot+'.log')]:
  if p.exists():
   dest=dst/p.name;shutil.move(p,dest);files.append({'path':str(dest.relative_to(o)),'sha256':sha(dest)})
 invalid.append({'slot':slot,'files':files})
retained_slots={x['slot'] for x in retained};retry=[j for j in jobs if j['slot'] not in retained_slots];never=[j['slot'] for j in retry if j['slot'] not in affected]
assert len(retained)==52 and len(affected)==6 and len(never)==10 and len(retry)==16
orch=read(r/'complete-native.orchestration.json');assert orch['candidate']==candidate and orch['exit']==1
shutil.copy2(r/'complete-native.orchestration.json',d/'original-complete-native.orchestration.json')
originalsources=[{'path':str(p.relative_to(root)),'sha256':sha(p)} for p in [w/'run-all-mutations-isolated.py',w/'run-complete-native.py',w/'r06-child-trace.cjs']]
plan={'candidate':candidate,'recordedAt':stamp(),'reason':'Confirmed clamshell/maintenance sleep on battery. All six overlapped native parts intentionally interrupted and quarantined; complete whole-part reexecution required. No product defect inferred.','firstSleep':first,'fullWake':wake,'retainedWholeParts':retained,'sleepAffectedSlots':sorted(affected),'interruptedPostWakeSlots':[],'neverStartedSlots':never,'retryJobs':retry,'originalOrchestration':orch,'originalOrchestrationBinding':{'path':str((d/'original-complete-native.orchestration.json').relative_to(o)),'sha256':sha(d/'original-complete-native.orchestration.json')},'invalidatedArtifacts':invalid,'originalRawR06Traces':[{'path':str(p.relative_to(o)),'sha256':sha(p)} for p in sorted(r.glob('r06-native-worker-*.jsonl'))],'originalExecutionSources':originalsources,'candidateChanged':False,'testRestrictions':None,'maxWorkers':6,'jobTimeoutMinutes':180,'r06TimeoutMs':20000,'powerSettingsChanged':False,'productionEffects':0,'invalidatedRunWindows':windows}
(o/'SUSPEND-RECOVERY-PLAN.json').write_text(json.dumps(plan,indent=2)+'\n')
source=old/'suspend-recovery-runner.py';s=source.read_text().replace('20261003','20261004').replace('singleopcertiso3','singleopcertrecovery4').replace('len(jobs)==13','len(jobs)==16');(w/source.name).write_text(s)
source=old/'suspend-recovery-validation.py';s=source.read_text().replace('20261003','20261004')
s=s.replace("{'P-ledger', 'P-mt3', 'P-pairing', 'P-principal', 'P-render', 'P-rt6'}", "{'P-ledger', 'P-mt3', 'P-pairing', *['P-mint-part-' + str(i) + '-of-4' for i in range(2, 5)]}")
s=s.replace("== ['P-seal']",'== []').replace("{'T-tables', 'WF', *['WR-part-' + str(i) + '-of-4' for i in range(1, 5)]}","{'P-principal', 'P-render', 'P-rt6', 'P-seal', 'T-tables', 'WF', *['WR-part-' + str(i) + '-of-4' for i in range(1, 5)]}")
s=s.replace("len(plan['retainedWholeParts']) == 55 and len(plan['retryJobs']) == 13", "len(plan['retainedWholeParts']) == 52 and len(plan['retryJobs']) == 16")
s=s.replace("'retainedWholePartitions': 55", "'retainedWholePartitions': 52")
(w/source.name).write_text(s)
for name in ['index-final-orchestration-sources.py','finalize-receipts.py']:
 p=w/name;s=p.read_text()
 if name.startswith('index-'):
  s=s.replace('Six whole sleep-overlapped parts and one interrupted post-wake part restarted; six never-started jobs executed. Fifty-five complete pre-sleep parts retained with immutable hashes.', 'Six whole sleep-overlapped parts restarted; ten never-started jobs executed. Fifty-two complete pre-sleep parts retained with immutable hashes.')
 else:
  s=s.replace("recovery['retainedWholePartitions']==55 and len(recovery['wholePartitionsReexecuted'])==7 and len(recovery['newWholePartitions'])==6", "recovery['retainedWholePartitions']==52 and len(recovery['wholePartitionsReexecuted'])==6 and len(recovery['newWholePartitions'])==10")
 p.write_text(s)
print(json.dumps({'retained':52,'quarantined':6,'neverStarted':10,'newWholeExecutions':16,'candidateUnchanged':True,'timeoutsUnchanged':True}))
