from pathlib import Path
import json,hashlib,subprocess,shutil,os
repo=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
base=Path('/tmp/maya-c9-failure-20261008')
dest=repo/'docs/rebuild/evidence/maya-development-integration-20261006/c9-failure-20261008'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
final=json.loads((base/'http-attempt2/manifest.json').read_text()); local=json.loads((base/'green5/report.json').read_text())
assert final['status']=='passed' and final['sourcesUnchanged'] and final['harnessUnchanged']
assert local['status']=='passed' and local['sourceUnchanged']
groups=0
for file in [*base.glob('http-attempt*/manifest.json'),*base.glob('*/report.json')]:
 r=json.loads(file.read_text())
 for g in r.get('groups',{}).values():
  assert g['closed'] and g['groupAbsent'];groups+=1
  try:os.killpg(g['pgid'],0)
  except ProcessLookupError:pass
  else:raise AssertionError('Own group still present')
 if 'clusterStopped' in r:
  assert r['clusterStopped'] and r['postmasterPidAbsent']
  assert not (Path(r['cluster'])/'postmaster.pid').exists()
for name,h in final['sourceBindings'].items():
 assert sha(repo/name)==h
 assert hashlib.sha256(subprocess.check_output(['git','show',final['sourceHead']+':'+name],cwd=repo)).hexdigest()==h
for name,h in local['sourceHashes'].items():
 assert hashlib.sha256(subprocess.check_output(['git','show',final['sourceHead']+':'+name],cwd=repo)).hexdigest()==h
assert not dest.exists();dest.mkdir(parents=True)
for f in base.rglob('*'):
 if f.is_file() and f.suffix in {'.mjs','.cjs','.py','.json','.log','.md'} and f.name!='archive.log':
  assert 'private' not in f.name
  to=dest/f.relative_to(base);to.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,to)
verification={'contract':'maya.c9-failure-verification/1','status':'qualified-local-pass','certificate':'NOT_ISSUED','sourceHead':final['sourceHead'],'sourceCount':len(final['sourceBindings']),'unitTests':199,'unitSuites':9,'productionTypes':True,'focusedProofAndSpecTypes':True,'scopedLint':True,'httpTests':4,'actualNodeAndPostgresRestart':True,'ownedGroupsAbsent':groups,'ownClustersStopped':2,'lateStandaloneRed':{'status':201,'outcome':'PARTIAL','current':True,'findings':1},'lateStandaloneGreen':{'status':400,'code':'c9_source_changed','findings':0},'compoundLateSource':'UNCONFIRMED, no findings/prose','heldReplay':'400 c9_read_work_in_progress_or_unknown, exact receipt preserved, no rediscovery','noRequestBusinessWrites':True,'realModelAcceptance':False,'realProviderAcceptance':False,'qualification':['Fault injection delays or loses delivery after a genuine canonical C8 read. Source values, owners and constraints are not replaced.','HELD_UNKNOWN replay across actual restart is proved; no crashed DISPATCHED worker / natural lease expiry recovery.','Ten isolated expiry boundary cases are component-clock tests, not DB-admissible deadline shapes or natural elapsed HTTP.','Current React was not rerun in this HTTP-only failure slice; previous checkpoint remains separately qualified.','No schema, retention or background authority change, no live provider/model/production/working-website change.'],'failedAttempts':{'green1':'Prettier errors in authored fixture/expiry spec; targeted105+productiontypes passed.','green2':'13 fixture lint findings; targeted105+productiontypes passed.','http-attempt1':'One exact standalone late-source failure; other three cases passed. Genuine policy revision1→2 after read returned causes stale current finding.','red':'Directory name inherited from runner; this phase is a successful 32-test expiry component baseline, not a failing RED.'},'artifactPolicy':'Private receipt, DB files and ambient secrets excluded; all source inputs and failed finite attempts retained.'}
(dest/'verification.json').write_text(json.dumps(verification,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'archive':str(dest),'groups':groups,'files':sum(p.is_file() for p in dest.rglob('*'))}))
