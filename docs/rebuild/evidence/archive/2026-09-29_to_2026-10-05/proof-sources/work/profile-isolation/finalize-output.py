import pathlib, json, hashlib, shutil, subprocess, datetime
root=pathlib.Path.cwd(); work=root/'work/profile-isolation'; repo=root/'work/maya-controlled-integration'
out=root/'outputs/profile-isolation'; receipts=out/'receipts'
read=lambda p:json.loads(p.read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
unit=read(work/'final-backend.json'); live=read(work/'final-live.json')
turn=read(work/'final-turn-mutants-focused.json')
profile=read(work/'final-profile-ingress-mutants.json')
contract=read(work/'final-profile-contract-mutants.json')
assert unit['success'] and live['success']
for name in ['final-profile-ingress-mutants.json','final-profile-contract-mutants.json','final-contract-typecheck.log']:
    shutil.copy2(work/name,receipts/name)
matrix=read(out/'MATRIX-REVIEW.json')
fbe=read(repo/'docs/rebuild/widget-release-programme/sb1-v2/fbe2e-disposition.json')
fbe['scope']='Controlled integration: fresh backend, source evidence and artifact checks; no new whole FBE2E limitation closure.'
fbe['currentCandidate']=head
fbe['integrationBoundary']='Actual React carrier-to-backend booking/NAVIGATE journey and full fresh applicable certification remain unproved. Runtime API prerequisites are explicitly skipped in the standalone suite.'
(out/'FBE2E-DISPOSITION.json').write_text(json.dumps(fbe,ensure_ascii=False,indent=2)+'\n')
stats=lambda d:{k:d[k] for k in ['numPassedTests','numPassedTestSuites','numPendingTests','numFailedTests']}
data={
 'candidateSha':head,'branch':'codex/maya-controlled-integration-20260930','worktree':str(repo),
 'profile':'closed-input.no-handoff@1','profileIsolation':'PASS' if profile['status']=='AS-DECLARED' and contract['status']=='AS-DECLARED' else 'FAIL',
 'handoffIngressEgressRefusals':'PASS','9.6':'PASS',
 'falseBefore':10,'falseGlobal':9,'profileApplicableFalse':7,'evidenceMissing':7,'integrationOwned':0,
 'globalHandoffStop':['G6-6','G13-R8'],
 'tests':{'backend':stats(unit),'widgetsLive':stats(live),'binaryCases':19,'releaseBinaryCases':2,'carrier':{'pass':93,'fail':0},'runtime':{'pass':355,'fail':0,'skipped':7},'e2e':1,'eventsLive':4,'httpSmoke':'PASS'},
 'mutations':{'declared':492,'batteries':42,'scheduledJobs':63,'completeProgramme':'NOT_COMPLETE',
   'TURN':{'status':turn['status'],'mutants':len(turn['mutants']),'restrictions':turn['restrictions'],'sourceHead':turn['source_head']},
   'PI':{'status':profile['status'],'mutants':len(profile['mutants']),'restrictions':profile['restrictions'],'sourceHead':profile['source_head']},
   'PI-contract':{'status':contract['status'],'mutants':len(contract['mutants']),'restrictions':contract['restrictions'],'sourceHead':contract['source_head']}},
 'ciEquivalent':'INCOMPLETE','carrierIntegration':'PARTIAL: conformance, runtime binding and build/parity pass; complete live journey not certified',
 'certifiedForProfile':False,'fullContractCertified':False,'readyForReleaseAuthorization':False,
 'schemaChanges':0,'presentationOverlap':0,'productionEffects':0,'realOtp':0,'realYclientsEffects':0,
 'remainingBlockers':[
  'BS-1 source contract: personal appointments.own.list → SCHEDULE for G7-5/G7-BOOK1/G11-I9/G13-I3.',
  'NS-1 bounded CHECK/source contract: retained journal date and exact detail/parent navigation for G12-R1b/G12-I11/G13-R2.',
  'After source implementation: complete fresh applicable 492-mutation/CI/carrier/FBE2E certification on the final exact candidate; no current release certificate.',
 ],
 'sourceReceiptQualification':'Backend and clean HTTP/BIN receipts were captured on 5b928b01; a65aa04d adds only the independently verified exact CI inventory test. Runtime rebuild bytes are identical. This validation-only overlay is documented; it is not a complete exact-final-HEAD release certificate.',
 'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
(out/'CHECKPOINT.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
text=f"""# Controlled integration checkpoint

Candidate: `{head}`
Branch: `codex/maya-controlled-integration-20260930`
Worktree: `{repo}`

The fixed server profile and one canonical persisted USER-turn writer are implemented. The current progress matrix is 130 L, 4 L-T, 22 U and 9 false. This is not a release certificate.

```yaml
PROFILE: closed-input.no-handoff@1
PROFILE ISOLATION: {data['profileIsolation']}
HANDOFF INGRESS/EGRESS REFUSALS: PASS
9.6: PASS
FALSE GLOBAL CLAUSES: 9
PROFILE-APPLICABLE FALSE: 7
EVIDENCE_MISSING: 7
INTEGRATION_OWNED: 0
MUTATIONS: PARTIAL — complete 492 programme not certified
CI-EQUIVALENT: INCOMPLETE
CARRIER INTEGRATION: PARTIAL
CERTIFIED_FOR_PROFILE: NO
FULL-CONTRACT CERTIFIED: NO
READY FOR RELEASE AUTHORIZATION: NO
```

## Implemented and proved

- Profile: exact fixed registry/template combinations; only the two named HANDOFF duties excluded; V1 full-contract parser unchanged. Existing entitlement configJson plus atomic AuditLog binding suffice; no schema change. Server admission protects mint, ingress, dispatch, stored resolve/navigation, cache and successor exits, including stale/revoked/regranted tokens.
- 9.6: ordinary typed chat, typed widget routing and native widget lowering converge on TimelineStore.appendUserTurn. Tenant/actor/request correlation, exactly one USER row, immutable audit, retries, erasure, authority and conversation fencing are covered. Clean T-2b HTTP/BIN evidence passed the canonical verifier; three named mutants kill that clean HTTP proof. No mirror writer.
- Original Claude/backend worktrees are unchanged. React/CSS/iOS sources and presentation ratchets have zero delta. Seven headless-runtime files carry the approved identity integration. Full changed-path and commit-parent proof is in `receipts/ownership-and-source-overlay.json`.

## Fresh verification

Backend: 586 suites / 5,594 tests, zero failures or skips. Widgets live: 34 suites / 394 tests. BIN: 19 cases plus two cross-process release/identity cases. HTTP smoke and four PostgreSQL event tests pass.

Carrier: 93/93. Runtime: 355 pass, 7 explicitly skipped local-API cases; those skips are not PASS. Web/Capacitor parity, reproducible runtime hashes, K5/K15, carrier ratchets (50 refuse / 42 admit), typechecks, lint and K3 pass. Contract checker: 31 pass and 4 historical advisory pending checks. Dependency audit: zero high/critical, four moderate.

Mutation receipts: TURN {turn['status']} (12, restricted diagnostics); PI {profile['status']} (6, unfiltered live suite); PI-contract {contract['status']} (16, restricted unit diagnostics). All 492 anchors validate; 35 scheduling/receipt integrity checks pass. These receipts do not substitute for the complete programme of 42 batteries / 63 jobs.

The last commit changes only the exact CI inventory test. Backend/source-pair receipts name 5b928b01, and the documented validation-only delta leads to a65aa04d. A fresh build on the latter has byte-identical backend artifacts. No complete final-HEAD release-certification claim is made.

## Exact boundary

1. BS-1 requires a new narrowly defined personal-client appointment source: four booking evidence duties remain false.
2. NS-1 requires an additive change to the existing retained-date CHECK and exact source/parent navigation contract: three navigation duties remain false. The live PostgreSQL STOP proof rejects the current invalid shape. No migration is authored.
3. Following those decisions and implementations, complete the whole fresh mutation/CI/carrier/FBE2E certification on the final candidate. FBE2E disposition remains 13 CLOSED / 6 PARTIAL / 9 OPEN; no production/provider/OTP or real carrier journey evidence is fabricated.

See [DECISIONS.md](DECISIONS.md), [CLAUSE-MATRIX.md](CLAUSE-MATRIX.md), [current-audit.json](current-audit.json) and the fresh [threshold refusal proof](receipts/threshold-refusal.json).

G6-6 and G13-R8 remain globally false/STOP. Full-contract certification remains false. No production grant/deploy/write, real OTP, real YCLIENTS effect, iPhone reinstall or Chapter 10. No source branch merge or push occurred.
"""
(out/'CHECKPOINT.md').write_text(text)
manifest={}
for file in sorted(out.rglob('*')):
    if file.is_file() and file.name!='DELIVERY-MANIFEST.json':
        manifest[str(file.relative_to(out))]={'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
(out/'DELIVERY-MANIFEST.json').write_text(json.dumps({'candidateSha':head,'files':manifest},indent=2)+'\n')
print(json.dumps({'candidate':head,'globalFalse':9,'applicableFalse':7,'profileIsolation':data['profileIsolation'],'certifiedForProfile':False,'receiptFiles':len(manifest)}))
