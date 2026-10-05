from pathlib import Path
import datetime
import json
import subprocess
import time

root = Path.cwd()
work = root / 'work/final-certification-2915ab8e'
receipts = root / 'outputs/final-certification-2915ab8e/receipts'
candidate = '2915ab8e7c089e2c1f39848cb795940e5267c119'
original = receipts / 'complete-native.orchestration.json'
while not original.exists():
    time.sleep(1)
data = json.loads(original.read_text())
assert data['candidate'] == candidate and data['exit'] == 0, 'Inspect original failure before recovery'
# This PID was read from the current process tree. Check command ownership on
# every observation so a subsequently reused PID never delays another task.
while True:
    result = subprocess.run(['ps', '-p', '10924', '-o', 'command='], text=True, capture_output=True)
    if result.returncode or 'final-certification-2915ab8e/launch-final-after-diagnostic.py' not in result.stdout:
        break
    time.sleep(1)
assert (work / 'stop-report-watcher').exists()
began = datetime.datetime.now(datetime.timezone.utc).isoformat()
tick = time.time()
print(json.dumps({'candidate': candidate, 'phase': 'starting complete suspend-affected parts', 'startedAt': began}), flush=True)
with (receipts / 'suspend-reverification.orchestration.log').open('w') as log:
    result = subprocess.run(['python3', str(work / 'run-suspend-reverification.py')], cwd=root,
                            stdout=log, stderr=subprocess.STDOUT)
record = {'candidate': candidate, 'name': 'suspend-reverification', 'startedAt': began,
          'exit': result.returncode, 'seconds': round(time.time() - tick, 2)}
(receipts / 'suspend-reverification.orchestration.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record), flush=True)
raise SystemExit(result.returncode)
