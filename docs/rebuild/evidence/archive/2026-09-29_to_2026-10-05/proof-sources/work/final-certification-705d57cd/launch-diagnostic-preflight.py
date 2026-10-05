from pathlib import Path
import json,subprocess,time
root=Path.cwd();work=root/'work/final-certification-705d57cd';f=root/'outputs/final-certification-705d57cd/receipts/fbe2e-l27-postcommit-dismiss.receipt.json'
while not f.exists(): time.sleep(1)
record=json.loads(f.read_text());assert record['candidate']=='705d57cd787e24d8944dbe764789e27fd9af3708' and record['exit']==0
for name in ['prove-requested-baselines.py','run-anchor-preflight.py']:
 r=subprocess.run(['python3',str(work/name)],cwd=root)
 if r.returncode: raise SystemExit(r.returncode)
