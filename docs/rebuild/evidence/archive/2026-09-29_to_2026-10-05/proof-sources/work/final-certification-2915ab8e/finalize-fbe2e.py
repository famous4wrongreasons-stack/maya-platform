from pathlib import Path
import collections, datetime, hashlib, json, subprocess

root = Path.cwd()
repo = root / 'work/maya-controlled-integration'
out = root / 'outputs/final-certification-2915ab8e'
receipts = out / 'receipts'
candidate = '2915ab8e7c089e2c1f39848cb795940e5267c119'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip() == candidate
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
complete = read(out / 'COMPLETE-MUTATIONS.json')
assert complete['candidate'] == candidate and complete['status'] == 'PASS'
assert complete['parts'] == 65 and complete['declarations'] == 509

def proof(rel):
    p = out / rel
    assert p.is_file(), rel
    return {'path': rel, 'sha256': sha(p)}

reports = {}
for p in (receipts / 'mutation-receipt').glob('widgets-mutation-report-*.json'):
    report = read(p)
    assert report['source_head'] == candidate and report['status'] == 'AS-DECLARED'
    assert report['baseline_red'] == [] and report['mismatches'] == 0
    reports[report['batteries'][0]] = (p, report)
wr_path, wr = reports['gateWR.json']
assert len(wr['mutants']) == 23
assert all(m['status'] in ['build-killed', 'live-killed'] for m in wr['mutants'])
wr_ids = {m['id'] for m in wr['mutants']}

delta_path = out / 'L12-DELTA-PROOF.json'
delta = read(delta_path)
assert delta['candidate'] == candidate and delta['emittedRuntimeIdenticalAcrossAllThree']
assert delta['runtimeHelperPredatesDelta'] and not delta['entireFileIsTypeOnly']
for site in delta['runtimeSites']:
    assert set(site['mutationIds']) <= wr_ids
    assert sha(repo / 'maya-saas-backend' / site['file']) == site['sourceSha256']
delta['nativeWRAdmission'] = 'PASS: complete fresh 23/23 WR with green controls'
delta['nativeWRReceipt'] = proof(str(wr_path.relative_to(out)))
delta['historicalLimitationStatus'] = 'CLOSED for the exact uncovered-delta claim'
delta_path.write_text(json.dumps(delta, indent=2) + '\n')

pmint_path, pmint = reports['gateP-mint.json']
pmint_jobs = [x for x in complete['localJobTimings'] if x['gate'] == 'P-mint']
assert len(pmint_jobs) == 4
assert all(x['localMarginTo180Minutes'] > 0 for x in pmint_jobs)
plan_path = out / 'L16-CURRENT-PLAN-PROOF.json'
plan = read(plan_path)
assert plan['candidate'] == candidate and plan['currentJobBudgetMinutes'] == 180
plan['freshReceipts'] = 'PASS: all four complete P-mint parts and canonical full-corpus assembly'
plan['nativeReceipt'] = proof(str(pmint_path.relative_to(out)))
plan['observedLocalTimings'] = pmint_jobs
plan['historicalLimitationStatus'] = 'CLOSED for the historical two-part capacity limitation'
plan['scopeLimit'] = 'The approved four-part repair is exercised locally with full tests. No remote GitHub execution, future timing guarantee or timeout increase is claimed.'
plan_path.write_text(json.dumps(plan, indent=2) + '\n')

for name in ['backend-full', 'widgets-live-full', 'evidence-verifier', 'contract-check',
             'fbe2e-canonical-net-roundtrip', 'fbe2e-canonical-net-turn',
             'fbe2e-canonical-net-bin', 'fbe2e-compiled-net-bin',
             'fbe2e-compiled-receipt-net-bin', 'fbe2e-l27-postcommit-dismiss']:
    record = read(receipts / (name + '.receipt.json'))
    assert record['candidate'] == candidate and record['exit'] == 0

