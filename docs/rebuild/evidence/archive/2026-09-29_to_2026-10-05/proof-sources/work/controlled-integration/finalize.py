from pathlib import Path
import collections, datetime, hashlib, json, re, shutil, subprocess

root = Path(__file__).resolve().parents[2]
repo = root / 'work/maya-controlled-integration'
receipts = root / 'work/controlled-integration/receipts'
out = root / 'outputs/controlled-integration'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
assert head == '4f479dce32e6e3595516447a5a6bf8cc6278528a'
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip()

def jest(name):
    d = json.loads((receipts / (name + '.json')).read_text())
    assert d['success'] and d['numFailedTests'] == 0 and d['numFailedTestSuites'] == 0, name
    return {k: d[k] for k in ['numPassedTests', 'numPendingTests', 'numPassedTestSuites', 'numFailedTests']}

def node_test(name):
    t = (receipts / (name + '.log')).read_text()
    result = {k: int(re.findall(r'^# ' + k + r' (\d+)$', t, re.M)[-1]) for k in ['tests', 'pass', 'fail', 'skipped']}
    assert result['fail'] == 0
    return result

tests = {n: jest(n) for n in ['backend-tests', 'widgets-live', 'ar-binary']}
tests.update({n: node_test(n) for n in ['carrier-tests', 'runtime-tests', 'mutation-ci-integrity']})
binary = next(json.loads(line) for line in (receipts / 'widget-binary-http.log').read_text().splitlines() if line.startswith('{"contract":"maya.widgets-intent-http-proof/2"'))
assert binary['status'] == 'PASS' and binary['failed'] == 0
tests['binary-http'] = {'passed': binary['cases'], 'failed': binary['failed']}
backend = json.loads((receipts / 'backend-tests.json').read_text())
integration = [a for s in backend['testResults'] for a in s['assertionResults'] if '[INTEGRATION-ONLY]' in a['fullName']]
assert len(integration) == 1 and integration[0]['status'] == 'passed'
tests['built-shell-integration-only'] = {'status': 'PASS', 'name': integration[0]['fullName']}
inv = json.loads((receipts / 'mutation-inventory.json').read_text())
prior_fbe = json.loads((repo / 'docs/rebuild/widget-release-programme/sb1-v2/fbe2e-disposition.json').read_text())
fbe_counts = dict(collections.Counter(x['after'] for x in prior_fbe['limitations']))
summary = {'contract': 'maya.controlled-integration-checkpoint/1', 'candidateSha': head,
 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'branch': 'codex/maya-controlled-integration-20260930', 'worktree': str(repo),
 'status': 'STOP_SCOPE_CONTRACT', 'falseBefore': 10, 'falseAfter': 10, 'evidenceMissing': 7,
 'integrationOwned': ['9.6'], 'handoffStop': ['G6-6', 'G13-R8'], 'tests': tests,
 'mutations': {'status': 'NOT_RUN_SCOPE_STOP', 'batteries': inv['batteries'], 'declarations': inv['mutants'], 'jobs': inv['jobs'], 'freshKillReceipts': 0},
 'fbe2e': {'progressCountsRetained': fbe_counts, 'freshWholeLimitationClosures': 0, 'syntheticBackendBookingAndBinaryTests': 'PASS', 'actualReactCarrierToBackendJourney': 'NOT_PROVED'},
 'ciEquivalent': 'INCOMPLETE', 'ar1ThresholdSatisfied': False, 'readyForSyntheticReleaseCertification': False,
 'productionActivation': False, 'productionDeploy': False, 'realOtp': False, 'realYclients': False,
 'iphoneReinstall': False, 'chapter10': False, 'sourceBranchMutation': False}
(out / 'CHECKPOINT.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')

