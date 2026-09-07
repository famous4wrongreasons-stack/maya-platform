"""Read deployed public code metadata, never execute PHP or issue business requests."""
import datetime,hashlib,json,re,subprocess
from pathlib import Path
out={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionWrites':0,'sites':{},'cron':{}}
for domain in ['muzhskayaestetika.rf','mayaos.ru']:
 root=Path('/home/m/mocine3388')/domain/'public_html'
 entries={}
 for p in sorted(root.rglob('*')):
  rel=p.relative_to(root)
  if not p.is_file() or p.suffix.lower() not in ['.php','.html','.js'] or any(x in {'node_modules','.git','vendor','uploads','cache','backups','backup'} for x in rel.parts):continue
  data=p.read_bytes();text=data.decode('utf-8',errors='replace')
  refs=sorted(set(re.findall(r'(?:["\'])(/(?:api|internal|app|panel|auth|webhook)[A-Za-z0-9_./?{}-]*)(?:["\'])',text)))
  entry={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'pathRefs':refs,
   'phpActions':sorted(set(re.findall(r'case\s+["\']([A-Za-z0-9_.-]+)["\']\s*:',text))) if p.suffix=='.php' else [],
   'uiActions':sorted(set(re.findall(r'\b(?:pfetch|apiFetch|apiGet|apiPost)\(\s*["\']([A-Za-z0-9_/.-]+)["\']',text))) if p.suffix!='.php' else [],
   'sinkMarkers':[{'line':i,'names':sorted(set(re.findall(r'\b(curl_exec|file_put_contents|unlink|mysqli_query|PDO|pg_query|shell_exec|exec|fetch|WebSocket|session_start)\s*\(',line)))} for i,line in enumerate(text.splitlines(),1) if re.search(r'\b(curl_exec|file_put_contents|unlink|mysqli_query|PDO|pg_query|shell_exec|exec|fetch|WebSocket|session_start)\s*\(',line)]}
  entries[str(rel)]=entry
 out['sites'][domain]=entries
try:
 p=subprocess.run(['crontab','-l'],capture_output=True,text=True)
 out['cron']={'readExit':p.returncode,'sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'entries':[{'line':i,'scriptRefs':re.findall(r'[A-Za-z0-9_.-]+\.(?:php|py|sh)',s)} for i,s in enumerate(p.stdout.splitlines(),1) if s.strip() and not s.lstrip().startswith('#')]}
except PermissionError:
 out['cron']={'readExit':'PERMISSION_DENIED','entries':None}
print(json.dumps(out,indent=2))
