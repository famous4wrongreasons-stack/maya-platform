from pathlib import Path
import datetime,hashlib,json,subprocess,time
root=Path.cwd();w=root/'work/release-packaging-final-20261003';rw=root/'work/release-packaging-recovery-20261003';o=root/'outputs/release-packaging-final-20261003';r=o/'receipts'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
while True:
 execution=read(o/'SUSPEND-RECOVERY-EXECUTION.json')
 if execution['status']!='RUNNING':break
 time.sleep(5)
assert execution['status']=='PASS' and execution['exit']==0,'Recovery failed; certification is not attempted'
plan=read(o/'SUSPEND-RECOVERY-PLAN.json');assert execution['planSha256']==sha(o/'SUSPEND-RECOVERY-PLAN.json')
original=r/'suspend-invalidated/20261003-clamshell/complete-native.orchestration.json';native=read(original)
assert read(r/'complete-native.orchestration.json')==native,'Unexpected orchestration rewrite'
assert native['candidate']==execution['candidate'] and native['exit']==0
for row in plan['unchanged65Parts']:assert sha(o/row['path'])==row['sha256']
for slot in execution['slots']:
 rc=read(r/('mutation-'+slot+'.receipt.json'));part=read(r/'mutation-parts'/('widgets-mutation-part-'+slot+'.json'))
 assert rc['candidate']==native['candidate'] and rc['exit']==0
 assert part['source_head']==native['candidate'] and part['status']=='PARTITION-AS-DECLARED' and part['mismatches']==0
native.update(completedAt=execution['completedAt'],seconds=round((datetime.datetime.fromisoformat(execution['completedAt'])-datetime.datetime.fromisoformat(native['startedAt'])).total_seconds(),2),
 originalExecution={'path':str(original.relative_to(o)),'sha256':sha(original),'admission':'65 unaffected partitions retained; two suspend-overlapped partitions fully replaced'},
 recovery={'path':'SUSPEND-RECOVERY-EXECUTION.json','sha256':sha(o/'SUSPEND-RECOVERY-EXECUTION.json'),'wholeCanonicalPartitions':execution['slots']},
 reportingCoordinator={'path':str(Path(__file__).relative_to(root)),'sha256':sha(Path(__file__))})
(r/'complete-native.orchestration.json').write_text(json.dumps(native,indent=2)+'\n')
for i in [1,2]:
 p=r/('mutation-worker-'+str(i)+'-migration.log')
 (r/('recovery-worker-'+str(i)+'-migration.log')).write_bytes(p.read_bytes())
code=subprocess.run(['python3',str(w/'finish-programme.py')],cwd=root).returncode
raise SystemExit(code)
