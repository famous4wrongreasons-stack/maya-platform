from pathlib import Path
import datetime, hashlib, json, subprocess

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/final-certification-705d57cd'
receipts = out / 'receipts'
candidate = '705d57cd787e24d8944dbe764789e27fd9af3708'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
complete = read(out / 'COMPLETE-MUTATIONS.json')
assert complete['candidate'] == candidate and complete['status'] == 'PASS'
assert complete['declarations'] == 509 and complete['applicableKills'] == 506
assert len(complete['localJobTimings']) == 65
assert all(x['localMarginTo180Minutes'] > 0 for x in complete['localJobTimings']), 'Review the observed local job budget before claiming CI-equivalent PASS'

groups = {
    'backend_and_platform': ['npm-audit', 'prisma-generate', 'prisma-validate',
        'synthetic-smoke-migration', 'synthetic-smoke-seed', 'backend-typecheck',
        'scripts-typecheck', 'lint', 'k3', 'backend-full', 'e2e', 'events-db-migration',
        'events-live', 'backend-build', 'platform-http-smoke'],
    'legacy_python': ['python-compile', 'legacy-python-full'],
    'frontend_gates': ['frontend-inline', 'prepublication-contracts', 'prepublication-counterfactuals'],
    'widget_contract': ['contract-compile', 'contract-check', 'k1-dossier'],
    'widgets_live': ['proof-db-migration', 'live-typecheck', 'widgets-live-full', 'http-bin',
        'release-binary', 'evidence-verifier'],
    'runtime_node22': ['runtime-build', 'runtime-hash-check', 'runtime-self-test',
        'runtime-typecheck', 'runtime-full', 'icons', 'k5-exit', 'k15-census'],
    'runtime_node24': ['node24-runtime-check', 'node24-runtime-selftest',
        'node24-runtime-typecheck', 'node24-runtime-full', 'node24-icons'],
    'carrier': ['carrier-build', 'carrier-capacitor-build', 'carrier-typecheck',
        'carrier-full', 'carrier-harness', 'carrier-ratchet-selftest'],
    'safe_integration': ['ns1-16-step', 'l27-17-step', 'fbe2e-canonical-net-roundtrip',
        'fbe2e-canonical-net-turn', 'fbe2e-canonical-net-bin', 'fbe2e-compiled-net-bin',
        'fbe2e-compiled-receipt-net-bin', 'fbe2e-l27-postcommit-dismiss'],
    'mutation_integrity_and_assembly': ['mutation-ci-integrity', 'mutation-inventory', 'mutation-assemble'],
    'requested_baselines': ['requested-baselines-1', 'requested-baselines-2', 'requested-baselines-3'],
    'extra_runtime_mutation_control': ['l27-mutations-baseline']
}
indexed = {}
for group, names in groups.items():
    indexed[group] = []
    for name in names:
        path = receipts / (name + '.receipt.json')
        record = read(path)
        assert record['candidate'] == candidate and record['exit'] == 0, name
        log = receipts / (name + '.log')
        assert log.is_file(), name
        indexed[group].append({'name': name, 'status': 'PASS',
            'receipt': str(path.relative_to(out)), 'receiptSha256': sha(path),
            'log': str(log.relative_to(out)), 'logSha256': sha(log),
            'seconds': record['seconds']})

for name, tests, suites in [('backend-full', 5603, 587), ('widgets-live-full', 406, 37)]:
    data = read(receipts / (name + '.json'))
    assert data['numPassedTests'] == tests and data['numFailedTests'] == 0
    assert data['numPassedTestSuites'] == suites and data['numFailedTestSuites'] == 0
    assert data['success'], name
extra = read(receipts / 'l27-runtime-mutations.json')
assert extra['candidate'] == candidate and extra['status'] == 'PASS'
assert len(extra['mutations']) == 8 and all(x['status'] == 'KILLED' and x['namedKillers'] for x in extra['mutations'])
postconditions = read(out / 'CI-POSTCONDITIONS.json')
assert postconditions['candidate'] == candidate and postconditions['status'] == 'PASS'
for audit in postconditions['runtimeSkipAudit'].values():
    assert audit['count'] == 7 and audit['unlabelled'] == 0
