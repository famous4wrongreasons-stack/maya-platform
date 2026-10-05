from pathlib import Path
import datetime, hashlib, json, subprocess

root = Path.cwd()
work = root / 'work/final-certification-2915ab8e'
out = root / 'outputs/final-certification-2915ab8e'
candidate = '2915ab8e7c089e2c1f39848cb795940e5267c119'
native = json.loads((out / 'receipts/complete-native.orchestration.json').read_text())
assert native['candidate'] == candidate and native['exit'] == 0
subprocess.run(['python3', str(work / 'capture-host-suspend.py')], cwd=root, check=True)
path = out / 'HOST-SUSPEND-OBSERVATION.json'
observation = json.loads(path.read_text())
assert observation['candidate'] == candidate
reexecution = None
if observation['suspensionWindows']:
    reexecution = json.loads((out / 'SUSPEND-REEXECUTION.json').read_text())
    cohort_path = out / reexecution['originalCohort']
    assert hashlib.sha256(cohort_path.read_bytes()).hexdigest() == reexecution['originalCohortSha256']
    cohort = json.loads(cohort_path.read_text())
    assert cohort['candidate'] == reexecution['candidate'] == candidate
    assert reexecution['status'] == 'PASS' and reexecution['fullSuitesAndControls']
    assert reexecution['restrictions'] == 'none; complete canonical parts and default steps'
    assert not reexecution['candidateChanged'] and not reexecution['timeoutsChanged']
    assert not reexecution['newTransportFailures'] and not reexecution['reexecutionOverlappedSleep']
    expected = {'WR-part-3-of-4', 'WR-part-4-of-4'}
    assert set(cohort['requiredSlots']) == set(reexecution['requiredSlots']) == set(reexecution['reexecutedSlots']) == expected
    assert cohort['observation']['suspensionWindows'] == observation['suspensionWindows']
    assert all(w['fullWakeObserved'] for w in observation['suspensionWindows'])
    assert not observation['completedOverlappingJobs'], 'Every currently admitted job must avoid the interruption'
    admitted = {x['slot']: x for x in reexecution['admittedParts']}
    assert set(admitted) == expected
    for slot, original_hash in cohort['allOriginalPartHashes'].items():
        path = out / 'receipts/mutation-parts' / ('widgets-mutation-part-' + slot + '.json')
        assert hashlib.sha256(path.read_bytes()).hexdigest() == (admitted[slot]['sha256'] if slot in expected else original_hash)
    for original in cohort['originalParts']:
        for item in original['files']:
            assert hashlib.sha256((out / item['retained']).read_bytes()).hexdigest() == item['sha256']
    for execution in reexecution['executions']:
        assert execution['candidate'] == candidate and execution['exit'] == 0 and execution['seconds'] < 10800
        begin = datetime.datetime.fromisoformat(execution['startedAt'])
        end = datetime.datetime.fromisoformat(execution['completedAt'])
        assert not any(begin <= datetime.datetime.fromisoformat(w['to']) and end >= datetime.datetime.fromisoformat(w['from']) for w in observation['suspensionWindows'])
    # Ordinary component suites completed before this late native-corpus interruption.
    first_sleep = datetime.datetime.fromisoformat(observation['suspensionWindows'][0]['from']).timestamp()
    for path in (out / 'receipts').glob('*.receipt.json'):
        if path.name.startswith('mutation-'):
            continue
        assert path.stat().st_mtime < first_sleep, path
result = {'candidate': candidate, 'status': 'PASS',
          'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'campaignStart': json.loads((out / 'CANDIDATE.json').read_text())['recordedAt'],
          'suspensionWindows': observation['suspensionWindows'], 'reexecutionRequired': reexecution is not None,
          'wholePartsReexecuted': len(reexecution['requiredSlots']) if reexecution else 0,
          'reexecutionReceiptSha256': hashlib.sha256((out / 'SUSPEND-REEXECUTION.json').read_bytes()).hexdigest() if reexecution else None,
          'observationSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
          'scope': 'Current campaign only. Interrupted originals retained; exact full replacements verified. No sleep result is waived or imported from another candidate.',
          'powerSettingsChanged': False, 'timeoutsChanged': False}
(out / 'HOST-ENVIRONMENT-CHECK.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
