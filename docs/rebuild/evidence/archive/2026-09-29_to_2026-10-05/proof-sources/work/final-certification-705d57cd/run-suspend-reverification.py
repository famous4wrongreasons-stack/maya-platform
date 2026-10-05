from pathlib import Path
import concurrent.futures
import datetime
import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
backend = repo / 'maya-saas-backend'
work = root / 'work/final-certification-705d57cd'
out = root / 'outputs/final-certification-705d57cd'
receipts = out / 'receipts'
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
utcnow = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()

def clean_candidate():
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()

clean_candidate()
native = read(receipts / 'complete-native.orchestration.json')
assert native['candidate'] == candidate and native['exit'] == 0
assert (work / 'stop-report-watcher').exists()
plan = read(receipts / 'mutation-plan.json')
assert plan['candidate'] == candidate and len(plan['jobs']) == 65
assert len(list((receipts / 'mutation-parts').glob('*.json'))) == 65
subprocess.run(['python3', str(work / 'capture-host-suspend.py')], cwd=root, check=True)
observation = read(out / 'HOST-SUSPEND-OBSERVATION.json')
assert observation['nativeOriginalExecutionComplete'] and observation['nativeOriginalExecutionExit'] == 0
assert observation['suspensionWindows'] and all(w['fullWakeObserved'] for w in observation['suspensionWindows'])
required = {job['slot'] for job in observation['completedOverlappingJobs']}
jobs = [job for job in plan['jobs'] if job['slot'] in required]
assert jobs and len(jobs) == len(required)

stage = receipts / 'suspend-reverification'
quarantine = receipts / 'suspend-invalidated'
assert not stage.exists() and not quarantine.exists(), 'Preserve prior attempts; no silent overwrite/retry'
for directory in [stage, stage / 'parts', stage / 'diagnostics', stage / 'resources', quarantine]:
    directory.mkdir()
originals = []
all_original_part_hashes = {}
for job in plan['jobs']:
    slot = job['slot']
    part = receipts / 'mutation-parts' / ('widgets-mutation-part-' + slot + '.json')
    receipt = receipts / ('mutation-' + slot + '.receipt.json')
    data, execution = read(part), read(receipt)
    assert data['source_head'] == execution['candidate'] == candidate
    assert execution['exit'] == 0 and not data['baseline_red'] and data['mismatches'] == 0
    all_original_part_hashes[slot] = sha(part)
    if slot in required:
        retained = quarantine / slot
        retained.mkdir()
        files = []
        for source in [part, receipt, receipts / ('mutation-' + slot + '.log')]:
            target = retained / source.name
            shutil.copy2(source, target)
            files.append({'original': str(source.relative_to(out)), 'retained': str(target.relative_to(out)),
                          'sha256': sha(source)})
        originals.append({'slot': slot, 'files': files})
cohort = {'candidate': candidate, 'capturedAt': utcnow(), 'requiredSlots': sorted(required),
          'reason': 'Every complete part overlapping the observed clamshell/maintenance suspension window is invalidated for this admission, whether or not the runner reported a mismatch.',
          'observation': observation, 'originalParts': originals,
          'allOriginalPartHashes': all_original_part_hashes}
(out / 'SUSPEND-ORIGINAL-COHORT.json').write_text(json.dumps(cohort, indent=2) + '\n')

node = '/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin'
env = {k: v for k, v in os.environ.items() if k in ['HOME', 'TMPDIR', 'USER', 'LANG']}
env['PATH'] = node + ':/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/wave1-closure-20260919/python-venv/bin:/opt/homebrew/bin:/usr/bin:/bin'
env['DATABASE_URL'] = '[REDACTED DATABASE URL]'
env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'", (backend / 'test/widgets-live/support/environment.ts').read_text())))
todo = queue.Queue()
for job in jobs:
    todo.put(job)
stopped = threading.Event()
sources = {}
pids = {}
lock = threading.Lock()
executions = []

