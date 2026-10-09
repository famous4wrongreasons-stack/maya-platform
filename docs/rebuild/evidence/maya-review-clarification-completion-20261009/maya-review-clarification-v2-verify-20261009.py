import json,hashlib,pathlib,subprocess,io,tarfile,sys
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
p=pathlib.Path(sys.argv[1]);base=root/'docs/rebuild/evidence/maya-offline48-after-reviews-20261009/r1'
load=lambda path:json.loads(path.read_text())
before=load(base/'semantic-score.json');score=load(p/'semantic-score.json');m=load(p/'candidate-manifest.json');runner=load(p/'runner-report.json')
key=lambda s:{f"{r['caseId']}:{r['turn']}":r for r in s['rows']}
a,b=key(before),key(score);assert set(a)==set(b) and len(b)==81
assert score['contract']=='maya.offline48.contract-score/2'
assert score['counts']=={'pass':57,'semantic_fail':0,'unsupported':12,'insufficient_evidence':10,'clarification_pending':2},score['counts']
assert score['criticalSafety']=={'failedTurns':0,'missingEvidenceTurns':0}
assert score['remainingNonPendingTurns']==22 and score['pendingClarificationTurns']==2 and score['unclosedTurns']==24
assert score['exitCode']==2
changes=[{'case':k,'before':a[k]['status'],'after':b[k]['status']} for k in a if a[k]['status']!=b[k]['status']]
assert len(changes)==2 and all(c['before']=='semantic_fail' and c['after']=='clarification_pending' for c in changes)
for c in changes:
 assert b[c['case']]['goalCompleted'] is False
 assert b[c['case']]['phase']=='AWAITING_RATING_CHOICE'
files=m['sourceHashes']; roots=sorted({('/'.join(f.split('/')[:2]) if not f.startswith('docs/') else f) for f in files})
data=subprocess.check_output(['git','archive',m['candidateCommit'],*roots],cwd=root)
with tarfile.open(fileobj=io.BytesIO(data)) as t:
 for f,sha in files.items():
  assert hashlib.sha256(t.extractfile(f).read()).hexdigest()==sha,f
old=load(base/'candidate-manifest.json');unchanged={}
for f in files:
 if any(x in f for x in ['core-full-offline-model','core-offline-48-20261009.json','core-full-offline-fixtures']):
  assert files[f]==old['sourceHashes'][f],f
  unchanged[f]=files[f]
actual=[json.loads(line) for line in (p/'actual-http-turns.jsonl').read_text().splitlines()]
assert len(actual)==81
receipts=[json.loads(line) for line in (p/'offline-review-clarification-receipts.jsonl').read_text().splitlines()]
assert len(receipts)==2
for receipt in receipts:
 rows=[r for r in actual if r['caseId']==receipt['caseId'] and r['turn']==receipt['turn']];assert len(rows)==1
 assert receipt['responseHash']==rows[0]['responseHash']
 assert receipt['reviewClarification']==rows[0]['audit']['reviewClarification']
 assert receipt['reviewClarification']['goalCompleted'] is False
assert runner['sourcesUnchanged'] and runner['clusterStopped'] and runner['brokerClosed'] and runner['postmasterPidAbsent']
assert all(v['closed'] and v['groupAbsent'] for v in runner['groups'].values())
status=subprocess.run(['/opt/homebrew/opt/postgresql@16/bin/pg_ctl','-D',runner['cluster'],'status'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
assert status.returncode==3 and not (pathlib.Path(runner['cluster'])/'postmaster.pid').exists()
r={'contract':'maya.review-clarification-v2.source-and-delta/1','baselineHead':'b81ac624cd8b359bbebc6d809f530e1ed978e360','sourceHead':m['candidateCommit'],'sourceFilesVerified':len(files),'sourceUnchangedDuringRun':True,'allActualTurns':81,'beforeCounts':before['counts'],'afterCounts':score['counts'],'criticalSafety':score['criticalSafety'],'retainedPreviousPass':sum(a[k]['status']=='pass' and b[k]['status']=='pass' for k in a),'changed':changes,'remainingNonPendingTurns':22,'pendingClarificationTurns':2,'unclosedTurns':24,'separateCompletionProofNotAddedToOriginal81':True,'unchangedFrozenInputs':unchanged,'runnerStatus':runner['status'],'pgStatusExit':status.returncode,'postmasterPidAbsent':True,'runnerGroupsClosed':True,'brokerClosed':True,'scoreSha256':hashlib.sha256((p/'semantic-score.json').read_bytes()).hexdigest(),'manifestSha256':hashlib.sha256((p/'candidate-manifest.json').read_bytes()).hexdigest(),'limits':['Actual HTTP/auth/C9 with scripted model and synthetic domain sources','Pending clarification is not a completed answer and not PASS','Separate supplemental completion proof does not rewrite original81 outcomes','Not real model/provider, browser or full MAYA acceptance']}
(p/'source-and-delta-verification.json').write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n');print(json.dumps({k:v for k,v in r.items() if k!='unchangedFrozenInputs'},indent=2,ensure_ascii=False))
