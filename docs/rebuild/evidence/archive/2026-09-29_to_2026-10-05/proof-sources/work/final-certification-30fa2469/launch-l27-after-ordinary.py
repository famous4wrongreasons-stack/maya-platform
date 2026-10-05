from pathlib import Path
import json, subprocess, time
root=Path.cwd();work=root/'work/final-certification-30fa2469';path=root/'outputs/final-certification-30fa2469/receipts/main-programme-status.json'
while not path.exists(): time.sleep(1)
record=json.loads(path.read_text());assert record['candidate']=='30fa24698f3ae277c22209e8edfd448c29e4f872' and record['exits']==[0]*8
raise SystemExit(subprocess.run(['python3',str(work/'run-l27-mutations.py')],cwd=root).returncode)
