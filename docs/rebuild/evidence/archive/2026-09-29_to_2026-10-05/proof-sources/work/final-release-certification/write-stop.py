from pathlib import Path
import subprocess,json,hashlib,collections,shutil
root=Path.cwd();repo=root/'work/maya-controlled-integration';out=root/'outputs/final-release-certification';work=root/'work/final-release-certification';receipts=out/'receipts'
def git(*args):return subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
head=git('rev-parse','HEAD');assert head=='6a40575cc0dc841a84f42367a45364ff7e626f09';assert git('status','--porcelain')==''
obs=json.loads((receipts/'source-roundtrip-observations.json').read_text());personal,journal=obs['observations'];d=journal['diagnostic'];ret=journal['parentReturn'];x=d['exchanges'][-1];raw=x['response']['value'];projection=x['projection']['value']
assert personal['createRescheduleCancel'] and personal['counters']['submissions']==8
assert journal['roundTripPassed'] is False
assert x['status']==200 and raw['outcome']=='terminate' and raw['receipt_outcome']=='ACCEPTED'
assert ret['requestedParentWidgetId']==ret['resolvedParentWidgetId']==raw['resolved_widget']['widget_id']
assert 'resolved_widget' not in projection
assert d['submissionOutcomes'][-1]['status']=='accepted'
assert ret['after']['fullscreen']['phase']=='open'
assert ret['after']['fullscreen']['itemId']==ret['before']['fullscreen']['itemId']
assert ret['before']['timeline']==ret['after']['timeline']
r=json.loads((receipts/'fbe2e-source-roundtrip.receipt.json').read_text());assert r['candidate']==head and r['exit']==1
mutants=[(p,json.loads(p.read_text())) for p in sorted((repo/'maya-saas-backend/test/widgets-live/mutations').glob('gate*.json'))]
expect=collections.Counter('equivalent' if isinstance(m.get('equivalent'),str) else m.get('expect','live-killed') for _,ms in mutants for m in ms)
baseline=root/'outputs/source-certification/MATRIX-REVIEW.json';matrix=json.loads(baseline.read_text());false=[x['id'] for x in matrix['rows'] if x['state']=='false'];assert false==['G6-6','G13-R8']
matrixStatus={'candidate':head,'profile':'closed-input.no-handoff@1','profileApplicableFalse':0,'globalFalse':2,'globalFalseIds':false,'basis':'Inherited backend progress disposition only; unchanged backend, NOT a freshly certified complete clause audit','basisFile':str(baseline),'basisSha256':h(baseline),'freshIntegrationFailure':'NS-1 canonical NAVIGATE(w) parent-return result is dropped by runtime projection','fullContractCertified':False,'certifiedForProfile':False};(out/'MATRIX-STATUS.json').write_text(json.dumps(matrixStatus,indent=2)+'\n')
programme=[
 ('full applicable mutation corpus','NOT RUN',f'{sum(len(ms) for _,ms in mutants)} declarations / {len(mutants)} batteries; STOP on FBE2E defect before running corpus'),
 ('full CI-equivalent','FAIL / INCOMPLETE','FBE2E required path failed; remaining programme stopped'),
 ('backend full suite','NOT RUN','STOP; no historical receipts reused'),
 ('runtime full suite','NOT RUN','STOP; runtime build fresh PASS only'),
 ('carrier full suite','NOT RUN','STOP; carrier build and test-harness build fresh PASS only'),
 ('widgets-live full','NOT RUN','STOP; targeted roundtrip FBE2E probe is separate'),
 ('HTTP/BIN full','NOT RUN','STOP; actual HTTP used by targeted FBE2E only'),
 ('complete applicable FBE2E','FAIL','Personal create/reschedule/cancel PASS; detail opening PASS; server-resolved parent return FAIL'),
 ('profile isolation','NOT RUN','STOP'),('revocation/expiry','NOT RUN','STOP'),('cross-tenant/profile substitution','NOT RUN','STOP'),('old-token refusal','NOT RUN','STOP'),
 ('artifact/hash/parity','INCOMPLETE','Fresh builds pass; current artifact hashes recorded, full parity programme stopped'),('9.6 proof','NOT RUN','STOP'),
 ('BS-1','PARTIAL','Fresh actual personal carrier create/reschedule/cancel PASS; full certification programme stopped'),('NS-1','FAIL','Exact parent received from server; projection drops it and detail stays open'),('self-booking successor mechanism','NOT RUN','STOP; no OTP sent')]
