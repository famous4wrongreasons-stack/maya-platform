from pathlib import Path
import json,hashlib,subprocess,datetime
root=Path(__file__).resolve().parents[2]; repo=root/'work/maya-controlled-integration'; cert=root/'outputs/ar1-production-unlock-final-20261002'; out=root/'outputs/controlled-production-76df1766'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
dirty=subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip()
j=json.loads((cert/'ARTIFACT-HASH-PARITY.json').read_text()); failures=[]; trees=[]
for t in j['trees']:
 expected={e['path']:e['sha256'] for e in t['entries']}
 actual={str(p.relative_to(repo)):sha(p) for p in (repo/t['root']).rglob('*') if p.is_file()}
 diff=[p for p in expected.keys()|actual.keys() if expected.get(p)!=actual.get(p)]
 failures.extend(diff);trees.append({'root':t['root'],'files':len(actual),'matching':not diff,'differences':diff})
r=json.loads((cert/'CERTIFICATION-RECEIPTS.json').read_text()); refs={}
def walk(v):
 if isinstance(v,dict):
  if isinstance(v.get('path'),str) and isinstance(v.get('sha256'),str):refs[v['path']]=v['sha256']
  for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(r)
badrefs=[p for p,h in refs.items() if not (cert/p).is_file() or sha(cert/p)!=h]
ok=head==j['candidate']==r['candidate']=='76df1766a74212f2c8a06ab879386fc8e4468d73' and not dirty and not failures and not badrefs and r['certifiedForProfile'] and r['productionExecutionPathCertified']
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':head,'sourceClean':not dirty,'status':'PASS' if ok else 'STOP','trees':trees,'certificationReceiptSha256':sha(cert/'CERTIFICATION-RECEIPTS.json'),'referencedReceipts':len(refs),'badReferences':badrefs,'productionMutations':0}
(out/'CERTIFIED-ARTIFACT-PREFLIGHT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));raise SystemExit(0 if ok else 1)
