"""Bind fresh canonical GitHub matrix receipts to the existing strict release collector.

This reads downloaded evidence and invokes no product operation. It does not
manufacture a local execution: every adapted timing/exit cites its hosted job.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import subprocess

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
work = root / 'work/ar1-single-operator-final-20261005'
out = root / 'outputs/ar1-single-operator-final-20261005'
receipts = out / 'receipts'
hosted = out / 'hosted'
candidate = (work / 'HEAD').read_text().strip()
read = lambda p: json.loads(p.read_text())
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
publication = read(hosted / 'PUBLICATION.json')
assert publication['candidate'] == candidate and publication['status'] == 'PASS'
assert publication['productionOperations'] == 0
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
run = next(r for r in publication['hostedRuns'] if r['workflowDatabaseId'] == 362140366)
assert run['headSha'] == candidate and run['conclusion'] == 'success'
rid = str(run['databaseId'])
jobs_path = hosted / (rid + '-jobs.json')
jobs = [j for page in read(jobs_path) for j in page['jobs']]
assert len(jobs) == 70 and all(j['conclusion'] == 'success' for j in jobs)
native_jobs = {j['name'][len('Widgets mutation battery ('):-1]: j for j in jobs
               if j['name'].startswith('Widgets mutation battery (') and j['name'].endswith(')')}
assert len(native_jobs) == 68
node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node + ':/usr/bin:/bin'
plan_text = subprocess.check_output(['node', 'scripts/widgets-mutation-ci.mjs', 'plan', ''],
                                    cwd=repo / 'maya-saas-backend', env=env, text=True)
plan = dict(line.split('=', 1) for line in plan_text.strip().splitlines())
matrix = json.loads(plan['matrix'])['include']
assert {j['slot'] for j in matrix} == set(native_jobs)
parts = receipts / 'mutation-parts'
parts.mkdir(exist_ok=False)
rows = []
for declared in matrix:
    slot = declared['slot']
    filename = 'widgets-mutation-part-' + slot + '.json'
    source = hosted / 'artifacts' / rid / ('widgets-mutation-part-' + candidate + '-' + slot) / filename
    part = read(source)
    assert part['source_head'] == candidate and part['status'] == (
        'PARTITION-AS-DECLARED' if declared['partition'] else 'AS-DECLARED')
    assert part['baseline_red'] == [] and part['mismatches'] == 0
    assert all(v is None for v in part['restrictions'].values())
    job = native_jobs[slot]
    timestamps = [datetime.datetime.fromisoformat(job[key].replace('Z', '+00:00'))
                  for key in ['started_at', 'completed_at']]
    seconds = (timestamps[1] - timestamps[0]).total_seconds()
    assert 0 < seconds < 10800
    assert timestamps[0] >= datetime.datetime.fromisoformat(publication['mutationDispatchStartedAt'])
    for step in ['Run the battery shard', 'Stop containers']:
        assert next(s for s in job['steps'] if s['name'] == step)['conclusion'] == 'success'
    shutil.copyfile(source, parts / filename)
    assert digest(source) == digest(parts / filename)
    row = {'candidate': candidate, 'name': 'mutation-' + slot,
           'kind': 'hosted-job observation; not a local process receipt',
           'exit': 0, 'exitDerivation': 'GitHub job conclusion == success',
           'seconds': seconds, 'startedAt': job['started_at'], 'finishedAt': job['completed_at'],
           'executionEnvironment': 'GitHub Actions isolated Ubuntu/PostgreSQL service container',
           'workflowRunId': run['databaseId'], 'jobId': job['id'], 'jobUrl': job['html_url'],
           'jobMetadataFile': str(jobs_path.relative_to(out)), 'jobMetadataSha256': digest(jobs_path),
           'originalPart': str(source.relative_to(out)), 'partSha256': digest(source)}
    (receipts / ('mutation-' + slot + '.receipt.json')).write_text(json.dumps(row, indent=2) + '\n')
    rows.append(row)
(receipts / 'mutation-plan.json').write_text(json.dumps({'candidate': candidate, 'jobs': matrix,
    'executionEnvironment': 'GitHub Actions', 'restrictions': 'none; canonical unfiltered workflow'}, indent=2) + '\n')
result = {'candidate': candidate, 'exit': 0, 'executionEnvironment': 'GitHub Actions',
          'workflowRunId': run['databaseId'], 'workflowUrl': run['url'], 'parts': 68,
          'canonicalHostedCollectorPassed': True, 'historicalReceiptsAdmitted': 0,
          'scope': 'Fresh downloaded native job evidence; no local native-corpus execution claimed',
          'jobs': rows}
(receipts / 'complete-native.orchestration.json').write_text(json.dumps(result, indent=2) + '\n')
(out / 'HOSTED-MUTATION-PROVENANCE.json').write_text(json.dumps({
    'candidate': candidate, 'status': 'PASS', 'rawHostedJobs': {'path': str(jobs_path.relative_to(out)), 'sha256': digest(jobs_path)},
    'publication': {'path': 'hosted/PUBLICATION.json', 'sha256': digest(hosted / 'PUBLICATION.json')},
    'parts': rows, 'strictLocalReassemblyStillRequired': True, 'historicalReceiptsAdmitted': 0,
}, indent=2) + '\n')
print('68 fresh hosted parts imported byte-for-byte; existing strict release collector must still admit them.')
