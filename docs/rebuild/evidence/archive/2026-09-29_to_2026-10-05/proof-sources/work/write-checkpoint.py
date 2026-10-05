from pathlib import Path
import json,subprocess,hashlib,collections
root=Path(__file__).parent/'widget-release'
receipts=root.parent/'receipts'
program=root/'docs/rebuild/widget-release-programme'
out=root.parent.parent/'outputs'
out.mkdir(exist_ok=True)
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
def load(name):return json.loads((receipts/name).read_text())
def suite(name):
 a=load(name)
 assert a['numFailedTests']==0 and a['numFailedTestSuites']==0,(name,a['numFailedTests'])
 return {k:a[k] for k in ['numTotalTestSuites','numPassedTestSuites','numTotalTests','numPassedTests','numPendingTests','numFailedTests']}
regression=load('backend-full.json')
assert regression['numFailedTests']==1 and regression['numFailedTestSuites']==1
failed=[t for suite in regression['testResults'] for t in suite['assertionResults'] if t['status']=='failed']
assert len(failed)==1 and failed[0]['fullName'].endswith('gates a static shell candidate as strictly as a PHP edge candidate')
assert 'ENOENT' in failed[0]['failureMessages'][0] and '/maya-chat-shell/dist/web' in failed[0]['failureMessages'][0]
unit={k:regression[k] for k in ['numTotalTestSuites','numPassedTestSuites','numTotalTests','numPassedTests','numPendingTests','numFailedTests']}
unit['status']='NOT_PASS: one missing presentation build artifact'
unit['failure']='beget-relay-release.architecture.spec.ts: verifyShellCandidate requires absent maya-chat-shell/dist/web; shell build belongs to Claude; test and package untouched'
live=suite('widgets-live-final.json')
new=load('wr-mutations-final.json');assert new['status']=='AS-DECLARED' and new['baseline_red']==[]
assert len(new['mutants'])==21 and all(m['status']=='build-killed' for m in new['mutants'])
tags=[load(n) for n in ['tag-m20.json','tag-pm11.json']]
assert all(a['status']=='PARTITION-AS-DECLARED' and a['mutants'][0]['live_evidence'] for a in tags)
checks=load('programme-check.json');assert not checks['ownershipOverlap']
for log in ['typecheck-final.log','typecheck-live-final.log','typecheck-scripts-final.log','widget-contract-typecheck.log','lint-final.log','b29-lint.log']:
 assert (receipts/log).read_text().strip()=='',log
