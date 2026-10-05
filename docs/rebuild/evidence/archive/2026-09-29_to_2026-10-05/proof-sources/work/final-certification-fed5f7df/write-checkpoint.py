from pathlib import Path
from collections import Counter
import json, hashlib, subprocess, datetime

root = Path(__file__).resolve().parents[2]
out = root / 'outputs/final-certification-fed5f7df'
receipts = out / 'receipts'
repo = root / 'work/maya-controlled-integration'
work = Path(__file__).resolve().parent
sha = 'fed5f7dfa0a5611dba24b40a8143b354c22151e5'
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == sha
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()

def read(p):
    return json.loads(p.read_text())

def save(name, obj):
    (out / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

# Receipt status is not inferred merely from a nonzero exit: deliberate counterfactuals
# must name the expected killers; interrupted processes are not completed failures.
index = []
for p in sorted(receipts.rglob('*.receipt.json')):
    d = read(p)
    rel = str(p.relative_to(out))
    if 'inadmissible-concurrent-attempt' in rel:
        status = 'EXCLUDED_ORCHESTRATION_ATTEMPT'
    elif 'ar-red-baseline-attempt' in rel:
        status = 'RETAINED_RED_BASELINE_NO_MUTATION_ADMISSION'
    elif p.name.startswith('L27-M'):
        status = 'EXPECTED_COUNTERFACTUAL_FAILURE_SEE_NAMED_KILLER_REPORT'
    elif p.name == 'http-lifecycle-diagnostic-full.receipt.json':
        status = 'EXCLUDED_DIAGNOSTIC_PRELOAD_ERROR'
    elif d.get('exit') == -15:
        status = 'INTERRUPTED_NOT_CERTIFIED'
    elif d.get('exit') == 0:
        status = 'PASS'
    else:
        status = 'NONZERO_REVIEW_REQUIRED'
    index.append({'path': rel, 'sha256': digest(p), 'candidate': d.get('candidate'),
                  'exit': d.get('exit'), 'status': status})
save('FRESH-PROOF-INDEX.json', {'candidate': sha, 'generatedAt': now,
    'historicalReceiptsAdmitted': False, 'certificateIssued': False,
    'receipts': index, 'note': 'Individual PASS receipts do not substitute for the unfinished complete programme.'})

matrix = read(out / 'FRESH-CLAUSE-EVIDENCE.json')
matrix['completeMutationCertification'] = 'STOP: repeated red native unmutated AR live baselines; programme incomplete'
matrix['certifiedForProfile'] = False
matrix['fullContractCertified'] = False
matrix['countMeaning'] = 'Source/contract disposition with fresh manifest coverage; not a completed release-certificate threshold.'
save('FRESH-CLAUSE-EVIDENCE.json', matrix)

previous_path = root / 'outputs/final-certification-98716cd5/FBE2E-DISPOSITION.json'
previous = read(previous_path)
remaining = {
    'L2': 'Local contract checks PASS; no fresh remote CI run or new advisory-policy acceptance.',
    'L5': 'Fixed tomorrow window remains tied to unresolved date/window policy, together with L24.',
    'L12': 'Type-only/runtime port mutation coverage remains a disclosed boundary; no historical mutation receipt is admitted for this candidate.',
    'L16': 'Remote shard timing/headroom unproved; local complete mutation programme also interrupted.',
    'L20': 'A supplied UNKNOWN verdict does not prove an actual Action Engine uncertainty/fault-produced UNKNOWN.',
    'L23': 'Narrowed network structural ratchet remains a presentation dependency; successful network probes do not replace that ratchet.',
    'L24': 'Canonical date/window/timezone policy owner remains unsettled; no new tenant policy invented.',
    'L25': 'Tap-as-delivery/render lifecycle ruling remains open.',
    'L26': 'Historical audit-builder baseline admission ruling remains open; current strict consumer does not retroactively approve old controls.',
}
new_rows = []
for old in previous['limitations']:
    ident = old['id']
    row = {'id': ident, 'before': old['after'], 'after': old['after'],
           'historicalContext': old,
           'historicalContextWarning': 'Descriptions/receipts inside this historical object are provenance only, not fresh certification.'}
    row['currentNote'] = remaining.get(ident, 'Retain source disposition. Fresh ordinary suites are indexed separately; complete mutation certification is unfinished.')
    if ident == 'L27':
        row.update(after='CLOSED', currentNote='Exact previously failing built-runtime/binary COMMIT → Dismiss probe now preserves one assistant item, one canonical receipt and one business effect. Identity uses server action_receipt_ref, not text.',
                   freshProofs=['receipts/fbe2e-l27-postcommit-dismiss.receipt.json', 'receipts/l27-postcommit-dismiss-observations.json', 'receipts/l27-runtime-mutations.json'])
    if ident == 'L14':
        row.update(currentNote='Immutable receipt retries and confirmed-publication ownership verified against current source; injected second COMMIT is explicitly defensive, not a production-reachable rereference scenario.',
                   freshProofs=['L14-CURRENT-CLOSURE.md', 'receipts/backend-full.json', 'receipts/widgets-live-full.json'])
    new_rows.append(row)
save('FBE2E-DISPOSITION.json', {'contract': 'maya.fbe2e-final-certification-disposition/1',
    'candidate': sha, 'historicalDispositionSha256': digest(previous_path),
    'scope': 'Current limitation disposition; not complete release certification and not acceptance of retained limitations.',
    'counts': dict(Counter(r['after'] for r in new_rows)), 'limitations': new_rows,
    'freshFullCertification': False, 'overall': 'PARTIAL / NOT CERTIFIED',
    'newBlocker': 'Repeated red native HTTP baseline controls; underlying cause not established.'})

l14 = out / 'L14-CURRENT-CLOSURE.md'
l14.write_text(l14.read_text().replace('WR native mutation result: PENDING.',
    'WR native mutation result: NOT COMPLETED; the programme stopped on repeated red AR baseline controls. No WR mutation closure is claimed for this candidate.'))

diag = read(receipts / 'AR-BASELINE-DIAGNOSTIC.json')
diag.update(status='STOP: repeated red unmutated baseline; root cause unresolved',
            action='All certification runners stopped. No AR result, complete mutation aggregate or release certificate admitted.',
            instrumentation='A separate HTTP preload diagnostic failed because its required variable was scrubbed in an E2 child process. Excluded as diagnostic tooling error; not a third candidate failure or root-cause proof.')
save('receipts/AR-BASELINE-DIAGNOSTIC.json', diag)

defect = '''# Certification STOP: native HTTP baseline instability

Candidate: `fed5f7dfa0a5611dba24b40a8143b354c22151e5`.

Two fresh unmutated native AR live controls failed before any AR mutation result could be admitted. This blocks certification. The underlying cause is unresolved; these observations do not establish a backend product defect, L27 regression, or a proven resource-contention explanation.

| Attempt | Result | Exact observed failure | Receipt |
| --- | --- | --- | --- |
| First isolated native AR control | 400 PASS / 5 FAIL | `SV2-HTTP registered authenticated route refuses caller authority and consumes real V2 coordinator`: 120000 ms timeout. Later PROFILE-INGRESS, E1-T2B-CLEAN, T-F11/B-1 and BS-SOURCE report `Cannot read properties of undefined (reading 'Socket')`. | `receipts/mutation-diagnostics/1-live-1790778318690.json` |
| Fresh native AR retry, fresh database | 403 PASS / 2 FAIL | `F88-1 [HTTP] every one of the 28 forbidden keys is refused at depth 0 and at depth 3, with the location named`: 120000 ms timeout. `F88-2`: `socket hang up`. | `receipts/mutation-diagnostics/1-live-1790779347865.json` |

The normal full live suite passed 405/405. A separate fresh unmodified full diagnostic also passed 405/405 (`receipts/ar-baseline-diagnostic-full-live.json`). Four independent native controls passed. These are intermittent failures, not a reproducible assertion showing weakened authority semantics. A green repeat cannot erase the red controls.

## Exact execution context

The stock command was `node scripts/widgets-mutation-battery.mjs --gate AR --out <external receipt path>`. No test filters, shortened step list, changed timeout, altered assertions or changed declaration were used. Native live baselines contain all 405 tests. Build controls use all 5598 backend tests plus typecheck and K3.

Node 22.23.2, Darwin arm64, loopback PostgreSQL on port 55729, public CI values from `test/widgets-live/support/environment.ts`; no provider keys. First isolated database: `maya_widget_gate_proof_finalfed5iso_worker1`. Retry: `maya_widget_gate_proof_finalfed5_ar_retry`. The retry ran while independent mutation workers were still active; resource interaction is an unproved hypothesis, not an established cause.

Inputs were materialized outside the candidate. `MUTATION-INPUT-PROVENANCE.json` records 2331 compared tracked source inputs per worker and zero mismatches. Two public `.env` example templates were omitted by configuration sanitization and are disclosed there. All executable source/tests/declarations were unchanged. Scripts and command receipts are hashed in `HARNESS-PROVENANCE.json` and the proof index. The local reproduction scripts require a fresh proof database and refuse to overwrite an existing database; they must not be pointed at production.

An earlier separate orchestration attempt had allowed K5's temporary source counterfactuals to overlap readers of the original runtime. It was invalidated, stopped, archived under `receipts/inadmissible-concurrent-attempt`, and replaced with independent runtime/carrier copies. The backend full suite was rerun successfully. That discarded attempt is not the evidence for the two failures above.

## Diagnostic limit

The extra HTTP lifecycle preloader run produced 404 PASS / 1 FAIL because its own required environment variable was scrubbed by an E2 child while the preload remained inherited. This is an external diagnostic-tool error and is excluded from candidate results. Its trace does not establish the root cause of the native failures. No third candidate failure is claimed.

## Consequence

All certification processes have stopped. Only the completed NS native part is admissible: 5/5 as declared with a green full control. The remaining native programme is incomplete. Eight additional L27 runtime counterfactuals were killed by their named tests after a green full runtime baseline, but cannot substitute for the 502-declaration backend corpus.

No complete mutation aggregate, CI-equivalent certificate, profile certificate or release authorization readiness is issued. The next required work is to establish and correct the cause of unreliable native HTTP controls, then run the complete fresh programme on the final candidate. No candidate source fix is included in this checkpoint. All red, interrupted and diagnostic receipts remain available; no retry is silently substituted.
'''
(out / 'CERTIFICATION-DEFECT-HTTP-BASELINE.md').write_text(defect)

checks = {
    'backend': {'status': 'PASS', 'suites': 587, 'passed': 5598, 'failed': 0},
    'runtimeNode22': {'status': 'PASS_WITH_DISCLOSED_SKIPS', 'passed': 422, 'skipped': 7, 'failed': 0},
    'runtimeNode24': {'status': 'PASS_WITH_DISCLOSED_SKIPS', 'passed': 422, 'skipped': 7, 'failed': 0},
    'carrier': {'status': 'PASS', 'passed': 93, 'failed': 0},
    'widgetsLiveMain': {'status': 'PASS', 'suites': 36, 'passed': 405, 'failed': 0},
    'python': {'status': 'PASS', 'passed': 613},
    'httpBin': {'status': 'PASS', 'passed': 21},
    'releaseBinary': {'status': 'PASS', 'passed': 2},
    'NS1': {'status': 'PASS', 'roundtrip': '16/16'},
    'L27': {'status': 'PASS', 'probe': '17/17', 'exactFormerFailingFBE2E': 'PASS', 'visibleTerminalOutcomes': 1},
    '9.6': {'status': 'PASS', 'proof': 'receipts/canonical-net-turn-observations.json', 'mirrorWriter': False},
    'BS1': {'status': 'PASS', 'proof': 'receipts/compiled-net-bin-observations.json'},
    'successorVerification': {'status': 'PASS in main full live suite', 'requiredProofs': '12/12', 'additionalV2Proofs': 7,
                              'limit': 'Its SV2-HTTP test also timed out in the native AR control; full certification is withheld.'},
    'profileRevocationExpiryOldTokenSubstitution': {'status': 'PASS in main suites', 'fullMutationCertification': False},
    'pwaCapacitorParity': {'status': 'PASS', 'proof': 'ARTIFACT-HASH-PARITY.json', 'deviceInstall': False},
}
mutation = {'status': 'INCOMPLETE / BLOCKED', 'declared': 502, 'batteries': 44,
    'plannedNativeParts': 65, 'completedNativeParts': 1, 'completedNativePart': 'NS',
    'completedDeclaredMutants': 5, 'additionalRuntimeL27Killed': 8,
    'note': 'Other native parts are interrupted or not run. No partial result substitutes for the complete corpus.',
    'pendingHandoffDeclarations': ['gate6.json#M17b', 'gate6.json#M18b'],
    'assembledCompleteReceipt': False}
checkpoint = {'candidate': sha, 'branch': 'codex/maya-controlled-integration-20260930',
    'worktree': str(repo), 'createdAt': now, 'integration': 'Exact fast-forward from 98716cd5; commit provenance preserved',
    'candidateClean': True, 'additionalCandidateEdits': 0, 'backendFilesTouched': 0,
    'profile': 'closed-input.no-handoff@1', 'profileApplicableFalse': 0, 'globalFalse': 2,
    'matrixQualification': 'Source/evidence disposition, not completed certification. Full165 contract remains unchanged.',
    'globalStops': ['G6-6', 'G13-R8'], 'checks': checks, 'mutations': mutation,
    'ciEquivalent': 'NOT CERTIFIED: complete native mutation gate blocked',
    'fbe2e': {'status': 'PARTIAL / NOT CERTIFIED', 'executedIntegrationProbes': 'PASS',
              'limitationDisposition': {'CLOSED': 19, 'PARTIAL': 5, 'OPEN': 4}, 'remaining': remaining},
    'certifiedForProfile': False, 'fullContractCertified': False, 'readyForReleaseAuthorization': False,
    'exactRemainingBlockers': ['Repeated red unmutated native AR live controls (SV2-HTTP timeout; F88-1 timeout/F88-2 socket hang up); underlying cause unresolved.',
        'Complete 502-declaration native programme and aggregate not completed; complete CI-equivalent/profile certification cannot be issued.',
        'Retained FBE2E boundaries L2/L5/L12/L16/L20/L23/L24/L25/L26 have not been waived or newly owner-accepted.'],
    'effects': {'productionMigration': 0, 'productionDeploy': 0, 'productionGrant': 0,
        'realOTP': 0, 'realYclients': 0, 'iphoneReinstall': 0, 'chapter10': 0},
    'allCertificationProcessesStopped': True}
save('CHECKPOINT.json', checkpoint)

summary = '''# Final certification checkpoint — STOP

Exact Claude L27 commit integrated with provenance preserved. The exact former failing COMMIT → Dismiss FBE2E was run first and passes: one visible terminal outcome, one canonical receipt, one business effect. No extra candidate edits; backend files touched: 0.

```yaml
FINAL CANDIDATE SHA: fed5f7dfa0a5611dba24b40a8143b354c22151e5
PROFILE: closed-input.no-handoff@1
PROFILE-APPLICABLE FALSE: 0 # source/evidence disposition; not completed certification
GLOBAL FALSE: 2 # G6-6 and G13-R8 remain HANDOFF STOP
FULL MUTATIONS: INCOMPLETE / BLOCKED
CI-EQUIVALENT: NOT CERTIFIED
FBE2E: PARTIAL / NOT CERTIFIED
NS-1: PASS
L27: PASS
PWA/CARRIER PARITY: PASS
CERTIFIED_FOR_PROFILE: NO
FULL-CONTRACT CERTIFIED: NO
READY FOR RELEASE AUTHORIZATION: NO
```

| Fresh verification | Result |
| --- | --- |
| Backend | 587 suites; 5598 PASS, 0 FAIL |
| Runtime, Node 22 and 24 separately | 422 PASS, 7 SKIP, 0 FAIL each |
| Carrier | 93 PASS |
| Widgets-live main run | 405 PASS |
| Python | 613 PASS |
| HTTP/BIN; release binary | 21 PASS; 2 PASS |
| NS-1 roundtrip; L27 probe | 16/16; 17/17 |
| Exact former failing L27 FBE2E | PASS; visible terminal outcomes = 1 |
| 9.6; BS-1; successor | PASS in fresh ordinary/integration suites; successor 12 required + 7 additional proofs |
| Profile isolation, expiry, revocation, cross-tenant/profile substitution, old token | PASS in main ordinary/live suites; complete mutation certification remains blocked |
| Artifacts/PWA/Capacitor parity | PASS; built artifact proof, no device reinstall |
| Native corpus | 502 declarations, 65 parts; only NS complete: 5/5 as declared |
| Additional L27 runtime counterfactuals | 8/8 killed with named killers; full runtime controls, no test filters |

Seven optional runtime fixture tests were skipped, not passed. Their exact inventory is in `RUNTIME-SKIP-AUDIT.json`. Separate integration probes are reported separately and do not rename these skips.

The immediate blocker is repeated failure of the unmutated native AR HTTP baseline: first 400 PASS / 5 FAIL (SV2-HTTP timeout, then Socket errors); fresh retry 403 PASS / 2 FAIL (F88-1 timeout, F88-2 socket hang up). Main full live and a fresh diagnostic both pass 405/405. Root cause remains unresolved; a backend product defect or resource-contention cause is not established. See `CERTIFICATION-DEFECT-HTTP-BASELINE.md` for exact failures and provenance. All certification processes are stopped.

The initial attempt exposed an orchestration issue with temporary K5 mutations. It was invalidated and archived, then replaced with independent inputs and a fresh successful backend full run. No affected partial receipt is admitted. The separate HTTP preload diagnostic had its own environment propagation bug and is excluded as tooling error.

FBE2E disposition is 19 CLOSED / 5 PARTIAL / 4 OPEN after L27 closure. Retained boundaries are L2 (CI/advisory policy), L5/L24 (date/window/timezone policy), L12 (type/runtime mutation coverage), L16 (remote shard timing), L20 (actual owner-fault UNKNOWN), L23 (network structural ratchet), L25 (tap/render lifecycle), L26 (historical audit admission). No new owner acceptance is inferred. Functional probe PASS does not constitute full FBE2E certification.

L14 was reviewed against current canonical source and `9085c2bb` provenance. Immutable receipt retry is valid; an injected second COMMIT is only a defensive proof. No production-reachable rereference scenario was manufactured. See `L14-CURRENT-CLOSURE.md`.

The next required work is to resolve the unreliable native control, then complete fresh final certification. No complete mutation aggregate, certificate, entitlement grant, production migration/deployment, real OTP/YCLIENTS effect, iPhone reinstall or Chapter 10 work occurred.

Supporting artifacts: `CHECKPOINT.json`, `FRESH-PROOF-INDEX.json`, `FRESH-CLAUSE-EVIDENCE.json`, `FBE2E-DISPOSITION.json`, `ARTIFACT-HASH-PARITY.json`, `MUTATION-INPUT-PROVENANCE.json`. Historical receipts are provenance only. All new receipts are for this exact candidate.
'''
(out / 'CHECKPOINT.md').write_text(summary)

harness = [{'path': str(p.relative_to(root)), 'sha256': digest(p), 'bytes': p.stat().st_size}
           for p in sorted(work.rglob('*')) if p.is_file() and not p.is_symlink()
           and not any(v.startswith('mutation-isolated-worker') or v in ['node_modules', 'runtime-mutation-mirror'] for v in p.relative_to(work).parts)
           and p.suffix in ['.py', '.cjs', '.mjs', '.ts']]
save('HARNESS-PROVENANCE.json', {'candidate': sha, 'files': harness,
    'scope': 'External certification harnesses; not committed candidate implementation. Hashing alone does not admit failed/instrumented receipts.'})
candidate = read(out / 'CANDIDATE.json')
candidate.update(finalStatus='STOP: certification control failure', clean=True,
    fullContractCertified=False, readyForReleaseAuthorization=False,
    harnessProvenanceSha256=digest(out/'HARNESS-PROVENANCE.json'))
save('CANDIDATE.json', candidate)
(work / 'STATE.json').write_text(json.dumps({'candidate': sha, 'branch': checkpoint['branch'],
    'status': 'STOP: repeated native HTTP baseline failures; root cause unresolved',
    'activeSessions': {}, 'checkpoint': str(out/'CHECKPOINT.md'), 'additionalSourceEdits': 0,
    'productionEffects': 0, 'certifiedForProfile': False}, indent=2) + '\n')
manifest = [{'path': str(p.relative_to(out)), 'bytes': p.stat().st_size, 'sha256': digest(p)}
            for p in sorted(out.rglob('*')) if p.is_file() and p.name != 'DELIVERY-MANIFEST.json']
save('DELIVERY-MANIFEST.json', {'candidate': sha, 'createdAt': now, 'files': manifest,
    'warning': 'Includes failed, interrupted and excluded diagnostic receipts for transparency; hashes are not certificate admission.'})
print(json.dumps({'checkpoint': str(out/'CHECKPOINT.md'), 'hashedFiles': len(manifest),
    'receiptIndex': len(index), 'candidateClean': True, 'certified': False}))