def worker(index):
    wr = work / ('suspend-reverification-worker-' + str(index))
    assert not wr.exists()
    wr.mkdir()
    wb = wr / 'maya-saas-backend'
    shutil.copytree(backend, wb, ignore=shutil.ignore_patterns('node_modules', 'dist', 'coverage', '.git', '.env*', '*.tsbuildinfo'))
    (wb / 'node_modules').symlink_to(backend / 'node_modules', target_is_directory=True)
    for path in repo.iterdir():
        if path.name in ['maya-chat-shell', 'maya-carrier-react']:
            shutil.copytree(path, wr / path.name, ignore=shutil.ignore_patterns('node_modules', '.env*'))
            if (path / 'node_modules').exists():
                (wr / path.name / 'node_modules').symlink_to(path / 'node_modules', target_is_directory=True)
        elif path.name != 'maya-saas-backend':
            (wr / path.name).symlink_to(path, target_is_directory=path.is_dir())
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=wr, text=True).strip() == candidate
    db = 'maya_widget_gate_proof_final705dsuspend_worker' + str(index)
    db_create = "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const n=process.argv[1];if(!/^maya_widget_gate_proof_final705dsuspend_worker[1-8]$/.test(n))throw Error('guard');if((await c.query('select 1 from pg_database where datname=$1',[n])).rowCount)throw Error('fresh DB already exists');await c.query('CREATE DATABASE '+n);await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})"
    subprocess.run(['node', '-e', db_create, db], cwd=backend, env=env, check=True)
    ee = {**env, 'DATABASE_URL': '[REDACTED DATABASE URL]' + db}
    with (stage / ('worker-' + str(index) + '-migration.log')).open('w') as log:
        subprocess.run(['npx', 'prisma', 'migrate', 'deploy'], cwd=wb, env=ee, stdout=log, stderr=subprocess.STDOUT, check=True)
    with lock:
        sources[index] = wb
    while not stopped.is_set():
        try:
            job = todo.get_nowait()
        except queue.Empty:
            return
        slot = job['slot']
        args = ['node', 'scripts/widgets-mutation-battery.mjs', '--gate', job['gate']]
        if job['partition']:
            args += ['--partition', job['partition']]
        args += ['--out', str(stage / 'parts' / ('widgets-mutation-part-' + slot + '.json'))]
        began, tick = utcnow(), time.time()
        print(json.dumps({'started': slot, 'worker': index, 'candidate': candidate}), flush=True)
        with (stage / ('mutation-' + slot + '.log')).open('w') as log:
            process = subprocess.Popen(args, cwd=wb, env=ee, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            with lock:
                pids[index] = process.pid
            (work / ('suspend-worker-' + str(index) + '-pid')).write_text(str(process.pid))
            code = process.wait()
        record = {'candidate': candidate, 'name': 'mutation-' + slot, 'command': args, 'cwd': str(wb),
                  'exit': code, 'seconds': round(time.time() - tick, 2),
                  'startedAt': began, 'completedAt': utcnow(), 'pid': process.pid,
                  'campaignPhase': 'Unrestricted whole-part reexecution after documented host suspension'}
        (stage / ('mutation-' + slot + '.receipt.json')).write_text(json.dumps(record, indent=2) + '\n')
        with lock:
            executions.append(record)
            pids.pop(index, None)
        print(json.dumps(record), flush=True)
        if code:
            stopped.set()
            return

seen = {}
def capture_reports():
    with lock:
        current = list(sources.items())
    for label, source in current:
        key = hashlib.sha1(str(source).encode()).hexdigest()[:10]
        for step in ['live', 'unit']:
            path = Path(tempfile.gettempdir()) / ('widgets-mutation-' + step + '-' + key + '.json')
            try:
                stat = path.stat()
                signature = (stat.st_mtime_ns, stat.st_size)
                if seen.get(str(path)) == signature:
                    continue
                raw = path.read_bytes()
                data = json.loads(raw)
            except (FileNotFoundError, PermissionError, json.JSONDecodeError):
                continue
            seen[str(path)] = signature
            failures = []
            for suite in data.get('testResults', []):
                for assertion in suite.get('assertionResults', []):
                    if assertion.get('status') == 'failed':
                        failures.append({k: assertion.get(k) for k in ['fullName', 'title', 'failureMessages']})
                if suite.get('status') == 'failed' and not suite.get('assertionResults'):
                    failures.append({'suite': suite.get('name'), 'message': suite.get('message')})
            record = {'capturedAt': utcnow(), 'worker': label, 'step': step, 'reportSha256': hashlib.sha256(raw).hexdigest(),
                      'source': str(source), 'startTime': data.get('startTime'), 'success': data.get('success'),
                      'passed': data.get('numPassedTests'), 'failed': data.get('numFailedTests'), 'failures': failures}
            name = str(label) + '-' + step + '-' + str(data.get('startTime', stat.st_mtime_ns)) + '.json'
            (stage / 'diagnostics' / name).write_text(json.dumps(record, indent=2) + '\n')

def capture_resources():
    with lock:
        current_pids = set(pids.values())
    rows = []
    for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,pgid=,%cpu=,rss=,etime=,command='], text=True).splitlines():
        fields = line.strip().split(None, 6)
        if len(fields) == 7:
            rows.append({'pid': int(fields[0]), 'ppid': int(fields[1]), 'pgid': int(fields[2]),
                         'cpu': float(fields[3]), 'rssKiB': int(fields[4]), 'elapsed': fields[5], 'command': fields[6]})
    owners = [row for row in rows if row['pid'] in current_pids and
              'scripts/widgets-mutation-battery.mjs' in row['command'] and str(stage / 'parts') in row['command']]
    groups = {row['pgid'] for row in owners}
    owned = [row for row in rows if row['pgid'] in groups]
    sockets = subprocess.run(['/usr/sbin/lsof', '-nP', '-a', '-p', ','.join(str(row['pid']) for row in owned), '-iTCP'],
                             text=True, capture_output=True) if owned else None
    data = {'candidate': candidate, 'capturedAt': utcnow(), 'ownedGroups': len(groups), 'processes': owned,
            'sockets': sockets.stdout if sockets else '', 'cpuPercent': round(sum(row['cpu'] for row in owned), 1),
            'rssGiB': round(sum(row['rssKiB'] for row in owned) / 1024**2, 2)}
    name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json'
    (stage / 'resources' / name).write_text(json.dumps(data, indent=2) + '\n')

print(json.dumps({'candidate': candidate, 'requiredSlots': sorted(required), 'workers': min(8, len(jobs)),
                  'restrictions': 'none; complete canonical parts and default steps'}), flush=True)
last_progress = last_resource = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(jobs))) as pool:
    futures = [pool.submit(worker, index) for index in range(1, min(8, len(jobs)) + 1)]
    while not all(future.done() for future in futures):
        capture_reports()
        now = time.monotonic()
        if now - last_progress >= 50:
            with lock:
                done = len(executions)
                red = [record['name'] for record in executions if record['exit']]
            print(json.dumps({'phase': 'suspend whole-part reexecution', 'completed': done, 'total': len(jobs),
                              'rawTestRuns': len(list((stage / 'diagnostics').glob('*.json'))), 'failedJobs': red}), flush=True)
            last_progress = now
        if now - last_resource >= 300:
            capture_resources()
            last_resource = now
        time.sleep(0.2)
    capture_reports()
    for future in futures:
        future.result()
