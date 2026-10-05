from pathlib import Path
import datetime, hashlib, json, os, subprocess, time

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/final-certification-2915ab8e'
receipts = out / 'receipts'
candidate = '2915ab8e7c089e2c1f39848cb795940e5267c119'
node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node + ':/usr/bin:/bin'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()

def inventory():
    return [{'path': str(p.relative_to(repo)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for base in ['maya-chat-shell/dist', 'maya-carrier-react/dist']
            for p in sorted((repo / base).rglob('*')) if p.is_file()]

before = inventory()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
for name, package in [('runtime-build', 'maya-chat-shell'), ('carrier-build', 'maya-carrier-react')]:
    assert not (receipts / (name + '.receipt.json')).exists()
    tick = time.time()
    command = ['npm', 'run', 'build']
    with (receipts / (name + '.log')).open('w') as log:
        result = subprocess.run(command, cwd=repo / package, env=env, stdout=log, stderr=subprocess.STDOUT)
    row = {'candidate': candidate, 'name': name, 'command': command, 'cwd': str(repo / package),
           'exit': result.returncode, 'seconds': round(time.time() - tick, 2)}
    (receipts / (name + '.receipt.json')).write_text(json.dumps(row, indent=2) + '\n')
    print(json.dumps(row), flush=True)
    assert result.returncode == 0
after = inventory()
assert before == after, 'Artifacts changed: review before accepting earlier current-candidate tests'
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
(out / 'FRESH-BUILD-EQUIVALENCE.json').write_text(json.dumps({'candidate': candidate, 'status': 'PASS',
    'startedAt': started, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Missing explicit build commands executed during the current campaign; emitted bytes equal the current-candidate artifacts already exercised.',
    'before': before, 'after': after, 'byteIdentical': True, 'sourceChanged': False,
    'historicalReceiptsAdmitted': False}, indent=2) + '\n')
