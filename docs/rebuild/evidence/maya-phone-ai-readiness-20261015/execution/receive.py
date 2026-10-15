import pathlib,json,sys,os,hashlib,subprocess,datetime,re
os.umask(0o077)
root=pathlib.Path('/srv/maya-phone-staging');dest=root/'preparation/ai-20261015';result={'status':'REFUSED','phase':'preflight','providerCalls':0}
def run(args,t=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=t)
 if p.returncode:raise RuntimeError('command_failed')
 return p.stdout
def write_new(p,b):
 fd=os.open(str(p),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(b);f.flush();os.fsync(f.fileno())
try:
 x=json.load(sys.stdin);assert set(x)=={'preflight','scope','pin','compose','sources','overlayCommit','credential'}
 old=x['preflight'];scope=x['scope'];key=x.pop('credential');assert re.fullmatch('[A-Za-z0-9_-]{16,512}',key)
 assert os.getuid()==0 and root.resolve()==root and (root/'private').stat().st_mode&0o077==0
 assert re.fullmatch('[a-f0-9]{40}',x['overlayCommit'])
 prior=root/'compose.catalog-public-with-setup.json'
 assert hashlib.sha256(prior.read_bytes()).hexdigest()==old['composeHash']
 assert json.loads(prior.read_text())==old['compose']
 assert hashlib.sha256((root/'private/owner-scope.json').read_bytes()).hexdigest()==old['ownerScopeHash']
 assert json.loads((root/'private/catalog-scope.json').read_text())==old['catalogScope']
 for name,c in old['containers'].items():
  d=json.loads(run(['docker','inspect',c['id']]))[0]
  assert d['State']['Running'] and d['State']['StartedAt']==c['startedAt'] and d['RestartCount']==c['restarts'] and d['Image']==c['image']
 assert run(['systemctl','show','smm_bot.service','--property=MainPID,ExecMainStartTimestampMonotonic,NRestarts,ActiveState'])==old['smmState']
 assert scope['contract']=='maya.phone-owner-ai/1' and scope['approvalRef']=='owner-20261015-phone-deepseek-24h-usd2'
 for k,v in old['state']['owner'].items():assert scope[k]==v
 assert scope['candidate']=='7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3' and scope['maxCalls']==100 and scope['maxSpendNanoUsd']==2000000000
 now=datetime.datetime.now(datetime.timezone.utc);start=datetime.datetime.fromisoformat(scope['notBefore'].replace('Z','+00:00'));end=datetime.datetime.fromisoformat(scope['expiresAt'].replace('Z','+00:00'))
 assert start<=now<end and 0<(end-start).total_seconds()<=86400 and (now-start).total_seconds()<240
 scopeBytes=json.dumps(scope,separators=(',',':'),ensure_ascii=False).encode()
 assert hashlib.sha256(scopeBytes).hexdigest()==x['pin']
 c=x['compose'];p=old['compose']
 for n in ['postgres','gateway','catalog-egress']:assert c['services'][n]==p['services'][n]
 b=c['services']['backend'];m=c['services']['model-egress'];assert b['image']==p['services']['backend']['image'] and b['env_file']==p['services']['backend']['env_file']
 assert b['environment']==dict(p['services']['backend']['environment'],MAYA_PHONE_AI_SCOPE_SHA256=x['pin'])
 assert b['networks']==['private','catalog_private','model_private'] and m['networks']==['model_private','edge'] and c['networks']['model_private']['internal']
 assert not m.get('ports') and not m.get('env_file') and m['restart']=='no' and b['command']==[] and m['command']==[]
 assert all('deepseek.key' not in v for v in b['volumes'])
 assert m['environment']=={'MAYA_PHONE_AI_SCOPE_SHA256':x['pin']}
 allowed={'phone-ai-entry.mjs','phone-ai-runtime.mjs','phone-ai-scope.mjs','phone-ai-egress.mjs','conversation-qualification/current-candidate-budget.mjs','conversation-qualification/core-local-ab-checks.mjs'}
 assert set(x['sources'])==allowed
 for name,item in x['sources'].items():assert hashlib.sha256(item['text'].encode()).hexdigest()==item['sha256']
 assert not dest.exists() and not (root/'private/deepseek.key').exists() and not (root/'private/phone-ai-scope.json').exists() and not (root/'private/phone-ai-ledger').exists() and not (root/'compose.phone-ai.json').exists()
 result['phase']='write-private-overlay';dest.mkdir(mode=0o700);(dest/'conversation-qualification').mkdir(mode=0o700)
 for name,item in x['sources'].items():write_new(dest/name,item['text'].encode())
 write_new(dest/'PRE-STATE.json',json.dumps(old,indent=2).encode());write_new(dest/'SOURCE-MANIFEST.json',json.dumps({'overlayCommit':x['overlayCommit'],'sources':{n:i['sha256'] for n,i in x['sources'].items()}},indent=2).encode())
 write_new(root/'private/phone-ai-scope.json',scopeBytes);write_new(root/'private/deepseek.key',key.encode());key=None
 (root/'private/phone-ai-ledger').mkdir(mode=0o700)
 write_new(root/'compose.phone-ai.json',json.dumps(c,indent=2).encode())
 result.update(status='STORED',phase='complete',expiresAt=scope['expiresAt'],scopePin=x['pin'],credentialMode='0600',started=False)
except Exception as e:result['errorType']=type(e).__name__
print(json.dumps(result))
if result['status']!='STORED':sys.exit(1)
