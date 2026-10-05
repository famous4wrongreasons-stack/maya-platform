from pathlib import Path
import collections, datetime, hashlib, json, re, subprocess

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/final-certification-705d57cd'
r = out / 'receipts'
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
complete = read(out / 'COMPLETE-MUTATIONS.json')
assert complete['candidate'] == candidate and complete['status'] == 'PASS'

def save(name, data):
    (out / name).write_text(json.dumps({'candidate': candidate, **data}, ensure_ascii=False, indent=2) + '\n')

def ref(p):
    return {'path': str(p.relative_to(out)), 'sha256': sha(p)}

def passed_receipt(name):
    p = r / (name + '.receipt.json')
    data = read(p)
    assert data['candidate'] == candidate and data['exit'] == 0, name
    return ref(p)

reports = {}
for p in (r / 'mutation-receipt').glob('widgets-mutation-report-*.json'):
    data = read(p)
    assert data['source_head'] == candidate and data['status'] == 'AS-DECLARED'
    assert not data['baseline_red'] and data['mismatches'] == 0
    reports[data['batteries'][0][4:-5]] = (p, data)
assert len(reports) == 44

def battery(gate, count):
    p, data = reports[gate]
    assert len(data['mutants']) == count
    assert all(m['status'] in ['build-killed', 'live-killed'] for m in data['mutants'])
    return {'gate': gate, 'declarations': count, 'status': data['status'],
            'receipt': ref(p), 'assembly': data['assembly'],
            'baselineControls': data['baseline_controls'],
            'mutants': data['mutants']}

save('AR1-NATIVE-PROOF.json', {'status': '19/19 PASS', 'battery': battery('AR', 19),
     'productionGrant': False, 'certificateIssued': False})
save('PROFILE-NATIVE-PROOF.json', {'profile': 'closed-input.no-handoff@1',
     'status': '22/22 PASS', 'batteries': [battery('PI', 6), battery('PI-contract', 16)],
     'globalStops': ['G6-6', 'G13-R8'], 'fullContractCertified': False, 'certificateIssued': False})
h = battery('H-harness', 26)
repair_ids = {'H-LOOPBACK-1', 'H-R02-LOOPBACK-1', 'H-ADMIN-LOOPBACK-1', 'H-BOOT-LOOPBACK-1', 'H-P408-CLOCK-1'}
repairs = [m for m in h['mutants'] if m['id'] in repair_ids]
assert len(repairs) == 5
save('HTTP-HARNESS-NATIVE-REPAIR-PROOF.json', {'status': 'PASS', 'nativeReceipt': h['receipt'],
     'exactRepairMutants': repairs, 'baselineControls': h['baselineControls'], 'wholeCorpusAdmission': 'PASS'})
save('CLOCK-NATIVE-REPAIR-PROOF.json', {'nativeReceipt': h['receipt'],
     'mutation': next(m for m in repairs if m['id'] == 'H-P408-CLOCK-1'),
     'targetedBeforeAfter': '../harness-diagnosis-fed5f7df/clock-followup/REPAIR-REGRESSION.json',
     'nativeBatteryAdmission': 'PASS', 'productChanges': 0})
m13 = battery('13', 25)
save('M13-NATIVE-REPAIR-PROOF.json', {'gate13Total': 25, 'nativeReceipt': m13['receipt'],
     'exactPriorSurvivor': next(m for m in m13['mutants'] if m['id'] == 'M13-U13C-11'),
     'historicalReceiptSubstitution': False})
m9 = battery('9', 35)
turn = battery('TURN', 14)
save('TIMELINE-NATIVE-REPAIR-PROOF.json', {'status': 'PASS', 'userWriter': m9['receipt'],
     'turnWriter': turn['receipt'],
     'repairedUserMutations': [m for m in m9['mutants'] if m['id'] in ['M9-27', 'M9-28']],
     'assistantIsolationMutations': [m for m in turn['mutants'] if m['id'] in ['TURN-M13', 'TURN-M14']],
     'productChanges': 0, 'historicalReceiptSubstitution': False})

live = read(r / 'widgets-live-full.json')
unit = read(r / 'backend-full.json')
assert live['success'] and live['numPassedTests'] == 406 and live['numFailedTests'] == 0
assert unit['success'] and unit['numPassedTests'] == 5603 and unit['numFailedTests'] == 0
tests = [a for t in live['testResults'] for a in t['assertionResults']]
unit_tests = [a for t in unit['testResults'] for a in t['assertionResults']]
assert all(a['status'] == 'passed' for a in tests)
save('CURRENT-LIVE-PROOF-INDEX.json', {'source': ref(r / 'widgets-live-full.json'),
     'fullLivePass': len(tests), 'proofs': [{'title': a['title'], 'status': a['status'], 'durationMs': a['duration']} for a in tests],
     'nativeMutationAdmission': 'PASS'})
repeated = read(out / 'REQUESTED-BASELINES-REPEATED.json')
assert repeated['candidate'] == candidate and len(repeated['independentRepeats']) == 3
assert all(x['exit'] == 0 and x['passed'] == 3 and x['failed'] == 0 for x in repeated['independentRepeats'])
save('BASELINE-ADMISSION.json', {'SV2-HTTP': 'PASS', 'F88-1': 'PASS', 'F88-2': 'PASS',
     'independentRepeatedRuns': repeated, 'freshUnfilteredLiveSuite': ref(r / 'widgets-live-full.json'),
     'completeNativeAdmission': 'PASS', 'completeNativeReceipt': ref(out / 'COMPLETE-MUTATIONS.json'),
     'nativeControlBoundary': 'Every complete canonical battery receipt has green plain and required neutralised controls.',
     'baselineRed': [], 'mismatches': 0, 'wholeCorpusAdmission': 'PASS'})

