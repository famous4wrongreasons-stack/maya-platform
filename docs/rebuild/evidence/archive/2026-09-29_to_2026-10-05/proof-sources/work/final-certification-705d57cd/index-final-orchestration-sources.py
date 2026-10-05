from pathlib import Path
import datetime
import hashlib
import json

root = Path.cwd()
work = root / 'work/final-certification-705d57cd'
out = root / 'outputs/final-certification-705d57cd'
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
complete = read(out / 'COMPLETE-MUTATIONS.json')
assert complete['candidate'] == candidate and complete['status'] == 'PASS'
initial_path = out / 'ORCHESTRATION-CURRENT-SOURCES.json'
initial = read(initial_path)
assert initial['candidate'] == candidate
changes = []
files = []
for row in initial['files']:
    path = work / row['path']
    assert path.is_file(), row['path']
    digest = sha(path)
    files.append({'path': row['path'], 'sha256': digest})
    if digest != row['sha256']:
        changes.append({'path': row['path'], 'capturedSha256': row['sha256'], 'finalSha256': digest})
assert {row['path'] for row in changes} == {'finalize-receipts.py', 'assemble-complete.py'}, changes
new_helpers = ['check-final-artifact-stability.py', 'check-final-process-lifecycle.py',
               'index-final-orchestration-sources.py', 'write-final-report.py',
               'capture-host-suspend.py', 'run-suspend-reverification.py',
               'launch-suspend-after-original.py', 'monitor-suspend-reverification.py']
for name in new_helpers:
    assert name not in {row['path'] for row in initial['files']}
    files.append({'path': name, 'sha256': sha(work / name)})
result = {
    'candidate': candidate,
    'status': 'PASS',
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'comparisonSource': 'ORCHESTRATION-CURRENT-SOURCES.json',
    'comparisonSourceSha256': sha(initial_path),
    'comparisonCapturedAt': initial['capturedAt'],
    'scope': 'Comparison against the retained mid-run source inventory. No claim that this inventory preceded the ordinary-suite start.',
    'executionSourcesChangedSinceCapture': [],
    'reportingOnlyChanges': changes,
    'reportingChangeReason': 'Final admission now additionally requires post-run cleanup/source-integrity receipts and complete same-candidate reexecution of every native part overlapping the documented host suspension. The original execution scripts, tests, probes, limits and mutation declarations were not changed.',
    'newHelpers': new_helpers,
    'additionalRecoveryExecution': ['run-suspend-reverification.py', 'launch-suspend-after-original.py'],
    'additionalRecoveryScope': 'Full canonical parts and default steps on the identical candidate; all original overlapping receipts retained and withheld from admission. No restricted or historical receipt substitution.',
    'files': sorted(files, key=lambda row: row['path']),
    'productCandidateChanged': False,
}
(out / 'FINAL-ORCHESTRATION-SOURCES.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'orchestrationSourceIntegrity': 'PASS',
                  'executionSourceChanges': 0, 'reportingOnlyChanges': len(changes)}))
