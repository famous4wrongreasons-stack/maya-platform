from pathlib import Path
import json,collections,datetime
root=Path.cwd();w=Path(__file__).resolve().parent;r=root/'outputs/final-certification-30fa2469/receipts'
files=sorted((r/'mutation-diagnostics').glob('*.json'),key=lambda p:p.stat().st_mtime_ns)
seenpath=w/'status-seen.json';seen=set(json.loads(seenpath.read_text())) if seenpath.exists() else set()
fresh=[]
for p in files:
 if p.name in seen:continue
 j=json.loads(p.read_text());row={k:j[k] for k in ['worker','step','passed','failed']};row['failingTitles']=[x['title'] for x in j.get('failures',[])][:8];row['omittedTitles']=max(0,len(j.get('failures',[]))-8);fresh.append(row);seen.add(p.name)
parts=[json.loads(p.read_text()) for p in (r/'mutation-parts').glob('*.json')]
alerts=[]
for p in files:
 j=json.loads(p.read_text())
 for f in j.get('failures',[]):
  t=' '.join(f.get('failureMessages',[]))
  if any(x in t for x in ['Exceeded timeout','socket hang up','ECONNREFUSED','EADDRINUSE','ECONNRESET']):alerts.append({'report':p.name,'title':f['title']})
seenpath.write_text(json.dumps(sorted(seen)))
progress = {
 'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'parts':len(parts), 'totalParts':65,
 'partStatuses':dict(collections.Counter(p['status'] for p in parts)),
 'completedDeclarations':sum(len(p['mutants']) for p in parts),
 'declarationStatuses':dict(collections.Counter(m['status'] for p in parts for m in p['mutants'])),
 'baselineRed':[x for p in parts for x in p.get('baseline_red',[])],
 'mismatches':sum(p.get('mismatches',0) for p in parts),
 'testRuns':len(files), 'transportFailureAlerts':alerts, 'newRuns':fresh[-8:],
}
print(json.dumps(progress,ensure_ascii=False))
record = {**progress, 'candidate':'30fa24698f3ae277c22209e8edfd448c29e4f872',
 'scope':'Live progress only. Does not admit partial receipts as whole-corpus certification.',
 'certificateIssued':False, 'canonicalAssembly':'PENDING'}
(r.parent/'MUTATION-PROGRESS.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
statepath=w/'STATE.json'
state=json.loads(statepath.read_text())
state.update({'updated':progress['utc'], 'completedMutationParts':len(parts),
              'observedTestRuns':len(files), 'completedMutationDeclarations':progress['completedDeclarations']})
statepath.write_text(json.dumps(state,indent=2)+'\n')
