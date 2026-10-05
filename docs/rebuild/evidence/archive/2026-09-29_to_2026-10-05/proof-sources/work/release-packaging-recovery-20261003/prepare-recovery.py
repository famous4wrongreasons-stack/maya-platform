from pathlib import Path
import datetime,difflib,hashlib,json,shutil,subprocess
root=Path.cwd();w=root/'work/release-packaging-final-20261003';rw=root/'work/release-packaging-recovery-20261003';o=root/'outputs/release-packaging-final-20261003';r=o/'receipts';repo=root/'work/maya-controlled-integration'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text());stamp=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00'))
head=(w/'HEAD').read_text().strip();assert head=='77ecb3f5696583389e75592141f46fd0664d33d8'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
host=read(o/'HOST-ENVIRONMENT-CHECK.json');assert host['reexecutionRequired']
sleep=host['sleepEvents'];begin=min(stamp(e['utc']) for e in sleep);end=max(stamp(e['utc']) for e in host['powerEvents'] if e['event']=='Wake')
parts=sorted((r/'mutation-parts').glob('*.json'));assert len(parts)==67
rows=[]
for p in parts:
 v=read(p);assert v['source_head']==head
 slot=p.stem.removeprefix('widgets-mutation-part-');a=stamp(v['startedAt']);b=stamp(v['finishedAt']);overlap=a<=end and b>=begin
 rows.append({'slot':slot,'path':str(p.relative_to(o)),'sha256':sha(p),'startedAt':v['startedAt'],'finishedAt':v['finishedAt'],'suspendOverlap':overlap})
affected=[v['slot'] for v in rows if v['suspendOverlap']];assert affected==['WR-part-3-of-4','WR-part-4-of-4'],affected
other=[]
for p in sorted(r.glob('*.receipt.json')):
 if p.name.startswith('mutation-'):continue
 v=read(p);assert v['candidate']==head
 completed=datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc)
 assert completed<begin,(p.name,completed)
 other.append({'path':str(p.relative_to(o)),'sha256':sha(p),'completedBeforeSuspend':completed.isoformat()})
archive=r/'suspend-invalidated/20261003-clamshell';assert not archive.exists();archive.mkdir(parents=True)
archived=[]
def keep(p,dest):
 assert p.exists() and not dest.exists();shutil.copy2(p,dest)
 archived.append({'original':str(p.relative_to(o)),'archive':str(dest.relative_to(o)),'sha256':sha(dest)})
for slot in affected:
 for p in [r/'mutation-parts'/('widgets-mutation-part-'+slot+'.json'),r/('mutation-'+slot+'.receipt.json'),r/('mutation-'+slot+'.log')]:
  keep(p,archive/p.name);p.unlink()
for name in ['HOST-ENVIRONMENT-CHECK.json','FINISH-STATUS.json','COMPLETE-MUTATIONS.json','FBE2E-DISPOSITION.json','FRESH-CLAUSE-EVIDENCE.json','COMPONENT-RECEIPTS.json','ARTIFACT-HASH-PARITY.json','FINAL-ARTIFACT-STABILITY.json']:
 if (o/name).exists():keep(o/name,archive/name)
for name in ['complete-native.orchestration.json','mutation-assemble.receipt.json','mutation-assemble.log']:
 keep(r/name,archive/name)
shutil.move(str(r/'mutation-receipt'),str(archive/'mutation-receipt'))
original=w/'run-all-mutations-isolated.py';s=original.read_text();t=s
replacements=[("work=root/'work/release-packaging-final-20261003'","work=root/'work/release-packaging-recovery-20261003'"),
("jobs=json.loads(plan['matrix'])['include']","jobs=[j for j in json.loads(plan['matrix'])['include'] if j['slot'] in ['WR-part-3-of-4','WR-part-4-of-4']]\nassert len(jobs)==2 and {(j['gate'],j['partition']) for j in jobs}=={('WR','3/4'),('WR','4/4')}"),
("out/'mutation-plan.json'","out/'recovery-mutation-plan.json'"),("out/'mutation-execution-order.json'","out/'recovery-mutation-execution-order.json'"),
("'workers':6","'workers':2"),("mutation-final2-worker-","mutation-recovery-worker-"),
("maya_widget_gate_proof_pkgfinaliso2_worker","maya_widget_gate_proof_pkgfinal_recovery1_worker"),("worker[1-6]","worker[1-2]"),
("r06-native-worker-","r06-recovery-worker-"),("max_workers=6","max_workers=2"),("range(1,7)","range(1,3)")]
for a,b in replacements:
 assert a in t,a;t=t.replace(a,b)
(rw/'run-recovery-partitions.py').write_text(t)
shutil.copy2(w/'r06-child-trace.cjs',rw/'r06-child-trace.cjs')
(rw/'canonical-runner-diff.patch').write_text(''.join(difflib.unified_diff(s.splitlines(True),t.splitlines(True),fromfile=str(original.relative_to(root)),tofile='run-recovery-partitions.py')))
record={'candidate':head,'status':'REEXECUTION REQUIRED','detectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cause':'Host clamshell suspend; not a product or harness test failure','suspendWindow':{'from':begin.isoformat(),'throughFullWake':end.isoformat()},'powerEvents':host['powerEvents'],'affectedSlots':affected,'unchanged65Parts':[v for v in rows if not v['suspendOverlap']],'invalidatedParts':[v for v in rows if v['suspendOverlap']],'otherExecutionReceiptsBeforeSuspend':other,'archive':archived,'canonicalRunner':{'path':str(original.relative_to(root)),'sha256':sha(original)},'recoverySources':[{'path':str(p.relative_to(root)),'sha256':sha(p)} for p in [rw/'prepare-recovery.py',rw/'run-recovery-partitions.py',rw/'r06-child-trace.cjs',rw/'canonical-runner-diff.patch']],'scope':'Both entire canonical WR partitions, unrestricted, fresh isolated source and DB. Other 65 same-programme receipts remain unchanged. No timeout or test-selection changes.','productChanged':False,'productionEffects':0}
(o/'SUSPEND-RECOVERY-PLAN.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'candidate':head,'affected':affected,'unaffectedParts':65,'otherReceipts':len(other),'archive':str(archive)}))
