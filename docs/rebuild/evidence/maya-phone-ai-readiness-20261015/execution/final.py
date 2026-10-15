import pathlib,json,subprocess,hashlib,datetime
r=pathlib.Path('/srv/maya-phone-staging');pre=r/'preparation/ai-alias-20261015';old=json.loads((r/'preparation/ai-20261015/PRE-STATE.json').read_text());cfg=json.loads((r/'compose.phone-ai-alias.json').read_text());scope=json.loads((r/'private/phone-ai-scope.json').read_text());m=json.loads((pre/'SOURCE-MANIFEST.json').read_text());base=['docker','compose','--env-file',str(r/'private/compose.env'),'-f',str(r/'compose.phone-ai-alias.json')]
def run(args,t=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=t)
 if p.returncode:raise RuntimeError('command_failed')
 return p.stdout
result={'status':'CHECKING','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'migrationsApplied':0}
try:
 services={}
 for n in ['backend','postgres','catalog-egress','gateway','model-egress']:
  ident=run(base+['ps','-q',n]).strip();d=json.loads(run(['docker','inspect',ident]))[0];assert d['State']['Running']
  services[n]={'running':d['State']['Running'],'restarts':d['RestartCount'],'health':d['State'].get('Health',{}).get('Status'),'image':d['Image']}
  if n in ['postgres','catalog-egress','gateway']:assert ident==old['containers'][n]['id'] and d['State']['StartedAt']==old['containers'][n]['startedAt'];services[n]['unchangedProcess']=True
  if n=='backend':
   assert d['Image']==old['containers']['backend']['image']
   for net in d['NetworkSettings']['Networks']:assert json.loads(run(['docker','network','inspect',net]))[0]['Internal']
   services[n]['internalNetworksOnly']=True
   assert all(x['Destination']!='/run/maya/deepseek.key' for x in d['Mounts']);services[n]['realModelKeyMounted']=False
  if n=='model-egress':assert not d['HostConfig'].get('PortBindings');services[n]['publishedPorts']=0
 assert services['backend']['health']=='healthy'
 for n,h in m['sources'].items():assert hashlib.sha256((pre/n).read_bytes()).hexdigest()==h
 result['services']=services
 code="""
 const headers={'content-type':'application/json','x-maya-scope':process.env.MAYA_PHONE_AI_SCOPE_SHA256,'x-maya-tenant':'foreign','x-maya-user':'foreign'};
 (async()=>{const status=async()=>{const r=await fetch('http://model-egress:8081/status');return r.json()};const before=await status();
 const refusals=[];for(const path of ['/chat/completions','/clients','/v1/chat/completions']){const r=await fetch('http://model-egress:8081'+path,{method:'POST',headers,body:'{}'});refusals.push(r.status);if(r.status!==403)throw Error('refusal');}
 const after=await status();if(after.stats.attempts!==before.stats.attempts)throw Error('unexpected_paid_attempt');
 const ready=await fetch('http://127.0.0.1:3000/api/health/ready');const unauth=await fetch('http://127.0.0.1:3000/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({surface:'native',messages:[{role:'user',content:'Привет'}]})});
 console.log(JSON.stringify({ready:ready.status,unauthenticatedChat:unauth.status,egressRefusals:refusals,negativeProbesPaidCalls:after.stats.attempts-before.stats.attempts,model:after}));})().catch(()=>process.exitCode=1)
 """
 result['checks']=json.loads(run(base+['exec','-T','backend','node','-e',code]));assert result['checks']['ready']==200 and result['checks']['unauthenticatedChat']==401
 assert run(['systemctl','show','smm_bot.service','--property=MainPID,ExecMainStartTimestampMonotonic,NRestarts,ActiveState'])==old['smmState'];result['unrelatedServiceUnchanged']=True
 query="""
 const fs=require('node:fs');const scope=JSON.parse(fs.readFileSync('/run/maya/phone-ai-scope.json'));const {PrismaClient}=require('@prisma/client');const {PrismaPg}=require('@prisma/adapter-pg');
 (async()=>{const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});try{
 const where={tenantId:scope.tenantId};const counts={clients:await p.client.count({where}),appointments:await p.appointment.count({where}),widgetGrants:await p.tenantEntitlement.count({where:{...where,featureKey:'widgets.runtime',enabled:true}}),actionExecutions:await p.actionExecution.count({where})};
 const tools=await p.aiToolExecution.findMany({where,select:{toolName:true,status:true,errorCode:true},orderBy:{createdAt:'desc'},take:10});
 console.log(JSON.stringify({counts,tools}));}finally{await p.$disconnect()}})().catch(()=>process.exitCode=1)
 """
 result['businessState']=json.loads(run(base+['exec','-T','backend','node','-e',query]));assert result['businessState']['counts']['clients']==0 and result['businessState']['counts']['appointments']==0 and result['businessState']['counts']['widgetGrants']==0
 rollback=json.loads((r/'compose.catalog-public-with-setup.json').read_text());rollback['services']['backend']['command']=['node','--enable-source-maps','dist/src/main.js']
 rp=r/'compose.phone-ai-rollback.json'
 if not rp.exists():rp.write_text(json.dumps(rollback,indent=2)+'\n');rp.chmod(0o600)
 else:assert json.loads(rp.read_text())==rollback
 run(['docker','compose','--env-file',str(r/'private/compose.env'),'-f',str(rp),'config','--quiet']);result['rollbackPreparedWithoutMigration']=True
 result.update(status='PASS',overlayCommit=m['overlayCommit'],appCandidate=scope['candidate'],expiresAt=scope['expiresAt'],catalogueExpiresAt=old['catalogScope']['expiresAt'])
except Exception as e:result.update(status='FAIL',errorType=type(e).__name__)
print(json.dumps(result))
if result['status']!='PASS':raise SystemExit(1)
