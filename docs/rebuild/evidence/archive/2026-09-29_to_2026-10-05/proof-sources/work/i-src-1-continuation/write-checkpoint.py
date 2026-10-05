import json,pathlib,subprocess,hashlib,re,collections,datetime
root=pathlib.Path.cwd();repo=root/'work/maya-controlled-integration';out=root/'outputs/i-src-1-continuation'
def git(*args):return subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
head=git('rev-parse','HEAD');receipts=out/('receipts-'+head[:8]);assert git('status','--porcelain')==''
rs={p.name.removesuffix('.receipt.json'):read(p) for p in receipts.glob('*.receipt.json')}
for n in ['runtime-check','runtime-build','runtime-typecheck','runtime-test','carrier-typecheck','carrier-build','carrier-test','source-profile-live','live-typecheck']:
 assert rs[n]['candidate']==head and rs[n]['exit']==0,n
assert rs['source-carrier']['candidate']==head and rs['source-carrier']['exit']==1
observations=read(receipts/'source-carrier-observations.json');personal,journal=observations['observations'];d=journal['diagnostic'];e=d['initialEnvelope']['value'];exchange=d['exchanges'][0];response=exchange['response']['value'];projection=exchange['projection']['value'];n=response['next_envelope']
assert personal['createRescheduleCancel'] and personal['counters']['submissions']==8
assert e['presentation']['fullscreen_detail']['route_key']=='fs.calendar'
assert exchange['status']==200 and response['stopped_at_gate']=='13'
assert projection['next_envelope']==n
assert all(v['verdict']=='valid' for v in d['renderCalls'])
assert d['renderCalls'][0]['presentation']['fullscreen_detail']['route_key']=='fs.calendar'
assert d['submissionOutcomes']==[{'status':'advanced','widgetId':n['widget_id']}]
assert [None if x is None else x['phase'] for x in d['fullscreenTransitions']]==['progress',None]
assert journal['fullscreen'] is None and len(d['timelineAfter'])==len(d['timelineBefore'])+1
assert git('diff','f531367f','HEAD','--','maya-chat-shell','maya-carrier-react')==''
paths=git('diff','--name-only','2b477417',head).splitlines();assert [p for p in paths if p.startswith('maya-saas-backend/')]==['maya-saas-backend/test/widgets-live/support/shell-approved-source-probe.mjs']
old=root/'outputs/source-certification/MATRIX-REVIEW.json';matrix=read(old);counts=collections.Counter(r['state'] for r in matrix['rows']);assert len(matrix['rows'])==165
false=[r['id'] for r in matrix['rows'] if r['state']=='false'];assert false==['G6-6','G13-R8']
matrix_status={'candidate':head,'basis':'Inherited backend clause progress disposition, not a new certification audit','baseline':str(old),'baselineSha256':sha(old),'clauses':165,'byState':dict(counts),'globalFalse':false,'profileApplicableFalse':0,'backendProductionFilesChanged':[],'freshIntegrationGate':'FAIL: I-SRC-1 NAVIGATE runtime lifecycle','fullCertificate':False,'profileCertificate':False}
(out/'MATRIX-STATUS.json').write_text(json.dumps(matrix_status,indent=2)+'\n')
proof=read(receipts/'source-profile-live.json');assert proof['success']
def tests(name):
 s=(receipts/(name+'.log')).read_text();return {k:int(re.search(r'^# '+k+r' (\d+)$',s,re.M)[1]) for k in ['tests','pass','fail','skipped']}
