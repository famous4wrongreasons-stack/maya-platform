from pathlib import Path
import json,shutil,hashlib,subprocess
repo=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
base=Path('/tmp/maya-single-lifecycle-http-20261008')
unit=Path('/tmp/maya-single-lifecycle-20261008')
dest=repo/'docs/rebuild/evidence/maya-development-integration-20261006/single-lifecycle-20261008'
final=json.loads((base/'attempt1/manifest.json').read_text())
assert final['status']=='passed' and final['clusterStopped'] and final['postmasterPidAbsent']
assert final['sourcesUnchanged'] and final['harnessUnchanged'] and final['buildUnchanged']
assert all(g['closed'] and g['groupAbsent'] for g in final['groups'].values())
assert not dest.exists()
dest.mkdir(parents=True)
for label,source in [('http',base),('local',unit)]:
 for f in source.rglob('*'):
  if f.is_file() and f.suffix in ['.json','.log','.mjs','.cjs','.py','.md','.png']:
   assert 'private-restart' not in f.name
   to=dest/label/f.relative_to(source);to.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,to)
for name,h in final['sourceBindings'].items():
 assert hashlib.sha256((repo/name).read_bytes()).hexdigest()==h
 assert hashlib.sha256(subprocess.check_output(['git','show',final['sourceHead']+':'+name],cwd=repo)).hexdigest()==h
local=json.loads((unit/'green3/report.json').read_text())
assert local['status']=='passed' and local['sourceUnchanged']
for name,h in local['sourceHashes'].items():
 assert hashlib.sha256(subprocess.check_output(['git','show',final['sourceHead']+':'+name],cwd=repo)).hexdigest()==h
verification={'contract':'maya.single-lifecycle-verification/1','sourceHead':final['sourceHead'],'status':'qualified-local-pass','certificate':'NOT_ISSUED','unitTests':190,'unitSuites':9,'browserGuardTests':6,'productionTypes':True,'focusedProofAndSpecTypes':True,'scopedLint':True,'currentReactCheckpoints':8,'singleLifecycleInitialHttpReact':True,'standaloneSingleClarificationRestartHttp':False,'standaloneSingleExactReplayHttp':False,'compoundActualProcessPgRestartReplay':True,'noRequestBusinessWrites':True,'realModelAcceptance':False,'realProviderAcceptance':False,'qualifiedLimits':['Single scoped clarification/continuation, held and revocation error propagation use local synthetic port tests.','Current React extra step proves initial single semantic request, not a standalone single restart/replay proof.','Natural source expiry, HELD and late transaction drift HTTP cases remain unexecuted.','No live provider/model, schema, background authority or aggregate C10 acceptance.'],'failedLocalAttempts':{'red':'Missing single Lifecycle dispatch reproduced: expected one C9 call, observed zero.','green1':'187 pass/3 failed: generic catch mislabelled missing turn/HELD/source revocation as CRM connectivity. Narrow delegation now preserves original refusal.','green2':'190 tests and production types/lint passed; focused test types found three fixture typing errors. Typed tables/object narrowing corrected; no production change.','green3':'190/9 plus production/focused types and lint pass.'},'privacy':'Private restart receipt, credentials, database files and Chrome profiles excluded.'}
(dest/'verification.json').write_text(json.dumps(verification,indent=2,ensure_ascii=False)+'\n')
print(dest)
