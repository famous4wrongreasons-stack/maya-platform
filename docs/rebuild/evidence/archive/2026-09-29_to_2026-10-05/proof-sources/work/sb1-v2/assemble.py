from pathlib import Path
import json,subprocess,hashlib,shutil,zipfile
root=Path(__file__).resolve().parents[2];repo=root/'work/widget-release';work=root/'work/sb1-v2';receipts=work/'final-receipts';docs=repo/'docs/rebuild/widget-release-programme/sb1-v2';out=root/'outputs/sb1-v2'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert head=='c94c751ca58342fc7ebf6f83cdec7bc16dd6c3ee'
subprocess.run(['node',str(docs/'recompute.mjs'),'--evidence',str(work/'final-evidence'),'--mutations',str(receipts/'mutations'),'--tests',str(receipts/'widgets.json'),'--source-head',head,'--out-dir',str(docs)],cwd=repo,check=True)
audit=json.loads((docs/'current-audit.json').read_text());assert audit['current_false_classification']=={'EVIDENCE_MISSING':11,'IMPLEMENTATION_MISSING':1,'OWNER_DECISION_REQUIRED':6}
mutations={}
for p in sorted((receipts/'mutations').glob('*.json')):
 r=json.loads(p.read_text());assert r['status']=='AS-DECLARED' and r['mismatches']==0 and not r['baseline_red'];mutations[p.stem]={'source_head':r['source_head'],'mutants':len(r['mutants']),'status':r['status'],'mismatches':0,'baseline_red':[], 'restrictions':r['restrictions']}
assert sum(m['mutants'] for m in mutations.values())==77
summaries={}
for name in ['backend','widgets','http']:
 r=json.loads((receipts/(name+'.json')).read_text());assert r['success'] and not r['numFailedTests'];summaries[name]={k:r[k] for k in ['numPassedTestSuites','numFailedTestSuites','numPassedTests','numFailedTests','numPendingTests','numTotalTests','success']}