runtime=tests('runtime-test');carrier=tests('carrier-test')
status={'candidate':head,'branch':git('branch','--show-current'),'worktree':str(repo),'workingTreeClean':True,'cancelPatchIntegrated':True,'originalCancelCommit':git('rev-parse','f531367f'),'cherryPickCommit':git('rev-parse','977b814e'),'diagnosticCommit':head,'cancelSourceProbe':'PASS: create/reschedule/cancel, 8 submissions, 3 completed owner executions, DB appointment canceled','navigateRootCause':'The source declares fs.calendar and the HTTP/projection returns valid detail. Runtime closes progress, treats advanced as timeline ingest, never opens fullscreen.','navigateFixOwner':'RUNTIME','navigate':'FAIL','profile':'closed-input.no-handoff@1','profileApplicableFalse':0,'matrixQualification':'Backend progress disposition only; source-carrier integration fails and certification is incomplete.','globalFalse':2,'globalStops':false,'fullMutations':'NOT RUN on this candidate; deferred at the explicit runtime-defect STOP boundary','ciEquivalent':'NOT COMPLETE; source-carrier probe FAIL','fbe2e':'PARTIAL: personal create/reschedule/cancel PASS; journal detail FAIL; return not exercised through carrier','runtime':runtime,'carrier':carrier,'backendSourceProfileLive':{'suites':proof['numPassedTestSuites'],'tests':proof['numPassedTests'],'failed':proof['numFailedTests']},'fullBackendSuite':'NOT RERUN in this pass; previous receipts not relabeled','widgetsLiveFull':'NOT RERUN in this pass; targeted source/profile suites only','httpBinFull':'NOT RERUN in this pass','certifiedForProfile':False,'fullContractCertified':False,'readyForReleaseAuthorization':False,'migrationProductionApplied':False,'productionEffects':0,'realOtp':0,'realYclientsEffects':0,'filesTouched':paths,'remainingBlockers':['Claude-owned runtime NAVIGATE lifecycle does not open accepted detail; exact canonical envelope and observation attached. Stop observed as requested.','After the corrected runtime is integrated, rerun source-carrier detail and parent return, then the full fresh applicable mutation/CI/FBE2E certification on the final candidate.'],'receipts':list(rs.values())}
(out/'CHECKPOINT.json').write_text(json.dumps(status,indent=2)+'\n')
provenance={'sourceCommit':status['originalCancelCommit'],'integratedCommit':status['cherryPickCommit'],'exactSourceParent':git('rev-parse','f531367f^'),'integratedParent':git('rev-parse','977b814e^'),'cherryPickMarkerPreserved':'(cherry picked from commit '+status['originalCancelCommit']+')' in git('show','-s','--format=%B','977b814e'),'runtimeAndCarrierDiffFromClaudeCommit':'EMPTY','nonClaudeEdits':['maya-saas-backend/test/widgets-live/support/shell-approved-source-probe.mjs'],'productionBackendEdited':False,'artifacts':[{'path':p,'sha256':sha(repo/p)} for p in paths]}
(out/'INTEGRATION-PROVENANCE.json').write_text(json.dumps(provenance,indent=2)+'\n')
packet=f'''# I-SRC-1 — confirmed runtime NAVIGATE blocker

Candidate: `{head}` on `{status['branch']}`. The worktree is clean.

The missing-emission hypothesis is DISPROVED by the actual canonical NS-1 source. No backend production fix is justified. The implementation is stopped at the user's explicit runtime-defect boundary. No runtime or presentation rewrite was made.

## Exact observation

The guarded local PostgreSQL probe creates synthetic INTERNAL calendar fixtures, invokes the production `operations.journal.read` source for `2026-09-24`, then activates the server-declared drawn detail control through the actual runtime and HTTP gateway. It uses the production React test drawer to verify drawn refs. No envelope is fabricated or resealed by this probe.

- Initial envelope: `{e['widget_id']}`; provenance `{e['provenance']['source_capability']}`.
- `presentation.fullscreen_detail = {json.dumps(e['presentation']['fullscreen_detail'])}`.
- NAVIGATE target: `{{"class":"detail","ref":"fs.calendar"}}`; no InputSchema.
- Initial integrity verdict: `valid`; renderer projection retains that same fullscreen declaration.
- `/api/widgets/intent`: HTTP {exchange['status']}; gate {response['stopped_at_gate']}; {response['gates_run']} gates run; outcome `{response['outcome']}`.
- Returned `next_envelope`: `{n['widget_id']}`, SCHEDULE, retained date `2026-09-24`; integrity verdict `valid`.
- The transport projection preserves that returned envelope exactly; live submission returns `advanced` with the same widget ID.
- Observed fullscreen phases: `progress → null`. There is no `open` transition.
- Timeline widget count: `{len(d['timelineBefore'])} → {len(d['timelineAfter'])}`; detail is rendered at `CARD` in the timeline.
- Final `fullscreen = null`. The source-carrier acceptance test remains red; it has not been weakened to accept this result.

## Exact source cause

On this candidate `maya-chat-shell/src/shell/intents.ts:528` opens PROGRESS after the existing exact-own-route check accepts the server target. Line 538 closes PROGRESS after the response. Lines 547–551 handle every `advanced` outcome by `ingest(outcome.envelope)`, regardless of the accepted `opens_detail` route. `ingest` places this emission on the timeline. The existing controller operation `maya-chat-shell/src/shell/shell.ts:231` (`presentDetail`) is never called by this outcome path.

The backend emission at `maya-saas-backend/src/widgets/emission/envelope.factory.ts:503` is correct for this request. Changing that declaration cannot repair a lifecycle branch which already accepted it and received a valid response.

Owner: **RUNTIME / Claude**. This packet does not authorize rewriting presentation semantics. Preserve existing integrity checks, route ownership, authority, parent re-resolution, no nested detail and focus/back behavior. Parent return through the carrier has not yet been exercised because the required fullscreen opening fails first; the separate fresh backend source tests prove the canonical parent HTTP response.

## Reproduction and receipts

[Complete observed initial envelope, exact detail response, transport projection and runtime trace]({receipts/'source-carrier-observations.json'}). Only spendable token/password/authorization string fields are replaced by SHA-256 markers. Each raw synthetic payload also has its own JSON hash. Bearer [REDACTED] are never recorded. Redacted copies are diagnostic artifacts; they are not reusable authenticated wire payloads. All raw authority values stay process-local; rerunning the probe obtains fresh ones.

[Probe command, candidate SHA and exit status]({receipts/'source-carrier.receipt.json'}). Set `DATABASE_URL` to the guarded loopback proof database and `GITHUB_SOURCE_PROBE_OUT` to an explicit local report path, then run in `maya-saas-backend`:

```bash
npx jest --config test/jest-widgets-live.json --runInBand --testRegex 'widgets-live/source-carrier.probe-spec.ts$'
```

Requires Node 22.23.2, dependencies, the already-approved NS-1 test migration, runtime build and carrier test harness. No production infrastructure is needed or authorized.

## CANCEL and certification

The exact Claude patch `f531367f` was cherry-picked as `977b814e` with original author, coauthor and source marker. Its parent is exactly the previous candidate; file overlap/conflicts: zero. Runtime/carrier paths remain byte-for-byte equal to Claude's commit. Fresh personal source-carrier probe passes: 8 submissions; create, reschedule and cancel owner executions; the same appointment ends canceled.

Fresh tests on `{head[:8]}`: runtime {runtime['pass']} PASS / {runtime['skipped']} declared skips, carrier {carrier['pass']} PASS; targeted backend source/profile tests {proof['numPassedTests']} PASS across {proof['numPassedTestSuites']} suites. Build and type checks pass. Full mutation corpus and complete CI certification are **not run/certified for this candidate**: the user's prerequisite NAVIGATE PASS is not met and their runtime-defect STOP applies.

The inherited backend progress matrix remains 0 profile-applicable false / 2 global HANDOFF STOP duties. This is not integration success or a release certificate. `CERTIFIED_FOR_PROFILE = NO`; `FULL-CONTRACT CERTIFIED = NO`; `READY FOR RELEASE AUTHORIZATION = NO`.

Production migration/deploy/grant, real OTP, real YCLIENTS, iPhone reinstall and Chapter 10 effects: zero.
'''
(out/'NAVIGATE-ROOT-CAUSE.md').write_text(packet)
(out/'CHECKPOINT.md').write_text(f'''# I-SRC-1 checkpoint

CANCEL интегрирован и прошёл полный локальный путь создания, переноса и отмены. NAVIGATE блокируется подтверждённым дефектом runtime: сервер корректно выдаёт `fs.calendar`, но принятый detail попадает в ленту после закрытия PROGRESS. Реализация остановлена согласно вашему условию; runtime-семантика не переписана.

```yaml
FINAL CANDIDATE SHA: {head}
CANCEL PATCH INTEGRATED: YES
NAVIGATE ROOT CAUSE: accepted detail ingested into timeline after PROGRESS closes
NAVIGATE FIX OWNER: RUNTIME
NAVIGATE: FAIL
PROFILE-APPLICABLE FALSE: 0 # backend progress matrix; integration gate FAIL
GLOBAL FALSE: 2 # G6-6 and G13-R8 remain STOP
FULL MUTATIONS: NOT RUN ON THIS CANDIDATE
CI-EQUIVALENT: INCOMPLETE / BLOCKED
FBE2E: PERSONAL PASS / NAVIGATE FAIL
CERTIFIED_FOR_PROFILE: NO
READY FOR RELEASE AUTHORIZATION: NO
PRODUCTION EFFECTS: 0
```

Свежие проверки точного HEAD: runtime {runtime['pass']} PASS, {runtime['skipped']} skips; carrier {carrier['pass']} PASS; backend source/profile {proof['numPassedTests']}/{proof['numPassedTests']} PASS. Это частичная проверка, не полная release-сертификация.

Остались два шага: исправление подтверждённого lifecycle-дефекта владельцем runtime; затем проверка detail/parent-return и полная свежая mutation/CI/FBE2E-сертификация финального кандидата.

[Точный пакет для Claude]({out/'NAVIGATE-ROOT-CAUSE.md'}) · [Envelope и probe receipt]({receipts/'source-carrier-observations.json'}) · [Provenance]({out/'INTEGRATION-PROVENANCE.json'}) · [Полный checkpoint]({out/'CHECKPOINT.json'})
''')
manifest={'candidate':head,'files':[{'path':str(p.relative_to(out)),'sha256':sha(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='DELIVERY-MANIFEST.json']};(out/'DELIVERY-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:v for k,v in status.items() if k not in ['receipts','filesTouched']},indent=2))
