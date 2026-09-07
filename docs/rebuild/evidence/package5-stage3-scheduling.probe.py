"""Read-only scheduling definitions/log aggregates. No app imports or job triggers."""
import ast,datetime,hashlib,json,os,re,subprocess
from pathlib import Path
out={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':'vps' if Path('/opt/maya-saas/current').exists() else 'beget','permissionBypass':False,'serverWrites':0,'jobTriggers':0,'definitions':[],'commands':[],'logs':{},'managerConfigs':[]}
def h(s):return hashlib.sha256(s.encode()).hexdigest()
def safe(s):
 s=re.sub(r'https?://[^\s"\']+',lambda m:m[0].split('?')[0],s)
 s=re.sub(r'(?i)((?:token|secret|password|api[_-]?key)\s*[=:]\s*)\S+',r'\1[REDACTED]',s)
 s=re.sub(r'(?<![A-Za-z])\d{8,12}:[A-Za-z0-9_-]{30,}', '[TOKEN REDACTED]', s)
 return s[:500]
def cmd(args):
 try:
  p=subprocess.run(args,capture_output=True,text=True,timeout=25)
  return p.returncode,p.stdout,p.stderr
 except (PermissionError,FileNotFoundError,subprocess.TimeoutExpired) as e:return type(e).__name__,'',''
def definition(p):
 try:s=p.read_text()
 except (PermissionError,FileNotFoundError,IsADirectoryError):return
 refs=[]
 for i,l in enumerate(s.splitlines(),1):
  if not l.strip() or l.lstrip().startswith('#'):continue
  if re.search(r'(?i)ExecStart|OnCalendar|OnBootSec|OnUnitActiveSec|WorkingDirectory|restart|cron|scheduler|schedule|python|node|php|curl|wget|/opt/|/home/|\.sh|run-parts',l):refs.append({'line':i,'text':safe(l)})
 out['definitions'].append({'path':str(p),'sha256':h(s),'scheduleRefs':refs})
if out['host']=='vps':
 out['release']=str(Path('/opt/maya-saas/current').resolve())
 for args in [['systemctl','list-timers','--all','--no-legend','--plain'],['systemctl','list-unit-files','--type=service,timer','--no-legend']]:
  c,s,e=cmd(args);out['commands'].append({'command':' '.join(args),'exit':c,'lines':[safe(l) for l in s.splitlines() if args[1]=='list-timers' or re.search(r'maya|barber|cron|supervisor|pm2',l,re.I)]})
 for root in [Path('/etc/systemd/system'),Path('/home/botadmin/.config/systemd/user')]:
  if root.exists():
   for p in root.rglob('*'):
    if p.is_file() and p.suffix in ['.service','.timer'] and re.search(r'maya|barber|cron',p.name,re.I):definition(p)
 for p in [Path('/etc/crontab'),*Path('/etc/cron.d').glob('*')]:definition(p)
 for user in ['botadmin','root']:
  c,s,e=cmd(['sudo','-n','crontab','-u',user,'-l']);out['commands'].append({'command':'crontab read '+user,'exit':c,'noCrontab':bool(re.search('no crontab',e,re.I)),'lines':[safe(l) for l in s.splitlines() if l.strip() and not l.lstrip().startswith('#')]})
 for unit in ['barbershop-bot','maya-saas','maya-organic-appointment-shadow-observer','cron']:
  c,s,e=cmd(['journalctl','-u',unit,'--since','2026-09-07 12:00:00 UTC','-n','25000','--no-pager','-o','json']);counts={};examples={};times=[];lineCount=0
  for line in s.splitlines():
   try:x=json.loads(line)
   except Exception:continue
   lineCount+=1;m=str(x.get('MESSAGE',''))
   patterns=[('apscheduler',r'(?:Running job|Job) ["\']([^"\']+)["\']'),('registered_job',r'Added job ["\']([^"\']+)["\']'),('nest_scheduler',r'\[(\w*(?:Scheduler|Runner|Retention|Reports)\w*)\]')]
   for kind,pat in patterns:
    match=re.search(pat,m)
    if match:
     raw=match[1];name=re.sub(r'0x[0-9a-f]+','<address>',raw);name=re.sub(r'(\d{8,})','<id>',name);key=kind+':'+name[:180];counts[key]=counts.get(key,0)+1
     examples.setdefault(key,{'timestampMicros':x.get('__REALTIME_TIMESTAMP'),'messageSha256':h(m)})
  out['logs'][unit]={'exit':c,'recordsRead':lineCount,'limit':25000,'boundedWindowNotAbsenceProof':True,'permissionDenied':bool(re.search('permission|not seeing',e,re.I)),'scheduledCounts':counts,'firstEvidence':examples}
else:
 home=Path.home();out['accountHome']=str(home);out['currentUid']=os.getuid();out['currentUser']=os.environ.get('USER')
 # Earlier crontab permission denial is not bypassed or retried under another user.
 out['crontabRead']='Prior PermissionError retained; no permission/configuration change and no alternate-user read'
 out['systemCronDirectoryRead']='PermissionError for /etc/cron.d from first current-user probe; no alternate access attempted'
 for p in [Path('/etc/crontab')]:
  out['commands'].append({'path':str(p),'readable':os.access(p,os.R_OK)})
  if os.access(p,os.R_OK):definition(p)
 for folder in [home/'.config/systemd/user',home/'.config/supervisor',home/'.supervisor',home/'.pm2']:
  out['managerConfigs'].append({'path':str(folder),'exists':os.path.exists(folder),'readable':os.access(folder,os.R_OK)})
  if os.path.exists(folder) and os.access(folder,os.R_OK):
   for p in folder.iterdir():
    if p.is_file() and (p.suffix in ['.service','.timer','.conf'] or p.name.startswith('ecosystem')):definition(p)
 for p in home.iterdir():
  if p.is_file() and re.search(r'cron|schedule|ecosystem|supervis|deploy.*\.sh$',p.name,re.I):definition(p)
 c,s,e=cmd(['ps','-u',str(os.getuid()),'-o','comm=']);out['commands'].append({'command':'own process names only','exit':c,'names':sorted(set(s.split()))})
print(json.dumps(out,ensure_ascii=False,indent=2))
