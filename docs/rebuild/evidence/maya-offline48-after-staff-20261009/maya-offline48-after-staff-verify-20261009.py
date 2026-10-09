import json,hashlib,pathlib,subprocess,io,tarfile,collections,sys
root=pathlib.Path('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-offline48-semantics')
p=pathlib.Path(sys.argv[1]);base=pathlib.Path('/private/tmp/maya-offline48-after-journal-20261009-r3')
load=lambda path:json.loads(path.read_text())
before=load(base/'semantic-score.json');score=load(p/'semantic-score.json');m=load(p/'candidate-manifest.json');runner=load(p/'runner-report.json')
keys=lambda s:{f"{r['caseId']}:{r['turn']}":r for r in s['rows']}
a,b=keys(before),keys(score);assert set(a)==set(b) and len(b)==81
changed=[{'case':k,'before':a[k]['status'],'after':b[k]['status'],'failed':b[k]['failedCheckIds'],'missing':b[k]['missingEvidenceIds']} for k in a if a[k]['status']!=b[k]['status']]
retained=sum(a[k]['status']=='pass' and b[k]['status']=='pass' for k in a)
files=m['sourceHashes']; roots=sorted({('/'.join(f.split('/')[:2]) if not f.startswith('docs/') else f) for f in files})
data=subprocess.check_output(['git','archive',m['candidateCommit'],*roots],cwd=root)
with tarfile.open(fileobj=io.BytesIO(data)) as t:
 for f,sha in files.items():
  assert hashlib.sha256(t.extractfile(f).read()).hexdigest()==sha,f
old=load(base/'candidate-manifest.json'); unchanged={}
for f in files:
 if ('core-full-offline-model' in f or 'core-full-offline-assessment' in f or 'core-full-offline-score' in f or 'core-offline-48-20261009.json' in f):
  assert files[f]==old['sourceHashes'][f],f
  unchanged[f]=files[f]
actual=[json.loads(line) for line in (p/'actual-http-turns.jsonl').read_text().splitlines()]
r={'sourceHead':m['candidateCommit'],'sourceFilesVerified':len(files),'sourceUnchangedDuringRun':runner['sourcesUnchanged'],'allActualTurns':len(actual),'beforeCounts':before['counts'],'afterCounts':score['counts'],'criticalSafety':score['criticalSafety'],'retainedPreviousPass':retained,'changed':changed,'remaining':[{'case':k,'status':v['status'],'missing':v['missingEvidenceIds']} for k,v in b.items() if v['status']!='pass'],'unchangedFrozenInputs':unchanged,'runnerStatus':runner['status'],'runnerCleanup':{k:runner.get(k) for k in ['clusterStopped','brokerClosed','postmasterPidAbsent','groups']},'scoreSha256':hashlib.sha256((p/'semantic-score.json').read_bytes()).hexdigest(),'limits':['Actual HTTP/auth/C9 with scripted model and synthetic domain sources','Staff delta requires explicitly authored fixture relation and separate observed receipts','Not real model/provider, browser, restart or full MAYA acceptance']}
(p/'source-and-delta-verification.json').write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:v for k,v in r.items() if k not in ['remaining','unchangedFrozenInputs','runnerCleanup']},indent=2,ensure_ascii=False))
