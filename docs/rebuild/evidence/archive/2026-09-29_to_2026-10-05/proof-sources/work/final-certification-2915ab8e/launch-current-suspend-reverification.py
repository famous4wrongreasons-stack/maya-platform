from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

root = Path.cwd()
work = root / 'work/final-certification-2915ab8e'
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/final-certification-2915ab8e'
receipts = out / 'receipts'
candidate = '2915ab8e7c089e2c1f39848cb795940e5267c119'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
native = read(receipts / 'complete-native.orchestration.json')
assert native['candidate'] == candidate and native['exit'] == 0
assert (work / 'stop-report-watcher').exists()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
commands = subprocess.check_output(['ps', '-axo', 'command='], text=True)
for name in ['launch-fresh-candidate.py', 'launch-final-after-diagnostic.py', 'run-all-mutations-isolated.py']:
    assert str(work / name) not in commands, 'Wait for the original orchestration to exit'
subprocess.run(['python3', str(work / 'capture-host-suspend.py')], cwd=root, check=True)
observation = read(out / 'HOST-SUSPEND-OBSERVATION.json')
assert {x['slot'] for x in observation['completedOverlappingJobs']} == {'WR-part-3-of-4', 'WR-part-4-of-4'}
assert observation['suspensionWindows'] == [{'from': '2026-10-02T06:35:59+00:00', 'to': '2026-10-02T06:55:23+00:00', 'fullWakeObserved': True}]
manifest = out / 'SUSPEND-EXECUTION-SOURCES.json'
assert not manifest.exists(), 'Retain every attempt; no overwrite'
sources = [work / 'launch-current-suspend-reverification.py', work / 'run-suspend-reverification.py',
           work / 'capture-host-suspend.py', work / 'check-host-environment.py',
           repo / 'maya-saas-backend/scripts/widgets-mutation-battery.mjs',
           repo / 'maya-saas-backend/scripts/widgets-mutation-ci.mjs']
manifest.write_text(json.dumps({'candidate': candidate, 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'reason': 'Full fresh replacement of the two exact current-candidate parts interrupted by observed host sleep.',
    'files': [{'path': str(p.relative_to(root)), 'sha256': sha(p)} for p in sources],
    'restrictions': 'none; canonical whole parts, default steps and full suites',
    'productChanged': False, 'timeoutsChanged': False, 'powerSettingsChanged': False}, indent=2) + '\n')
began = datetime.datetime.now(datetime.timezone.utc).isoformat()
tick = time.time()
print(json.dumps({'candidate': candidate, 'phase': 'fresh whole-part recovery', 'startedAt': began}), flush=True)
with (receipts / 'suspend-reverification.orchestration.log').open('w') as log:
    result = subprocess.run(['python3', str(work / 'run-suspend-reverification.py')], cwd=root,
                            stdout=log, stderr=subprocess.STDOUT)
record = {'candidate': candidate, 'name': 'suspend-reverification', 'startedAt': began,
          'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'exit': result.returncode, 'seconds': round(time.time() - tick, 2),
          'sourceManifest': manifest.name, 'sourceManifestSha256': sha(manifest)}
(receipts / 'suspend-reverification.orchestration.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record), flush=True)
raise SystemExit(result.returncode)
