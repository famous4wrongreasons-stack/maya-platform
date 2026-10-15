import pathlib,json,subprocess,hashlib,datetime,os,time
r=pathlib.Path('/srv/maya-phone-staging');pre=r/'preparation/ai-20261015';old=json.loads((pre/'PRE-STATE.json').read_text());m=json.loads((pre/'SOURCE-MANIFEST.json').read_text());c=r/'compose.phone-ai.json';cfg=json.loads(c.read_text());scope=json.loads((r/'private/phone-ai-scope.json').read_text())
def run(args,t=60):
 p=subprocess.run(args,capture_output=True,text=True,timeout=t)
 if p.returncode:raise RuntimeError('command_failed')
 return p.stdout
base=['docker','compose','--env-file',str(r/'private/compose.env'),'-f',str(c)]
result={'status':'REFUSED','phase':'preflight','migrationsApplied':0,'providerCalls':0}
try:
 assert not (pre/'START.json').exists() and not (r/'private/phone-ai-ledger/ledger.jsonl').exists()
 assert hashlib.sha256((r/'compose.catalog-public-with-setup.json').read_bytes()).hexdigest()==old['composeHash']
 for n,h in m['sources'].items():assert hashlib.sha256((pre/n).read_bytes()).hexdigest()==h
 assert hashlib.sha256((r/'private/phone-ai-scope.json').read_bytes()).hexdigest()==cfg['services']['backend']['environment']['MAYA_PHONE_AI_SCOPE_SHA256']
 assert json.loads(run(['docker','image','inspect',cfg['services']['backend']['image']]))[0]['Id']==old['containers']['backend']['image']
 for n,v in old['containers'].items():
  d=json.loads(run(['docker','inspect',v['id']]))[0];assert d['State']['Running'] and d['State']['StartedAt']==v['startedAt']
 assert run(['systemctl','show','smm_bot.service','--property=MainPID,ExecMainStartTimestampMonotonic,NRestarts,ActiveState'])==old['smmState']
 # Validate modules and their transitive imports on the exact deployed image,
 # without network, credentials, DB environment, volume writes or main bootstrap.
 args=['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--entrypoint','node']
 for n in m['sources']:args+=['-v',str(pre/n)+':/app/scripts/'+n+':ro']
 run(args+[cfg['services']['backend']['image'],'--input-type=module','-e',"await import('./scripts/phone-ai-egress.mjs'); await import('./scripts/phone-ai-runtime.mjs'); console.log('MODULES_OK')"])
 run(base+['config','--quiet']);result['phase']='start-model-egress'
 run(base+['up','-d','--no-deps','model-egress']);ident=run(base+['ps','-q','model-egress']).strip();assert ident
 check="fetch('http://127.0.0.1:8081/status').then(async r=>{const b=await r.json();if(!r.ok||b.stats.attempts!==0||b.revoked)process.exit(1);console.log(JSON.stringify(b))}).catch(()=>process.exit(1))"
 status=None
 for i in range(15):
  try:status=json.loads(run(['docker','exec',ident,'node','-e',check]));break
  except Exception:time.sleep(1)
 assert status is not None
 result['phase']='restart-backend-only';run(base+['up','-d','--no-deps','backend'])
 result.update(status='STARTED',phase='readiness-pending',expiresAt=scope['expiresAt'],modelStatus=status,overlayCommit=m['overlayCommit'])
except Exception as e:result['errorType']=type(e).__name__
fd=os.open(pre/'START.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w')as f:json.dump(result,f,indent=2)
print(json.dumps(result))
if result['status']!='STARTED':raise SystemExit(1)
