from pathlib import Path
import json,hashlib,collections,subprocess,datetime
root=Path(__file__).resolve().parents[2];wt=root/'work/widget-release';r=root/'work/preintegration/receipts';doc=wt/'docs/rebuild/widget-release-programme/preintegration';code='000ed08f3769f8ec78f634c7c10f4643e2d3fe11'
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
read=lambda f:json.loads(f.read_text())
reports=[];statuses=collections.Counter()
assert 'PASS (18 checks)' in (r/'final-runner-selftest.log').read_text()
for f in sorted((wt/'maya-saas-backend/test/widgets-live/mutations').glob('gate*.json')):
 gate=f.stem[4:];rp=r/f'mutations/{gate}.json';d=read(rp);decl=read(f)
 assert d['source_head']==code,(gate,'source target')
 assert d['battery_hashes'][f.name]==sha(f),(gate,'declaration bytes')
 assert d['status']=='AS-DECLARED' and d['mismatches']==0 and d['baseline_red']==[],(gate,'non-green receipt')
 assert [m['id'] for m in d['mutants']]==[m['id'] for m in decl],(gate,'incomplete declarations')
 for expected,actual in zip(decl,d['mutants']):
  expected_status='equivalent' if 'equivalent' in expected else expected.get('expect','live-killed')
  assert actual['status']==expected_status,(gate,actual['id'])
  if expected_status.endswith('killed'):assert actual['kills'],(gate,actual['id'],'no kill')
  statuses[actual['status']]+=1
 controls=list(d['baseline_controls'].values())+list(d['neutraliser_controls'].values())
 assert controls,(gate,'missing controls')
 for c in controls:
  assert c['exits'] and all(x==0 for x in c['exits'].values()) and c['failed']==[] and c['problems']==[],(gate,'bad controls')
 reports.append({'gate':gate,'source_head':d['source_head'],'mutants':len(d['mutants']),'status':d['status'],'baseline_red':d['baseline_red'],'restrictions':d['restrictions'],'receipt_sha256':sha(rp)})
