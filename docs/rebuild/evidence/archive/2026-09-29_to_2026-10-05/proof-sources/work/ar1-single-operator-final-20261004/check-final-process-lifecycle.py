from pathlib import Path
import datetime
import json
import os
import subprocess

root = Path.cwd()
work = root / 'work/ar1-single-operator-final-20261004'
out = root / 'outputs/ar1-single-operator-final-20261004'
repo = root / 'work/maya-controlled-integration'
candidate = 'dcf51e1e8b3e0c5e118bf0f111cbbc6bfd3287e4'
read = lambda p: json.loads(p.read_text())
complete = read(out / 'COMPLETE-MUTATIONS.json')
native = read(out / 'receipts/complete-native.orchestration.json')
assert complete['candidate'] == native['candidate'] == candidate
assert complete['status'] == 'PASS' and native['exit'] == 0

# Match unique current-run paths, not historical PIDs which may have been reused.
prefixes = {str(work.resolve()), str(repo.resolve()), str((root/'work/release-packaging-recovery-20261003').resolve())}
parts = list((out / 'receipts/mutation-parts').glob('*.json'))
assert len(parts) == 68
# Interrupted originals remain part of the lifecycle audit even though their
# evidence is replaced. Their temporary mirrors may differ from the retry's.
retained_parts = list((out / 'receipts/suspend-invalidated').glob('*/widgets-mutation-part-*.json'))
for p in parts + retained_parts:
    data = read(p)
    assert data['source_head'] == candidate
    mirror = Path(data['mirror']).resolve()
    assert mirror.name.startswith('widgets-mutation-mirror-')
    prefixes.add(str(mirror))

rows = []
for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,pgid=,command='], text=True).splitlines():
    fields = line.strip().split(None, 3)
    if len(fields) == 4:
        rows.append({'pid': int(fields[0]), 'ppid': int(fields[1]),
                     'pgid': int(fields[2]), 'command': fields[3]})
by_pid = {row['pid']: row for row in rows}
ancestors = set()
pid = os.getpid()
while pid and pid not in ancestors:
    ancestors.add(pid)
    pid = by_pid.get(pid, {}).get('ppid', 0)
possible = [row for row in rows if row['pid'] not in ancestors and
            any(token in row['command'].lower() for token in ['node', 'python', 'jest', 'npm', 'widgets-mutation'])]
cwd_by_pid = {}
if possible:
    scan = subprocess.run(['/usr/sbin/lsof', '-a', '-p', ','.join(str(row['pid']) for row in possible),
                           '-d', 'cwd', '-Fpn'], text=True, capture_output=True)
    current = None
    for line in scan.stdout.splitlines():
        if line.startswith('p'):
            current = int(line[1:])
        elif line.startswith('n') and current is not None:
            cwd_by_pid[current] = str(Path(line[1:]).resolve())
owned = []
for row in possible:
    cwd = cwd_by_pid.get(row['pid'], '')
    command = row['command']
    matches = [prefix for prefix in prefixes if prefix in command
               or prefix.replace('/private/var/', '/var/') in command
               or cwd == prefix or cwd.startswith(prefix + '/')]
    if matches:
        owned.append({**row, 'cwd': cwd, 'ownershipMatches': matches})

node_dir = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node_dir + ':/usr/bin:/bin'
env['DATABASE_URL'] = '[REDACTED DATABASE URL]'
script = """
const {Client}=require('pg');
(async()=>{
  const c=new Client({connectionString:process.env.DATABASE_URL});
  await c.connect();
  const result=await c.query(`select pid,datname,state,backend_start,xact_start,client_addr,client_port
    from pg_stat_activity where pid<>pg_backend_pid() and backend_type='client backend'
    and (datname like 'maya_widget_gate_proof_singleopcert%' or datname in ('maya_events_proof_singleopcert_20261004','maya_gates_smoke_singleopcert_20261004')) order by datname,pid`);
  console.log(JSON.stringify(result.rows));
  await c.end();
})().catch(error=>{console.error(error.message);process.exit(1)});
"""
sessions = json.loads(subprocess.check_output(['node', '-e', script], cwd=repo / 'maya-saas-backend', env=env, text=True))
listener = subprocess.run(['/usr/sbin/lsof', '-nP', '-iTCP:55729', '-sTCP:LISTEN'], text=True, capture_output=True)
assert listener.returncode == 0, 'Dedicated proof PostgreSQL listener unexpectedly absent'
result = {
    'candidate': candidate,
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'PASS' if not owned and not sessions else 'REVIEW REQUIRED',
    'currentRunPathPrefixes': sorted(prefixes),
    'remainingOwnedProcesses': owned,
    'remainingCurrentRunProofDbSessions': sessions,
    'dedicatedProofPostgresListener': listener.stdout,
    'retainedFixtureBoundary': 'Dedicated PostgreSQL proof server is intentionally retained. It is not a leaked test listener.',
    'pidReusePolicy': 'No historical PID alone is accepted as ownership; current command/CWD must match a unique current-run path.',
    'otherServicesChanged': False,
    'processesTerminatedByThisCheck': 0,
}
(out / 'FINAL-PROCESS-LIFECYCLE.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'processLifecycle': result['status'],
                  'remainingOwnedProcesses': len(owned), 'remainingProofDbSessions': len(sessions)}))
assert not owned and not sessions, 'Inspect exact owned residue before claiming clean teardown; nothing was killed'
