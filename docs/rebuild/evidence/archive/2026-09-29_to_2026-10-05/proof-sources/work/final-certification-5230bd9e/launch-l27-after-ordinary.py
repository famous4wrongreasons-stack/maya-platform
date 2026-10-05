from pathlib import Path
import json, subprocess, time
root=Path.cwd();work=root/'work/final-certification-5230bd9e';path=root/'outputs/final-certification-5230bd9e/receipts/main-programme-status.json'
while not path.exists(): time.sleep(1)
record=json.loads(path.read_text());assert record['candidate']=='5230bd9e23903941b8f7c4b814c2a326d14a3cbf' and record['exits']==[0]*8
raise SystemExit(subprocess.run(['python3',str(work/'run-l27-mutations.py')],cwd=root).returncode)
