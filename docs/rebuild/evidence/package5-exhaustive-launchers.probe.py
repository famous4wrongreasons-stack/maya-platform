import hashlib,json,re,subprocess
from pathlib import Path
def run(args):
 p=subprocess.run(args,capture_output=True,text=True);return p.returncode,p.stdout,p.stderr
out={'inspection':'readonly launcher/config structure; secrets excluded','cron':[],'nginx':{},'environmentFlags':{},'dailyScripts':[],'observer':{}}
code,raw,err=run(['sudo','-n','nginx','-T']);out['nginx']['exit']=code;out['nginx']['unavailable']=bool(err and not raw)
out['nginx']['routing']=[s.strip() for s in raw.splitlines() if re.match(r'\s*(server_name|listen|root|location|proxy_pass)\b',s)]
for u in ['root','botadmin']:
 c,o,e=run(['sudo','-n','crontab','-u',u,'-l']);out['cron'].append({'user':u,'exit':c,'noCrontab':bool(re.search(r'no crontab',e,re.I)),'permissionDenied':bool(re.search(r'permission|not allowed|password',e,re.I))})
for folder in ['hourly','daily','weekly','monthly']:
 c,o,e=run(['sudo','-n','find','/etc/cron.'+folder,'-maxdepth','1','-type','f']);
 for f in o.splitlines():
  c,s,e=run(['sudo','-n','cat',f]);out['dailyScripts'].append({'file':f,'sha256':hashlib.sha256(s.encode()).hexdigest(),'applicationRefs':sorted(set(re.findall(r'/(?:opt|home)/[A-Za-z0-9_./-]+',s)))})
for u in ['maya-saas','barbershop-bot']:
 c,pid,e=run(['systemctl','show',u,'-p','MainPID','--value']);c,s,e=run(['sudo','-n','cat','/proc/'+pid.strip()+'/environ']);env=dict(x.split('=',1) for x in s.split('\0') if '=' in x)
 out['environmentFlags'][u]={k:v.strip().lower() not in ['0','false','no','off',''] for k,v in env.items() if re.fullmatch(r'[A-Z0-9_]*(?:ENABLED|DRY_RUN)',k)}
f=Path('/opt/maya-shadow-observer/legacy_appointment_shadow_observer.py');out['observer']={'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
print(json.dumps(out,indent=2))
