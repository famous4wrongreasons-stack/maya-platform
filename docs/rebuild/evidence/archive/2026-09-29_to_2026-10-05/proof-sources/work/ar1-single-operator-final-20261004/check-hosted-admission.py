"""Read-only final admission of downloaded exact-HEAD hosted receipts."""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[2]
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/ar1-single-operator-final-20261004'
hosted = out / 'hosted'
candidate = 'dcf51e1e8b3e0c5e118bf0f111cbbc6bfd3287e4'
branch = 'codex/maya-controlled-integration-20260930'
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
git = lambda *args: subprocess.check_output(['git', *args], cwd=repo, text=True).strip()
local = read(out / 'CERTIFICATION-RECEIPTS.json')
publication = read(hosted / 'PUBLICATION.json')
assert local['candidate'] == publication['candidate'] == candidate
assert local['certifiedForProfile'] and publication['status'] == 'PASS'
assert local['fullMutations'] == local['localCiEquivalent'] == local['fbe2e'] == 'PASS'
assert not local['productionAuthorized'] and publication['productionOperations'] == 0
assert publication['headEqualsOrigin'] and publication['worktreeClean']
for item in local['additionalProofs']:
    assert sha(out / item['path']) == item['sha256'], item['path']
runs = publication['hostedRuns']
assert len(runs) == 6 and len(publication['requiredWorkflows']) == 6
packaging = publication['packagingWorkflowSource']
assert packaging['path'] == '.github/workflows/release-packaging.yml'
assert sha(repo / packaging['path']) == packaging['sha256']
assert any(run['workflowDatabaseId'] == packaging['workflowId']
           and run['workflowName'] == 'Canonical React release packaging' for run in runs)
assert all(run['headSha'] == candidate and run['headBranch'] == branch
           and run['status'] == 'completed' and run['conclusion'] == 'success' for run in runs)
mutation = next(run for run in runs if run['workflowDatabaseId'] == 362140366)
rid = str(mutation['databaseId'])
jobs = [job for page in read(hosted / (rid + '-jobs.json')) for job in page['jobs']]
assert len(jobs) == 70 and all(job['conclusion'] == 'success' for job in jobs)
assert sum(job['name'].startswith('Widgets mutation battery (') for job in jobs) == 68
reports = sorted((hosted / 'artifacts' / rid).rglob('widgets-mutation-report-*.json'))
assert len(reports) == 47
counts = collections.Counter()
bindings = []
for path in reports:
    report = read(path)
    assert report['source_head'] == candidate and report['status'] == 'AS-DECLARED'
    assert not report['baseline_red'] and report['mismatches'] == 0
    assert report['assembly']['all_declared_mutants'] and report['assembly']['unrestricted_tests']
    counts.update(mutant['status'] for mutant in report['mutants'])
    bindings.append({'path': str(path.relative_to(out)), 'sha256': sha(path)})
assert counts == {'build-killed': 359, 'live-killed': 183, 'pending': 2, 'equivalent': 1}
assert git('rev-parse', 'HEAD') == git('rev-parse', '@{upstream}') == candidate
assert git('ls-remote', '--heads', 'origin', 'refs/heads/' + branch).split()[0] == candidate
assert not git('status', '--porcelain')
value = {
    'candidate': candidate, 'status': 'PASS',
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'localCertification': {'path': 'CERTIFICATION-RECEIPTS.json',
                           'sha256': sha(out / 'CERTIFICATION-RECEIPTS.json')},
    'actualHostedCi': runs, 'hostedMutationJobs': len(jobs),
    'hostedCompleteReports': bindings, 'hostedMutationCounts': dict(counts),
    'multiTenantAuthorityPreserved': True, 'singleOperatorAr1': 'PASS',
    'independentHumanReview': False, 'releaseRehearsal': 'PASS; isolated database only',
    'pwaIosPackaging': 'PASS; React AChat; endpoint substitution contract preserved; no installation',
    'profileApplicableFalse': 0, 'globalFalse': 2,
    'globalStops': ['G6-6', 'G13-R8'], 'certifiedForProfile': True,
    'fullContractCertified': False,
    'readyForProductionExecutionAuthorization': False,
    'ownerActionsRemaining': local['remainingBlockers'],
    'deviceBoundary': 'Owner must connect/unlock iPhone for separately authorized install; '
                      'development provisioning expires 2026-10-05T08:16:21Z.',
    'headEqualsOrigin': True, 'worktreeClean': True, 'unpublishedRequiredSourceWork': 0,
    'productionOperations': 0, 'productionPrivateKeysCreatedOrStored': 0,
    'historicalReceiptsAdmitted': 0,
}
(out / 'FINAL-CHECKPOINT.json').write_text(json.dumps(value, indent=2) + '\n')
print('Fresh local and hosted final admission PASS; production authorization readiness remains NO until real owner prerequisites are confirmed.')
