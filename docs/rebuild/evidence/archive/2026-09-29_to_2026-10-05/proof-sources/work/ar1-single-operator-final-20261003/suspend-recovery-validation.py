"""Validate whole-part recovery; a green sleep-overlapped execution is inadmissible."""
from pathlib import Path
import datetime
import hashlib
import json
import re


def instant(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def periods(events, now):
    result = []
    start = None
    for event in sorted(events, key=lambda item: item['utc']):
        stamp = instant(event['utc'])
        if event['event'] == 'Sleep' and start is None:
            start = stamp
        elif event['event'] == 'Wake' and start is not None:
            result.append((start, stamp))
            start = None
    # DarkWake is not a full wake. An unfinished sleep interval stays excluded.
    if start is not None:
        result.append((start, now))
    return result


def require_awake(start, finish, intervals):
    assert start <= finish
    assert not any(start < end and finish > begin for begin, end in intervals), \
        'Execution overlaps system sleep; green assertions do not make it admissible'


def require_binding(root, binding):
    assert digest(root / binding['path']) == binding['sha256'], binding['path']


def part_for_execution(records, start, finish):
    # The native runner reuses one deterministic mirror path per worker.
    # Path alone is insufficient: bind a child to exactly one part interval.
    matches = [record for record in records
               if instant(record['startedAt']) <= start <= finish <= instant(record['finishedAt'])]
    assert len(matches) <= 1, 'Ambiguous native-part execution interval'
    return matches[0] if matches else None


def mirror_for_cwd(cwd):
    # The Python fixture directory itself is a symlink into the source tree.
    # Preserve its declared mirror parent before resolving /var -> /private/var.
    return str(Path(cwd).parent.resolve())


def require_l27_kill(row, mutant, log, baseline):
    assert row['name'] == mutant['id']
    assert row['candidate'] == baseline['candidate']
    assert row['command'] == baseline['command'] and row['cwd'] == baseline['cwd']
    assert baseline['exit'] == 0 and row['exit'] == mutant['exit'] == 1
    assert mutant['status'] == 'KILLED'
    failed = re.findall(r'^not ok \d+ - (.+)$', log, re.M)
    assert failed == mutant['actualFailedTests']
    named = [name for name in failed if name.startswith(mutant['namedKillerPrefix'])]
    assert named and named == mutant['namedKillers']


def l27_command_expectations(receipts, candidate):
    read = lambda path: json.loads(path.read_text())
    proof = read(receipts / 'l27-runtime-mutations.json')
    baseline = read(receipts / 'l27-mutations-baseline.receipt.json')
    assert proof['candidate'] == baseline['candidate'] == candidate
    assert proof['contract'] == 'maya.runtime-l27-counterfactuals/1'
    assert proof['status'] == 'PASS' and proof['baseline'] == 'GREEN'
    assert proof['restrictions'] == 'none: full runtime test suite per baseline and mutant'
    assert proof['mutants'] == len(proof['mutations']) == 8
    assert {row['id'] for row in proof['mutations']} == {f'L27-M{i:02}' for i in range(1, 9)}
    expected = {}
    for mutant in proof['mutations']:
        mid = mutant['id']
        row = read(receipts / (mid + '.receipt.json'))
        require_l27_kill(row, mutant, (receipts / (mid + '.log')).read_text(), baseline)
        expected[mid + '.receipt.json'] = 1
    return expected


def require_command_result(row, filename, expected_negative):
    # Nonzero is admissible only for a specific named counterfactual whose
    # green baseline, full command, raw log and declared killer were checked.
    assert row['exit'] == expected_negative.get(filename, 0), filename


def validate(root, events, now):
    out = root / 'outputs/ar1-single-operator-final-20261003'
    receipts = out / 'receipts'
    read = lambda path: json.loads(path.read_text())
    plan = read(out / 'SUSPEND-RECOVERY-PLAN.json')
    execution = read(out / 'SUSPEND-RECOVERY-EXECUTION.json')
    candidate = plan['candidate']
    assert execution['candidate'] == candidate and execution['status'] == 'PASS'
    validator_test = read(out / 'SUSPEND-RECOVERY-VALIDATION-TEST.json')
    assert validator_test['candidate'] == candidate and validator_test['status'] == 'PASS'
    assert len(validator_test['cases']) == 16 and validator_test['sourceSha256'] == digest(Path(__file__))
    assert plan['maxWorkers'] == 6 and plan['testRestrictions'] is None
    assert plan['jobTimeoutMinutes'] == 180 and plan['r06TimeoutMs'] == 20000
    expected_affected = {'P-ledger', 'P-mt3', 'P-pairing', 'P-principal', 'P-render', 'P-rt6'}
    assert set(plan['sleepAffectedSlots']) == expected_affected
    assert plan['interruptedPostWakeSlots'] == ['P-seal']
    assert set(plan['neverStartedSlots']) == {'T-tables', 'WF', *['WR-part-' + str(i) + '-of-4' for i in range(1, 5)]}
    assert len(plan['retainedWholeParts']) == 55 and len(plan['retryJobs']) == 13
    intervals = periods(events, now)
    assert any(a == instant(plan['firstSleep']) and b == instant(plan['fullWake']) for a, b in intervals)
    for row in plan['retainedWholeParts']:
        for binding in row['files']:
            require_binding(out, binding)
    for binding in plan['originalExecutionSources'] + execution['sources']:
        require_binding(root, binding)
    for row in plan['invalidatedArtifacts']:
        for binding in row['files']:
            require_binding(out, binding)
    for binding in plan['originalRawR06Traces']:
        require_binding(out, binding)

    canonical_jobs = read(receipts / 'mutation-plan.json')['jobs']
    assert len(canonical_jobs) == 68
    records = []
    mirrors = {}
    expected_unit_slots = set()
    retried = {job['slot'] for job in plan['retryJobs']}
    assert {job['slot'] for job in execution['jobs']} == retried
    for job in canonical_jobs:
        path = receipts / 'mutation-parts' / ('widgets-mutation-part-' + job['slot'] + '.json')
        part = read(path)
        receipt = read(receipts / ('mutation-' + job['slot'] + '.receipt.json'))
        assert part['source_head'] == receipt['candidate'] == candidate
        assert part['status'] in ['AS-DECLARED', 'PARTITION-AS-DECLARED']
        assert not part['baseline_red'] and part['mismatches'] == 0
        assert part['restrictions'] == {'live_tests': None, 'live_filter': None, 'unit_tests': None}
        if any('unit' in control['steps'] for control in part['baseline_controls'].values()):
            expected_unit_slots.add(job['slot'])
        assert receipt['exit'] == 0 and receipt['seconds'] < 10800
        start, finish = instant(part['startedAt']), instant(part['finishedAt'])
        require_awake(start, finish, intervals)
        if job['slot'] in retried:
            assert start >= instant(execution['startedAt']) > instant(plan['fullWake'])
        else:
            assert finish < instant(plan['firstSleep'])
        mirror = str(Path(part['mirror']).resolve())
        record = {'slot': job['slot'], 'path': str(path.relative_to(out)),
                  'sha256': digest(path), 'startedAt': part['startedAt'], 'finishedAt': part['finishedAt']}
        records.append(record)
        mirrors.setdefault(mirror, []).append(record)
    assert len(records) == 68

    # All individual command receipts used by this current programme must also
    # lie outside suspend periods. Archived/invalidated diagnostics are not read.
    expected_negative = l27_command_expectations(receipts, candidate)
    command_receipts = []
    for path in sorted(receipts.glob('*.receipt.json')):
        row = read(path)
        if row.get('candidate') != candidate or 'seconds' not in row:
            continue
        require_command_result(row, path.name, expected_negative)
        finish = datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc)
        start = finish - datetime.timedelta(seconds=row['seconds'])
        require_awake(start, finish, intervals)
        command_receipts.append({'path': str(path.relative_to(out)), 'sha256': digest(path),
                                 'expectedExit': expected_negative.get(path.name, 0)})

    trace_sources = sorted(receipts.glob('r06-native-worker-*.jsonl')) + sorted(receipts.glob('r06-recovery-worker-*.jsonl'))
    assert len(trace_sources) == 12
    traces = []
    excluded = []
    covered_slots = set()
    for path in trace_sources:
        worker = int(path.stem.split('-')[-1])
        is_original = path.name.startswith('r06-native-')
        lines = path.read_text().splitlines()
        admitted = []
        excluded_lines = []
        for line_number, raw in enumerate(lines, 1):
            row = json.loads(raw)
            mirror = mirror_for_cwd(row['cwd'])
            start = datetime.datetime.fromtimestamp(row['started'] / 1000, datetime.timezone.utc)
            finish = start + datetime.timedelta(milliseconds=row['elapsedMs'])
            record = part_for_execution(mirrors.get(mirror, []), start, finish)
            if record is None:
                matching = [window for window in plan['invalidatedRunWindows']
                            if window['worker'] == worker and instant(window['startedAt']) <= start <= instant(window['finishedAt'])]
                assert is_original and len(matching) == 1, (path.name, line_number, 'Unexplained excluded trace')
                excluded_lines.append(line_number)
                excluded.append({'path': str(path.relative_to(out)), 'line': line_number,
                                 'slot': matching[0]['slot'], 'reason': 'Entire original part invalidated or interrupted; fresh whole part required'})
                continue
            require_awake(start, finish, intervals)
            assert instant(record['startedAt']) <= start <= finish <= instant(record['finishedAt'])
            assert row['status'] == 0 and row['signal'] is None and row['error'] is None
            assert row['timeout'] == 20000
            admitted.append(line_number)
            covered_slots.add(record['slot'])
        assert admitted
        traces.append({'path': str(path.relative_to(out)), 'sha256': digest(path),
                       'rawExecutions': len(lines), 'admittedExecutions': len(admitted),
                       'admittedLines': admitted, 'excludedLines': excluded_lines})
    assert expected_unit_slots <= covered_slots, ('Missing R06 unit coverage', expected_unit_slots - covered_slots)
    return {'candidate': candidate, 'status': 'PASS', 'checkedAt': now.isoformat(),
            'admittedSleepOverlaps': 0, 'admittedPartitions': 68, 'retainedWholePartitions': 55,
            'wholePartitionsReexecuted': plan['sleepAffectedSlots'] + plan['interruptedPostWakeSlots'],
            'newWholePartitions': plan['neverStartedSlots'], 'admittedParts': records,
            'admittedCommandReceipts': command_receipts, 'admittedRawR06Traces': traces,
            'unitPartsRequiringR06': sorted(expected_unit_slots), 'r06CoveredParts': sorted(covered_slots),
            'excludedOriginalTraces': excluded, 'historicalCandidateReceiptsAdmitted': 0,
            'timeoutsChanged': False, 'unrestrictedTests': True, 'productionEffects': 0}
