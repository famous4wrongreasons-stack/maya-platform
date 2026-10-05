from pathlib import Path
import datetime,hashlib,json,subprocess,time
root=Path.cwd();w=root/'work/release-packaging-recovery-20261003';o=root/'outputs/release-packaging-final-20261003';r=o/'receipts';repo=root/'work/maya-controlled-integration'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
plan=read(o/'SUSPEND-RECOVERY-PLAN.json');head=plan['candidate'];assert not (o/'SUSPEND-RECOVERY-EXECUTION.json').exists()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
for x in plan['recoverySources']:assert sha(root/x['path'])==x['sha256']
sources=plan['recoverySources']+[{'path':str(Path(__file__).relative_to(root)),'sha256':sha(Path(__file__))}]
record={'candidate':head,'startedAt':now(),'status':'RUNNING','sources':sources,'planSha256':sha(o/'SUSPEND-RECOVERY-PLAN.json'),'slots':plan['affectedSlots'],'command':['python3',str(w/'run-recovery-partitions.py')],'freshDbNames':['maya_widget_gate_proof_pkgfinal_recovery1_worker1','maya_widget_gate_proof_pkgfinal_recovery1_worker2'],'timeoutsChanged':False,'restrictions':None,'effects':'local isolated test DB only'}
(o/'SUSPEND-RECOVERY-EXECUTION.json').write_text(json.dumps(record,indent=2)+'\n')
t=time.time();code=subprocess.run(record['command'],cwd=root).returncode
record.update(status='PASS' if code==0 else 'FAIL',exit=code,completedAt=now(),seconds=round(time.time()-t,2))
(o/'SUSPEND-RECOVERY-EXECUTION.json').write_text(json.dumps(record,indent=2)+'\n')
raise SystemExit(code)
