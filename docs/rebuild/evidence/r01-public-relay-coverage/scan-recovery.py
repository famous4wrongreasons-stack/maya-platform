from pathlib import Path
import json,re,hashlib,os
h=Path.home()
names=['.maya-b22-daa7f91a','security-backup-2026-06-22','deploy-backups','.codex-package5-b7-b8-4b96b546','.maya-release-evidence','.maya-b23-candidate','backups','landing_bak','.codex-package5-remediation-94543056','.p5-b21-dc266820','site-community-stage-20260904','p5-b14-7260a5a4-backup','.codex-package5-b5-b6-fb820b3b','.maya-b24-candidate','api-proxy-backups','site-community-proxy-backup-1788517921','app','mayaos-staging-20260806-210634','muzhskayaestetika.rf/backups','muzhskayaestetika.rf/deploy-staging']
rows=[];errors=[];links=[]
files=[p for p in h.iterdir() if p.is_file() and re.search(r'api.*(?:php|tmp)$',p.name)]
for name in names:
 root=h/name
 if not root.exists():continue
 for parent,dirs,found in os.walk(root,followlinks=False,onerror=lambda e:errors.append(str(e))):
  for leaf in dirs+found:
   p=Path(parent)/leaf
   if p.is_symlink():links.append(dict(path=str(p),target=str(p.resolve())))
  files.extend(Path(parent)/n for n in found if re.search(r'\.(?:php\d*|phtml|phar)(?:\.|$)',n,re.I))
for p in sorted(set(files)):
 if p.is_symlink():continue
 try:
  b=p.read_bytes();s=b.decode('utf8','replace');rows.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),bookRecord='book_record' in s.lower(),providerWriteCandidate=bool(re.search(r'yc_post\s*\(',s)),refusal='verified_client_channel_required'in s))
 except OSError as e:errors.append(str(e))
print(json.dumps(dict(boundary=names,files=rows,symlinks=links,errors=errors,publicReachability='UNPROVEN until effective virtual-host/alias mapping is available'),indent=2))
