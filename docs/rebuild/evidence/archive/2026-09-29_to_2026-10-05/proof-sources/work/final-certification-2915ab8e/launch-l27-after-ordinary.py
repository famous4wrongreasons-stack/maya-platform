from pathlib import Path
import json, subprocess, time
root=Path.cwd();work=root/'work/final-certification-2915ab8e';path=root/'outputs/final-certification-2915ab8e/receipts/main-programme-status.json'
while not path.exists(): time.sleep(1)
record=json.loads(path.read_text());assert record['candidate']=='2915ab8e7c089e2c1f39848cb795940e5267c119' and record['exits']==[0]*8
raise SystemExit(subprocess.run(['python3',str(work/'run-l27-mutations.py')],cwd=root).returncode)
