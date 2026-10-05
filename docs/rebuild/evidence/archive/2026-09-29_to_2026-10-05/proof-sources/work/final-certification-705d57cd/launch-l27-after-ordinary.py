from pathlib import Path
import json, subprocess, time
root=Path.cwd();work=root/'work/final-certification-705d57cd';path=root/'outputs/final-certification-705d57cd/receipts/main-programme-status.json'
while not path.exists(): time.sleep(1)
record=json.loads(path.read_text());assert record['candidate']=='705d57cd787e24d8944dbe764789e27fd9af3708' and record['exits']==[0]*8
raise SystemExit(subprocess.run(['python3',str(work/'run-l27-mutations.py')],cwd=root).returncode)
