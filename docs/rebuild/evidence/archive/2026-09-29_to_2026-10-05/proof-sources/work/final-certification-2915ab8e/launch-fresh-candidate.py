from pathlib import Path
import subprocess,json,time
root=Path.cwd();work=root/'work/final-certification-2915ab8e'
for script in ['prove-requested-baselines.py','launch-final-after-diagnostic.py']:
 print(json.dumps({'phase':script,'started':time.time()}),flush=True)
 code=subprocess.run(['python3',str(work/script)],cwd=root).returncode
 if code:raise SystemExit(code)
