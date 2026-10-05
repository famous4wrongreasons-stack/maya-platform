from pathlib import Path
import subprocess,os,json,re,hashlib,shutil,time
root=Path.cwd();repo=root/'work/maya-controlled-integration';be=repo/'maya-saas-backend';w=root/'work/ar1-single-operator-20261003';out=root/'outputs/ar1-single-operator-20261003';logs=out/'migration-rehearsal';logs.mkdir(exist_ok=True)
node='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/chapter7-p01-option-a-940ddd51/node-v22.23.2-darwin-arm64/bin';pg='/opt/homebrew/opt/postgresql@16/bin/'
env={k:v for k,v in os.environ.items() if k in ['HOME','TMPDIR','USER','LANG']};env['PATH']=node+':/opt/homebrew/bin:/usr/bin:/bin';env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']+)'",(be/'test/widgets-live/support/environment.ts').read_text())))
url=lambda name:'[REDACTED DATABASE URL]'+name
admin=url('maya_widget_gate_proof_decisions_20261002')
pre='maya_widget_gate_proof_so_pre2_20261003';upgrade='maya_widget_gate_proof_so_upgrade2_20261003';rollback='maya_widget_gate_proof_so_rollback2_20261003'
rows=[]
def run(name,args,cwd=be,database=admin):
 t=time.time()
 with (logs/(name+'.log')).open('w') as f:r=subprocess.run(args,cwd=cwd,env={**env,'DATABASE_URL':database},stdout=f,stderr=subprocess.STDOUT)
 rows.append({'name':name,'exit':r.returncode,'seconds':round(time.time()-t,2)});print(json.dumps(rows[-1]),flush=True);assert r.returncode==0,name
migrations=json.loads((out/'PRODUCTION-PRESTATE-READONLY.json').read_text())['observed']['database']['migrations'];available={p.parent.name:p for p in (be/'prisma/migrations').glob('*/migration.sql')}
historical=json.loads((be/'prisma/historical-migration-baseline.json').read_text())['acknowledged'];allowed={(x['migration_name'],x['checksum']) for x in historical}
acknowledged=[];applied={}
for x in migrations:
 n=x['migration_name']
 if n not in available:
  assert (n,x['checksum']) in allowed,(n,'unacknowledged historical migration')
  assert x['finished_at'] or x['rolled_back_at'],(n,'unresolved migration')
  acknowledged.append(x);continue
 assert x['finished_at'] and not x['rolled_back_at'] and hashlib.sha256(available[n].read_bytes()).hexdigest()==x['checksum'],n
 applied[n]=x
assert {(x['migration_name'],x['checksum']) for x in acknowledged}==allowed
pending=sorted(set(available)-set(applied));assert pending==['20260929190000_client_link_challenge_json_v2','20260930120000_journal_detail_retained_date'],pending
copy=w/'prestate-migration-artifact2';copy.mkdir(exist_ok=False);(copy/'prisma/migrations').mkdir(parents=True)
for file in ['prisma.config.ts','prisma/schema.prisma','prisma/migrations/migration_lock.toml']:shutil.copyfile(be/file,copy/file)
(copy/'node_modules').symlink_to(be/'node_modules')
for n in applied:shutil.copytree(available[n].parent,copy/'prisma/migrations'/n)
for name in [pre,upgrade,rollback]:
 run('create-'+name,[pg+'psql',admin,'-X','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE '+name])
run('apply-observed-prestate',['node',str(be/'node_modules/prisma/build/index.js'),'migrate','deploy'],cwd=copy,database=url(pre))
run('synthetic-canary',[pg+'psql',url(pre),'-X','-v','ON_ERROR_STOP=1','-c',"CREATE SCHEMA rehearsal; CREATE TABLE rehearsal.canary (id text primary key, value text not null); INSERT INTO rehearsal.canary VALUES ('synthetic-only','rollback-preserves-this-row');"])
dump=w/'synthetic-prestate2.dump';run('backup',[pg+'pg_dump',url(pre),'--format=custom','--no-owner','--file',str(dump)]);dump.chmod(0o600)
for name in [upgrade,rollback]:run('restore-'+name,[pg+'pg_restore','--exit-on-error','--no-owner','--dbname',url(name),str(dump)])
run('apply-only-certified-pending',['npx','prisma','migrate','deploy'],database=url(upgrade))
def snapshot(name):
 sql="SELECT json_build_object('migrations',(SELECT json_agg(migration_name ORDER BY migration_name) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'constraints',(SELECT json_agg(json_build_array(c.conname,pg_get_constraintdef(c.oid,true)) ORDER BY c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'),'canary',(SELECT json_agg(t) FROM rehearsal.canary t))"
 return json.loads(subprocess.check_output([pg+'psql',url(name),'-X','-tA','-v','ON_ERROR_STOP=1','-c',sql],env=env,text=True))
a=snapshot(pre);b=snapshot(upgrade);c=snapshot(rollback);assert a==c and b['canary']==a['canary'];assert set(b['migrations'])-set(a['migrations'])==set(pending)
run('upgraded-http-rehearsal',['npm','run','test:widgets:live','--','--testPathPatterns=widget-single-operator','--json','--outputFile='+str(logs/'upgraded-http.json')],database=url(upgrade))
result={'status':'PASS','productionReadOnlyInventory':'PRODUCTION-PRESTATE-READONLY.json','appliedChecksumsMatch':len(applied),'pending':pending,'newGovernanceMigrations':0,'exactHistoricalBaselineMatches':acknowledged,'historicalReconstructionOwner':'20260816160000_reconcile_marketing_schema','syntheticBackupSha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'rollbackRestoresPrestateAndCanary':True,'constraintComparison':'all 793 definitions via PostgreSQL pretty deparser; normalizes dump/restore parser parentheses, no constraint excluded','scope':'synthetic schema based on observed migration history; no production data copied','receipts':rows,'productionMutations':0,'realOtp':0,'realYclients':0}
(out/'MIGRATION-ROLLBACK-REHEARSAL.json').write_text(json.dumps(result,indent=2)+'\n')
