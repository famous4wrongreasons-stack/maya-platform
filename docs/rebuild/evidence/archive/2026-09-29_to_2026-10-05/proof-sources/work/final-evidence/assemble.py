from pathlib import Path
import json,subprocess,hashlib,shutil,zipfile
root=Path(__file__).resolve().parents[2];repo=root/'work/widget-release';b=repo/'maya-saas-backend';work=root/'work/final-evidence';r=work/'receipts';docs=repo/'docs/rebuild/widget-release-programme/final-evidence';out=root/'outputs/final-evidence'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
p=subprocess.run(['node',str(docs/'recompute.mjs'),'--evidence',str(work/'final-capture'),'--mutations',str(r/'mutations'),'--receipts',str(r)],cwd=repo,text=True,capture_output=True)
(r/'recompute.log').write_text(p.stdout+p.stderr);print(p.stdout,p.stderr);assert p.returncode==0
own=json.loads(subprocess.check_output(['node','docs/rebuild/widget-release-programme/check.mjs'],cwd=repo,text=True));assert own['ownershipOverlap']==[] and own['productionActivation']=='FORBIDDEN' and own['clientRolesUnchanged'];own['scope_note']='Ownership check only. Clause counts from this legacy checker describe the programme baseline; current clause state is current-audit.json.';(docs/'ownership-proof.json').write_text(json.dumps(own,indent=2)+'\n')
audit=json.loads((docs/'current-audit.json').read_text());assert audit['counts']['byState']=={'L-T':4,'L':127,'U':18,'false':16};assert audit['current_false_classification']=={'EVIDENCE_MISSING':9,'IMPLEMENTATION_MISSING':0,'OWNER_DECISION_REQUIRED':6,'INTEGRATION_OWNED':1}
mut={}
for file in sorted((r/'mutations').glob('*.json')):
 d=json.loads(file.read_text());assert d['status']=='AS-DECLARED' and d['mismatches']==0 and not d['baseline_red'];mut[file.stem]={'mutants':len(d['mutants']),'source_head':d['source_head'],'status':d['status'],'restrictions':d['restrictions'],'baseline_red':[], 'sha256':sha(file)}
assert sum(x['mutants'] for x in mut.values())==122
summaries={}
for name in ['unit','backend-scope','widgets','http','u-scope']:
 d=json.loads((r/(name+'.json')).read_text());assert d['success'] and d['numFailedTests']==0;summaries[name]={k:d[k] for k in ['numPassedTestSuites','numPassedTests','numFailedTests','numPendingTests','success']}
binr=json.loads(next(l for l in (r/'bin.log').read_text().splitlines() if l.startswith('{')));assert binr['status']=='PASS' and binr['cases']==17
v=json.loads((work/'final-capture/verification-report.json').read_text());assert v['violations']==[]
verification={'contract':'maya.widget-final-evidence-checkpoint/1','source_head':head,'runtime_changed_this_pass':False,'mutations':mut,'fresh_mutants':122,'test_summaries':summaries,'bin_cases':17,'evidence':v,'inventory':{'declarations':434,'batteries':37,'ci_jobs':58},'audit_selftests':57,'receipt_selftests':47,'typecheck_widgets_live':'PASS','typecheck_scripts':'PASS','changed_test_lint':'PASS','build':'PASS','K3_structural_checks':'10/10','full_backend_regression':'Inherited exact runtime bytes: previous 578 suites / 5458 passing; this pass re-ran affected backend suites plus whole widgets live suite. No fresh full-backend claim.','remote_ci':'NOT RUN; restricted receipts are not a complete CI certificate','integration_artifact':{'status':'INTEGRATION-ONLY CHECK','present':(repo/'maya-chat-shell/dist/web').is_dir(),'copied':False},'9.6':'INTEGRATION-OWNED; still false','fbe2e':{'CLOSED':13,'PARTIAL':6,'OPEN':9,'new_whole_closures':0},'self_booking':'Previous implemented mechanism preserved; no production identity change','AR-1':{'envelope':'READY','status':'PROPOSED / UNAPPROVED / NOT ACTIVATED','writer_implemented':False},'effects':{'production':0,'otp':0,'yclients':0},'claude_path_overlap':0,'safe_to_integrate':'NO','reason':'No combined carrier/backend candidate, canonical 9.6 persisted-turn proof or fresh integration CI; this is not a backend regression failure.'}
(docs/'verification.json').write_text(json.dumps(verification,indent=2)+'\n')
for dirname,source in [('evidence',work/'final-capture'),('mutation-receipts',r/'mutations')]:
 (docs/dirname).mkdir(exist_ok=True)
 for f in source.iterdir():
  if f.suffix in ['.json','.jsonl']:shutil.copy2(f,docs/dirname/f.name)
