from pathlib import Path
import subprocess,json,time
root=Path.cwd(); work=root/'work/ar1-single-operator-20261003'; out=root/'outputs/ar1-single-operator-20261003/receipts'
for name in ['evidence-verifier','k1-dossier']:
 p=out/(name+'.receipt.json')
 while not p.exists():time.sleep(1)
 assert json.loads(p.read_text())['exit']==0,name
for name in ['run-net-proof.py','run-net-turn-proof.py','run-net-bin.py','run-compiled-bin.py','run-compiled-receipt-bin.py','run-postcommit-bin.py','run-parity.py']:
 print('START '+name,flush=True)
 result=subprocess.run(['python3',str(work/name),'proof'],cwd=root)
 if result.returncode:raise SystemExit(result.returncode)
print('ALL INTEGRATION PROBES COMPLETE',flush=True)
