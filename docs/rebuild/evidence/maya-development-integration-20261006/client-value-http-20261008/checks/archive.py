from pathlib import Path
import json,shutil,hashlib,subprocess
base=Path('/tmp/maya-client-value-http-20261008')
repo=Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration')
dest=repo/'docs/rebuild/evidence/maya-development-integration-20261006/client-value-http-20261008'
final=json.loads((base/'attempt4/manifest.json').read_text())
assert final['status']=='passed'
assert final['clusterStopped'] and final['postmasterPidAbsent']
assert final['sourcesUnchanged'] and final['harnessUnchanged'] and final['buildUnchanged']
assert all(v['closed'] and v['groupAbsent'] for v in final['groups'].values())
assert not dest.exists()
dest.mkdir(parents=True)
for attempt in range(1,5):
 p=base/f'attempt{attempt}'
 m=json.loads((p/'manifest.json').read_text())
 assert m['clusterStopped'] and m['postmasterPidAbsent']
 assert all(v['closed'] and v['groupAbsent'] for v in m['groups'].values())
 for f in p.rglob('*'):
  if f.is_file() and f.suffix in ['.json','.log','.png','.mjs','.cjs']:
   assert 'private-restart' not in f.name
   to=dest/f'attempt{attempt}'/f.relative_to(p);to.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,to)
for f in base.iterdir():
 if f.is_file() and f.suffix in ['.log','.json','.mjs','.cjs','.md']:
  to=dest/'checks'/f.name;to.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,to)
for name,h in final['sourceBindings'].items():
 assert hashlib.sha256((repo/name).read_bytes()).hexdigest()==h
 gitbytes=subprocess.check_output(['git','show',final['sourceHead']+':'+name],cwd=repo)
 assert hashlib.sha256(gitbytes).hexdigest()==h
summary={
 'contract':'maya.client-value-http-verification/1',
 'sourceHead':final['sourceHead'],
 'runtimeHead':'7c25fc8f6287fe6ebc2a6a564d9acaffd6e6a641',
 'status':'qualified-local-pass','certificate':'NOT_ISSUED',
 'prepareAndResumeJestPassed':True,'currentReactCheckpoints':7,
 'actualPostgresAndBackendProcessRestart':True,
 'realModelAcceptance':False,'liveProviderAcceptance':False,
 'allAttemptGroupsClosed':True,
 'failedAttempts':{'attempt1':'Financial role case omitted required reporting period; 400 before role guard. Four React checkpoints passed.', 'attempt2':'Second synthetic internal appointment overlapped first; canonical DB constraint refused. Prepare and actual PG restart passed.', 'attempt3':'Replay helper added audience absent from React original; intent no longer matched. Resume UI restoration and acceptance reached; exact replay assertion failed.'},
 'remaining':['Natural published-source expiry over HTTP; immutable canonical temporal constraints prohibit shortcut date rewrites.','HELD-work HTTP and late within-transaction source/authority drift remain separately unit-qualified.','Real model and YCLIENTS provider qualification; no external call authorized.','MAYA/C10 aggregate completion and separate pending autonomy/schema decisions.'],
 'privacy':'Synthetic fixtures only. Private restart receipt, credentials, database files and Chrome profiles excluded.',
}
(dest/'verification.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False)+'\n')
print(dest)
