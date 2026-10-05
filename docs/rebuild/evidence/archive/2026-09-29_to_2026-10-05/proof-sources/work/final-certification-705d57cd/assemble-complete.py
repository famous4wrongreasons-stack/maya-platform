from pathlib import Path
import collections, datetime, hashlib, json, os, subprocess, time

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
backend = repo / 'maya-saas-backend'
out = root / 'outputs/final-certification-705d57cd'
receipts = out / 'receipts'
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
retry = None
if (out / 'HOST-SUSPEND-OBSERVATION.json').exists():
    retry = json.loads((out / 'SUSPEND-REEXECUTION.json').read_text())
    assert retry['candidate'] == candidate and retry['status'] == 'PASS'
    assert retry['restrictions'] == 'none; complete canonical parts and default steps'
    assert set(retry['requiredSlots']) == set(retry['reexecutedSlots'])
    cohort_path = out / retry['originalCohort']
    assert hashlib.sha256(cohort_path.read_bytes()).hexdigest() == retry['originalCohortSha256']
    cohort = json.loads(cohort_path.read_text())
    assert cohort['candidate'] == candidate
    assert set(cohort['requiredSlots']) == set(retry['requiredSlots'])
    assert len(retry['admittedParts']) == len(retry['requiredSlots']) > 0
    for item in retry['admittedParts']:
        assert hashlib.sha256((out / item['path']).read_bytes()).hexdigest() == item['sha256']
plan = json.loads((receipts / 'mutation-plan.json').read_text())
assert plan['candidate'] == candidate and len(plan['jobs']) == 65
parts = sorted((receipts / 'mutation-parts').glob('*.json'))
assert len(parts) == 65, 'Full fresh corpus must finish before assembly'
timings = []
for job in plan['jobs']:
    path = receipts / ('mutation-' + job['slot'] + '.receipt.json')
    record = json.loads(path.read_text())
    assert record['candidate'] == candidate and record['exit'] == 0, path
    timings.append({'slot': job['slot'], 'gate': job['gate'],
                    'seconds': record['seconds'],
                    'localMarginTo180Minutes': round(10800 - record['seconds'], 2)})

node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node + ':/usr/bin:/bin'
destination = receipts / 'mutation-receipt'
assert not destination.exists(), 'Do not overwrite a previous assembly'
args = ['node', 'scripts/widgets-mutation-ci.mjs', 'assemble',
        str(receipts / 'mutation-parts'), str(destination), candidate, '']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
result = subprocess.run(args, cwd=backend, env=env, text=True, capture_output=True)
(receipts / 'mutation-assemble.log').write_text(result.stdout + result.stderr)
record = {'candidate': candidate, 'name': 'mutation-assemble', 'command': args,
          'cwd': str(backend), 'startedAt': started, 'exit': result.returncode,
          'seconds': round(time.monotonic() - clock, 2)}
(receipts / 'mutation-assemble.receipt.json').write_text(json.dumps(record, indent=2) + '\n')
assert result.returncode == 0, result.stdout + result.stderr
assert 'COMPLETE BATTERIES: 44; mutants: 509' in result.stdout
reports = sorted(destination.glob('widgets-mutation-report-*.json'))
assert len(reports) == 44
counts = collections.Counter()
rows = []
excluded = []
for path in reports:
    report = json.loads(path.read_text())
    assert report['source_head'] == candidate and report['status'] == 'AS-DECLARED'
    assert report['assembly']['all_declared_mutants'] and report['assembly']['unrestricted_tests']
    assert report['baseline_red'] == [] and report['mismatches'] == 0
    counts.update(m['status'] for m in report['mutants'])
    excluded.extend({'battery': m['battery'], 'id': m['id'], 'status': m['status'],
                     'reason': m.get('reason')} for m in report['mutants']
                    if m['status'] in ['pending', 'equivalent'])
    rows.append({'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                 'battery': report['batteries'][0], 'mutants': len(report['mutants']),
                 'partitions': report['assembly']['partitions'],
                 'baselineControls': len(report['baseline_controls']),
                 'neutraliserControls': len(report['neutraliser_controls'])})
assert dict(counts) == {'build-killed': 344, 'live-killed': 162, 'pending': 2, 'equivalent': 1}
assert {(x['battery'], x['id']) for x in excluded if x['status'] == 'pending'} == {('gate6.json', 'M17b'), ('gate6.json', 'M18b')}
summary = {'candidate': candidate, 'status': 'PASS', 'parts': 65, 'batteries': 44,
           'declarations': 509, 'applicableKills': 506, 'counts': dict(counts),
           'existingNonKillDeclarations': excluded,
           'restrictions': 'none; full canonical default steps and unfiltered tests',
           'baselineRed': [], 'mismatches': 0, 'reports': rows,
           'localJobTimings': timings,
           'timingScope': 'Observed local eight-worker execution only. No remote GitHub execution or timing guarantee is claimed.',
           'historicalMutationReceiptsAdmitted': 0, 'certificateIssued': False}
if retry:
    summary['hostSuspendRecovery'] = {
        'status': retry['status'], 'wholePartsReexecuted': len(retry['requiredSlots']),
        'receipt': 'SUSPEND-REEXECUTION.json',
        'receiptSha256': hashlib.sha256((out / 'SUSPEND-REEXECUTION.json').read_bytes()).hexdigest(),
        'sourceCandidateUnchanged': True, 'timeoutsChanged': False,
        'restrictions': retry['restrictions'], 'originalsRetained': True,
    }
(out / 'COMPLETE-MUTATIONS.json').write_text(json.dumps(summary, indent=2) + '\n')
print(result.stdout.strip())
print(json.dumps({'status': 'PASS', 'counts': dict(counts), 'certificateIssued': False}))
