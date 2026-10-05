from pathlib import Path
import subprocess, json, os, time, hashlib

root = Path.cwd()
work = root / 'work/clock-fixture-diagnosis'
be = work / 'backend'
out = root / 'outputs/harness-diagnosis-fed5f7df/clock-followup'
rel = 'src/billing/p4-08-tenant-billing-canonical-cutover.service.spec.ts'
node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node + ':/usr/bin:/bin'
results = []
def run(name, source, expected_fail, clock=None):
    (be / rel).write_text(source)
    args = ['node', 'node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', rel, '--json', '--outputFile=' + str(out / (name + '.json'))]
    extra = {}
    if clock:
        args += ['--setupFilesAfterEnv', str(work / 'ambient-clock.cjs')]
        extra['PROOF_CLOCK_ISO'] = clock
    start = time.time()
    with (out / (name + '.log')).open('w') as log:
        r = subprocess.run(args, cwd=be, env={**env, **extra}, stdout=log, stderr=subprocess.STDOUT)
    data = json.loads((out / (name + '.json')).read_text())
    receipt = dict(name=name, exit=r.returncode, seconds=round(time.time()-start, 3), passed=data['numPassedTests'], failed=data['numFailedTests'], runtimeErrors=data['numRuntimeErrorTestSuites'], ambientClock=clock, sourceSha256=hashlib.sha256(source.encode()).hexdigest(), command=args, failedTests=[a['fullName'] for t in data['testResults'] for a in t['assertionResults'] if a['status']=='failed'])
    (out / (name + '.receipt.json')).write_text(json.dumps(receipt, indent=2)+'\n')
    results.append(receipt)
    print(json.dumps(receipt), flush=True)
    assert data['numFailedTests'] == expected_fail and data['numRuntimeErrorTestSuites'] == 0
    assert r.returncode == (1 if expected_fail else 0)

red = (work / 'red.spec.ts.txt').read_text()
fixed = (work / 'fixed.spec.ts.txt').read_text()
run('repair-before', red, 3)
run('repair-after', fixed, 0)
for name, clock in [('fixture', '2026-09-02T12:00:00.000Z'), ('before-boundary', '2026-09-30T23:59:59.999Z'), ('at-boundary', '2026-10-01T00:00:00.000Z'), ('after-boundary', '2026-10-01T00:00:00.001Z')]:
    run('repair-after-' + name, fixed, 0, clock)
assert fixed.count('jest.useFakeTimers({ now: NOW });') == 1
run('repair-clock-removal-mutant', fixed.replace('jest.useFakeTimers({ now: NOW });', 'jest.useRealTimers();'), 3)
(be / rel).write_text(fixed)
(out / 'REPAIR-REGRESSION.json').write_text(json.dumps(results, indent=2)+'\n')
