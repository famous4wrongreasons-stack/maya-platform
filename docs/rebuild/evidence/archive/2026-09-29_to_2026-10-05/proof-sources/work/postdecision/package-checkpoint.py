from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import json, shutil, hashlib, subprocess

root=Path(__file__).resolve().parents[2]
repo=root/'work/widget-release'
work=root/'work/postdecision'
out=repo/'docs/rebuild/widget-release-programme/postdecision'
prior=out.parent/'preintegration'
receipts=work/'receipts'
def read(p): return json.loads(p.read_text())
def write(p,d): p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
def git(*a): return subprocess.check_output(['git',*a],cwd=repo,text=True).strip()
source=git('rev-parse','HEAD')
runtime='a46b228bcc2c8912f2b25d194944be7ea0dee365'
start='d7eaf17c153929bbf01f86aae13753bacd955e84'
assert source=='b2a8c8a2bd0ab34ed18456536086ae04ace73f9c'

for src,dst in [('evidence','runtime-evidence'),('boundary-evidence','evidence')]:
    shutil.copytree(work/src,out/dst,dirs_exist_ok=True)
    log=receipts/('evidence-verify.log' if src=='evidence' else 'boundary-verify.log')
    write(out/dst/'verification-report.json',json.loads(log.read_text().splitlines()[0]))
shutil.copy2(work/'runtime-audit.json',out/'runtime-audit.json')
shutil.copytree(receipts/'mutations',out/'mutation-receipts',dirs_exist_ok=True,ignore=shutil.ignore_patterns('*.log'))

d=read(prior/'clause-disposition.json')
d['contract']='maya.widget-release-postdecision-disposition/1'
d['postdecision_start_head']=start
d['source_head']=source
for c in d['clauses']:
    c['postdecision_before']=c['after']
    if c['id']=='G13-I7':
        c.update(after='L',proof_added='WR-COMMIT-ACTION-BOUNDARY HTTP/BIN + WR-F33/WR-F76 + AB-M1/AB-M2; ACTION-BOUNDARY-PROOF.md',
                 result='CLOSED — executable action-source/metadata boundary proof',
                 boundary='Shared F33/F76 boundary proven. Non-draft ancestry and appointment nouns retain separate false clauses.')
    elif c['id']=='9.6':
        c['dependency']='INTEGRATION_ONLY_CANONICAL_PERSISTED_USER_TURN'
        c['boundary']='Owner explicitly reserves the one canonical persisted user-turn identity for the Claude+Codex integration checkpoint. No mirror writer.'
write(out/'clause-disposition.json',d)
matrix=['# Disposition of the original 31 false clauses','','31 → 19 in the preceding pass → 18 in this pass. Whole clauses only.','','| Clause | At pass start | Now | Existing implementation owner | Proof / result | Remaining boundary |','|---|---|---|---|---|---|']
esc=lambda s: str(s).replace('|','\\|').replace('\n',' ')
for c in d['clauses']:
    matrix.append('| '+' | '.join(esc(x) for x in [c['id'],c['postdecision_before'],c['after'],c['implementation_source'],c['proof_added']+'; '+c['result'],c['boundary']])+' |')
(out/'CLAUSE-DISPOSITION.md').write_text('\n'.join(matrix)+'\n')

f=read(prior/'fbe2e-disposition.json')
f['contract']='maya.fbe2e-postdecision-disposition/1'
f['scope']='Current owner-decision pass. No new whole FBE2E limitation closure. Historical statements are retained with current notes; PARTIAL is not acceptance.'
notes={
 'L2':'Contract checker freshly passes 31/31; remote CI and advisory acceptance policy remain unproved/unapproved.',
 'L4':'Fresh production-binary harness 17/17 includes explicit personal context and the stronger WR source boundary. Carrier artifact/transport remain integration-owned.',
 'L12':'Fresh WR 23/23 and new AB 2/2 have green controls; still not exhaustive port/type mutation coverage.',
 'L16':'Planner/assembler now pins 34 batteries, 55 jobs, 410 declarations. Self-tests pass; remote timing not measured.',
 'L26':'Current decision/boundary admission adds rejection tests (32 combined audit tests). Approval of U-class does not retroactively approve red/missing historical controls.',
 'L27':'Owner reserves clause 9.6 for one canonical persisted user-turn identity at integration. No second writer.'
}
for c in f['limitations']:
    c['historical_before']=c['before']
    c['before']=c['after']
    if c['id'] in notes: c['current_note']=notes[c['id']]
f['counts']=dict(Counter(c['after'] for c in f['limitations']))
assert f['counts']=={'CLOSED':13,'PARTIAL':6,'OPEN':9}
write(out/'fbe2e-disposition.json',f)

def jest(name):
    d=read(receipts/(name+'.json'))
    return {k:d[k] for k in ['success','numPassedTestSuites','numPassedTests','numFailedTests','numPendingTests']}
