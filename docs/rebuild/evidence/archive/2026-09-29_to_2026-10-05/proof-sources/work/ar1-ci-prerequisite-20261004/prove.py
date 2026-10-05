from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import time

root = Path(__file__).resolve().parents[2]
work = root / 'work/ar1-ci-prerequisite-20261004'
out = root / 'outputs/ar1-ci-prerequisite-20261004'
repo = root / 'work/maya-controlled-integration'
fixture = work / 'clean-fixture'
backend = fixture / 'maya-saas-backend'
node_dir = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
python_dir = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin'
env = {key: value for key, value in os.environ.items() if key in ['HOME', 'USER', 'TMPDIR', 'LANG']}
env['PATH'] = node_dir + ':' + python_dir + ':/opt/homebrew/bin:/usr/bin:/bin'
candidate = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
spec = backend / 'src/action-engine/beget-relay-release.architecture.spec.ts'
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
original = digest(spec)


def run(name, command):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    now = time.monotonic()
    with (out / (name + '.log')).open('w') as log:
        result = subprocess.run(command, cwd=backend, env=env, stdout=log, stderr=subprocess.STDOUT)
    receipt = {'candidate': candidate, 'command': command, 'cwd': str(backend),
               'startedAt': started, 'exit': result.returncode, 'seconds': round(time.monotonic() - now, 2)}
    (out / (name + '.receipt.json')).write_text(json.dumps(receipt, indent=2) + '\n')
    return result.returncode


def tests(name):
    command = ['node', 'node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath',
               'src/action-engine/beget-relay-release.architecture.spec.ts',
               '--json', '--outputFile', str(out / (name + '.json'))]
    status = run(name, command)
    return status, json.loads((out / (name + '.json')).read_text())


assert not (fixture / 'maya-chat-shell/dist/web').exists()
status, before = tests('before')
failures = [a for suite in before['testResults'] for a in suite['assertionResults'] if a['status'] == 'failed']
assert status == 1 and before['numFailedTests'] == len(failures) == 1
assert failures[0]['title'] == '[INTEGRATION-ONLY] gates a static shell candidate as strictly as a PHP edge candidate'
assert 'ENOENT' in ''.join(failures[0]['failureMessages']) and 'maya-chat-shell/dist/web' in ''.join(failures[0]['failureMessages'])
print('BEFORE: exact hosted ENOENT reproduced in clean isolated fixture', flush=True)
assert run('build-prerequisite', ['node', '../maya-chat-shell/build.mjs']) == 0
assert (fixture / 'maya-chat-shell/dist/web').is_dir()
status, after = tests('after')
assert status == 0 and after['success'] and after['numFailedTests'] == 0
assert after['numPassedTests'] == before['numTotalTests'] and after['numPassedTestSuites'] == 1
assert digest(spec) == original == digest(repo / 'maya-saas-backend/src/action-engine/beget-relay-release.architecture.spec.ts')
assert candidate == subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
result = {'candidate': candidate, 'status': 'PASS', 'rootCause': 'CI omitted the separately generated runtime artifact required by an unchanged integration-only R01 test.',
          'before': {'fail': 1, 'pass': before['numPassedTests'], 'reason': 'ENOENT: maya-chat-shell/dist/web'},
          'after': {'fail': 0, 'pass': after['numPassedTests']},
          'testSourceSha256': original, 'testChanged': False, 'productChanged': False,
          'artifactCopied': False, 'artifactBuiltFromExistingSource': True,
          'runtimeBuilderSha256': digest(repo / 'maya-chat-shell/build.mjs'),
          'releasePayloadOwner': 'React AChat; this integration fixture does not select or publish a release payload',
          'productionEffects': 0, 'driverSha256': digest(Path(__file__))}
(out / 'CLEAN-REPRODUCTION.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result), flush=True)
