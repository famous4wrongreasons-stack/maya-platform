"""Fixed approved Wave R-C operational cutover. No database/business commands."""
import datetime,grp,shlex,hashlib,json,os,pwd,re,shutil,stat,subprocess,sys,time,urllib.request
from pathlib import Path
REV='8bc03454';BASE=Path('/opt/maya-saas/releases/20260908-a18-security-consent-0867ecea');REL=Path('/opt/maya-saas/releases/20260908-p5-rc-'+REV);CURRENT=Path('/opt/maya-saas/current');EVIDENCE=Path('/opt/maya-saas/release-evidence/wave-rc-'+REV);STATE=EVIDENCE/'cutover-state.json';ENV=Path('/etc/maya-saas/live-widgets.env');ROOT=Path('/var/lib/maya-saas');PRIVATE=ROOT/'team-private';PYENV=Path('/home/botadmin/barbershop-bot/.env');PLAN=Path('/tmp/maya-wave-rc-'+REV+'-python/config-plan.json');phase=sys.argv[1]
assert os.getuid()==0 and phase in ['quiesce','configure','activate','verify']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def meta(p):
 s=p.lstat();return{'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid}
def active(unit):return subprocess.run(['systemctl','is-active','--quiet',unit]).returncode==0
def write(p,data,metadata):
 t=p.with_name(p.name+'.wave-rc-pending');fd=os.open(t,os.O_WRONLY|os.O_CREAT|os.O_EXCL,metadata['mode'])
 try:
  with os.fdopen(fd,'wb')as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chown(t,metadata['uid'],metadata['gid']);os.chmod(t,metadata['mode']);os.replace(t,p)
 finally:
  if t.exists():t.unlink()
def save(x):write(STATE,(json.dumps(x,indent=2)+'\n').encode(),{'mode':0o600,'uid':0,'gid':0})
def inactive():
 for unit in ['maya-saas','barbershop-bot']:assert not active(unit),'Application must remain quiesced'
if phase=='quiesce':
 assert CURRENT.resolve()==BASE and REL.is_dir() and not STATE.exists()
 assert (REL/'dist/src/action-engine/action-engine.durable-policy.js').is_file()
 assert active('maya-saas')and active('barbershop-bot')
 state={'revision':REV,'baseline':str(BASE),'release':str(REL),'phase':'starting','originalParent':meta(ROOT),'originalEnv':meta(ENV),'originalEnvHash':sha(ENV),'stoppedUnits':['maya-saas','barbershop-bot']}
 backup=EVIDENCE/'before-runtime.env';assert not backup.exists();shutil.copyfile(ENV,backup);os.chmod(backup,0o600)
 state.update(originalPythonEnv=meta(PYENV),originalPythonEnvHash=sha(PYENV),configPlanHash=sha(PLAN));pbackup=EVIDENCE/'before-python.env';assert not pbackup.exists();shutil.copyfile(PYENV,pbackup);os.chmod(pbackup,0o600)
 save(state)
 for unit in ['barbershop-bot','maya-saas']:subprocess.run(['systemctl','stop',unit],check=True)
 inactive();state['phase']='quiesced';save(state)
elif phase=='configure':
 inactive();assert CURRENT.resolve()==BASE;state=json.loads(STATE.read_text());assert state['phase']=='quiesced'and sha(ENV)==state['originalEnvHash']
 service=pwd.getpwnam('maya-saas');group=grp.getgrnam('maya-saas');assert service.pw_gid==group.gr_gid and set(group.gr_mem)<= {'maya-saas'}
 assert not ROOT.is_symlink() and meta(ROOT)=={'mode':0o700,'uid':0,'gid':0};assert not PRIVATE.exists()
 os.chown(ROOT,0,group.gr_gid);os.chmod(ROOT,0o710);PRIVATE.mkdir(mode=0o700);os.chown(PRIVATE,service.pw_uid,group.gr_gid);os.chmod(PRIVATE,0o700)
 assert sha(PYENV)==state['originalPythonEnvHash']and sha(PLAN)==state['configPlanHash']
 plan=json.loads(PLAN.read_text());assert set(plan)=={'nest','python'}
 expected={'OPERATIONAL_ALERTS_CANONICAL_CUTOVER_AT','CANONICAL_INBOX_PROJECTION_CUTOVER_AT','OWNER_REPORTS_CANONICAL_CUTOVER_AT','OWNER_REPORTS_MORNING_CANONICAL_CUTOVER_AT','EXPENSE_REMINDERS_CANONICAL_ENABLED','PUBLIC_COMMUNITY_GATEWAYS','STAFF_AI_AVAILABLE_PROVIDERS','OWNER_REPORT_PDF_PYTHON','OWNER_REPORT_PDF_RENDERER'}
 assert set(plan['nest'])==expected and set(plan['python'])=={'PUBLIC_COMMUNITY_GATEWAY_ID'}
 stamp=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
 def configured(path,values):
  raw=path.read_text()
  for key,value in values.items():
   if value=='@CUTOVER@':value=stamp
   matches=list(re.finditer(r'(?m)^(?:export\s+)?'+key+r'=([^\n]*)$',raw));assert len(matches)<=1
   replacement=key+'='+shlex.quote(value)
   if matches:
    old=matches[0].group(1).strip().strip('"\'');assert old in ['', 'false','0'], 'Unexpected activation setting'
    raw=raw[:matches[0].start()]+replacement+raw[matches[0].end():]
   else:raw=raw.rstrip('\n')+'\n'+replacement+'\n'
  return raw.encode()
 nestData=configured(ENV,plan['nest']);pythonData=configured(PYENV,plan['python'])
 write(ENV,nestData,state['originalEnv']);write(PYENV,pythonData,state['originalPythonEnv'])
 state.update(phase='configured',canonicalCutoverAt=stamp,configuredEnvHash=sha(ENV),configuredPythonEnvHash=sha(PYENV),privateStorage=meta(PRIVATE),parentStorage=meta(ROOT));save(state)
 subprocess.run(['runuser','-u','maya-saas','--','test','-x',str(ROOT)],check=True)
 subprocess.run(['runuser','-u','maya-saas','--','test','-w',str(PRIVATE)],check=True)
elif phase=='activate':
 inactive();state=json.loads(STATE.read_text());assert state['phase']=='configured'and CURRENT.resolve()==BASE and sha(ENV)==state['configuredEnvHash']and sha(PYENV)==state['configuredPythonEnvHash']
 manifest=json.loads(Path('/tmp/maya-wave-rc-'+REV+'-python/manifest.json').read_text())
 for item in manifest['files']:assert sha(Path(item['destination']))==item['after'], 'Unverified runtime artifact'
 prev=Path('/opt/maya-saas/previous-release');write(prev,(str(BASE)+'\n').encode(),meta(prev)if prev.exists()else{'mode':0o644,'uid':0,'gid':0})
 temp=CURRENT.with_name('current.wave-rc-pending');assert not temp.exists()and not temp.is_symlink();temp.symlink_to(REL);os.replace(temp,CURRENT)
 subprocess.run(['systemctl','start','maya-saas'],check=True)
 ready=False
 for _ in range(15):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3107/api/health/ready',timeout=3)as r:ready=r.status==200
  except Exception:pass
  if ready:break
  time.sleep(2)
 assert ready,'Prepared backend failed readiness; do not start legacy initiators'
 subprocess.run(['systemctl','start','barbershop-bot'],check=True);assert active('barbershop-bot')
 state['phase']='activated';state['activatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save(state)
else:
 state=json.loads(STATE.read_text());assert state['phase']=='activated'and CURRENT.resolve()==REL and sha(ENV)==state['configuredEnvHash']and sha(PYENV)==state['configuredPythonEnvHash'];assert active('maya-saas')and active('barbershop-bot')
 assert meta(PRIVATE)==state['privateStorage']and meta(ROOT)==state['parentStorage']
 for endpoint in ['health','health/ready']:
  with urllib.request.urlopen('http://127.0.0.1:3107/api/'+endpoint,timeout=5)as r:assert r.status==200
print(json.dumps({'status':'PASS','phase':phase,'revision':REV,'productionBusinessCommands':0,'productionProofMessages':0}))
