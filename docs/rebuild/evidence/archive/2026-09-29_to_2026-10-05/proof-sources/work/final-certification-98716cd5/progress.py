from pathlib import Path
import json,hashlib,tempfile,subprocess,re
root=Path(__file__).resolve().parents[2];work=Path(__file__).resolve().parent;repo=root/'work/maya-controlled-integration';out=root/'outputs/final-certification-98716cd5/receipts'
reports=list((out/'mutation-parts').glob('*.json'))
ns=out/'mutations-NS-full.json'
if ns.exists():reports.append(ns)
parsed=[(p,json.loads(p.read_text())) for p in reports]
failed=[{'file':str(p),'status':v.get('status'),'mismatches':v.get('mismatches')} for p,v in parsed if v.get('status') not in ['AS-DECLARED','PARTITION-AS-DECLARED']]
active=[];targets=[]
if not ns.exists():targets.append(('NS',repo/'maya-saas-backend'))
for i in range(1,9):
 f=work/('worker-'+str(i)+'-pid')
 if not f.exists():continue
 cmd=subprocess.run(['ps','-p',f.read_text().strip(),'-o','command='],capture_output=True,text=True).stdout
 m=re.search(r'--gate ([^ ]+)',cmd)
 if m:targets.append((m[1],work/('mutation-worker-'+str(i))/'maya-saas-backend'))
for gate,source in targets:
 key=hashlib.sha1(str(source).encode()).hexdigest()[:10];mirror=Path(tempfile.gettempdir())/('widgets-mutation-mirror-'+key)/'maya-saas-backend';current='control'
 for m in json.loads((source/('test/widgets-live/mutations/gate'+gate+'.json')).read_text()):
  if 'equivalent'in m:continue
  edits=m.get('edits',[{k:m.get(k) for k in ['file','find','replace']}]);texts={}
  try:
   for e in edits:
    if e['file'] not in texts:texts[e['file']]=(source/e['file']).read_text()
    texts[e['file']]=texts[e['file']].replace(e['find'],e['replace'],1)
   if all((mirror/f).exists() and (mirror/f).read_text()==s for f,s in texts.items()):current=m['id'];break
  except (FileNotFoundError,UnicodeDecodeError):pass
 active.append(gate+':'+current)
print(json.dumps({'complete':len(parsed),'of':65,'failed':failed,'active':active},separators=(',',':')))
