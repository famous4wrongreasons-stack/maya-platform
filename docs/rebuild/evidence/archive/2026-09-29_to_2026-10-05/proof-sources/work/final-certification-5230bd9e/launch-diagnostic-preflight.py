from pathlib import Path
import json,subprocess,time
root=Path.cwd();work=root/'work/final-certification-5230bd9e';f=root/'outputs/final-certification-5230bd9e/receipts/fbe2e-l27-postcommit-dismiss.receipt.json'
while not f.exists(): time.sleep(1)
record=json.loads(f.read_text());assert record['candidate']=='5230bd9e23903941b8f7c4b814c2a326d14a3cbf' and record['exit']==0
for name in ['prove-requested-baselines.py','run-anchor-preflight.py']:
 r=subprocess.run(['python3',str(work/name)],cwd=root)
 if r.returncode: raise SystemExit(r.returncode)