assert len(reports)==32 and sum(statuses.values())==398
backend=read(r/'backend-full.json');widgets=read(r/'widgets-full.json');integration=read(r/'integration-only.json')
assert backend['success'] and backend['numPassedTests']==5348 and backend['numFailedTests']==0 and backend['numPendingTests']==1
assert widgets['success'] and widgets['numPassedTests']==348 and widgets['numFailedTests']==0
assert not integration['success'] and integration['numFailedTests']==1
assert 'ENOENT' in integration['testResults'][0]['message'] and 'maya-chat-shell/dist/web' in integration['testResults'][0]['message']
binary=next(json.loads(l) for l in (r/'final-bin.log').read_text().splitlines() if l.startswith('{"contract":"maya.widgets-intent-http-proof/2"'))
assert binary['status']=='PASS' and binary['cases']==16 and binary['failed']==0
current=read(doc/'current-audit.json');assert current['counts']['byState']=={'L-T':4,'L':125,'U':17,'false':19}
own=read(r/'ownership-final-precommit.json');assert own['ownershipOverlap']==[]
verification={'contract':'maya.widget-release-preintegration-verification/1','observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backend_source_head':code,'branch':'codex/widget-release-programme-20260929','backend':{k:backend[k] for k in ['success','numPassedTestSuites','numPassedTests','numFailedTests','numPendingTests']},'widgets_live':{k:widgets[k] for k in ['success','numPassedTestSuites','numPassedTests','numFailedTests']},'binary':{'status':binary['status'],'cases':binary['cases'],'failed':binary['failed'],'health':binary['binary']['health'],'mints':binary['mint_provenance']},'integration_only':{'status':'INTEGRATION-ONLY CHECK — BLOCKED ON CLAUDE ARTIFACT','missing':'maya-chat-shell/dist/web','executed_checks':1,'backend_failure':False,'source_assertions_preserved':True},'mutations':{'declarations':398,'batteries':32,'statuses':dict(statuses),'unexpected':0,'red_baselines':0,'restricted':True,'full_ci_certificate':False,'reports':reports},'local_checks':{'application_build':'PASS','application_typecheck':'PASS','scripts_typecheck':'PASS','widgets_live_typecheck':'PASS','contract_typecheck':'PASS','prisma_generate':'PASS','changed_typescript_lint':'PASS','k3':'10/10','widget_contract':'31/31; 4 pre-existing pending mechanisms','lineage_selftest':'12/12','mutation_runner_selftest':'18/18','mutation_planner_assembler':'35/35','current_audit_selftest':'13/13','canonical_audit_selftest':'17/17'},'github_ci':'NOT RUN — no push, deploy or merge','current_gate_headline':current['headline'],'current_clause_counts':current['counts'],'ownership':{'claude_head':own['claudeHead'],'overlap':[],'claude_uncommitted_paths':own['claudeUncommittedPaths']},'production_writes':0,'real_yclients_effects':0,'schema_changes':0,'new_migrations':0,'activation':'FORBIDDEN; planned/readiness preserved','receipts':{str(f.relative_to(r)):{'sha256':sha(f),'bytes':f.stat().st_size} for f in sorted(r.rglob('*')) if f.is_file() and f.suffix in ['.json','.log'] and f.name not in ['mutations-dry.log']}}
(doc/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
print(json.dumps({'backend':verification['backend'],'widgets':verification['widgets_live'],'binary':verification['binary'],'mutations':dict(statuses),'claude_overlap':0}))
from collections import Counter
clauses=read(doc/'clause-disposition.json')['clauses'];remaining=[c for c in clauses if c['after']=='false'];classes=Counter(c['classification'] for c in remaining);fbe=read(doc/'fbe2e-disposition.json')['limitations'];fc=Counter(x['after'] for x in fbe)
assert dict(classes)=={'OWNER_DECISION_REQUIRED':6,'EVIDENCE_MISSING':12,'IMPLEMENTATION_MISSING':1}
assert dict(fc)=={'CLOSED':13,'PARTIAL':6,'OPEN':9}
changed=subprocess.check_output(['git','diff','--name-only','223d81c25aa8fb59863e72b96c7927a096eccb9d'],cwd=wt,text=True).splitlines()
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=wt,text=True).splitlines()
report=f'''# Widget Release Programme — pre-integration checkpoint

**Закрыто 12 из 24 evidence gaps.** False clauses: **31 → 19**. Gate 14 теперь имеет исполняемую HTTP/BIN-пару через действующий Action Engine; строгий счёт **4/15**, с отдельно учитываемым U — **7/15**. Это не разрешение на production activation.

Ветка: `codex/widget-release-programme-20260929`.
Worktree: `{wt}`.
Backend proof HEAD: `{code}`. Финальный HEAD документационного checkpoint указан в экспортируемом отчёте; backend bytes после proof HEAD не менялись.

## Область изменений

В этом проходе изменены backend evidence/тесты, проверка lineage в evidence verifier, наблюдаемость persisted successor relation, профили backend/integration-проверок, CI-подготовка Prisma и документы. Единственное добавление в application runtime этого прохода — логирование уже сохранённой связи successor → predecessor. Admission, authority, entitlements и lifecycle не менялись ради evidence.

Правки runtime из предыдущего прохода остаются в этой ветке и покрыты свежими полными backend/widgets-live прогонами. Ничего из ветки Claude не cherry-picked, merged или rebased. Его carrier, React/AChat, CSS, renderer, Capacitor/iOS и ratchets не изменялись.

Проверка пересечения сравнивает весь delta от общего base с текущей историей ветки Claude, его незакоммиченными файлами и защищёнными префиксами. **CLAUDE PATH OVERLAP: 0.** Claude HEAD при проверке: `{own['claudeHead']}`. Точный список обеих сторон — `ownership-proof.json`.

## Clauses и решения

| Классификация false clauses | До | После |
|---|---:|---:|
| EVIDENCE_MISSING | 24 | 12 |
| IMPLEMENTATION_MISSING | 3 | 1 |
| OWNER_DECISION_REQUIRED | 4 | 6 |
| Всего false | 31 | 19 |

Промотированы: **G6-8…G6-12, G7-4, G7-6, G13-R6, G13-R9, G14-a/b/c**. Полный список всех 31 строк, owners, proof/result и ограничений — `CLAUSE-MATRIX.md` и `clause-disposition.json`.

Три NAVIGATE metadata rows (`G12-R1b`, `G12-I11`, `G13-R2`) исправлены в новом current audit: реализация существует, `built: true`. Документальный drift закрыт, whole-clause live claims не добавлены. Исторический audit сохранён. Текущий audit: 125 L, 4 L-T, 17 U, 19 false.

G6-6 и G13-R8 переклассифицированы в OWNER_DECISION_REQUIRED: принимающий HANDOFF route/lookup/authority contract не определён. Подпись opaque handle его не заменяет. 9.6 остаётся IMPLEMENTATION_MISSING с dependency на общий conversation writer/turn identity; пересекать owned carrier/runtime ports Claude или вводить второй writer нельзя.

OD-3/4/5 остаются **OPEN**, final packet **READY** в `DECISIONS.md`. Варианты и последствия сокращены до актуальных. Решения не выбраны. AR-1 остаётся STOP: канонического activation contract нет; `widgets.runtime` остаётся planned, запрет production grant и A2.2 сохранены.

## FBE2E и self-booking

**13 CLOSED / 6 PARTIAL / 9 OPEN.** Новые частичные закрытия: L2 (Prisma generation перед contract compilation), L4 (реальный built-backend booking journey), L26 (строгий admission новых receipts). Presentation-owned части не зачтены. Полный список 28 limitations — `fbe2e-disposition.json`.

Read-only snapshot production в 2026-09-29T16:56:28Z: User есть; Telegram identity — 1; личный Client — 1; активный CrmClientLink — 1; matching maya_user link history — 1, эта связь revoked; активных verified maya_user links — 0. Все чтения выполнены в READ ONLY transaction, затем ROLLBACK; идентификаторы и PII не выведены.

```text
SAME-HUMAN BINDING EXISTS: YES (явная историческая связь)
MISSING LINK: действующий canonically verified maya_user binding episode; прежний отозван
EXISTING CANONICAL ROUTE CAN SUPPORT SELF-BOOKING: NO (из текущего tenant_owner context)
CONTRACT DECISION REQUIRED: YES
SELF-BOOKING DECISION PACKET: READY
```

TENANT_OWNER != CLIENT. CLIENT_ROLES не расширен; данные, роли и отозванная связь не менялись. Даже новая верификация сама по себе не создаёт authority для owner self-booking.

## Проверки и пределы receipts

- Backend: **5348 PASS / 0 FAIL**, 572 suites; 1 явно помеченная integration-only проверка исключена из backend-профиля.
- Widgets-live: **348/348 PASS**.
- Built backend HTTP: **16/16 PASS**, health 200; новый booking create идёт через реальный catalog route, DRAFT и COMMIT, подтверждён durable ActionExecution и отказ повторного COMMIT.
- Evidence verifier: **8 lines / 6 claims**, HTTP/BIN по 10 captured mints, 0 violations; source fixtures не пишут widget/action rows.
- Все **398 declarations / 32 batteries**: **{statuses['build-killed']} build-killed, {statuses['live-killed']} live-killed, {statuses['equivalent']} equivalent, {statuses['pending']} pending**; 0 unexpected, 0 red baseline. Запуск ограничен заявленными killers; каждый receipt сохраняет filters. Это **не полный unfiltered CI certificate**. M17b/M18b остаются pending: независимость policy/source fences ещё не доказана.
- Build, application/scripts/widgets-live/contract typechecks, lint изменённых TS: PASS; K3 — 10/10; contract checker — 31/31, 4 ранее известных pending mechanisms.
- Lineage self-test 12/12; mutation runner 18/18; planner/assembler 35/35; новый current-audit consumer 13/13; canonical audit self-test 17/17.
- CI repair: Prisma generate локально PASS; advisory workflow policy сохранена. **Fresh GitHub CI: NOT RUN**. Ветка не pushed.

`npm test` сохраняет все проверки. Единственный `npm run test:integration` check исполнен и остановлен отсутствием `maya-chat-shell/dist/web`: **INTEGRATION-ONLY CHECK**, не backend failure. Его assertions сохранены; source/artifact Claude не копировались и не собирались. Отдельный backend-профиль не подменяет этот integration check.

## Exit

```text
FALSE CLAUSES BEFORE: 31
FALSE CLAUSES AFTER: 19
EVIDENCE_MISSING REMAINING: 12
IMPLEMENTATION_MISSING REMAINING: 1
OWNER_DECISION_REQUIRED: 6
FBE2E CLOSED: 13
FBE2E PARTIAL: 6
FBE2E OPEN: 9
OD-3/4/5 FINAL PACKET: READY (решения OPEN)
SELF-BOOKING DECISION PACKET: READY
CLAUDE PATH OVERLAP: 0
PRODUCTION EFFECTS: 0
REAL YCLIENTS EFFECTS: 0
SAFE TO INTEGRATE: NO
```

Backend regression зелёный. Общий integration acceptance ещё не подтверждён: нужен отдельный artifact check Claude и свежий branch CI/полный mutation certificate. Это ограничения интеграционной проверки, отдельно от production release blockers ниже.

Точные production/programme blockers:

- 12 whole-clause evidence gaps: {', '.join(c['id'] for c in remaining if c['classification']=='EVIDENCE_MISSING')}.
- 9.6 — canonical conversation-writer dependency; G6-6/G13-R8 — receiving HANDOFF authority; G8-3/G8-4/G8-5t/G8-DENY — owner-approved bounds/normalizer/text sources or scope decision.
- OD-3/4/5 и AR-1 activation envelope/threshold/approver/writer/rollback contract; SB-1 identity re-verification plus authority contract.
- FBE presentation dependencies L3/L4/L9/L18/L19/L23/L27; policy/evidence rulings L2/L5/L24/L25/L26; remaining proof limits L12/L16/L20. Списки пересекаются, они не суммируются в общий процент.

Production deploy/config/DB writes: 0. Real YCLIENTS effects: 0. Schema changes / новые migrations: 0. Использована только отдельная loopback proof-БД с существующими migrations; после проверок её PostgreSQL остановлен. No merge, no Chapter 10, no website changes, no carrier redesign.

## Файлы этого прохода

'''
for f in sorted(set(changed+new+['docs/rebuild/widget-release-programme/preintegration/CHECKPOINT.md'])):report+=f'- `{f}`\n'
(doc/'CHECKPOINT.md').write_text(report)