(out/'PROGRAMME.json').write_text(json.dumps({'candidate':head,'termination':'STOP_ON_GENUINE_DEFECT','mutationInventory':{'batteries':len(mutants),'declarations':sum(len(ms) for _,ms in mutants),'byDeclaredExpectation':dict(expect),'executedInThisPass':0},'checks':[{'name':n,'status':s,'detail':d} for n,s,d in programme]},indent=2)+'\n')
status={'candidate':head,'integration':'Exact requested commit already at HEAD; exact parent 1d519822bb92343f1bf4efdf92cbc4264eace48a verified; no duplicate cherry-pick','branch':git('branch','--show-current'),'worktree':str(repo),'worktreeClean':True,'candidateFilesChangedThisPass':0,'profileApplicableFalse':0,'globalFalse':2,'matrixQualification':'Inherited backend progress matrix only, not fresh full certification','fullMutations':'NOT RUN — STOP','ciEquivalent':'FAIL / INCOMPLETE','fbe2e':'FAIL — canonical parent return','pwaCarrierParity':'NOT CERTIFIED — full check stopped','certifiedForProfile':False,'fullContractCertified':False,'readyForReleaseAuthorization':False,'defect':{'id':'I-SRC-1-RETURN','owner':'RUNTIME','rawResolvedParent':ret['resolvedParentWidgetId'],'projectionPreservesResolvedWidget':False,'submissionOutcome':'accepted','activationOutcome':d['activationOutcomes'][-1]['outcome'],'fullscreenAfter':'open','sameDetailStillOpen':True,'timelinePollution':0},'productionEffects':0,'productionMigrationApplied':False,'realOtp':0,'realYclientsEffects':0,'iphoneReinstall':False,'chapter10':False,'remainingBlockers':['Runtime typed projection/submission loses the canonical NAVIGATE(w) resolved parent; accepted outcome does not return/close the current detail.','After fixing that exact runtime path, produce a new exact candidate and run the complete fresh certification programme. This pass stopped at the defect; no old/partial receipts substitute.']}
(out/'CHECKPOINT.json').write_text(json.dumps(status,indent=2)+'\n')
summary={'sourceWidgetId':ret['requestedParentWidgetId'],'detailWidgetId':d['exchanges'][0]['response']['value']['next_envelope']['widget_id'],'returnControl':d['activationOutcomes'][-1]['ref'],'serverTarget':ret['returnIntent']['value']['target'],'http':x['status'],'receipt_outcome':raw['receipt_outcome'],'serverResolvedWidgetId':raw['resolved_widget']['widget_id'],'projectedKeys':list(projection),'submissionOutcomes':d['submissionOutcomes'],'fullscreenAfter':ret['after']['fullscreen']['phase'],'sameDetailStillOpen':True,'timelineUnchanged':True}
(out/'DEFECT-SUMMARY.json').write_text(json.dumps(summary,indent=2)+'\n')
(out/'STOP-NS1-PARENT-RETURN.md').write_text(f'''# I-SRC-1-RETURN — final certification STOP

Exact candidate: `{head}`. Its parent is exactly `1d519822bb92343f1bf4efdf92cbc4264eace48a`. The requested NAVIGATE opening patch was already integrated at HEAD; no duplicate cherry-pick or product edit was made. Worktree remains clean.

## Observed defect

The canonical journal source opens fullscreen correctly. Its server-declared `navigate.journal.parent@1` control is present in the actual runtime reading order and rendered by the actual React DetailSheet. Activating that exact control reaches the real local HTTP gateway. The server authorizes and resolves the exact parent, but the runtime drops the result and leaves the same detail open while reporting the activation as dismissed/successful.

```json
{json.dumps(summary,indent=2)}
```

This is the canonical NAVIGATE(w) **server return control**, not Escape, browser Back or the chrome close button. Those close paths were the subject of the preceding patch; they do not substitute for this round trip.

## Exact failure points

- `maya-saas-backend/src/widgets/routing/effect-router.service.ts:225`: the journal child/parent relationship and current parent are resolved using the current tenant/principal. At line 251 the server returns the parent envelope as `resolvedWidget`; the HTTP receipt exposes it as `resolved_widget`. This fresh response is HTTP 200 / ACCEPTED, and its widget ID exactly equals the server-minted return target.
- `maya-chat-shell/src/net/types.ts:215`: `WidgetIntentProjection` has no `resolved_widget` member.
- `maya-chat-shell/src/net/project.ts:268`: `projectWidgetIntent` returns only outcome, code, next_envelope and receipt_outcome. The captured projected response has exactly those four keys; `resolved_widget` is lost here.
- `maya-chat-shell/src/shell/intents.ts:108`: with no next_envelope the live submission reads terminal receipts, then returns `accepted` for this response. No canonical parent reaches the shell.
- `maya-chat-shell/src/shell/intents.ts:597`: the accepted branch marks the current detail entry terminal and republishes it. It neither resolves a parent return nor closes the detail. The final ShellView still names the same `d2` detail in phase `open`.

Fix owner: **RUNTIME**. No backend emission defect was observed in this round trip. No generic navigation policy or HANDOFF implementation is called for. The missing transport/lifecycle path must carry the validated server-resolved parent and use the existing shell return/close ownership, preserving current tenant/principal/release and exact-parent binding. No fix was implemented in this certification pass, in accordance with the explicit STOP instruction.

## Fresh evidence and reproduction

[Full raw-shape source/detail/return payloads, projections and runtime observations]({receipts/'source-roundtrip-observations.json'}) · [Failing executable receipt]({receipts/'fbe2e-source-roundtrip.receipt.json'}) · [Jest result]({receipts/'fbe2e-source-roundtrip.json'}) · [Harness diff]({out/'HARNESS-DIFF.txt'}) · [Harness hashes and candidate provenance]({out/'CANDIDATE.json'}).

Spendable tokens are redacted using SHA-256 markers. Payload JSON hashes are captured before redaction. Credentials remain process-local. All data comes from guarded synthetic INTERNAL-calendar fixtures on loopback PostgreSQL; there is no production/provider effect.

The verification harness is an external copy of the existing source-carrier probe. It adds only the actual drawn parent-return activation and a round-trip assertion; production modules, envelopes and the candidate checkout are unchanged. It does not mock or repair the HTTP response. The raw parent response and the lost typed projection are recorded independently of the final fullscreen assertion.

From the task directory, the saved reproduction scripts recreate and run this external harness:

```bash
python3 outputs/final-release-certification/reproduce/prepare.py
python3 outputs/final-release-certification/reproduce/run-preflight.py
```

Requires the existing Node 22.23.2 runtime, local guarded proof PostgreSQL with the approved NS-1 test migration, and installed dependencies. The scripts require the exact candidate and a clean worktree. No production connection is used.

## Certification disposition

Fresh runtime build, carrier build and carrier harness build: PASS. Fresh personal create/reschedule/cancel: PASS (8 submissions). Fresh NAVIGATE(detail) opening: PASS. Fresh canonical parent return: **FAIL**. The FBE2E assertion is red and is not waived.

Full mutation execution and remaining suites were **not run after this defect**. The complete programme is listed in [PROGRAMME.json]({out/'PROGRAMME.json'}); no historical or partial receipt is counted as full certification.

The backend progress matrix remains 0 profile-applicable false / 2 global false (`G6-6`, `G13-R8` STOP); this is explicitly an inherited progress disposition, not a fresh certification audit. The separate mandatory integration duty fails. `closed-input.no-handoff@1` and `full165.closed-input` are unchanged. No profile or full-contract certificate is issued. Release authorization readiness: NO.
''')
(out/'CHECKPOINT.md').write_text(f'''# Final release certification — STOP

```yaml
FINAL CANDIDATE SHA: {head}
PROFILE-APPLICABLE FALSE: 0 # inherited backend progress matrix; not certified
GLOBAL FALSE: 2 # G6-6 / G13-R8 STOP
FULL MUTATIONS: NOT RUN — STOP
CI-EQUIVALENT: FAIL / INCOMPLETE
FBE2E: FAIL — canonical NAVIGATE(w) parent return
PWA/CARRIER PARITY: NOT CERTIFIED — STOP
CERTIFIED_FOR_PROFILE: NO
FULL-CONTRACT CERTIFIED: NO
READY FOR RELEASE AUTHORIZATION: NO
```

Дефект: backend возвращает точный parent в `resolved_widget` (HTTP 200 / ACCEPTED), projection удаляет это поле, runtime сообщает успешное действие и оставляет прежний detail открытым. Это серверная ссылка возврата NS-1, а не Escape/Back/closeDetail.

По вашему условию сертификация остановлена на этом воспроизводимом дефекте. Код кандидата не менялся. Полные mutation/CI/parity-проверки после STOP не запускались; старые результаты не подставлялись.

[Точный дефект и воспроизведение]({out/'STOP-NS1-PARENT-RETURN.md'}) · [Envelope и receipt]({receipts/'source-roundtrip-observations.json'}) · [Статус всей программы]({out/'PROGRAMME.json'})

Оставшиеся blockers: runtime-путь канонического parent return; после его исправления — полная свежая сертификация нового точного кандидата. Production migration/deploy/grant, реальные OTP/YCLIENTS, iPhone reinstall, Chapter 10: 0.
''')
repro=out/'reproduce';repro.mkdir(exist_ok=True)
for f in ['prepare.py','run-preflight.py']:shutil.copy2(work/f,repro/f)
files=[repo/'maya-chat-shell/dist/manifest.json',repo/'maya-chat-shell/src/net/project.ts',repo/'maya-chat-shell/src/net/types.ts',repo/'maya-chat-shell/src/shell/intents.ts',repo/'maya-saas-backend/src/widgets/routing/effect-router.service.ts']
(out/'ARTIFACT-HASHES.json').write_text(json.dumps({'candidate':head,'scope':'Diagnostic artifact/source identity only; not full parity certification','files':[{'path':str(p.relative_to(repo)),'sha256':h(p)} for p in files]},indent=2)+'\n')
manifest={'candidate':head,'files':[{'path':str(p.relative_to(out)),'sha256':h(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='DELIVERY-MANIFEST.json']};(out/'DELIVERY-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(status,indent=2))
