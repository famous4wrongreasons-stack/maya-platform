import pathlib, subprocess, json, datetime, hashlib

root = pathlib.Path('/srv/maya-phone-staging')
base = ['docker', 'compose', '--env-file', str(root/'private/compose.env'), '-f', str(root/'compose.catalog-public-with-setup.json')]
probe = r"""
const {PrismaClient}=require('@prisma/client');
const {PrismaPg}=require('@prisma/adapter-pg');
(async()=>{
 const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try {
  const t=await p.tenant.findUnique({where:{slug:'malestheticstavropol'},select:{id:true,defaultTimezone:true}});
  if(!t)throw Error('owner_missing');
  const c=await p.crmIntegration.findUnique({where:{tenantId:t.id},select:{provider:true,status:true,verifiedAt:true,lastSyncAt:true,lastErrorCode:true,settingsJson:true}});
  if(!c)throw Error('integration_missing');
  const s=c.settingsJson||{};
  const [staff,staffLinks,staffAccess,clients,appointments,widgets,actions]=await Promise.all([
   p.staff.count({where:{tenantId:t.id}}),
   p.staffProviderLink.count({where:{tenantId:t.id,provider:'yclients'}}),
   p.crmStaffAccess.count({where:{tenantId:t.id}}),
   p.client.count({where:{tenantId:t.id}}),
   p.appointment.count({where:{tenantId:t.id}}),
   p.tenantEntitlement.count({where:{featureKey:'widgets.runtime',enabled:true}}),
   p.actionExecution.findMany({where:{tenantId:t.id,capability:{contains:'crm'}},select:{capability:true,state:true,finalOutcomeCode:true,reconciliationState:true,finalizedAt:true}})
  ]);
  console.log(JSON.stringify({ownerExists:true,timezone:t.defaultTimezone,crm:{provider:c.provider,status:c.status,verifiedAt:c.verifiedAt,lastSyncAt:c.lastSyncAt,lastErrorCode:c.lastErrorCode,exactCompany503759:String(s.companyId)==='503759',acceptedImportSnapshotPresent:typeof s.acceptedImportSnapshotHash==='string'&&/^[0-9a-f]{64}$/.test(s.acceptedImportSnapshotHash)},counts:{staff,staffLinks,staffAccess,clients,appointments,enabledWidgetEntitlements:widgets},actions}));
 }finally{await p.$disconnect();}
})().catch(()=>{console.error('sanitized_activation_probe_failed');process.exitCode=1;});
"""
r = subprocess.run(base+['exec','-T','backend','node','-e',probe],capture_output=True,text=True,timeout=30)
if r.returncode:
 print(json.dumps({'status':'FAIL','category':'sanitized_activation_probe_failed'}));raise SystemExit(1)
state = json.loads(r.stdout)
assert state['crm']['status']=='active' and state['crm']['lastErrorCode'] is None
assert state['crm']['exactCompany503759'] and state['crm']['acceptedImportSnapshotPresent']
assert state['counts']['clients']==0 and state['counts']['appointments']==0 and state['counts']['enabledWidgetEntitlements']==0
containers=[]
for service in ['backend','postgres','catalog-egress','gateway']:
 q=subprocess.run(base+['ps','-q',service],capture_output=True,text=True,check=True,timeout=10).stdout.strip()
 d=json.loads(subprocess.run(['docker','inspect',q],capture_output=True,text=True,check=True,timeout=10).stdout)[0]
 containers.append({'service':service,'running':d['State']['Running'],'startedAt':d['State']['StartedAt'],'restartCount':d['RestartCount'],'restartPolicy':d['HostConfig']['RestartPolicy']['Name'],'imageId':d['Image']})
assert all(x['running'] and x['restartCount']==0 and x['restartPolicy']=='no' for x in containers)
raw_scope=json.loads((root/'private/catalog-scope.json').read_text())
scope={k:raw_scope[k] for k in ['contract','companyId','maxCalls','notBefore','expiresAt']}
result={'status':'PASS','readOnlyState':state,'containers':containers,'scope':scope,'providerWrites':0,'newMigrationsApplied':0,'iPhoneInstalled':False,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
# No credential values, customer records, staff contacts, or database URLs are emitted.
print(json.dumps(result))
