from pathlib import Path
import datetime, hashlib, json, re, subprocess
root=Path.cwd();work=root/'work/ar1-single-operator-20261003';out=root/'outputs/ar1-single-operator-20261003';r=out/'receipts';candidate=(work/'HEAD').read_text().strip()
read=lambda p:json.loads(p.read_text())
complete=read(out/'COMPLETE-MUTATIONS.json');assert complete['candidate']==candidate and complete['status']=='PASS'
start=datetime.datetime.fromisoformat(read(out/'CANDIDATE.json')['startedAt']);now=datetime.datetime.now(datetime.timezone.utc)
rx=re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})\s+(Sleep|Wake|DarkWake)(?:\t| {2,})(.*)$')
events=[]
for line in subprocess.check_output(['pmset','-g','log'],text=True).splitlines():
 m=rx.match(line)
 if m:
  stamp=datetime.datetime.strptime(m[1],'%Y-%m-%d %H:%M:%S %z').astimezone(datetime.timezone.utc)
  if start<=stamp<=now:events.append({'utc':stamp.isoformat(),'event':m[2],'details':m[3].strip()})
sleep=[e for e in events if e['event']=='Sleep']
result={'candidate':candidate,'status':'PASS' if not sleep else 'REVIEW REQUIRED','programmeStart':start.isoformat(),'checkedAt':now.isoformat(),'powerEvents':events,'sleepEvents':sleep,'reexecutionRequired':bool(sleep),'timeoutsChanged':False,'powerSettingsChanged':False,'method':'Actual padded Sleep/Wake/DarkWake event column; scheduler Wake Requests are excluded. Any sleep during this fresh programme requires overlap analysis before admission.','idleSleepInhibitor':'caffeinate -is attached to programme lifetime'}
if sleep and (out/'SUSPEND-RECOVERY-PLAN.json').exists():
 import importlib.util
 spec=importlib.util.spec_from_file_location('suspend_recovery',work/'suspend-recovery-validation.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 try:
  proof=module.validate(root,events,now)
  (out/'SUSPEND-RECOVERY-PROOF.json').write_text(json.dumps(proof,indent=2)+'\n')
  result.update(status='PASS',reexecutionRequired=False,recoveryProof={'path':'SUSPEND-RECOVERY-PROOF.json','sha256':hashlib.sha256((out/'SUSPEND-RECOVERY-PROOF.json').read_bytes()).hexdigest()},admittedSleepOverlaps=0)
 except (AssertionError,FileNotFoundError) as error:
  result['recoveryRefusal']=str(error) or 'Recovery is incomplete or fails immutable binding checks'
(out/'HOST-ENVIRONMENT-CHECK.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result));assert result['status']=='PASS' and not result['reexecutionRequired'],'Do not admit sleep-overlapped executions without exact analysis and any required fresh reruns'