binary=next(json.loads(s) for s in reversed((receipts/'bin-proof-final.log').read_text().splitlines()) if s.startswith('{"contract":'))
assert binary['status']=='PASS' and binary['failed']==0
base=json.loads((program/'baseline.json').read_text()); fbe=json.loads((program/'fbe2e-disposition.json').read_text())
files=sorted(set(git('diff','--name-only',base['base']).splitlines()+git('ls-files','--others','--exclude-standard').splitlines())-{''})
mutants=[{'id':m['id'],'status':m['status'],'killers':[k['test'] for k in m.get('kills',[])]} for m in new['mutants']]
verification={
 'contract':'maya.widget-release-local-verification/1','code_target':git('rev-parse','HEAD'),
 'baseline':base['base'],'node':'22.23.2','postgres':'16.14; isolated loopback cluster, port 55729',
 'new_migrations':0,'existing_migrations_replayed':99,'proof_cluster':'STOPPED after verification; only this task-owned cluster was stopped',
 'backend_regression':unit,'widgets_live':live,'production_binary_cases':{'pass':binary['cases'],'failed':0,'health':200,'fbe2e_binary_coverage':False},
 'new_mutations':{'status':new['status'],'source_head':new['source_head'],'baseline_red':new['baseline_red'],'restrictions':new['restrictions'],'steps':new['steps'],'mutants':mutants},
 'http_tag_mutations':[{'source_head':a['source_head'],'status':a['status'],'restriction':a['restrictions'],'id':a['mutants'][0]['id'],'entry':'HTTP','status_of_mutant':a['mutants'][0]['status']} for a in tags],
 'mutation_runner_selftest':'18/18 PASS, includes plain live baseline for a neutraliser-only partition',
 'mutation_planner_assembler':'34/34 PASS; 32 batteries, 53 shards, 394 declarations planned, not 394 executed',
 'typecheck':'application, scripts, widgets-live, widget-contract PASS','lint':'changed TS files PASS','build':'PASS','k3':'10/10 PASS','widget_contract':'31/31 PASS; 4 pre-existing pending mechanisms',
 'gate_state':checks['clauseStates'],'gate_headline':checks['headline'],'false_clause_classification':checks['classificationCounts'],
 'fbe2e_counts':dict(collections.Counter(x['after'] for x in fbe['limitations'])),
 'ci':{'status':'NOT_RUN','scope':'No push, workflow dispatch or repository-settings change. Historical canonical-branch receipts are not receipts for this branch. Full unfiltered 394-mutant programme not run.'},
 'safe_to_integrate':'NO','reason':'Review checkpoint only: Full backend regression has one missing Claude-owned shell artifact; current-branch CI and full unfiltered mutation certification are absent. This is distinct from production activation, which is forbidden.',
 'runtime_source_hashes':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files if f.startswith('maya-saas-backend/src/') and not f.endswith('.spec.ts')},
 'ownership':{'claude_head':checks['claudeHead'],'overlap':[],'protected_paths_basis':'All baseline Claude changed paths plus current Claude committed/uncommitted delta and all carrier/shell/UI/CSS paths; check.mjs asserts zero overlap.'},
 'proof_scope':'Local fixture/internal-provider evidence. Injected second-COMMIT test is RI persistence proof, not production-minted HTTP evidence. New WR mutations are restricted BUILD proofs, not a complete CI receipt.',
 'first_full_live_run':'340 pass / 1 fail: B-29 previously used CONTROL as uncertain AE receipt; corrected to explicit AE COMMIT U fixture; final full live corpus passes.'
}
(program/'verification.json').write_text(json.dumps(verification,indent=2,ensure_ascii=False)+'\n')
lines=['# Widget Release Programme — checkpoint 29 сентября 2026','',
'Изолированная backend/docs/evidence ветка. Production activation и owner self-booking остаются заблокированы каноническими решениями. Изменения не означают готовность booking для реального пользователя.','',
f"- Branch: `{git('branch','--show-current')}`",f'- Worktree: `{root}`',f"- Canonical baseline: `{base['base']}`",f"- Проверенный code/test target: `{verification['code_target']}`",'- Финальный HEAD с документами указан в outputs/checkpoint.json.','',
'## Изменения и ownership','',
'Изменены только `maya-saas-backend` и выделенный `docs/rebuild/widget-release-programme`. Runtime delta — 5 backend-файлов: truthful selector facts/completeness, actor/principal/tenant fences, terminal-line validation, immutable confirmed-receipt ownership и COMMIT-only reconciliation. Остальное — тесты, mutation harness и документы.','',
'**Пересечение с Claude: 0 файлов.** Проверка включает все пути, изменённые Claude между 9e4b266d и baseline, весь последующий committed/uncommitted delta его ветки, а также maya-carrier, maya-chat-shell, iOS, UI/CSS. Этот workstream не выполнял записи в ветку/worktree Claude; Claude продолжал свою работу независимо. Merge/rebase/cherry-pick не выполнялись. Результат `check.mjs` и список путей сохраняются в checkpoint.json.','',
'Влияние: неизвестные поля enabled/consultation/availability возвращаются как NOT_MEASURED; это может потребовать от будущего UI/owner read model честного ограниченного представления. Изобретённые true/false/FREE больше не выдаются как факты. React acceptance этим не доказан.','',
'## Gates до / после','',
'| Статус | До | После |','|---|---:|---:|','| L | 113 | 113 |','| L-T | 4 | 4 |','| U | 17 | 17 |','| false | 31 | 31 |','',
'Строго: **3/15**; с U: **6/15**, принятие U владельцем остаётся OD-3. 31 false = **24 EVIDENCE_MISSING + 3 IMPLEMENTATION_MISSING + 4 OWNER_DECISION_REQUIRED**. Три NAVIGATE-строки дополнительно имеют STALE_DOC (`built: false`); отсутствие пары HTTP/BIN сохраняет false. Старое утверждение об отсутствии shell submission опровергнуто текущими source probes. Ни одна строка не повышена на основании только unit/GW proof.','',
'| Clause | Классификация |','|---|---|']
for c in base['clauses']:lines.append(f"| {c['id']} | {c['classification']}"+(' + STALE_DOC metadata' if c['metadata_drift'] else '')+' |')
lines+=['','Тексты всех clauses, source owners и reasons находятся в baseline.json. Состояние пересчитано после каждого атомарного unit; history — gate-recomputations.json.','',
'## OD и self-booking','',
'- OD-3: OPEN — отдельно принять U-class или оставить только strict denominator.','- OD-4: OPEN — принять G5-f как U в этом cycle либо утвердить route/step-up contract.','- OD-5: OPEN — owner-shaped output для текущего scope либо новый carrier для principal-narrowed masking.','- Activation: STOP — нет утверждённых threshold, approver, activation owner/writer и ratchet unlock. Production activation не реализована.','- Owner self-booking: STOP — CLIENT_ROLES не расширен, TENANT_OWNER != CLIENT. Канонический resolver требует active membership + verified maya_user ClientChannelLink; наличие такой связи у реального владельца не проверялось в production DB. Даже наличие связи не даёт owner роли права на CLIENT-only chat capability. В DECISIONS.md описаны отдельный client context, narrow self-booking capability или сохранение отказа.','',
'## FBE2E','',
'**13 закрыто; 3 частично; 12 открыто.** Частичные: L12 (ограниченный охват мутаций), L16 (новое partitioning без измеренного remote headroom), L20 (unknown cells проверены; реальная неопределённость AE/provider ещё не доказана).','',
'| ID | После | Disposition |','|---|---|---|']
for x in fbe['limitations']:lines.append(f"| {x['id']} | {x['after']} | {x['classification']} — {x['disposition']} |")
lines+=['','## Проверки','',
f"- Backend regression: {unit['numPassedTestSuites']}/{unit['numTotalTestSuites']} suites; {unit['numPassedTests']} passed, {unit['numPendingTests']} pending, 1 failed (отсутствует maya-chat-shell/dist/web).",
f"- Widgets-live: {live['numPassedTestSuites']}/{live['numTotalTestSuites']} suites; {live['numPassedTests']} tests PASS.",
'- Built backend HTTP corpus: 15/15 PASS; health 200. Это прежний корпус, не FBE2E binary proof.','- Новые мутации: 21/21 BUILD-killed; baseline green. Запуск ограничен относящимися к изменениям suites.','- MINT-M20 и P-M11: live-killed, HTTP:1 каждый; это targeted partitions, не полный corpus.','- Mutation runner: 18/18 self-checks; planner/assembler: 34/34; 32 batteries / 53 shards / 394 declarations запланированы.','- Build, application/scripts/widgets-live/contract typechecks, lint changed files: PASS.','- K3 planned/readiness + entitlement writer guards: 10/10 PASS. Contract checker: 31/31, 4 ранее известных pending mechanisms.','- Полный live прогон первоначально нашёл старую CONTROL fixture в B-29. Тест исправлен на явно объявленную AE COMMIT/U fixture; окончательный полный прогон PASS.','- GitHub CI для этой ветки: NOT RUN. Ветка не pushed, workflow/settings не изменены. Старые CI receipts не присвоены новому HEAD.','',
'## Остаток и интеграция','',
'Общий backend-прогон не зелёный: единственный сбой — ENOENT для maya-chat-shell/dist/web в beget-relay-release.architecture.spec.ts. Этот неизменённый тест требует presentation build artifact. В защищённом shell-пакете не создавались файлы и не запускалась сборка. Это же препятствует полному mutation baseline, использующему общий unit corpus.','',
'**SAFE TO INTEGRATE: NO.** Это review checkpoint; для допуска в integration нужны отсутствующий shell artifact с полным зелёным backend baseline, актуальные branch CI receipts и обязательная полная mutation-сертификация без ограниченного набора tests. Отдельно production widgets.runtime запрещён до решения AR-1 и применимых OD.','',
'Точные открытые блокеры: 24 whole-clause HTTP/BIN admissions; 3 implementation/presentation dependencies (G6-6, G13-R8, 9.6); 4 Gate 8 source/scope decisions; OD-3/4/5; activation contract; SB-1; L2/L5/L24/L25/L26 owner rulings; L3/L4/L9/L18/L19/L23/L27 presentation dependencies; остатки L12/L16/L20. Эти списки пересекаются и не суммируются в общий процент.','',
'Production deploy/config/DB writes: 0. Real YCLIENTS effects: 0. Новые migrations/schema changes: 0; только replay 99 существующих migrations в отдельной loopback proof-БД; созданный для задачи PostgreSQL остановлен после проверок. Chapter 10, website, UI, iPhone reinstall: не затронуты.','',
'## Файлы','']
# Final docs are added later; capture all actual paths including programme outputs.
for f in sorted(set(files+['docs/rebuild/widget-release-programme/verification.json','docs/rebuild/widget-release-programme/CHECKPOINT.md'])):lines.append('- `'+f+'`')
report='\n'.join(lines)+'\n'
(program/'CHECKPOINT.md').write_text(report)
(out/'WIDGET-RELEASE-CHECKPOINT.md').write_text(report)
for n in ['baseline.json','fbe2e-disposition.json','verification.json','DECISIONS.md','gate-recomputations.json']:(out/n).write_bytes((program/n).read_bytes())
print(json.dumps({'regression':unit,'live':live,'fbe2e':verification['fbe2e_counts'],'code_target':verification['code_target']}))