parity = read(out / 'ARTIFACT-HASH-PARITY.json')
assert parity['candidate'] == candidate and parity['parity'] == 'PASS'
stability = read(out / 'FINAL-ARTIFACT-STABILITY.json')
assert stability['candidate'] == candidate and stability['status'] == 'PASS'
lifecycle = read(out / 'FINAL-PROCESS-LIFECYCLE.json')
assert lifecycle['candidate'] == candidate and lifecycle['status'] == 'PASS'
assert lifecycle['remainingOwnedProcesses'] == []
assert lifecycle['remainingCurrentRunProofDbSessions'] == []
orchestration = read(out / 'FINAL-ORCHESTRATION-SOURCES.json')
assert orchestration['candidate'] == candidate and orchestration['status'] == 'PASS'
assert orchestration['executionSourcesChangedSinceCapture'] == []
reexecution = read(out / 'SUSPEND-REEXECUTION.json')
assert reexecution['candidate'] == candidate and reexecution['status'] == 'PASS'
assert reexecution['newTransportFailures'] == [] and not reexecution['reexecutionOverlappedSleep']
fbe = read(out / 'FBE2E-DISPOSITION.json')
assert fbe['candidate'] == candidate and fbe['completeApplicableNativeCorpus'] == 'PASS'
assert fbe['counts'] == {'CLOSED': 21, 'PARTIAL': 3, 'OPEN': 4}

matrix_path = out / 'FRESH-CLAUSE-EVIDENCE.json'
matrix = read(matrix_path)
assert matrix['candidate'] == candidate and len(matrix['rows']) == 165
assert matrix['profileApplicableFalse'] == 0 and matrix['globalFalse'] == 2
matrix['completeMutationCertification'] = 'PASS'
matrix['completeMutationReceiptSha256'] = sha(out / 'COMPLETE-MUTATIONS.json')
matrix['countMeaning'] = 'All 165 source/contract dispositions are revalidated. Fresh HTTP/BIN/U proofs and the complete unrestricted native corpus support 163 profile-applicable clauses. Overall release certification remains separate and blocked on seven FBE2E boundaries.'
matrix['overallThreshold'] = 'NOT SATISFIED: seven FBE2E boundaries lack named owner acceptance'
for row in matrix['rows']:
    row['clauseEvidenceAdmitted'] = row['state'] != 'false'
    row['certificationAdmitted'] = False
matrix_path.write_text(json.dumps(matrix, indent=2) + '\n')

components_path = out / 'COMPONENT-RECEIPTS.json'
components = read(components_path)
components['nativeMutationCorpus'] = 'PASS: 44 batteries, 65 parts, 509 declarations, 506 applicable kills'
components['completeProgrammeExecuted'] = True
components['releaseThreshold'] = 'NOT SATISFIED: see FBE2E-DISPOSITION.json'
components_path.write_text(json.dumps(components, indent=2) + '\n')
baseline_path = out / 'BASELINE-ADMISSION.json'
baseline = read(baseline_path)
baseline['completeNativeAdmission'] = 'PASS'
baseline['completeNativeReceipt'] = 'COMPLETE-MUTATIONS.json'
baseline['completeNativeReceiptSha256'] = sha(out / 'COMPLETE-MUTATIONS.json')
baseline['baselineRed'] = []
baseline['mismatches'] = 0
baseline['wholeCorpusAdmission'] = 'PASS'
baseline['nativeControlBoundary'] = 'Initial raw controls are retained as diagnostics; complete canonical receipts and assembly now supply final native admission.'
baseline_path.write_text(json.dumps(baseline, indent=2) + '\n')

