from pathlib import Path
import datetime
import hashlib
import json
import re
import shutil
import subprocess

root = Path.cwd()
out = root / 'outputs/final-certification-705d57cd'
r = out / 'receipts'
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
utc = datetime.timezone.utc
start = datetime.datetime(2026, 10, 1, 13, 27, 49, tzinfo=utc)
now = datetime.datetime.now(utc)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
events = []
# "Wake Requests" is a scheduler hint, not a wake event. The padded event column
# distinguishes it from an actual Wake/DarkWake line.
rx = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})\s+(Sleep|Wake|DarkWake)(?:\t| {2,})(.*)$')
for line in subprocess.check_output(['pmset', '-g', 'log'], text=True).splitlines():
    m = rx.match(line)
    if not m:
        continue
    stamp = datetime.datetime.strptime(m[1], '%Y-%m-%d %H:%M:%S %z').astimezone(utc)
    if stamp >= start:
        events.append({'utc': stamp.isoformat(), 'event': m[2], 'details': m[3].strip()})
windows = []
opened = None
for event in events:
    if event['event'] == 'Sleep' and opened is None:
        opened = event['utc']
    elif event['event'] == 'Wake' and opened is not None:
        windows.append({'from': opened, 'to': event['utc'], 'fullWakeObserved': True})
        opened = None
if opened:
    windows.append({'from': opened, 'to': now.isoformat(), 'fullWakeObserved': False})

def overlaps(begin, end):
    return any(begin <= datetime.datetime.fromisoformat(w['to']) and
               end >= datetime.datetime.fromisoformat(w['from']) for w in windows)

runs = []
for path in (r / 'mutation-diagnostics').glob('*.json'):
    data = json.loads(path.read_text())
    begin = datetime.datetime.fromtimestamp(data['startTime'] / 1000, utc)
    end = datetime.datetime.fromisoformat(data['capturedAt'])
    if overlaps(begin, end):
        runs.append({'path': str(path.relative_to(out)), 'sha256': sha(path),
                     'worker': data['worker'], 'step': data['step'],
                     'startTime': begin.isoformat(), 'capturedAt': end.isoformat(),
                     'success': data['success'], 'passed': data['passed'], 'failed': data['failed'],
                     'failureTitles': [x.get('title', x.get('suite')) for x in data['failures']]})

jobs = []
for path in r.glob('mutation-*.receipt.json'):
    data = json.loads(path.read_text())
    if '--gate' not in data.get('command', []):
        continue
    assert data['candidate'] == candidate
    end = datetime.datetime.fromtimestamp(path.stat().st_mtime, utc)
    begin = end - datetime.timedelta(seconds=data['seconds'])
    if overlaps(begin - datetime.timedelta(seconds=1), end + datetime.timedelta(seconds=1)):
        args = data['command']
        jobs.append({'slot': data['name'].removeprefix('mutation-'),
                     'gate': args[args.index('--gate') + 1],
                     'partition': args[args.index('--partition') + 1] if '--partition' in args else None,
                     'receipt': str(path.relative_to(out)), 'receiptSha256': sha(path),
                     'startInferredFromReceipt': begin.isoformat(), 'completedAt': end.isoformat(),
                     'wallSeconds': data['seconds'], 'exit': data['exit'], 'command': args,
                     'originalSource': data['cwd']})
native_path = r / 'complete-native.orchestration.json'
native = json.loads(native_path.read_text()) if native_path.exists() else None
path = out / 'HOST-SUSPEND-OBSERVATION.json'
initial = out / 'HOST-SUSPEND-OBSERVATION.initial.json'
if path.exists() and not initial.exists():
    shutil.copy2(path, initial)
result = {
    'candidate': candidate, 'capturedAt': now.isoformat(),
    'powerEvents': events, 'suspensionWindows': windows,
    'windowScope': 'Conservative first Sleep through actual FullWake, including short maintenance DarkWakes.',
    'potentiallyOverlappingTestRuns': sorted(runs, key=lambda row: row['startTime']),
    'completedOverlappingJobs': sorted(jobs, key=lambda row: row['slot']),
    'jobTimestampMethod': 'Receipt filesystem completion timestamp minus its recorded wall seconds; overlap widened by one second.',
    'nativeOriginalExecutionComplete': native is not None,
    'nativeOriginalExecutionExit': native['exit'] if native else None,
    'admissionAssessment': 'All overlapping whole parts will be withheld and rerun with canonical unrestricted steps on the identical candidate. Unaffected fresh parts remain in this same certification programme.',
    'timeoutsChanged': False, 'productSourceChanged': False, 'powerSettingsChanged': False,
    'parserCorrection': 'Wake Requests scheduler hints in the initial diagnostic were not actual wake events and are excluded here.',
}
path.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'suspensionWindows': windows,
                  'overlappingRuns': len(runs), 'completedOverlappingJobs': [j['slot'] for j in jobs],
                  'originalNativeComplete': native is not None}))
