import subprocess, pathlib, json, datetime, hashlib
root=pathlib.Path(__file__).resolve().parents[2];repo=root/'work/maya-controlled-integration';out=root/'outputs/ar1-single-operator-final-20261004'
js=r'''
const {Client}=require('pg');
(async()=>{const db=new Client({connectionString:process.env.DATABASE_URL,options:'-c default_transaction_read_only=on -c statement_timeout=10000',application_name:'ar1-production-release-readonly'});try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const ro=(await db.query('SHOW transaction_read_only')).rows[0];
const owners=(await db.query(`SELECT m."tenantId",m."userId",t.slug,t.status FROM "Membership" m JOIN "User" u ON u.id=m."userId" JOIN "Tenant" t ON t.id=m."tenantId" WHERE m.role='tenant_owner' AND m.status='active' AND u.status='active'`)).rows;
const operators=(await db.query(`SELECT u.id,u.role,u."tenantId",u.status,(length(trim(u.email))>0) AS email_configured,(length(u."passwordHash")=60 AND u."passwordHash" ~ '^[$]2[aby][$][0-9]{2}[$][./A-Za-z0-9]{53}$') AS bcrypt_credential_shape_valid,(SELECT count(*)::int FROM "AuthSession" a WHERE a."userId"=u.id AND a."tenantId" IS NULL AND a."revokedAt" IS NULL AND a."expiresAt">now()) AS active_global_sessions FROM "User" u WHERE u.role='platform_owner'`)).rows;
const migrations=(await db.query(`SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`)).rows;
const entitlements=owners.length===1?(await db.query(`SELECT id,"tenantId","featureKey",enabled,"expiresAt","updatedAt","configJson" IS NOT NULL AS has_config FROM "TenantEntitlement" WHERE "tenantId"=$1 AND "featureKey"='widgets.runtime'`,[owners[0].tenantId])).rows:[];
const tables=(await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('WidgetIntentToken','ClientLinkChallenge','ClientChannelLink','WidgetMessage','TenantEntitlement','AuditLog') ORDER BY table_name`)).rows;
console.log(JSON.stringify({readOnly:ro,owners,operators,migrations,entitlements,tables}));
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}})().catch(e=>{console.log(JSON.stringify({errorCode:e.code||'READ_FAILED',errorName:e.name}));process.exitCode=1;});
'''
remote='''import os,subprocess,pathlib,json,hashlib,urllib.request
def run(args):return subprocess.check_output(args,text=True).strip()
current=os.path.realpath('/opt/maya-saas/current')
pid=run(['systemctl','show','maya-saas','-p','MainPID','--value'])
raw=pathlib.Path('/proc/'+pid+'/environ').read_bytes()
env=dict(x.decode().split('=',1) for x in raw.split(bytes([0])) if b'=' in x)
def trustinfo(value):
 try:
  j=json.loads(value or '{}');return [{'keyId':k,'principalId':v.get('principalId'),'purpose':v.get('purpose'),'publicKeyPresent':bool(v.get('publicKey'))} for k,v in j.items()]
 except:return {'validJson':False}
health={}
for route in ['health','health/ready']:
 try:
  with urllib.request.urlopen('http://127.0.0.1:3107/api/'+route,timeout=10) as r:health[route]={'status':r.status,'body':json.load(r)}
 except Exception as e:health[route]={'error':type(e).__name__}
report={'currentRelease':current,'mainPid':pid,'unit':run(['systemctl','show','maya-saas','-p','ActiveState','-p','SubState','-p','WorkingDirectory','-p','EnvironmentFiles']),'health':health,'nodeVersion':run(['/opt/node-v24/bin/node','--version']),'releaseSettings':{k:env.get(k) for k in ['NODE_ENV','WIDGET_RELEASE_ENVIRONMENT','WIDGET_RELEASE_CANDIDATE_SHA']},'productionTrust':trustinfo(env.get('WIDGET_RELEASE_PRODUCTION_TRUST_JSON')),'productionTenantAllowlistConfigured':bool(env.get('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON')),'releaseEnvFileSha256':hashlib.sha256(pathlib.Path('/etc/maya-saas/live-widgets.env').read_bytes()).hexdigest()}
p=subprocess.run(['/opt/node-v24/bin/node','-e',__READONLY_JS__],cwd=current,env=env,text=True,capture_output=True)
report['databaseInventoryExit']=p.returncode
try:report['database']=json.loads(p.stdout)
except:report['database']={'parseFailed':True}
print(json.dumps(report))
'''.replace('__READONLY_JS__',repr(js))
args=[str(repo/'maya-saas-backend/deploy/vps/ssh-jump.sh'),'[REDACTED EMAIL]','sudo -n python3 -']
p=subprocess.run(args,input=remote,text=True,capture_output=True,timeout=120)
r={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'exit':p.returncode,'stderr':p.stderr.strip(),'productionMutations':0}
try:r['observed']=json.loads(p.stdout)
except:r['parseFailed']=True
(out/'PLATFORM-ACCOUNT-READONLY.json').write_text(json.dumps(r,indent=2)+'\n')
compact=json.loads(json.dumps(r))
db=compact.get('observed',{}).get('database',{})
if 'migrations' in db:db['migrationsCount']=len(db.pop('migrations'))
print(json.dumps({'readOnly':True,'exit':r['exit'],'operators':db.get('operators'),'productionMutations':0},indent=2))