binr=json.loads(next(l for l in (receipts/'bin.log').read_text().splitlines() if l.startswith('{')));assert binr['status']=='PASS' and binr['cases']==17
schema=json.loads((receipts/'schema-inventory.json').read_text());assert len(schema['columns'])==14 and schema['applied_migrations']==100 and schema['pending_or_failed_migrations']==0
own=json.loads((receipts/'ownership-proof.json').read_text());assert not own['ownershipOverlap'] and own['clientRolesUnchanged'] and own['productionActivation']=='FORBIDDEN'
verify=json.loads((work/'final-evidence/verification-report.json').read_text());assert not verify['violations']
verification={'contract':'maya.sb1-json-v2-checkpoint/1','source_head':head,'identity_runtime_source_head':mutations['SV2']['source_head'],'identity_proof_only_delta':['maya-saas-backend/src/widgets/i-mig2.schema.spec.ts'],'self_booking_contract':'IMPLEMENTED','new_verified_binding_path':'READY','json_v2':'PASS','successor_proofs':'12/12','production_user_reverified':False,'test_summaries':summaries,'bin':{'cases':17,'failed':0,'status':'PASS'},'mutations':mutations,'fresh_mutants':77,'inventory':{'batteries':36,'declarations':431,'ci_jobs':57},'receipt_selftests':47,'audit_selftests':32,'schema':schema,'application_live_script_typechecks':'PASS','build':'PASS','changed_source_lint':'PASS','contract_checker':{'passed':31,'total':31,'pending_later_package':4},'remote_ci':'NOT RUN; no new full remote CI certificate','integration_only_check':{'status':'BLOCKED','reason':'maya-chat-shell/dist/web is absent in the isolated checkout','source_unchanged':True},'widget_false_before_programme':31,'widget_false_before_this_pass':18,'widget_false_after':18,'classifications':audit['current_false_classification'],'fbe2e':{'CLOSED':13,'PARTIAL':6,'OPEN':9},'od_decisions':{'OD-3':'APPROVED A','OD-4':'APPROVED B','OD-5':'APPROVED B'},'AR-1':'NOT READY / STOP','9.6':'INTEGRATION-OWNED / BLOCKED','claude_path_overlap':0,'production_effects':0,'real_otp_sent':0,'real_yclients_effects':0,'schema_application':'guard-only V2 DDL applied to two isolated synthetic proof databases; no production application','safe_to_integrate':'NO','superseded_diagnostics':'The initial full regression exposed the 99/100 migration-count ratchet. Its exact approved exception is fixed in c94c751c; final full backend run is green. Intermediate runs are not counted as final certification.'}
(docs/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
previous=repo/'docs/rebuild/widget-release-programme/reverification'
d=json.loads((previous/'clause-disposition.json').read_text());d.update(previous_source_head=d['source_head'],source_head=head,current_note='JSON V2 mechanism implemented and proven; no new whole widget-clause promotion. Fresh source/evidence matrix contains all 165 clauses.')
(docs/'clause-disposition.json').write_text(json.dumps(d,indent=2)+'\n')
f=json.loads((previous/'fbe2e-disposition.json').read_text());f['scope']='SB-1 JSON V2 pass; fresh backend evidence, no new whole FBE2E limitation closure.'
for r in f['limitations']:
 if r['id']=='L16':r['current_note']='431 declarations / 36 batteries / 57 CI jobs; 47 lineage/receipt selftests pass. No remote timing claim.'
 if r['id']=='L12':r['current_note']='Fresh WR 23, AB 2, H-harness 21, SB1 10, SBV 8 and V2 13 mutations pass their declared controls. This is targeted coverage, not full remote/exhaustive port certification.'
(docs/'fbe2e-disposition.json').write_text(json.dumps(f,indent=2)+'\n')
shutil.copy2(receipts/'ownership-proof.json',docs/'ownership-proof.json')
for folder in ['evidence','mutation-receipts']:(docs/folder).mkdir(exist_ok=True)
for p in (work/'final-evidence').iterdir():shutil.copy2(p,docs/'evidence'/p.name)
for p in (receipts/'mutations').glob('*.json'):shutil.copy2(p,docs/'mutation-receipts'/p.name)
files=subprocess.check_output(['git','diff','--name-only','4e39f5fbb419b0c87f4cbd91cffb9847f02c8499',head],cwd=repo,text=True).splitlines()
(docs/'FILES-TOUCHED.md').write_text('# Files touched in the JSON V2 pass\n\nBackend package: `maya-saas-backend`. Plus this programme’s docs/evidence directory. No Prisma model, SQL column, presentation package or Claude worktree change.\n\n'+ '\n'.join('- `'+p+'`' for p in files)+'\n\nComplete programme delta and current Claude comparison: `ownership-proof.json`. Overlap: 0.\n')
backend=summaries['backend'];widgets=summaries['widgets']
(docs/'CHECKPOINT.md').write_text(f'''# SB-1 JSON V2 — checkpoint

Механизм повторной верификации реализован и проверен локально. Production owner не переверифицирован; реальный OTP не отправлялся.

```yaml
SELF-BOOKING CONTRACT: IMPLEMENTED
NEW VERIFIED BINDING PATH: READY
JSON V2: PASS
SUCCESSOR PROOFS: 12/12
FALSE CLAUSES: 18
EVIDENCE_MISSING: 11
IMPLEMENTATION_MISSING: 1
OWNER_DECISION_REQUIRED: 6
SAFE TO INTEGRATE: NO
```

Branch: `codex/widget-release-programme-20260929`.
Worktree: `{repo}`.
Verification source HEAD: `{head}`. Последующий documentation-only HEAD записан в outputs `DELIVERY.json`.

## Что реализовано

Authenticated User + tenant → canonical exact Client/CRM channel → strict SMS.ru OTP → immutable JSON V2 → atomic successor ClientChannelLink → явно выбранный personal-client context. TENANT_OWNER != CLIENT; CLIENT_ROLES не расширен. V1 остаётся неизменным. Client/predecessor/channel не принимаются как caller authority. Revoked predecessor не меняется и не реактивируется. Proof ограничен и OTP TTL, и сроком текущей сессии. Actual User/session/membership/business role сохраняются в audit.

Использованы существующие ClientLinkChallenge, ClientChannelLink, AuthRateLimitBucket и SMS.ru adapter. Новых моделей и SQL columns: 0. Подготовлена одна guard-only migration; применена только на двух принадлежащих этому заданию локальных proof-базах. На production она не применялась.

## Проверки

- Backend: {backend['numPassedTestSuites']} suites, {backend['numPassedTests']} PASS, 0 FAIL; один integration-only тест исключён этим отдельным профилем.
- Widgets-live: {widgets['numPassedTestSuites']} suites, {widgets['numPassedTests']} PASS. Включены все 12 successor proofs и дополнительные JSON/V1/channel/session/rate-limit/delivery/HTTP проверки.
- HTTP release evidence: 8/8 PASS; built backend BIN: 17/17 PASS.
- Targeted mutations: 77/77 as declared, green controls, 0 mismatches. SV2 13, SBV 8, SB1 10, WR 23, H-harness 21, AB 2.
- V2 mutation receipt сохраняет реальный target `{mutations['SV2']['source_head']}`; единственный последующий backend delta — тест точного числа одобренных миграций. Runtime, V2 tests и battery bytes неизменны. Остальные receipts привязаны к текущему source HEAD.
- Build, application/live/scripts typechecks, changed-source lint: PASS. Receipt/lineage selftests 47; audit selftests 32. Contract checker 31/31, 4 ранее раскрытых pending checks следующего пакета.
- Свежая пустая proof-база прошла обычную цепочку из 100 миграций; ClientLinkChallenge сохранил 14 SQL columns и V1 lifecycle guard.
- Отдельно выполнен INTEGRATION-ONLY CHECK: отсутствует `maya-chat-shell/dist/web`. Claude artifact не копировался; assertion сохранён. Это не backend failure. Fresh remote CI не запускался; scoped receipts не выдаются за полный remote certificate.

Первый full regression обнаружил устаревшее ожидание 99 миграций. Исправление допускает ровно одобренную V2 migration, сохраняет прежние 99 и три widget migrations, запрещает в extension новые таблицы/колонки/Widget tables. Итоговый regression переснят после исправления.

## Матрица и оставшиеся blockers

Полная матрица пересчитана из свежих HTTP/BIN/provenance/mutation receipts: 165 clauses; 126 L, 4 L-T, 17 U, 18 false. Strict gates 4/15, with U 7/15. Programme: 31 → 18; этот проход: 18 → 18. SB-1 identity proof не заменяет widget evidence. FBE2E: 13 CLOSED / 6 PARTIAL / 9 OPEN.

OD-3 A / OD-4 B / OD-5 B: APPROVED. SB-1 и JSON V2 не требуют нового owner/schema решения для реализованного механизма.

Exact remaining blockers:

1. 9.6: один canonical persisted user-turn identity на Claude+Codex integration checkpoint. No mirror writer. Combined carrier artifact/transport acceptance и fresh CI ещё не выполнены в этой ветке.
2. G6-6 / G13-R8: STOP до destination-specific receiving authority contract. Не блокирует независимые booking routes само по себе.
3. G8-3 / G8-4 / G8-5t / G8-DENY: canonical bounds/normalizer/text/DENY owner contract.
4. 11 evidence clauses: G6-13; G7-5, G7-BOOK1, G7-FR6b, G7-FR6d; R-1a; G11-I9; G12-R1b, G12-I11, G13-R2; G13-I3. Точные обязанности перечислены в REMAINING-WIDGET-WORK.md; полная матрица в CLAUSE-MATRIX.md.
5. AR-1: NOT READY / STOP. Threshold, approver, entitlement writer, rollback/revocation, ratchet unlock и activation proof не определяются до оставшихся release evidence/contracts. widgets.runtime остаётся planned/fail-closed.

```yaml
CLAUDE PATH OVERLAP: 0
PRODUCTION EFFECTS: 0
REAL OTP SENT: 0
REAL YCLIENTS EFFECTS: 0
CLAUDE MERGE: NO
CHAPTER 10: NO
```

SAFE TO INTEGRATE остаётся NO для общего programme acceptance до совместного integration checkpoint. Сам backend механизм SB-1 реализован; production use не выполнялся и не сертифицирован этим локальным доказательством.
''')
(docs/'README.md').write_text('# JSON V2 checkpoint\n\nStart with CHECKPOINT.md. CONTRACT.md and owner-decisions.json record the approved authority/persistence contract. SUCCESSOR-PROOFS.md lists the 12 required scenarios. CLAUSE-MATRIX.md and REMAINING-WIDGET-WORK.md separate identity completion from remaining widget/integration obligations. verification.json and mutation-receipts retain exact source targets and limits. Historical preintegration/postdecision/reverification packets are unchanged.\n')
for p in docs.rglob('*'):
 if p.is_file():
  q=out/p.relative_to(docs);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
# Preserve full receipts for review without adding large logs to the repository.
with zipfile.ZipFile(out/'raw-receipts.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in receipts.rglob('*'):
  if p.is_file():z.write(p,'final-receipts/'+str(p.relative_to(receipts)))
 for name in ['build.log','lint.log','schema-apply.log','fresh-schema-deploy.log','successor-live.json','integration.json','integration.log','contract-check.log']:
  z.write(work/'receipts'/name,'supporting-receipts/'+name)
 z.write(work/'receipts/backend.json','superseded-diagnostics/first-regression.json')
print(json.dumps({'source_head':head,'tests':summaries,'mutants':77,'output':str(out)},indent=2))
