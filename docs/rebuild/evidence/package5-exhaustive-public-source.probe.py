import base64,hashlib,json,re
from pathlib import Path
roots={'vps':Path('/var/www/maya-platform')}
if not roots['vps'].exists(): roots={'salon':Path('/home/m/mocine3388/muzhskayaestetika.rf/public_html'),'mayaos':Path('/home/m/mocine3388/mayaos.ru/public_html')}
out={}
for k,r in roots.items():
 for p in r.rglob('*'):
  if not p.is_file() or p.suffix not in {'.html','.js'}:continue
  if any(x in {'uploads','media','node_modules','.git','backups','vendor'} for x in p.relative_to(r).parts):continue
  b=p.read_bytes();s=b.decode(errors='replace')
  s=re.sub(r'(?im)((?:const|let|var)\s+\w*(?:token|secret|password|apiKey)\w*\s*=\s*)[\"\'][^\"\'\n]{12,}[\"\']',r'\1"[REDACTED]"',s)
  out[k+'/'+str(p.relative_to(r))]={'sha256':hashlib.sha256(b).hexdigest(),'content':base64.b64encode(s.encode()).decode()}
print(json.dumps(out))