changes=subprocess.check_output(['git','diff','--name-only','f8d6fe419ae5a157f964d3d9359f834f56475ddd',head],cwd=repo,text=True).splitlines()
(docs/'FILES-TOUCHED.md').write_text('# Files touched\n\nPackage: maya-saas-backend, tests/proof support only. Plus this pass docs/evidence directory. Runtime semantics, schema, feature readiness, carrier and Claude files unchanged.\n\n'+''.join('- `'+c+'`\n' for c in changes)+'\nComplete branch comparison, committed/uncommitted Claude paths and excluded prefixes: ownership-proof.json. Overlap: 0.\n')
(docs/'CHECKPOINT.md').write_text(f'''# Final independent evidence checkpoint

Закрыто 2 из 11 evidence gaps. G7-FR6b: **L**, доказана кардинальность всей canonical pairing table + штатный HTTP/BIN COMMIT. R-1a: **U**, live typed positive/refusal и отдельно исключённая SPOKEN часть по принятому OD-3 A. U не считается strict live. Остальные девять не повышены по fixture/RI тестам.

```yaml
FALSE CLAUSES: 16 # 18 → 16; за всю программу 31 → 16
EVIDENCE_MISSING: 9
IMPLEMENTATION_MISSING: 0
OWNER_DECISION_REQUIRED: 6
INTEGRATION_OWNED: 1 # 9.6 остаётся false
FINAL OWNER DECISION PACKET: READY
AR-1 ENVELOPE: READY # PROPOSED, UNAPPROVED, NOT ACTIVATED
SAFE TO INTEGRATE: NO
```

**{audit['headline']}**. Все 165 строк: 127 L / 4 L-T / 18 U / 16 false. Перенос 9.6 в INTEGRATION_OWNED не закрывает clause и не меняет её код.

Branch: `codex/widget-release-programme-20260929`\nWorktree: `{repo}`\nProof-source HEAD: `13b4a4f88f8b7feb69762e97f73689f4921425db`\nCurrent test-source HEAD: `{head}`. Финальный documentation commit — в DELIVERY.json. Mutation receipts сохраняют свой настоящий HEAD; единственная последующая backend delta — отдельный U ledger test. Runtime и прежние killers не менялись.

## Проверка

- Affected backend: {summaries['backend-scope']['numPassedTestSuites']} suites / {summaries['backend-scope']['numPassedTests']} PASS; отдельные pairing/readback/absence: {summaries['unit']['numPassedTests']} PASS.
- Полный widgets live: {summaries['widgets']['numPassedTestSuites']} suites / {summaries['widgets']['numPassedTests']} PASS; fresh U ledger: {summaries['u-scope']['numPassedTests']} PASS.
- HTTP evidence: {summaries['http']['numPassedTests']} PASS; BIN: 17/17. Manifest: {v['lines']} строк, {v['claims']} claims, 0 violations.
- Mutations: **122/122 as declared**, 0 baseline failures / 0 mismatches. Включены полные Gate 7, Gate 8-R, pairing и WF/WR/H-harness/AB batteries. Это targeted receipts, не новая full remote CI certification.
- Typechecks live/scripts, build, scoped lint и K3 **10/10** PASS. Audit selftests **57**, receipt/lineage selftests **47** PASS.
- Предыдущая full backend regression 578 suites / 5458 PASS сохранена с неизменными runtime bytes; заново полная backend suite в этом проходе не заявляется.
- Claude overlap **0**; production/OTP/YCLIENTS effects **0**. Новых schema changes нет.

## Точные оставшиеся blockers

1. **G6-13** — real Gate-6 allow / Gate-14 authority disagreement с metric: нужен test-only synchronization/observation путь к отдельному BIN-процессу; текущий счётчик только in-memory. Это evidence-engineering dependency, не новое product decision.
2. **G7-5, G7-BOOK1, G11-I9, G13-I3** — canonical production non-draft initial action/ancestry, appointment reread и single-use pairing proof. Прямой minter не является этим источником.
3. **G7-FR6d** — whole no-MONEY / PAYMENT_HANDOFF / F80 E-INDEP proof.
4. **G12-R1b, G12-I11, G13-R2** — production detail/w NAVIGATE target evidence. Имеющийся T1 schedule target s не заменяет его.
5. **G6-6 / G13-R8** — destination-specific receiving owner contract, текущий STOP сохранён; обычный booking и SB-1 не зависят от HANDOFF.
6. **G8-3 / G8-4 / G8-5t / G8-DENY** — явный scope или именованные input owners. Не превращены в U без решения.
7. **9.6 — INTEGRATION-OWNED.** Нужен combined carrier/backend candidate с одной persisted user-turn identity. Отсутствующий `maya-chat-shell/dist/web` — INTEGRATION-ONLY CHECK, не backend failure. Artifact Claude не копировался; его assertions не ослаблены.
8. **AR-1:** предложенный полный contract готов, но не одобрен и не реализован entitlement writer. Ни threshold, ни ratchet unlock не выполнены. В proposal явно закрыт риск автоматического trial grant при смене `planned`.

FBE2E whole limitations сохранены: **13 CLOSED / 6 PARTIAL / 9 OPEN**. Их presentation/effect/policy boundaries не закрываются новым backend test. SB-1 mechanism не менялся, реальная повторная верификация не запускалась.

`SAFE TO INTEGRATE: NO` относится к отсутствующей проверке combined candidate/9.6/integration CI. Текущие backend checks зелёные. Release readiness и activation — отдельные, всё ещё закрытые gates.

Все owner choices и шесть частей AR-1 собраны в **DECISIONS.md**. По каждой из исходных 11 evidence clauses implementation owner, proof и результат — в **CLAUSE-DISPOSITION.md**. Полный текущий расчёт воспроизводится **recompute.mjs**, отказывает на drift/неполных receipts; исторические документы не переписаны.

**STOP после этого checkpoint.** Merge, deployment и activation не выполнялись.
''')
out.mkdir(exist_ok=True)
# Include every generated file in the ownership inventory; legacy counts remain labelled.
own=json.loads(subprocess.check_output(['node','docs/rebuild/widget-release-programme/check.mjs'],cwd=repo,text=True))
assert own['ownershipOverlap']==[]
own['scope_note']='Ownership check only. Clause counts from this legacy checker describe the programme baseline; current clause state is current-audit.json.'
(docs/'ownership-proof.json').write_text(json.dumps(own,indent=2)+'\n')
for f in docs.iterdir():
 if f.is_file():shutil.copy2(f,out/f.name)
with zipfile.ZipFile(out/'receipts.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in r.rglob('*'):
  if f.is_file() and not f.name.startswith('dev-') and f.name not in ['postgres.log','wf-dryrun.json']:z.write(f,'receipts/'+str(f.relative_to(r)))
 for folder in ['evidence','mutation-receipts']:
  for f in (docs/folder).iterdir():z.write(f,folder+'/'+f.name)
(out/'SHA256.json').write_text(json.dumps({f.name:sha(f) for f in out.iterdir() if f.is_file() and f.name!='SHA256.json'},indent=2)+'\n')
print('assembled',out)
