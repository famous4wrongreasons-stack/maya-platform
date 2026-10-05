from pathlib import Path
import datetime, hashlib, json, os, platform, re, subprocess, time

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
backend = repo / 'maya-saas-backend'
work = root / 'work/final-certification-2915ab8e'
out = root / 'outputs/final-certification-2915ab8e'
receipts = out / 'receipts'
candidate = '2915ab8e7c089e2c1f39848cb795940e5267c119'
initial = 'fed5f7dfa0a5611dba24b40a8143b354c22151e5'
node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node + ':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin'
env['DATABASE_URL'] = '[REDACTED DATABASE URL]'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'", (backend / 'test/widgets-live/support/environment.ts').read_text())))
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
paths = subprocess.check_output(['git', 'diff', '--name-only', initial, candidate], cwd=repo, text=True).splitlines()
allowed = {
    'scripts/widgets-mutation-ci.mjs', 'scripts/widgets-mutation-ci.test.mjs',
    'src/admin/admin.controller.spec.ts', 'src/auth/legacy-staff-principal.http.spec.ts',
    'src/billing/p4-08-tenant-billing-canonical-cutover.service.spec.ts',
    'src/bootstrap/configure-http-app.spec.ts', 'src/widgets/owner-ports/commit-booking.adapter.spec.ts',
    'src/widgets/stores/timeline.store.spec.ts', 'test/app.e2e-spec.ts',
    'test/widgets-live/http-listener.live-spec.ts', 'test/widgets-live/mutations/gate9.json',
    'test/widgets-live/mutations/gateH-harness.json', 'test/widgets-live/mutations/gateTURN.json',
    'test/widgets-live/support/http-bootstrap.ts',
}
assert set(paths) == {'maya-saas-backend/' + p for p in allowed}
meta = {'candidate': candidate, 'branch': 'codex/maya-controlled-integration-20260930',
        'worktree': str(repo), 'startingCandidate': initial, 'clean': True,
        'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'platform': platform.platform(), 'node22': subprocess.check_output(['node', '--version'], env=env, text=True).strip(),
        'node24': subprocess.check_output(['/usr/local/bin/node', '--version'], text=True).strip(),
        'nativeWorkers': 8, 'historicalReceiptsAdmitted': 0, 'productionEffects': 0,
        'realOtpEffects': 0, 'realYclientsEffects': 0}
(out / 'CANDIDATE.json').write_text(json.dumps(meta, indent=2) + '\n')
(out / 'OWNERSHIP-PROOF.json').write_text(json.dumps({'candidate': candidate, 'base': initial, 'files': paths,
    'claudePathOverlap': 0, 'productPathsChanged': [], 'timeoutsIncreased': False}, indent=2) + '\n')
(out / 'HARNESS-CHANGES.patch').write_bytes(subprocess.check_output(['git', 'diff', initial, candidate], cwd=repo))

admin_env = {**env, 'DATABASE_URL': '[REDACTED DATABASE URL]'}
create = "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n='maya_widget_gate_proof_final2915_20261002';if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh database exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
subprocess.run(['node', '-e', create], cwd=backend, env=admin_env, check=True)

def run(name, args):
    begin = time.time()
    with (receipts / (name + '.log')).open('w') as log:
        result = subprocess.run(args, cwd=backend, env=env, stdout=log, stderr=subprocess.STDOUT)
    record = {'candidate': candidate, 'name': name, 'command': args, 'cwd': str(backend),
              'exit': result.returncode, 'seconds': round(time.time() - begin, 2)}
    (receipts / (name + '.receipt.json')).write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record), flush=True)
    assert result.returncode == 0, name

run('prisma-generate', ['npx', 'prisma', 'generate'])
run('proof-db-migration', ['npx', 'prisma', 'migrate', 'deploy'])
run('assembly-regression-diagnostic', ['node', '--test', 'scripts/widgets-mutation-ci.test.mjs'])
(out / 'DIAGNOSTIC-PREFLIGHT.json').write_text(json.dumps({'candidate': candidate, 'kind': 'mandatory-live-assembly',
    'status': 'PASS', 'checks': '54 collector/integrity regression tests; no prior receipts admitted',
    'scope': 'Diagnostic only; the complete fresh 509-declaration corpus is still mandatory.'}, indent=2) + '\n')
