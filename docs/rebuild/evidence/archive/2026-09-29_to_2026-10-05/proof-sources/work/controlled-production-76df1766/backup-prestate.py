from pathlib import Path
import subprocess,json,datetime
root=Path(__file__).resolve().parents[2];repo=root/'work/maya-controlled-integration';out=root/'outputs/controlled-production-76df1766'
remote=r'''
import pathlib,subprocess,os,json,datetime,hashlib,shutil,urllib.parse
os.umask(0o077)
base=pathlib.Path('/opt/maya-saas');current=(base/'current').resolve();expected=base/'releases/20260929-recon-fix-eb43bc22'
assert current==expected, 'prestate changed'
assert shutil.disk_usage(base).free>2*1024**3, 'insufficient backup space'
dest=base/'backups/controlled-76df1766-20261003'
assert not dest.exists(), 'backup already exists; inspect rather than overwrite'
dest.mkdir(parents=True,mode=0o700)
pid=subprocess.check_output(['systemctl','show','maya-saas','-p','MainPID','--value'],text=True).strip()
env=dict(x.decode().split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_bytes().split(bytes([0])) if b'=' in x)
u=urllib.parse.urlparse(env['DATABASE_URL']);pg=dict(os.environ)
pg.update(PGHOST=u.hostname or '',PGPORT=str(u.port or 5432),PGUSER=urllib.parse.unquote(u.username or ''),PGPASSWORD=urllib.parse.unquote(u.password or ''),PGDATABASE=urllib.parse.unquote(u.path.lstrip('/')),PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=0',PGAPPNAME='ar1-pre-release-backup')
pgbin=pathlib.Path('/usr/lib/postgresql/16/bin');dump=str(pgbin/'pg_dump') if (pgbin/'pg_dump').exists() else shutil.which('pg_dump');restore=str(pgbin/'pg_restore') if (pgbin/'pg_restore').exists() else shutil.which('pg_restore')
def run(args,**kw):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
 if p.returncode: raise RuntimeError('backup command failed: '+pathlib.Path(args[0]).name+' exit '+str(p.returncode))
 return p.stdout
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':'76df1766a74212f2c8a06ab879386fc8e4468d73','currentRelease':str(current),'directory':str(dest),'mode':'0700','databaseMutations':0,'runtimeChanges':0}
try:
 run([dump,'--format=custom','--lock-wait-timeout=10s','--file',str(dest/'production.pgdump')],env=pg)
 toc=run([restore,'--list',str(dest/'production.pgdump')]);report['dumpArchiveReadable']=True;report['dumpTocEntries']=len([x for x in toc.splitlines() if x and not x.startswith(b';')]);(dest/'production.toc').write_bytes(toc)
 run(['tar','-czf',str(dest/'backend-release.tar.gz'),'-C',str(current.parent),current.name])
 run(['tar','-tzf',str(dest/'backend-release.tar.gz')]);report['releaseArchiveReadable']=True
 shutil.copyfile('/etc/maya-saas/live-widgets.env',dest/'live-widgets.env')
 (dest/'maya-saas.service.txt').write_bytes(run(['systemctl','cat','maya-saas']))
 (dest/'previous-current.txt').write_text(str(current)+'\n')
 files=[]
 for p in sorted(dest.iterdir()):
  if p.is_file():
   p.chmod(0o600);h=hashlib.sha256()
   with p.open('rb') as f:
    for b in iter(lambda:f.read(1048576),b''):h.update(b)
   files.append({'name':p.name,'bytes':p.stat().st_size,'sha256':h.hexdigest(),'mode':'0600'})
 assert (base/'current').resolve()==current,'live symlink changed externally'
 report.update(status='PASS',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=files,restoreExecuted=False,privateContentsReturned=False)
except Exception as e:report.update(status='FAIL',error=str(e))
(dest/'BACKUP-MANIFEST.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
'''
p=subprocess.run([str(repo/'maya-saas-backend/deploy/vps/ssh-jump.sh'),'[REDACTED EMAIL]','sudo -n python3 -'],input=remote,text=True,capture_output=True,timeout=600)
if p.returncode:report={'status':'FAIL','exit':p.returncode,'privateOutputWithheld':True}
else:report=json.loads(p.stdout)
(out/'BACKUP-RECEIPT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
