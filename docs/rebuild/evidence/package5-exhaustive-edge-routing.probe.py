import json,hashlib,re
from pathlib import Path
out={'productionWrites':0,'databaseConnections':0,'roots':{}}
for site in ['muzhskayaestetika.rf','mayaos.ru']:
 root=Path('/home/m/mocine3388')/site/'public_html';rows=[]
 for p in sorted(root.rglob('.htaccess')):
  if not p.is_file():continue
  s=p.read_text(errors='replace'); safe=[]
  for i,l in enumerate(s.splitlines(),1):
   if re.search(r'(?i)^\s*(?:Rewrite|Require|Deny|Allow|Order|Options|<Files|</Files|AddHandler|RemoveHandler|SetHandler|php_flag|DirectoryIndex)',l):
    if re.search(r'(?i)(?:token|secret|password|authorization|api.key)',l):l='[REDACTED ROUTING LINE]'
    safe.append({'line':i,'directive':l[:500]})
  rows.append({'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'directives':safe})
 out['roots'][site]=rows
print(json.dumps(out,indent=2))