tests={n:jest(n) for n in ['backend','widgets','sb1-unit','boundary-unit','sb1-http','boundary-http','boundary-e1-http']}
assert all(v['success'] and v['numFailedTests']==0 for v in tests.values())
assert tests['backend']['numPassedTests']==5387
assert tests['widgets']['numPassedTests']==349
binary=next(json.loads(line) for line in (receipts/'boundary-bin.log').read_text().splitlines() if line.startswith('{"contract":'))
assert binary['status']=='PASS' and binary['cases']==17 and binary['failed']==0
reports=[];statuses=Counter()
for p in sorted((receipts/'mutations').glob('*.json')):
    m=read(p)
    assert m['status']=='AS-DECLARED' and m['mismatches']==0 and m['baseline_red']==[]
    for c in m['baseline_controls'].values():
        assert not c['failed'] and not c['problems'] and all(x==0 for x in c['exits'].values())
    statuses.update(x['status'] for x in m['mutants'])
    reports.append({k:m[k] for k in ['source_head','batteries','status','restrictions','baseline_red'] } | {'mutants':len(m['mutants'])})
assert statuses=={'build-killed':33,'live-killed':23}
assert '47' in (receipts/'evidence-tool-tests.log').read_text()
assert 'pass 32' in (receipts/'audit-tests.log').read_text()
audit=read(out/'current-audit.json')
assert audit['counts']['byState']=={'L-T':4,'L':126,'U':17,'false':18}
delta=git('diff','--name-only',runtime,source,'--','maya-saas-backend').splitlines()
assert len(delta)==7 and all('/test/' in p or p.endswith('.spec.ts') or p.endswith('.test.mjs') for p in delta)
integration=jest('integration')
assert integration['numFailedTests']==1 and 'maya-chat-shell/dist/web' in (receipts/'integration.log').read_text()
file_hashes={}
for p in sorted(receipts.rglob('*')):
    if p.is_file(): file_hashes[str(p.relative_to(receipts))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
v={
 'contract':'maya.widget-release-postdecision-verification/1',
 'observed_at':datetime.now(timezone.utc).isoformat(),'branch':git('branch','--show-current'),
 'pass_start_head':start,'runtime_source_head':runtime,'evidence_source_head':source,
 'application_runtime_identical':True,'test_only_delta_after_full_backend_run':delta,
 'tests':tests,'binary':{'cases':17,'status':'PASS','failed':0,'health':binary['binary']['health']},
 'audit_selftests':{'passed':32,'failed':0},'evidence_tool_selftests':{'passed':47,'failed':0},
 'build':'PASS','typecheck_application':'PASS','typecheck_widgets_live':'PASS','typecheck_scripts':'PASS','changed_typescript_lint':'PASS',
 'contract_checker':{'passed':31,'pending':4},
 'backend_runtime_note':'Full backend run used Node 22.23.2. Initial Node 24 process crashed with exit 139 and is not a passing run. Only seven explicitly listed test/evidence files changed since the full run; boundary unit tests and planner tests independently passed after those additions.',
 'integration_only':{'status':'INTEGRATION-ONLY CHECK — BLOCKED','missing':'maya-chat-shell/dist/web','backend_failure':False,'result':integration,'source_assertions_preserved':True,'claude_artifact_copied':False},
 'mutations':{'declared_total':410,'batteries':34,'planned_jobs':55,'freshly_exercised':56,'statuses':dict(statuses),'unexpected':0,'red_baselines':0,'restricted':True,'full_ci_certificate':False,'reports':reports,'not_rerun_this_pass':354,'remaining_gate6_pending':['M17b','M18b'],'historical_receipts':'../preintegration/verification.json; not a fresh 410-mutant run'},
 'remote_ci':'NOT RUN — no fresh CI receipt claimed',
 'clause_counts':audit['counts'],'current_false_classification':audit['current_false_classification'],'fbe2e':f['counts'],
 'self_booking':{'context_consumer':'IMPLEMENTED','new_verified_binding':'BLOCKED','end_to_end_contract':'BLOCKED','production_identity_observation':'Retained read-only 2026-09-29T16:56:28.580Z snapshot; no reread/write in this pass'},
 'safety':{'production_effects':0,'real_yclients_effects':0,'schema_migrations':0,'merge_claude':False,'runtime_activation':False,'chapter10':False},
 'raw_receipts':file_hashes
}
write(out/'verification.json',v)
shutil.copy2(prior/'owner-identity.json',out/'owner-identity-retained-readonly.json')
paths=sorted(set(git('diff','--name-only',start).splitlines()+git('ls-files','--others','--exclude-standard','--','docs/rebuild/widget-release-programme/postdecision').splitlines()))
(out/'FILES-TOUCHED.md').write_text('# Files touched in the owner-decision pass\n\nApplication package: maya-saas-backend. Evidence/docs: docs/rebuild/widget-release-programme/postdecision. No presentation packages.\n\n'+ '\n'.join('- '+p for p in paths)+'\n\nThe separate ownership-proof.json changed list covers the entire branch against the canonical isolation baseline, including previous passes.\n')
print(json.dumps({'packaged':str(out),'source_head':source,'fresh_mutants':sum(statuses.values()),'test_results':tests,'clauses':audit['counts']},ensure_ascii=False))
