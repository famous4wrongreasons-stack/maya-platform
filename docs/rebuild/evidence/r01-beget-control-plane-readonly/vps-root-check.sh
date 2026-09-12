python3 - <<'PY'
import subprocess,re,json,pathlib,hashlib,datetime,os
r=subprocess.run(['sudo','-n','nginx','-T'],capture_output=True,text=True,timeout=25)
active='\n'.join(l.split('#',1)[0] for l in r.stdout.splitlines())
roots=sorted(set(re.findall(r'^\s*(?:root|alias)\s+([^;]+);',active,re.M)))
rows=[];errs=[]
for name in roots:
 p=pathlib.Path(name)
 row={'path':name,'exists':p.exists(),'symlink':p.is_symlink(),'resolved':str(p.resolve()),'phpArtifacts':[],'symlinks':[]}
 if p.exists():
  for d,dirs,files in os.walk(p,followlinks=False,onerror=lambda e:errs.append(type(e).__name__)):
   for n in dirs+files:
    q=pathlib.Path(d)/n
    if q.is_symlink():row['symlinks'].append({'path':str(q),'resolved':str(q.resolve())})
   for n in files:
    q=pathlib.Path(d)/n
    if q.is_symlink():continue
    if re.search(r'\.(php\d*|phtml?|phar)(?:\.|$)',n,re.I):
     b=q.read_bytes();row['phpArtifacts'].append({'path':str(q),'sha256':hashlib.sha256(b).hexdigest()})
 rows.append(row)
print(json.dumps({'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nginxTestExit':r.returncode,'activePhpFastCgiLines':[l for l in active.splitlines() if re.search(r'(?i)php|fastcgi',l)],'rootRows':rows,'errors':errs,'configurationSha256':hashlib.sha256(r.stdout.encode()).hexdigest()},indent=2))
PY
