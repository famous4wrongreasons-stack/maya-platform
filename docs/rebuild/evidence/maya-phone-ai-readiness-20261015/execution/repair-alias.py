import json,pathlib,subprocess,hashlib,os,datetime
os.umask(0o077);root=pathlib.Path('/srv/maya-phone-staging');oldDir=root/'preparation/ai-repair-20261015';dest=root/'preparation/ai-alias-20261015';old=json.loads((root/'preparation/ai-20261015/PRE-STATE.json').read_text());scopeBytes=(root/'private/phone-ai-scope.json').read_bytes();scope=json.loads(scopeBytes);pin=hashlib.sha256(scopeBytes).hexdigest();compose=json.loads((root/'compose.phone-ai-repair.json').read_text());base=['docker','compose','--env-file',str(root/'private/compose.env'),'-f',str(root/'compose.phone-ai-repair.json')]
def run(args,t=45):
 p=subprocess.run(args,capture_output=True,text=True,timeout=t)
 if p.returncode:raise RuntimeError('command_failed')
 return p.stdout
def put(p,b):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb')as f:f.write(b);f.flush();os.fsync(f.fileno())
out={'status':'REFUSED','phase':'preflight'}
try:
 import sys
 packet=json.load(sys.stdin);sources=packet['sources'];assert packet['commit'].startswith('1671d467');assert not dest.exists() and not (root/'private/phone-ai-ledger/continuation-2.jsonl').exists()
 assert scope['approvalRef']=='owner-20261015-phone-deepseek-24h-usd2' and scope['maxSpendNanoUsd']==2000000000 and scope['maxCalls']==100
 assert datetime.datetime.now(datetime.timezone.utc)<datetime.datetime.fromisoformat(scope['expiresAt'].replace('Z','+00:00'))
 for name in ['postgres','catalog-egress','gateway']:
  d=json.loads(run(['docker','inspect',old['containers'][name]['id']]))[0];assert d['State']['Running'] and d['State']['StartedAt']==old['containers'][name]['startedAt']
 assert run(['systemctl','show','smm_bot.service','--property=MainPID,ExecMainStartTimestampMonotonic,NRestarts,ActiveState'])==old['smmState']
 expected={'phone-ai-entry.mjs','phone-ai-runtime.mjs','phone-ai-scope.mjs','phone-ai-egress.mjs','phone-ai-continuation.mjs','conversation-qualification/current-candidate-budget.mjs','conversation-qualification/core-local-ab-checks.mjs'};assert set(sources)==expected
 for name,v in sources.items():assert hashlib.sha256(v['text'].encode()).hexdigest()==v['sha256']
 dest.mkdir(mode=0o700);(dest/'conversation-qualification').mkdir(mode=0o700)
 for name,v in sources.items():put(dest/name,v['text'].encode())
 put(dest/'SOURCE-MANIFEST.json',json.dumps({'overlayCommit':packet['commit'],'sources':{n:v['sha256'] for n,v in sources.items()}},indent=2).encode())
 args=['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--entrypoint','node']
 for n in sources:args+=['-v',str(dest/n)+':/app/scripts/'+n+':ro']
 run(args+[compose['services']['backend']['image'],'--input-type=module','-e',"await import('./scripts/phone-ai-egress.mjs');await import('./scripts/phone-ai-runtime.mjs')"])
 status=json.loads(run(base+['exec','-T','backend','node','-e',"fetch('http://model-egress:8081/status').then(r=>r.json()).then(b=>console.log(JSON.stringify(b)))"]))
 assert not status['stats']['halted'] and status['stats']['attempts']==4 and status['stats']['reservedNanoUsd']==391926480
 put(dest/'PRE-REPAIR-STATUS.json',json.dumps(status,indent=2).encode())
 out['phase']='stop-old-relay';ident=run(base+['ps','-q','model-egress']).strip();run(base+['stop','model-egress']);assert not json.loads(run(['docker','inspect',ident]))[0]['State']['Running']
 ledger=root/'private/phone-ai-ledger/continuation-1.jsonl';checkpoint={'contract':'maya.phone-ai-operator-continuation/2','originalLedgerSha256':hashlib.sha256((root/'private/phone-ai-ledger/ledger.jsonl').read_bytes()).hexdigest(),'ledgerSha256':hashlib.sha256(ledger.read_bytes()).hexdigest(),'scopePin':pin,'candidate':scope['candidate'],'expiresAt':scope['expiresAt']};cb=json.dumps(checkpoint,separators=(',',':')).encode();cpin=hashlib.sha256(cb).hexdigest();put(root/'private/phone-ai-continuation2.json',cb)
 for name in ['backend','model-egress']:
  s=compose['services'][name];s['volumes']=[v.replace(str(oldDir)+'/',str(dest)+'/') for v in s['volumes']]
 compose['services']['model-egress']['volumes']=[v.replace(str(root/'private/phone-ai-continuation.json')+':',str(root/'private/phone-ai-continuation2.json')+':') for v in compose['services']['model-egress']['volumes']]
 compose['services']['model-egress']['environment']['MAYA_PHONE_AI_CONTINUATION_SHA256']=cpin
 repair=root/'compose.phone-ai-alias.json';put(repair,json.dumps(compose,indent=2).encode());new=['docker','compose','--env-file',str(root/'private/compose.env'),'-f',str(repair)];run(new+['config','--quiet'])
 out['phase']='start-conserved-continuation';run(new+['up','-d','--no-deps','model-egress']);run(new+['up','-d','--no-deps','backend'])
 out.update(status='STARTED',phase='readiness-pending',priorAttemptsCharged=4,priorReservedNanoUsd=391926480,expiresAt=scope['expiresAt'],scopeUnchanged=True,budgetReset=False,privateKeyRereadOnMac=False)
except Exception as e:out['errorType']=type(e).__name__
if dest.exists():put(dest/'REPAIR.json',json.dumps(out,indent=2).encode())
print(json.dumps(out))
if out['status']!='STARTED':raise SystemExit(1)
