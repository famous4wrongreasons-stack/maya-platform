from pathlib import Path
import collections,datetime,json
r=Path('outputs/ar1-single-operator-20261003/receipts')
parts=[json.loads(p.read_text()) for p in (r/'mutation-parts').glob('*.json')]
diagnostics=[json.loads(p.read_text()) for p in (r/'native-progress-diagnostics').glob('*.json') if not p.name.endswith('.raw.json')]
counts=collections.Counter(m['status'] for p in parts for m in p.get('mutants',[]))
alerts=[{'batteries':p['batteries'],'status':p.get('status'),'baselineRed':p.get('baseline_red'),'mismatches':p.get('mismatches'),'badMutants':[{'id':m['id'],'status':m['status'],'expect':m.get('expect')} for m in p.get('mutants',[]) if m.get('expect') and m['status']!=m['expect']]} for p in parts if p.get('status') not in ['AS-DECLARED','PARTITION-AS-DECLARED'] or p.get('baseline_red') or p.get('mismatches')]
latest=sorted(diagnostics,key=lambda d:d['capturedAt'])[-4:]
print(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'completedParts':len(parts),'totalParts':68,'nativeStatuses':dict(counts),'alerts':alerts,'diagnosticSteps':len(diagnostics),'latestDiagnosticsNotAdmission':[{'worker':d['worker'],'step':d['step'],'pass':d['passed'],'fail':d['failed'],'titles':[f['title'] for f in d['failures']][:3]} for d in latest]},ensure_ascii=False))
