import json,subprocess,os,datetime
from pathlib import Path
out={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inspection':'read-only service/process metadata, no app import, no database connection','release':str(Path('/opt/maya-saas/current').resolve()),'services':{},'otherStdinPythonProcesses':[],'productionEffectsForProof':0,'serviceChanges':0}
for u in ['maya-saas','barbershop-bot','maya-organic-appointment-shadow-observer']:
 p=subprocess.run(['systemctl','show',u,'-p','MainPID','-p','ActiveState'],capture_output=True,text=True);out['services'][u]=dict(s.split('=',1) for s in p.stdout.splitlines() if '=' in s)
p=subprocess.run(['ps','-eo','pid,ppid,comm,args'],capture_output=True,text=True)
for line in p.stdout.splitlines()[1:]:
 s=line.split(None,3)
 if len(s)==4 and s[3] in ['python3 -','python -'] and int(s[0])!=os.getpid():out['otherStdinPythonProcesses'].append({'pid':int(s[0]),'ppid':int(s[1]),'command':s[2]})
print(json.dumps(out,indent=2))