updates = {
    '9.6-CURRENT-PROOF.json': {'wholeCorpusAdmission': 'PASS'},
    'CURRENT-LIVE-PROOF-INDEX.json': {'nativeMutationAdmission': 'PASS'},
    'HTTP-HARNESS-NATIVE-REPAIR-PROOF.json': {'wholeCorpusAdmission': 'PASS'},
    'REQUESTED-BASELINES-REPEATED.json': {'nativeCorpusControl': 'PASS: complete unrestricted native baseline controls and canonical assembly'},
    'AR1-NATIVE-PROOF.json': {'scope': 'Complete native AR battery, admitted with complete whole-corpus assembly. This is synthetic implementation proof, not a release certificate or production authorization.'},
    'PROFILE-NATIVE-PROOF.json': {'scope': 'Complete PI and PI-contract batteries, admitted with complete whole-corpus assembly. Not a signed release certificate.'},
    'CLOCK-NATIVE-REPAIR-PROOF.json': {'nativeBatteryAdmission': 'Complete H-harness AS-DECLARED, 26/26 killed; whole corpus PASS'},
    'M13-NATIVE-REPAIR-PROOF.json': {'scope': 'Complete fresh native Gate 13 on current candidate, admitted with complete whole-corpus assembly.'},
    'SUCCESSOR-CURRENT-PROOF.json': {'nativeMutationAdmission': '31/31 across complete SV2,SB1,SBV batteries PASS; canonical whole-corpus assembly PASS'}
}
for name, fields in updates.items():
    path = out / name
    data = read(path)
    assert data['candidate'] == candidate
    data.update(fields)
    data['completeNativeReceiptSha256'] = sha(out / 'COMPLETE-MUTATIONS.json')
    path.write_text(json.dumps(data, indent=2) + '\n')

result = {'candidate': candidate, 'profile': 'closed-input.no-handoff@1',
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'localCiEquivalent': 'PASS', 'remoteGitHubRunClaimed': False,
    'executionScope': 'Local macOS arm64, Node 22/24, Python 3.11, isolated PostgreSQL 16 proof databases. Workflow commands and postconditions executed; no hosted Linux execution or branch-protection claim.',
    'finalProcessLifecycle': {'status': 'PASS', 'receipt': 'FINAL-PROCESS-LIFECYCLE.json',
        'sha256': sha(out / 'FINAL-PROCESS-LIFECYCLE.json'),
        'retainedFixture': 'Dedicated proof PostgreSQL server intentionally retained'},
    'orchestrationSourceIntegrity': {'status': 'PASS', 'receipt': 'FINAL-ORCHESTRATION-SOURCES.json',
        'sha256': sha(out / 'FINAL-ORCHESTRATION-SOURCES.json')},
    'hostSuspendRecovery': {'status': 'PASS', 'receipt': 'SUSPEND-REEXECUTION.json',
        'sha256': sha(out / 'SUSPEND-REEXECUTION.json'),
        'wholePartsReexecuted': len(reexecution['requiredSlots']), 'candidateChanged': False,
        'timeoutsChanged': False, 'invalidatedReceiptsRetained': True},
    'groups': indexed, 'componentResults': components,
    'mutationCorpus': {'batteries': 44, 'parts': 65, 'declarations': 509, 'applicableKills': 506,
        'handoffPending': 2, 'existingEquivalent': 1, 'extraL27Kills': 8,
        'baselineRed': [], 'mismatches': 0, 'historicalReceiptsAdmitted': 0},
    'profileApplicableFalse': 0, 'globalFalse': 2, 'globalStops': ['G6-6', 'G13-R8'],
    'fbe2eSafeProbes': 'PASS', 'fbe2eAcceptance': 'PARTIAL', 'fbe2eCounts': fbe['counts'],
    'certifiedForProfile': False, 'fullContractCertified': False,
    'readyForReleaseAuthorization': False,
    'remainingBlockers': [{'id': row['id'], 'boundary': row['remainingBoundary']}
        for row in fbe['limitations'] if row['after'] != 'CLOSED'],
    'productDefectEstablished': False, 'harnessDefectEstablished': True,
    'productionEffects': 0, 'realOtpEffects': 0, 'realYclientsEffects': 0}
(out / 'CERTIFICATION-RECEIPTS.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'localCiEquivalent': 'PASS', 'nativeMutations': 'PASS',
                  'fbe2eSafeProbes': 'PASS', 'fbe2eAcceptance': 'PARTIAL', 'certifiedForProfile': False}))