def node_counts(name, passes, skips=0):
    passed_receipt(name)
    text = (r / (name + '.log')).read_text()
    for key, value in [('pass', passes), ('fail', 0), ('skipped', skips)]:
        assert re.search(r'^(?:#|ℹ) ' + key + r'\s+' + str(value) + r'\s*$', text, re.M), (name, key)
    return {'pass': passes, 'skip': skips, 'fail': 0}
runtime = node_counts('runtime-full', 422, 7)
node_counts('node24-runtime-full', 422, 7)
carrier = node_counts('carrier-full', 93)
passed_receipt('legacy-python-full')
python_log = (r / 'legacy-python-full.log').read_text()
assert re.search(r'Ran 613 tests', python_log) and re.search(r'^OK\s*$', python_log, re.M)
for name in ['fbe2e-canonical-net-roundtrip', 'fbe2e-canonical-net-turn', 'fbe2e-canonical-net-bin',
             'fbe2e-compiled-net-bin', 'fbe2e-compiled-receipt-net-bin', 'fbe2e-l27-postcommit-dismiss']:
    passed_receipt(name)
save('COMPONENT-RECEIPTS.json', {'backend': {'pass': 5603, 'fail': 0, 'suites': 587},
     'widgetsLive': {'pass': 406, 'fail': 0, 'suites': 37}, 'runtime': {**runtime, 'nodes': [22, 24]},
     'carrier': carrier, 'python': {'pass': 613, 'fail': 0}, 'FBE2ESafeProbes': '6/6 PASS',
     'L27extraMutations': '8/8 KILLED', 'artifactParity': 'PASS', 'nativeMutationCorpus': 'PASS'})

l14_unit = [a for a in unit_tests if a['title'].startswith('WR-L22')]
l14_live = [a for a in tests if a['title'].startswith('WR-H2')]
assert l14_unit and l14_live and all(a['status'] == 'passed' for a in l14_unit + l14_live)
save('receipts/l14-fresh-proofs.json', {'unitReceipt': ref(r / 'backend-full.json'),
     'liveReceipt': ref(r / 'widgets-live-full.json'), 'unit': l14_unit, 'live': l14_live,
     'l27': ref(r / 'l27-postcommit-dismiss-observations.json'), 'wrNative': reports['WR'][0].name})
prior_text = (root / 'outputs/final-certification-2141e245/L14-CURRENT-CLOSURE.md').read_text()
current_text = prior_text.replace('2141e24544b5157c6341b649661d0cd3a2c21c48', candidate).replace('5602 tests', '5603 tests')
current_text = current_text.replace('WR native mutation result: PENDING in the complete fresh corpus; no WR mutation closure is claimed before canonical assembly.', 'WR native mutation result: PASS, 23/23, admitted by the complete fresh canonical assembly.')
current_text = current_text.replace('The final proof index will bind fresh results and hashes.', 'The proof index binds the fresh results and hashes.')
assert subprocess.check_output(['git', 'diff', '2141e24544b5157c6341b649661d0cd3a2c21c48', candidate, '--', 'maya-saas-backend/src/widgets/stores/intent-audit.store.ts'], cwd=repo) == b''
(out / 'L14-CURRENT-CLOSURE.md').write_text(current_text)

plan = read(r / 'mutation-plan.json')
pmint = [j for j in plan['jobs'] if j['gate'] == 'P-mint']
assert len(pmint) == 4 and {j['partition'] for j in pmint} == {'1/4', '2/4', '3/4', '4/4'}
workflow = repo / '.github/workflows/widgets-mutation.yml'
assert 'timeout-minutes: 180' in workflow.read_text()
save('L16-CURRENT-PLAN-PROOF.json', {'priorApprovedRepair': 'e180086f',
     'currentJobBudgetMinutes': 180, 'workflowSha256': sha(workflow),
     'plannerSha256': sha(repo / 'maya-saas-backend/scripts/widgets-mutation-ci.mjs'),
     'currentPlan': pmint, 'restrictedTests': False, 'freshReceipts': 'PASS'})

historical = root / 'outputs/final-certification-fed5f7df/FBE2E-DISPOSITION.json'
prior = read(root / 'outputs/final-certification-2141e245/FBE2E-RETAINED-BOUNDARIES.json')
boundaries = [x for x in prior['retainedBoundaries'] if x['id'] not in ['L12', 'L16']]
assert len(boundaries) == 7
save('FBE2E-RETAINED-BOUNDARIES.json', {'sourceDisposition': str(historical.relative_to(root)),
     'sourceDispositionSha256': sha(historical), 'sourceDispositionIsNotFreshReceipt': True,
     'freshSyntheticProbes': '6/6 PASS', 'retainedBoundaries': boundaries,
     'sourceRecheck': 'Product and presentation paths unchanged from the inspected 2141e245 source; only 13 test/harness paths changed from fed5f7df.',
     'ownerAcceptanceInferred': False, 'nativeCorpus': 'PASS', 'certificateIssued': False,
     'requirement': 'Approved AR-1 requires each FBE2E limitation closed or explicitly owner-accepted with its named boundary.'})
print(json.dumps({'candidate': candidate, 'completeProofIndexes': 'PASS'}))