b=tests['backend-tests']; w=tests['widgets-live']; c=tests['carrier-tests']; rt=tests['runtime-tests']
md=f'''# Controlled integration checkpoint

**STOP: current AR-1 cannot isolate HANDOFF from the release scope.** The combined candidate is saved. No runtime implementation was changed after this boundary was confirmed; the stale backend artifact test census was corrected from 37 to 38 in an atomic test-only commit; the existing diagnostic suites below ran to completion. The requested complete certification programme was not represented as passed.

```yaml
COMBINED CANDIDATE SHA: {head}
BRANCH: codex/maya-controlled-integration-20260930
9.6: FAIL # still open; implementation held at the explicit scope STOP
FALSE CLAUSES BEFORE: 10
FALSE CLAUSES AFTER: 10
EVIDENCE_MISSING: 7
INTEGRATION_OWNED: 1
HANDOFF_STOP: 2
FULL TESTS:
  backend: PASS ({b['numPassedTestSuites']} suites, {b['numPassedTests']} tests, {b['numPendingTests']} skipped)
  carrier: PASS ({c['pass']} tests)
  runtime: {rt['pass']} passed, {rt['skipped']} local-API tests skipped, {rt['fail']} failed
  widget_live: PASS ({w['numPassedTestSuites']} suites, {w['numPassedTests']} tests)
  binary_HTTP: PASS (18 cases)
  AR1_two_process: PASS (1 test)
MUTATIONS: NOT RUN — scope STOP ({inv['mutants']} declarations, {inv['batteries']} batteries, {inv['jobs']} CI jobs)
CARRIER PARITY: PASS
CI-EQUIVALENT: INCOMPLETE
AR-1 THRESHOLD SATISFIED: NO
READY FOR SYNTHETIC RELEASE CERTIFICATION: NO
```

Worktree: `{repo}`.

## What was proved

- Before merge: 256 backend-delta files and 30 presentation-delta files; overlap 0; conflicts 0. The eight Claude commits are recorded in `PRE-MERGE-PROOF.json`.
- Both checkpoint commits remain direct parents of merge e17b4acf, followed only by the artifact census test correction. Backend runtime bytes still equal `f9e703e3`; presentation/iOS bytes equal `36fc31d7`. Both source branches and worktrees retain their original state. Integration checkout is clean.
- The initial merge run had 5515 passing tests and one stale artifact-census assertion (37 expected, 38 actual). Its receipt is preserved separately. After the narrow test correction, the previously integration-only built-shell check now passes in the ordinary full backend suite. No carrier artifact was copied from Claude: it was built in this checkout.
- Backend build/preflight, backend/live/scripts typechecks and lint for the changed test passed. Runtime hash/reproducibility check passed. Carrier web/Capacitor parity passed, with only the prescribed endpoint/CSP/address differences. Artifact hashes are saved.
- Carrier ratchets: 50 refusing / 42 admitting fixtures. Runtime ratchets: 68/68 refusing, 24/24 admitting, coverage 31/31; write guard 2/2, PWA checks 51/51, bypass probes 8/8. K3: 10/10. Mutation CI integrity tests: 35/35. These controls do not replace execution of the 458-mutant programme.
- Scope-boundary proof: 11/11 assertions, including real certificate-parser refusal with only the two HANDOFF rows failing. Synthetic positive input is explicitly not an actual certificate.
- All live/binary writes used a new local guarded proof database, `maya_widget_gate_proof_integration_4f479dce`, on 127.0.0.1:55729. Only already-committed migrations were applied there. No new migration was authored. The proof PostgreSQL server was stopped afterward.

## Exact remaining blockers

1. **Scope-isolation contract:** AR-1 V1 requires full165 and cannot certify accepted HANDOFF STOP. `SCOPE-ISOLATION-DECISION.md` specifies the proposed versioned certificate, finite server profile, all-ingress admission fences, dependency threshold, revocation and required negative/mutation proofs. It is not implemented or approved by inference.
2. **9.6:** complete the canonical persisted typed/widget user-turn identity and same-writer retry/error proof. The existing matched-intent shared gateway is preserved. No mirror writer was added. See `INTEGRATION-FINDINGS.md`.
3. **G7-5 / G7-BOOK1 / G11-I9 / G13-I3:** an authorized production source for appointment-specific initial cancel/reschedule actions, then paired production-source HTTP/BIN evidence. Registry rows and direct emitter fixtures are insufficient.
4. **G12-R1b / G12-I11 / G13-R2:** authorized production-minted NAVIGATE detail/w with source capability, current authority, erasure/revocation and HTTP/BIN provenance. The new React detail renderer does not supply mint authority.
5. **Fresh complete certification:** after the contract and implementation boundary is settled, execute and assemble the full declared mutation programme plus all applicable integration/CI checks. No old mutation receipts were counted as fresh. Remote CI was not run. Runtime's seven local-API acceptance tests were skipped by their own prerequisite guard, not passed.
6. **FBE2E:** retained progress is {fbe_counts.get('CLOSED',0)} CLOSED / {fbe_counts.get('PARTIAL',0)} PARTIAL / {fbe_counts.get('OPEN',0)} OPEN; no new whole-limitation closure. Existing synthetic backend booking and binary paths passed, but actual React-carrier-to-backend acceptance and the disclosed provider/date-window/policy boundaries are not thereby certified. No production/provider evidence was manufactured.

Global progress remains 129 L / 4 L-T / 22 U / 10 false across 165 clauses. Historical accepted evidence is identified as inherited progress in `MATRIX-REVIEW.json`; it is not relabelled as a fresh full-release certificate.

Production activation/deploy, real OTP, real YCLIENTS effects, iPhone reinstall and Chapter 10: **0**. No HANDOFF endpoint was implemented.
'''
(out / 'CHECKPOINT.md').write_text(md)
for f in receipts.iterdir():
    if f.is_file(): shutil.copy2(f, out / 'receipts' / f.name)
manifest = {'candidateSha': head, 'files': {str(p.relative_to(out)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file() and p.name != 'DELIVERY-MANIFEST.json'}}
(out / 'DELIVERY-MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
