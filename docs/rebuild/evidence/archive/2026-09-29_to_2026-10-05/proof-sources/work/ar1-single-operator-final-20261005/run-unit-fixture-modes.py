from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import time

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
be = repo / 'maya-saas-backend'
out = root / 'outputs/ar1-single-operator-final-20261005'
receipts = out / 'receipts'
candidate = 'dff728e85a97841dd72bd290992b888344780780'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
node = Path('/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin')
files = ['src/entitlements/' + name + '.spec.ts' for name in [
    'widget-release-production', 'widget-release-single-operator',
    'widget-release-policy', 'widget-release-access', 'widget-release-unit-database']]
base = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
base.update(PATH=str(node) + ':/opt/homebrew/bin:/usr/bin:/bin', NODE_ENV='test')
rows = []
for mode in ['local', 'github']:
    env = base.copy()
    if mode == 'github':
        env.update(CI='true', GITHUB_ACTIONS='true', WIDGET_GATEWAY_PG='required',
                   DATABASE_URL='[REDACTED DATABASE URL]')
    name = 'unit-fixtures-' + mode
    args = [str(node / 'node'), 'node_modules/jest/bin/jest.js', '--runInBand',
            '--json', '--outputFile=' + str(receipts / (name + '.json')), *files]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    clock = time.monotonic()
    with (receipts / (name + '.log')).open('w') as log:
        result = subprocess.run(args, cwd=be, env=env, stdout=log, stderr=subprocess.STDOUT)
    report = json.loads((receipts / (name + '.json')).read_text())
    row = {'candidate': candidate, 'name': name, 'command': args, 'cwd': str(be),
           'startedAt': started, 'exit': result.returncode,
           'seconds': round(time.monotonic() - clock, 2),
           'passed': report['numPassedTests'], 'failed': report['numFailedTests'],
           'databaseUse': 'Configuration only; no connection client in these explicit suites', 'scope': 'Explicit offline policy and mocked-access unit suites only'}
    (receipts / (name + '.receipt.json')).write_text(json.dumps(row, indent=2) + '\n')
    assert row['exit'] == 0 and row['passed'] == 153 and row['failed'] == 0
    rows.append(row)
    print(json.dumps(row), flush=True)
guards = ['test/widgets-live/support/proof-db-guard.ts', 'src/entitlements/widget-release-environment.ts']
bindings = []
for name in guards:
    path = 'maya-saas-backend/' + name
    assert (be / name).read_bytes() == subprocess.check_output(['git', 'show', 'dcf51e1e:' + path], cwd=repo)
    bindings.append({'path': path, 'sha256': hashlib.sha256((be / name).read_bytes()).hexdigest()})
(out / 'CI-UNIT-FIXTURE-MODES.json').write_text(json.dumps({
    'candidate': candidate, 'status': 'PASS', 'rows': rows, 'unchangedGuards': bindings,
    'freshFinalHead': True, 'historicalReceiptsAdmitted': 0, 'productionEffects': 0,
    'beforeFailureProvenance': '../ar1-single-operator-final-20261004/hosted/diagnostics/ci-fixture-mode/BEFORE-REPRODUCTION.json',
    'beforeReceiptUse': 'Root-cause provenance only; not admitted as current passing evidence',
}, indent=2) + '\n')
