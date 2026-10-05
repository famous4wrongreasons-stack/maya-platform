from pathlib import Path
import json,subprocess,time
root=Path.cwd();work=root/'work/final-certification-2915ab8e';f=root/'outputs/final-certification-2915ab8e/receipts/fbe2e-l27-postcommit-dismiss.receipt.json'
while not f.exists(): time.sleep(1)
record=json.loads(f.read_text());assert record['candidate']=='2915ab8e7c089e2c1f39848cb795940e5267c119' and record['exit']==0
for name in ['prove-requested-baselines.py','run-anchor-preflight.py']:
 r=subprocess.run(['python3',str(work/name)],cwd=root)
 if r.returncode: raise SystemExit(r.returncode)
