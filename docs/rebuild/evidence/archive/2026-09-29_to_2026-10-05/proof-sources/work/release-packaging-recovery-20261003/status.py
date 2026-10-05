from pathlib import Path
import datetime,hashlib,json,re,subprocess
root=Path.cwd();o=root/'outputs/release-packaging-final-20261003';r=o/'receipts';be=root/'work/maya-controlled-integration/maya-saas-backend'
e=json.loads((o/'SUSPEND-RECOVERY-EXECUTION.json').read_text());result={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':e['status'],'startedAt':e['startedAt'],'parts':[]}
mutants=json.loads((be/'test/widgets-live/mutations/gateWR.json').read_text())
for slot,mirror in [('WR-part-3-of-4','1518ca81d9'),('WR-part-4-of-4','483e3b4880')]:
 p=r/'mutation-parts'/('widgets-mutation-part-'+slot+'.json');row={'slot':slot}
 if p.exists():
  v=json.loads(p.read_text());row.update(status=v['status'],mutants=len(v['mutants']),mismatches=v['mismatches'])
 else:
  base=Path('/var/folders/qw/q88nsc3s5bqcv2c_bwgm28gh0000gn/T')/('widgets-mutation-mirror-'+mirror)/'maya-saas-backend';matched=[]
  for m in mutants:
   edits=m.get('edits',[m]);files={}
   for edit in edits:
    p=be/edit['file'];text=files.get(edit['file'],p.read_text());files[edit['file']]=text.replace(edit['find'],edit['replace'],1)
   if all((base/file).exists() and (base/file).read_text()==text for file,text in files.items()):matched.append(m['id'])
  row.update(status='RUNNING',currentSourceMutation=matched or ['baseline / step transition'])
 result['parts'].append(row)
for p in sorted(r.glob('r06-recovery-*.jsonl')):
 rows=[json.loads(l) for l in p.read_text().splitlines()];result[p.stem]={'runs':len(rows),'allPassed':all(x['status']==0 and x['timeout']==20000 for x in rows)}
print(json.dumps(result))
