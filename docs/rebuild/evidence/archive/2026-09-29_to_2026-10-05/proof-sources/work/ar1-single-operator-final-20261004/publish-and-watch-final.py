"""Publish only after fresh local admission, then collect actual exact-HEAD GitHub CI.

This orchestration is not product source and performs no production operation.
Run explicitly after reviewing local certification; never imports old receipts.
"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

root = Path(__file__).resolve().parents[2]
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/ar1-single-operator-final-20261004'
hosted = out / 'hosted'
candidate = 'dcf51e1e8b3e0c5e118bf0f111cbbc6bfd3287e4'
branch = 'codex/maya-controlled-integration-20260930'
repository = 'famous4wrongreasons-stack/maya-platform'
workflows = {
    311601892: 'Platform CI',
    359168151: 'Widget Contract (blocking)',
    360279046: 'Widgets Live',
    360530612: 'MAYA Chat Shell',
    362140366: 'Widgets Mutation',
}
stamp = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()

def run(args):
    return subprocess.check_output(args, cwd=repo, text=True).strip()

def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

local = json.loads((out / 'CERTIFICATION-RECEIPTS.json').read_text())
assert local['candidate'] == candidate and local['certifiedForProfile'] is True
assert local['fullMutations'] == local['localCiEquivalent'] == local['fbe2e'] == 'PASS'
assert local['singleOperatorAr1'] == 'PASS' and local['profileApplicableFalse'] == 0
assert local['fullContractCertified'] is False and local['productionAuthorized'] is False
assert run(['git', 'rev-parse', 'HEAD']) == candidate
assert run(['git', 'branch', '--show-current']) == branch
assert not run(['git', 'status', '--porcelain'])
assert run(['git', 'remote', 'get-url', 'origin']) == '[REDACTED EMAIL]:' + repository + '.git'
for proof in local['additionalProofs']:
    assert hashlib.sha256((out / proof['path']).read_bytes()).hexdigest() == proof['sha256']

hosted.mkdir(exist_ok=True)
state_path = hosted / 'PUBLICATION.json'
if state_path.exists():
    state = json.loads(state_path.read_text())
    assert state['candidate'] == candidate and state['branch'] == branch
else:
    state = {'candidate': candidate, 'branch': branch, 'repository': repository,
             'startedAt': stamp(), 'productionOperations': 0, 'status': 'PUBLISHING'}
    write(state_path, state)

if not state.get('pushCompletedAt'):
    if 'prepublicationRunIds' not in state:
        prior = json.loads(run(['gh', 'run', 'list', '-R', repository, '--commit', candidate,
                                '--branch', branch, '--limit', '100', '--json', 'databaseId']))
        state['prepublicationRunIds'] = [item['databaseId'] for item in prior]
        write(state_path, state)
    pushed = run(['git', 'push', '--porcelain', '-u', 'origin', 'HEAD:refs/heads/' + branch])
    (hosted / 'normal-push.log').write_text(pushed + '\n')
    state['pushCompletedAt'] = stamp()
    write(state_path, state)

assert run(['git', 'rev-parse', 'refs/remotes/origin/' + branch]) == candidate
assert run(['git', 'ls-remote', '--heads', 'origin', 'refs/heads/' + branch]).split()[0] == candidate
# This candidate introduces a sixth push workflow. It may not yet have a remote
# workflow id before the first push, so resolve its actual id after registration.
packaging_path = '.github/workflows/release-packaging.yml'
deadline = time.monotonic() + 180
while True:
    pages = json.loads(run(['gh', 'api', '--paginate', '--slurp',
        'repos/' + repository + '/actions/workflows?per_page=100']))
    packaging = [workflow for page in pages for workflow in page['workflows']
                 if workflow['path'] == packaging_path and workflow['state'] == 'active']
    if packaging:
        assert len(packaging) == 1
        break
    assert time.monotonic() < deadline, 'Canonical packaging workflow not registered; no hosted admission'
    time.sleep(10)
assert packaging[0]['name'] == 'Canonical React release packaging'
workflows[packaging[0]['id']] = packaging[0]['name']
assert len(workflows) == 6
state['requiredWorkflows'] = {str(wid): name for wid, name in workflows.items()}
state['packagingWorkflowSource'] = {
    'path': packaging_path,
    'sha256': hashlib.sha256((repo / packaging_path).read_bytes()).hexdigest(),
    'workflowId': packaging[0]['id'],
}
write(state_path, state)
if not state.get('mutationDispatchedAt'):
    state['mutationDispatchStartedAt'] = stamp()
    write(state_path, state)
    run(['gh', 'workflow', 'run', '362140366', '-R', repository, '--ref', branch, '-f', 'gates='])
    state['mutationDispatchedAt'] = stamp()
    state['status'] = 'AWAITING HOSTED CI'
    write(state_path, state)

last = None
while True:
    runs = json.loads(run(['gh', 'run', 'list', '-R', repository, '--commit', candidate,
        '--branch', branch, '--limit', '100', '--json',
        'databaseId,workflowDatabaseId,workflowName,headSha,headBranch,event,createdAt,status,conclusion,url,attempt']))
    selected = {}
    for item in sorted(runs, key=lambda x: x['databaseId']):
        wid = item['workflowDatabaseId']
        if wid not in workflows:
            continue
        event = 'workflow_dispatch' if wid == 362140366 else 'push'
        if item['event'] != event:
            continue
        if item['databaseId'] in state['prepublicationRunIds']:
            continue
        assert item['headSha'] == candidate and item['headBranch'] == branch
        selected[wid] = item
    write(hosted / 'CURRENT-RUNS.json', {'candidate': candidate, 'checkedAt': stamp(),
          'expectedWorkflowIds': list(workflows), 'runs': list(selected.values())})
    compact = [(workflows[wid], item['status'], item['conclusion'], item['databaseId'])
               for wid, item in sorted(selected.items())]
    if compact != last:
        print(json.dumps({'at': stamp(), 'hosted': compact}), flush=True)
        last = compact
    failed = [item for item in selected.values()
              if item['status'] == 'completed' and item['conclusion'] != 'success']
    if failed or (len(selected) == len(workflows) and
                  all(item['status'] == 'completed' for item in selected.values())):
        break
    time.sleep(30)

for wid, item in selected.items():
    if item['status'] != 'completed':
        continue
    rid = str(item['databaseId'])
    write(hosted / (rid + '-jobs.json'), json.loads(run(['gh', 'api', '--paginate', '--slurp',
        'repos/' + repository + '/actions/runs/' + rid + '/jobs?per_page=100'])))
    artifacts = json.loads(run(['gh', 'api', '--paginate', '--slurp',
        'repos/' + repository + '/actions/runs/' + rid + '/artifacts?per_page=100']))
    write(hosted / (rid + '-artifacts.json'), artifacts)
    with (hosted / (rid + '-log.txt')).open('w') as log:
        subprocess.run(['gh', 'run', 'view', rid, '-R', repository, '--log'],
                       cwd=repo, text=True, stdout=log, check=True)
    if any(page['artifacts'] for page in artifacts):
        run(['gh', 'run', 'download', rid, '-R', repository, '-D', str(hosted / 'artifacts' / rid)])

assert not failed, 'Fresh hosted CI failed; inspect exact job receipt before any further change'
assert len(selected) == len(workflows)
assert run(['git', 'rev-parse', 'HEAD']) == candidate
assert run(['git', 'rev-parse', '@{upstream}']) == candidate
assert run(['git', 'ls-remote', '--heads', 'origin', 'refs/heads/' + branch]).split()[0] == candidate
assert not run(['git', 'status', '--porcelain'])
state.update(status='PASS', finishedAt=stamp(), headEqualsOrigin=True,
             worktreeClean=True, unpublishedRequiredSourceWork=0,
             hostedRuns=list(selected.values()), productionOperations=0)
write(state_path, state)
print('FRESH HOSTED CI AND NORMAL PUBLICATION PASS', flush=True)
