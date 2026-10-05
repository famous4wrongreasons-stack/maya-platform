"""Close the current exact-SHA programme after all 13 whole jobs finish freshly."""
from pathlib import Path
import datetime
import hashlib
import importlib.util
import json
import re
import subprocess

root = Path.cwd()
work = root / 'work/ar1-single-operator-final-20261003'
out = root / 'outputs/ar1-single-operator-final-20261003'
receipts = out / 'receipts'
repo = root / 'work/maya-controlled-integration'
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
plan = read(out / 'SUSPEND-RECOVERY-PLAN.json')
candidate = plan['candidate']
recovery = read(receipts / 'suspend-recovery.orchestration.json')
assert recovery['candidate'] == candidate and recovery['exit'] == 0 and recovery['wholeParts'] == 13
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
for item in plan['retainedWholeParts']:
    for binding in item['files']:
        assert sha(out / binding['path']) == binding['sha256']
sources = read(out / 'SUSPEND-RECOVERY-SOURCES.json')
for binding in sources['sources'] + plan['originalExecutionSources']:
    assert sha(root / binding['path']) == binding['sha256']
jobs = []
for job in plan['retryJobs']:
    path = receipts / ('mutation-' + job['slot'] + '.receipt.json')
    command = ['node', 'scripts/widgets-mutation-battery.mjs', '--gate', job['gate']]
    if job['partition']:
        command += ['--partition', job['partition']]
    command += ['--out', str(receipts / 'mutation-parts' / ('widgets-mutation-part-' + job['slot'] + '.json'))]
    row = read(path)
    assert row['candidate'] == candidate and row['exit'] == 0 and row['command'] == command
    assert row['seconds'] < 10800
    assert 'mutation-suspend-worker-' in row['cwd']
    jobs.append({**job, 'receipt': {'path': str(path.relative_to(out)), 'sha256': sha(path)}})
assert len(jobs) == 13 and len(list((receipts / 'mutation-parts').glob('*.json'))) == 68
report_sources = [work / name for name in ['suspend-recovery-validation.py',
    'suspend-recovery-validation-test.py', 'complete-suspend-recovery.py',
    'finalize-receipts.py', 'index-final-orchestration-sources.py']]
execution = {'candidate': candidate, 'status': 'PASS', 'startedAt': recovery['startedAt'],
    'completedAt': recovery['completedAt'], 'jobs': jobs, 'retainedWholeParts': 55,
    'sleepAffectedWholePartsReexecuted': 6, 'interruptedPostWakePartReexecuted': 1,
    'neverStartedPartsExecuted': 6, 'sources': sources['sources'] + [
        {'path': str(path.relative_to(root)), 'sha256': sha(path)} for path in report_sources],
    'restrictions': None, 'timeoutsChanged': False, 'productChanged': False,
    'productionEffects': 0}
(out / 'SUSPEND-RECOVERY-EXECUTION.json').write_text(json.dumps(execution, indent=2) + '\n')

now = datetime.datetime.now(datetime.timezone.utc)
start = datetime.datetime.fromisoformat(read(out / 'CANDIDATE.json')['startedAt'])
rx = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})\s+(Sleep|Wake|DarkWake)(?:\t| {2,})(.*)$')
events = []
for line in subprocess.check_output(['pmset', '-g', 'log'], text=True).splitlines():
    match = rx.match(line)
    if match:
        stamp = datetime.datetime.strptime(match[1], '%Y-%m-%d %H:%M:%S %z').astimezone(datetime.timezone.utc)
        if start <= stamp <= now:
            events.append({'utc': stamp.isoformat(), 'event': match[2], 'details': match[3].strip()})
spec = importlib.util.spec_from_file_location('suspend_recovery', work / 'suspend-recovery-validation.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
proof = module.validate(root, events, now)
(out / 'SUSPEND-RECOVERY-CLOSURE-PROOF.json').write_text(json.dumps(proof, indent=2) + '\n')

# This is a composite receipt of one current-candidate programme, explicitly
# distinguishing immutable completed pre-sleep jobs from fresh whole reruns.
# The interrupted original orchestration is retained as inadmissible diagnostics.
assert not (receipts / 'complete-native.orchestration.json').exists()
complete = {'candidate': candidate, 'startedAt': plan['originalOrchestration']['startedAt'],
    'completedAt': now.isoformat(), 'exit': 0, 'restrictions': None,
    'historicalReceiptsAdmitted': 0, 'retainedCurrentProgrammeWholeParts': 55,
    'freshRecoveryWholeParts': 13, 'admittedSleepOverlaps': 0,
    'originalInterruptedOrchestration': 'receipts/suspend-invalidated/original-complete-native.orchestration.json',
    'recoveryExecution': {'path': 'SUSPEND-RECOVERY-EXECUTION.json', 'sha256': sha(out / 'SUSPEND-RECOVERY-EXECUTION.json')},
    'recoveryProof': {'path': 'SUSPEND-RECOVERY-CLOSURE-PROOF.json', 'sha256': sha(out / 'SUSPEND-RECOVERY-CLOSURE-PROOF.json')}}
(receipts / 'complete-native.orchestration.json').write_text(json.dumps(complete, indent=2) + '\n')
print('Current-candidate programme complete: 55 immutable pre-sleep jobs + 13 fresh whole jobs; no admitted suspend overlaps.')
