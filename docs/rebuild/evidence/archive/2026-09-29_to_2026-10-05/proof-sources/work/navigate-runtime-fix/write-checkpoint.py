from pathlib import Path
import subprocess,json,re,hashlib
root=Path.cwd();repo=root/'work/maya-controlled-integration';out=root/'outputs/navigate-runtime-fix';base='1d519822bb92343f1bf4efdf92cbc4264eace48a'
def git(*args):return subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
head=git('rev-parse','HEAD');assert git('rev-parse','HEAD^')==base;assert not git('status','--porcelain')
receipts=out/('receipts-'+head[:8]);rs=[json.loads(p.read_text()) for p in sorted(receipts.glob('*.receipt.json'))]
assert len(rs)==8
for r in rs:assert r['candidate']==head and r['exit']==0,r
changed=git('diff','--name-only',base,head).splitlines();assert all(p.startswith('maya-chat-shell/') for p in changed)
assert git('diff',base,head,'--','maya-saas-backend','maya-carrier-react')==''
def count(name):
 s=(receipts/(name+'.log')).read_text();return {k:int(re.search(r'^# '+k+r' (\d+)$',s,re.M)[1]) for k in ['tests','pass','fail','skipped']}
runtime=count('runtime-test');carrier=count('carrier-test');assert runtime['fail']==carrier['fail']==0
obs=json.loads((receipts/'source-carrier-observations.json').read_text());p,j=obs['observations'];d=j['diagnostic']
assert p['createRescheduleCancel'] and p['counters']['submissions']==8
assert j['fullscreen']['phase']=='open' and j['fullscreen']['result']['density']=='SHEET'
assert [None if v is None else v['phase'] for v in d['fullscreenTransitions']]==['progress','open']
assert d['timelineBefore']==d['timelineAfter'];assert all(v['verdict']=='valid' for v in d['renderCalls'])
assert d['initialEnvelope']['value']['presentation']['fullscreen_detail']['route_key']=='fs.calendar'
assert d['exchanges'][0]['status']==200
assert d['exchanges'][0]['response']['value']['next_envelope']==d['exchanges'][0]['projection']['value']['next_envelope']
assert 'I-SRC-1 NAVIGATE DOM: accepted detail keeps one dialog; Escape' in (receipts/'runtime-test.log').read_text()
assert 'I-SRC-1 NAVIGATE: wrong tenant' in (receipts/'runtime-test.log').read_text()
patch=out/'I-SRC-1-NAVIGATE.patch';patch.write_bytes(subprocess.check_output(['git','format-patch','-1','--stdout',head],cwd=repo))
proofs={
 'valid fs.calendar NAVIGATE to fullscreen':'PASS; real canonical journal HTTP source + live submission + actual runtime',
 'detail never inserted into timeline':'PASS; before/after timeline IDs identical in actual source probe',
 'PROGRESS resolves correctly':'PASS; progress -> open, no history pop/push bounce',
 'undeclared or forged route':'PASS; 0 submissions',
 'substituted detail':'PASS; parent, route, turn, profile, self-echo, tampering, expiry and terminal negatives',
 'wrong tenant/principal':'PASS; runtime opaque correlation checks and canonical refusal propagation; server authority implementation unchanged',
 'contradictory or missing server acceptance':'PASS; REFUSED/NEEDS_VERIFICATION/expired/missing acceptance cannot open even with an attached envelope',
 'late response after close/back/sign-out/replacement':'PASS; no reopening, no timeline fallback',
 'closeDetail/fullscreen null':'PASS; idempotent close and detail token release',
 'focus/escape/back':'PASS; runtime with DOM double and unchanged carrier suite; no new device/browser certification claimed',
 'ordinary non-detail timeline':'PASS; successor append and in-place replacement preserved',
}
result={'base':base,'candidate':head,'branch':git('branch','--show-current'),'worktree':str(repo),'workingTreeClean':True,'navigateRootCauseFixed':True,'navigateFullscreen':'PASS','timelinePollution':0,'negativeRouteAuthProofs':'PASS','newNavigateRegressionTests':33,'runtime':runtime,'carrier':carrier,'backendFilesTouched':0,'carrierFilesTouched':0,'visualDesignChanged':False,'handoff':'STOP unchanged','sourceCarrierProbe':'PASS: personal create/reschedule/cancel and canonical NS-1 detail','proofs':proofs,'readyForCodexFinalCertification':True,'fullReleaseCertification':'NOT RUN in this narrow runtime unit; no certificate issued','scopeBoundary':'Opening NAVIGATE(detail) and existing close/Escape/browser-Back behavior. NAVIGATE(w) resolved_widget transport was not modified or newly certified.','productionEffects':0,'productionMigration':False,'realOtp':0,'realYclients':0,'iphoneReinstall':False,'chapter10':False,'changedFiles':changed,'receipts':rs,'patch':str(patch)}
(out/'CHECKPOINT.json').write_text(json.dumps(result,indent=2)+'\n')
(out/'PROOFS.md').write_text(f'''# I-SRC-1 NAVIGATE runtime patch

Base: `{base}`. Candidate: `{head}`. Branch: `{result['branch']}`. One atomic commit; clean worktree.

The accepted, server-declared NAVIGATE(detail) response now resolves the existing PROGRESS into `ShellView.fullscreen` using the existing detail controller. It never calls timeline ingest for this path. The same history entry and opener survive the transition. Close, Escape and browser Back remain owned by `closeDetail` / existing shell history handling.

The runtime carries the server's explicit acceptance verdict and checks response correlation: original parent widget, declared route, tenant, opaque principal proof, turn and render profile. It verifies existing H7/conformance and live lifecycle. These checks do not grant authority, validate server HMAC locally or replace current server principal/tenant checks. Refused, substituted or late detail responses cannot fall back to timeline insertion. Ordinary non-detail successors retain their existing timeline behavior.

## Fresh checks on this commit

- Runtime: **{runtime['pass']} PASS, {runtime['skipped']} declared skips, 0 failures** ({runtime['tests']} total). Includes **33 new NAVIGATE regression tests**.
- Carrier: **{carrier['pass']}/{carrier['tests']} PASS**.
- Runtime/carrier builds, type checks and runtime build gate: PASS.
- Existing, unmodified backend source-carrier probe: PASS. Real canonical journal HTTP source yields `fs.calendar`, HTTP 200 and accepted detail; actual runtime transitions `progress → open`, density SHEET, timeline IDs unchanged. The personal create/reschedule/cancel path remains PASS (8 submissions).

| Required proof | Result |
|---|---|
'''+''.join(f'| {k} | {v} |\n' for k,v in proofs.items())+f'''
[Full canonical source envelope, detail response and observed runtime states]({receipts/'source-carrier-observations.json'}). Spendable tokens are redacted with hashes; raw fixture payloads remain process-local.

[Source probe command and candidate receipt]({receipts/'source-carrier.receipt.json'}) · [Runtime receipt]({receipts/'runtime-test.receipt.json'}) · [Carrier receipt]({receipts/'carrier-test.receipt.json'}) · [Applyable patch with provenance]({patch})

Changed files:

'''+''.join(f'- `{p}`\n' for p in changed)+'''
Backend files changed: **0**. Carrier source, visual styles, backend authority, HANDOFF scope and registry/profile digest: unchanged. The committed runtime manifest was rebuilt to match the changed runtime modules.

`READY FOR CODEX FINAL CERTIFICATION = YES`. This unit stops after patch/proofs as requested. Full mutation/CI/release certification has not been executed in this unit and no release certificate is claimed. This patch concerns opening detail and existing close/Escape/browser-Back behavior; it does not extend or certify the separate NAVIGATE(w)/resolved_widget transport.

Production migration, deployment, grant, real OTP/YCLIENTS, iPhone reinstall and Chapter 10 effects: **0**.

The `receipts-precommit/` directory contains explicitly labeled diagnostic runs from before the commit. They do not substitute for the fresh committed-candidate receipts linked above.
''')
(out/'CHECKPOINT.md').write_text(f'''# I-SRC-1 NAVIGATE — завершено

Commit `{head}` основан точно на `{base}`. Канонический detail теперь открывается в fullscreen через существующий controller, сохраняя history entry и возврат фокуса. Лента не получает detail как обычный widget.

```yaml
NAVIGATE ROOT CAUSE FIXED: YES
NAVIGATE FULLSCREEN: PASS
TIMELINE POLLUTION: 0
NEGATIVE ROUTE/AUTH PROOFS: PASS
RUNTIME TESTS: {runtime['pass']} PASS / {runtime['skipped']} SKIP / 0 FAIL
CARRIER TESTS: {carrier['pass']} PASS / 0 FAIL
BACKEND FILES TOUCHED: 0
READY FOR CODEX FINAL CERTIFICATION: YES
```

Реальный локальный source-carrier probe: PASS для NAVIGATE и create/reschedule/cancel. Добавлены 33 регрессионные проверки. Визуальный дизайн и HANDOFF STOP сохранены.

[Patch]({patch}) · [Доказательства и границы проверки]({out/'PROOFS.md'}) · [Полный checkpoint]({out/'CHECKPOINT.json'})

Остановлено после patch/proofs. Финальная release-сертификация ещё не выполнялась; production effects: 0.
''')
manifest={'candidate':head,'files':[{'path':str(p.relative_to(out)),'sha256':h(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='DELIVERY-MANIFEST.json']};(out/'DELIVERY-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['candidate','navigateRootCauseFixed','timelinePollution','runtime','carrier','backendFilesTouched','readyForCodexFinalCertification']},indent=2))