native_wr = str(wr_path.relative_to(out))
notes = {
    'L1': ('HTTP evidence tags and declared HTTP kills are verified in the complete current mutation programme.', ['COMPLETE-MUTATIONS.json', 'CURRENT-LIVE-PROOF-INDEX.json']),
    'L3': ('Canonical network transport executes authentication, widget submissions and resolve over loopback into the built backend.', ['receipts/canonical-net-bin-observations.json']),
    'L4': ('Emitted runtime JavaScript executes create/reschedule/cancel and NS-1 return against the built backend; compiled React helper is exercised. This is not browser/device/production proof.', ['receipts/compiled-net-bin-observations.json']),
    'L6': ('Canonical unknown fields and incomplete totals remain unknown; current presenter assertions and named WR mutations pass.', ['receipts/backend-full.json', native_wr]),
    'L7': ('Authority user/tenant and actor tenant fences before booking quote/store are asserted and mutation-protected.', ['receipts/backend-full.json', native_wr]),
    'L8': ('Malformed canonical staff results refuse; incomplete lists cannot be relabelled COMPLETE by an undetected mutation.', ['receipts/backend-full.json', native_wr]),
    'L9': ('Actual runtime-issued create/reschedule/cancel COMMIT observations assert all fourteen gates.', ['receipts/compiled-net-bin-observations.json']),
    'L10': ('The current complete native programme requires green plain baselines including neutralised live batteries; harness regression controls pass.', ['COMPLETE-MUTATIONS.json', 'HTTP-HARNESS-NATIVE-REPAIR-PROOF.json']),
    'L11': ('Three canonical selector read kinds assert the selector minter dispatch; WR-M17 is killed.', ['receipts/backend-full.json', native_wr]),
    'L12': ('Every new runtime site named by historical L12 has a killed WR mutation. The exact ports delta emits no new runtime bytes; the pre-existing helper is not mislabelled type-only. No exhaustive line-coverage claim.', ['L12-DELTA-PROOF.json', native_wr]),
    'L13': ('Both booking principal fences are covered by foreign-principal and lock-time change tests, with WR-M18/M19 killed.', ['receipts/backend-full.json', native_wr]),
    'L14': ('Current immutable receipt/retry contract and exclusive confirmed publication are preserved. The injected second COMMIT remains a defensive store proof, not a manufactured production re-reference.', ['L14-CURRENT-CLOSURE.md', 'receipts/l14-fresh-proofs.json', native_wr]),
    'L15': ('Ownership, effect/space narrowing, monotonicity and same-token exception mutations WR-M12..M15 are killed with green controls.', [native_wr]),
    'L16': ('The existing four-part P-mint repair passes full fresh local execution and canonical assembly below the unchanged per-job budget. Remote GitHub timing is not claimed.', ['L16-CURRENT-PLAN-PROOF.json', str(pmint_path.relative_to(out))]),
    'L17': ('Canonical reconciliation lookup is fenced to AE COMMIT and WR-M16 is killed.', ['receipts/widgets-live-full.json', native_wr]),
    'L18': ('Fresh compiled-runtime network observations assert the actual COMMIT gate count, as for L9.', ['receipts/compiled-net-bin-observations.json']),
    'L19': ('Canonical confirmed receipt lines traverse createNet, conversation, the compiled React reply helper and subsequent chat request history.', ['receipts/compiled-receipt-net-bin-observations.json']),
    'L21': ('Server thread reader filters invalid terminal outcomes and receipt-reference bindings; WR-M06..M08 are killed.', ['receipts/backend-full.json', native_wr]),
    'L22': ('The recording store keys by canonical upsert identity and asserts immutable retry. It does not claim rejection of arbitrary first-write owner input.', ['receipts/backend-full.json', native_wr]),
    'L27': ('Built-runtime/binary COMMIT to Dismiss preserves one visible terminal outcome, one durable receipt and one synthetic execution; eight separate runtime mutations are killed.', ['L27-CURRENT-PROOF.json', 'receipts/l27-runtime-mutations.json', 'receipts/l27-postcommit-dismiss-observations.json']),
    'L28': ('Live dismiss before COMMIT leaves no terminal storage/thread line and no ActionExecution.', ['receipts/widgets-live-full.json'])
}
retained = read(out / 'FBE2E-RETAINED-BOUNDARIES.json')
boundaries = {r['id']: r for r in retained['retainedBoundaries'] if r['id'] not in ['L12', 'L16']}
assert set(boundaries) == {'L2', 'L5', 'L20', 'L23', 'L24', 'L25', 'L26'}
historical_path = root / 'outputs/final-certification-fed5f7df/FBE2E-DISPOSITION.json'
historical = read(historical_path)
rows = []
for old in historical['limitations']:
    key = old['id']
    if key in notes:
        note, paths = notes[key]
        rows.append({'id': key, 'before': old['after'], 'after': 'CLOSED',
                     'currentProof': note, 'freshEvidence': [proof(p) for p in paths]})
    else:
        boundary = boundaries[key]
        rows.append({'id': key, 'before': old['after'], 'after': boundary['status'],
                     'remainingBoundary': boundary['currentBoundary'],
                     'ownerAcceptance': 'NOT ESTABLISHED', 'newProductFailure': False})
counts = dict(collections.Counter(r['after'] for r in rows))
assert counts == {'CLOSED': 21, 'PARTIAL': 3, 'OPEN': 4}
result = {'contract': 'maya.fbe2e-final-certification-disposition/1', 'candidate': candidate,
          'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'historicalDispositionSource': str(historical_path.relative_to(root)),
          'historicalDispositionSha256': sha(historical_path),
          'historicalReceiptsAdmitted': 0, 'counts': counts, 'limitations': rows,
          'freshSyntheticIntegrationProbes': '6/6 PASS', 'completeApplicableNativeCorpus': 'PASS',
          'overall': 'PARTIAL: executable safe probes pass; seven retained boundaries are not owner-accepted',
          'productionProofClaimed': False, 'ownerAcceptanceInferred': False,
          'certifiedForProfile': False, 'fullContractCertified': False,
          'thresholdReason': 'Approved AR-1 requires each FBE2E limitation closed or explicitly owner-accepted with its named boundary.'}
(out / 'FBE2E-DISPOSITION.json').write_text(json.dumps(result, indent=2) + '\n')
retained.update(retainedBoundaries=list(boundaries.values()), nativeCorpus='PASS',
                newlyClosed=['L12', 'L16'], completeDisposition='FBE2E-DISPOSITION.json')
(out / 'FBE2E-RETAINED-BOUNDARIES.json').write_text(json.dumps(retained, indent=2) + '\n')
print(json.dumps({'candidate': candidate, 'counts': counts, 'certifiedForProfile': False}))
