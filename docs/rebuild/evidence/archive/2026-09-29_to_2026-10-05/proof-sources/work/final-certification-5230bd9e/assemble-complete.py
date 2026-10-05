from pathlib import Path
import collections, datetime, hashlib, json, os, subprocess, time

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
backend = repo / 'maya-saas-backend'
out = root / 'outputs/final-certification-5230bd9e'
receipts = out / 'receipts'
candidate = '5230bd9e23903941b8f7c4b814c2a326d14a3cbf'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
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
assert 'COMPLETE BATTERIES: 44; mutants: 507' in result.stdout
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
assert dict(counts) == {'build-killed': 342, 'live-killed': 162, 'pending': 2, 'equivalent': 1}
assert {(x['battery'], x['id']) for x in excluded if x['status'] == 'pending'} == {('gate6.json', 'M17b'), ('gate6.json', 'M18b')}
summary = {'candidate': candidate, 'status': 'PASS', 'parts': 65, 'batteries': 44,
           'declarations': 507, 'applicableKills': 504, 'counts': dict(counts),
           'existingNonKillDeclarations': excluded,
           'restrictions': 'none; full canonical default steps and unfiltered tests',
           'baselineRed': [], 'mismatches': 0, 'reports': rows,
           'localJobTimings': timings,
           'timingScope': 'Observed local eight-worker execution only. No remote GitHub execution or timing guarantee is claimed.',
           'historicalMutationReceiptsAdmitted': 0, 'certificateIssued': False}
(out / 'COMPLETE-MUTATIONS.json').write_text(json.dumps(summary, indent=2) + '\n')
print(result.stdout.strip())
print(json.dumps({'status': 'PASS', 'counts': dict(counts), 'certificateIssued': False}))