assert not stopped.is_set() and len(executions) == len(jobs)
clean_candidate()
subprocess.run(['python3', str(work / 'capture-host-suspend.py')], cwd=root, check=True)
final_observation = read(out / 'HOST-SUSPEND-OBSERVATION.json')
for record in executions:
    begin, end = datetime.datetime.fromisoformat(record['startedAt']), datetime.datetime.fromisoformat(record['completedAt'])
    assert not any(begin <= datetime.datetime.fromisoformat(window['to']) and
                   end >= datetime.datetime.fromisoformat(window['from'])
                   for window in final_observation['suspensionWindows']), 'Reexecution also overlapped sleep; no promotion'
transport_failures = []
for path in (stage / 'diagnostics').glob('*.json'):
    data = read(path)
    for failure in data['failures']:
        text = json.dumps(failure)
        if re.search(r'Exceeded timeout|socket hang up|ECONNRESET|EADDRINUSE', text, re.I):
            transport_failures.append({'report': path.name, 'failure': failure})
assert not transport_failures, 'Inspect exact timeout/transport failure; do not promote'

admitted = []
for job in jobs:
    slot = job['slot']
    name = 'widgets-mutation-part-' + slot + '.json'
    original = read(quarantine / slot / name)
    replacement = read(stage / 'parts' / name)
    assert replacement['source_head'] == candidate
    assert replacement['status'] in ['AS-DECLARED', 'PARTITION-AS-DECLARED']
    assert not replacement['baseline_red'] and replacement['mismatches'] == 0
    assert [(m['id'], m['status']) for m in replacement['mutants']] == [(m['id'], m['status']) for m in original['mutants']]
for slot, digest in all_original_part_hashes.items():
    assert sha(receipts / 'mutation-parts' / ('widgets-mutation-part-' + slot + '.json')) == digest
for job in jobs:
    slot = job['slot']
    name = 'widgets-mutation-part-' + slot + '.json'
    shutil.copy2(stage / 'parts' / name, receipts / 'mutation-parts' / name)
    for suffix in ['.receipt.json', '.log']:
        shutil.copy2(stage / ('mutation-' + slot + suffix), receipts / ('mutation-' + slot + suffix))
    target = receipts / 'mutation-parts' / name
    admitted.append({'slot': slot, 'path': str(target.relative_to(out)), 'sha256': sha(target)})
result = {'candidate': candidate, 'status': 'PASS', 'completedAt': utcnow(),
          'restrictions': 'none; complete canonical parts and default steps',
          'requiredSlots': sorted(required), 'reexecutedSlots': sorted(required), 'admittedParts': admitted,
          'originalCohort': 'SUSPEND-ORIGINAL-COHORT.json', 'originalCohortSha256': sha(out / 'SUSPEND-ORIGINAL-COHORT.json'),
          'invalidatedOriginalsRetained': originals, 'executions': executions,
          'timeoutsChanged': False, 'candidateChanged': False, 'fullSuitesAndControls': True,
          'newTransportFailures': [], 'reexecutionOverlappedSleep': False,
          'admissionScope': 'Complete fresh certification on this single unchanged candidate. Only interrupted whole parts were replaced by full current reexecutions; no historical/restricted receipts admitted.'}
(out / 'SUSPEND-REEXECUTION.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'suspendReexecution': 'PASS', 'completePartsReexecuted': len(jobs)}), flush=True)
