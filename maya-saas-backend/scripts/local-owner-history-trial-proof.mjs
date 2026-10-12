// H-2 compiled canonical HTTP/A22 proof on a fresh synthetic database only.
// No retained owner state, real credential or external provider transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { PRIVATE_KEYS, profileEnvironment, migrationConfigSource } from './local-onboarding-profile.mjs';
import { stage } from './local-onboarding.mjs';
import { createDiagnostic, readSessionPlan, readSourceBinding } from './local-yclients-read.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), output = process.argv[2];
assert.equal(process.platform, 'darwin');
assert.ok(process.argv.length === 3 && output && path.isAbsolute(output) && !fs.existsSync(output));
const source = readSourceBinding();
fs.mkdirSync(output, { mode: 0o700 });
const state = fs.mkdtempSync('/private/tmp/maya-history-proof-'); fs.chmodSync(state, 0o700);
async function port() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const n = s.address().port; await new Promise(r => s.close(r)); return n; }
const ports = new Set(); while (ports.size < 3) ports.add(await port());
const [pgPort, apiPort, webPort] = ports, origin = `http://127.0.0.1:${webPort}`;
const password = randomBytes(32).toString('hex'), database = 'maya_local_onboarding_' + randomBytes(8).toString('hex');
const keys = Object.fromEntries(PRIVATE_KEYS.map(k => [k, randomBytes(32).toString('hex')]));
const options = { databaseUrl: `postgresql://maya_local_onboarding:${password}@127.0.0.1:${pgPort}/${database}`, keys, apiPort, origin, stateDirectory: state };
const env = profileEnvironment(process.env, options), pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const plan = readSessionPlan({ stateDirectory: state, pgBin, database, pgPort, apiPort, webPort, minutes: 1 });
for (const [file, value] of Object.entries({ 'pg-password': password + '\n', pgpass: `127.0.0.1:${pgPort}:*:maya_local_onboarding:${password}\n`, 'prisma.config.mjs': migrationConfigSource(backend) })) fs.writeFileSync(path.join(state, file), value, { mode: 0o600, flag: 'wx' });
const report = { qualification: 'SYNTHETIC_H2_HTTP_PG_NOT_LIVE_ACCEPTANCE', head: source.head, status: 'preparing', checks: [], completed: [], state, realProviderCalls: 0, diagnostic: createDiagnostic(false) };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const control = { cancelled: null, terminate: null };
const cancel = () => { control.cancelled = 'SIGTERM'; control.terminate?.(); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
let started = false, prisma, app;
const originalFetch = globalThis.fetch;
try {
  save();
  for (const spec of plan.setup) {
    if (spec.name === 'pg-start') started = true;
    console.log(spec.name); await stage(spec, env, state, control); report.completed.push(spec.name); save();
  }
  const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: options.databaseUrl }) });
  for (const key of Object.keys(process.env)) if (/DATABASE|TELEGRAM|YCLIENTS|DEEPSEEK|OPENAI|SMS|SCHEDULER/.test(key)) delete process.env[key];
  Object.assign(process.env, env);
  globalThis.fetch=async()=>{report.realProviderCalls++;throw Error('External request forbidden in H-2 proof');};
  require('reflect-metadata');
  const load=file=>require(path.join(backend,'dist/src',file));
  const { NestFactory }=require('@nestjs/core');
  const { AppModule }=load('app.module.js');
  const { configureHttpApp }=load('bootstrap/configure-http-app.js');
  const { PrismaService }=load('prisma/prisma.service.js');
  const { TenantContextService }=load('tenancy/tenant-context.service.js');
  const { Package5Wave1ShadowService,Package5Wave1ExecutableService }=load('package5-wave1/package5-wave1.service.js');
  const { GovernedSettingsReadService }=load('package5-wave1/governed-settings.read.js');
  const { CanonicalActionIngressService }=load('action-engine/action-engine.ingress.js');
  const { EntitlementsService }=load('entitlements/entitlements.service.js');
  app=await NestFactory.create(AppModule,{bodyParser:false,logger:false,abortOnError:false});
  configureHttpApp(app);await app.listen(apiPort,'127.0.0.1');
  // One awaited listener per AppModule; requests never open/close the server.
  const request=require('supertest'),ctx=app.get(TenantContextService),settings=app.get(GovernedSettingsReadService);
  const planner=app.get(Package5Wave1ShadowService),executor=app.get(Package5Wave1ExecutableService),ingress=app.get(CanonicalActionIngressService);
  const tenantPath='/api/governed-settings/tenant',historyPath=tenantPath+'/client_capabilities';
  const http=(f,route,body,key=randomUUID())=>{
    const r=body===undefined?request(app.getHttpServer()).get(route):request(app.getHttpServer()).post(route).send(body);
    r.set('Origin',origin).timeout({response:20000,deadline:30000});if(f?.token)r.set('Authorization','Bearer '+f.token);if(body!==undefined)r.set('Idempotency-Key',key);return r;
  };
  const record=name=>{report.checks.push(name);save();};
  const asActor=(f,fn)=>ctx.runAsAuthPrincipal({tenantId:f.tenant.id,userId:f.user.id,role:f.member.role},fn);
  const command=(state,enabled=true)=>({confirmed:true,namespace:'client_capabilities',expectedRevision:state.revision,previousRevisionId:state.previousRevisionId,content:{client_self_visit_history:enabled}});
  const zero={revision:0,previousRevisionId:null};
  const fullTrial=()=>({status:'trial',trialFullAccess:true,trialEndsAt:new Date(Date.now()+3600000)});
  const fixture=async(role='tenant_owner',active=false)=>{
    const tenant=await prisma.tenant.create({data:{name:'Synthetic H2',slug:'synthetic-h2-'+randomUUID(),...fullTrial(),...(active?{status:'active'}:{}),currentPeriodEnd:new Date('2099-01-01')}});
    const loginPassword='Synthetic-only-H2-never-real-42!';
    const user=await prisma.user.create({data:{tenantId:tenant.id,email:randomUUID()+'@example.invalid',passwordHash:await require('bcrypt').hash(loginPassword,10),role,status:'active'}});
    const member=await prisma.membership.create({data:{tenantId:tenant.id,userId:user.id,role,status:'active',joinedAt:new Date()}});
    const login=await http(null,'/api/auth/login',{tenantSlug:tenant.slug,email:user.email,password:loginPassword});assert.equal(login.status,201,'synthetic login');
    return {tenant,user,member,token:login.body.access_token};
  };
  const counts=async f=>({
    revisions:await prisma.tenantBusinessConfigurationRevision.count({where:{tenantId:f.tenant.id}}),
    mutations:await prisma.actionTargetMutation.count({where:{tenantId:f.tenant.id}}),
    attempts:await prisma.actionAttempt.count({where:{tenantId:f.tenant.id}}),
  });
  const empty=async f=>assert.deepEqual(await counts(f),{revisions:0,mutations:0,attempts:0});
  const current=async f=>{const r=await http(f,historyPath);assert.equal(r.status,200);return r.body;};
  const f=await fixture();
  const before=await current(f),key=randomUUID(),input=command(before);
  const first=await http(f,tenantPath,input,key);assert.equal(first.status,201,'eligible full-trial write');
  assert.equal((await current(f)).content.client_self_visit_history,true);
  assert.equal(await asActor(f,()=>settings.ownHistoryEnabled(f.tenant.id)),true);
  const results=await Promise.all(Array.from({length:4},()=>http(f,tenantPath,input,key)));
  assert.ok(results.every(r=>r.status===201&&r.body.actionExecutionId===first.body.actionExecutionId));
  assert.deepEqual(await counts(f),{revisions:1,mutations:1,attempts:1});
  const revision=await prisma.tenantBusinessConfigurationRevision.findFirst({where:{tenantId:f.tenant.id}});
  assert.equal(revision.actorMembershipId,f.member.id);assert.equal(revision.actorUserId,f.user.id);assert.equal(revision.actionExecutionId,first.body.actionExecutionId);
  assert.ok(await prisma.auditLog.count({where:{tenantId:f.tenant.id,entityId:first.body.actionExecutionId,action:'action.rc_claim_policy'}}));
  record('full-trial-confirmed-http-A22-revision-audit-and-concurrent-idempotent-receipt');
  assert.equal((await http(f,tenantPath,input)).status,409);
  assert.equal((await http(f,tenantPath,{...input,content:{client_self_visit_history:false}},key)).status,409);
  for(const body of [{...command(await current(f)),confirmed:false},{...command(await current(f)),content:{client_self_visit_history:true,'widgets.runtime':true}},{...command(await current(f)),tenantId:'caller-selected'}])assert.equal((await http(f,tenantPath,body)).status,400);
  record('stale-CAS-changed-replay-unconfirmed-and-extra-authority-fields-refused');
  for(const namespace of ['business_rules','staff_ai_provider','c8_valuation','c9_orchestration'])assert.equal((await http(f,tenantPath+'/'+namespace)).status,403);
  assert.equal((await http(f,'/api/governed-settings/personal')).status,403);
  assert.equal((await http(f,tenantPath,{confirmed:true,namespace:'business_rules',...{expectedRevision:0,previousRevisionId:null},content:{rules:[]}})).status,403);
  assert.equal((await http(f,'/api/governed-settings/personal',{confirmed:true,durationMinutes:120,expectedGeneration:0})).status,403);
  record('other-trial-tenant-namespaces-and-personal-preferences-remain-refused');
  const staff=await fixture('staff');assert.equal((await http(staff,historyPath)).status,200);assert.equal((await http(staff,tenantPath,command(zero))).status,403);await empty(staff);
  record('existing-staff-read-role-preserved-non-owner-write-refused');
  const other=await fixture();
  // This route resolves the tenant from the authenticated session. An unrelated
  // caller header is ignored, not a tenant selector: it must return only f's data.
  const foreign=await http(f,historyPath).set('X-Tenant-Id',other.tenant.id);assert.equal(foreign.status,200);
  assert.equal(foreign.body.previousRevisionId,revision.id);assert.equal(foreign.body.revision,1);
  await assert.rejects(asActor(f,()=>settings.read(other.tenant.id,f.user.id,'client_capabilities')));
  assert.equal((await current(other)).revision,0);await empty(other);
  assert.equal((await http(null,historyPath)).status,401);
  record('caller-header-cannot-switch-tenant-foreign-context-and-unauthenticated-refused');
  for(const [name,change] of [
    ['expired',{trialEndsAt:new Date(Date.now()-1)}],['missing-expiry',{trialEndsAt:null}],['setup-only',{trialFullAccess:false}],['suspended',{status:'suspended'}],['cancelled',{status:'cancelled'}],
  ]){
    await prisma.tenant.update({where:{id:f.tenant.id},data:change});
    assert.ok([401,403].includes((await http(f,historyPath)).status),name);
    assert.ok([401,403].includes((await http(f,tenantPath,input,key)).status),name+' replay');
    await assert.rejects(asActor(f,()=>executor.resume(f.tenant.id,first.body.actionExecutionId)),undefined,name+' direct replay');
    await prisma.tenant.update({where:{id:f.tenant.id},data:fullTrial()});
  }
  record('expiry-missing-expiry-setup-suspension-cancellation-refuse-read-and-receipt');
  await prisma.membership.update({where:{id:f.member.id},data:{status:'suspended'}});
  assert.ok([401,403].includes((await http(f,tenantPath,input,key)).status));
  await assert.rejects(asActor(f,()=>executor.resume(f.tenant.id,first.body.actionExecutionId)));
  await prisma.membership.update({where:{id:f.member.id},data:{status:'active'}});
  await prisma.user.update({where:{id:f.user.id},data:{status:'suspended'}});
  await assert.rejects(asActor(f,()=>executor.resume(f.tenant.id,first.body.actionExecutionId)));
  await prisma.user.update({where:{id:f.user.id},data:{status:'active'}});
  record('revoked-membership-and-suspended-user-refuse-historical-receipt');
  // Actual admitted READY executions: change persisted authority before resume.
  for(const kind of ['allow','expired','setup-only','role-changed','membership-replaced','user-suspended']){
    report.phase='pending-'+kind;save();const pending=await fixture(),caller=randomUUID();
    const trusted=await asActor(pending,()=>planner.buildGoverned(pending.tenant.id,pending.user.id,'tenant_business_configuration',caller,caller,command(zero)));
    const admitted=await asActor(pending,()=>ingress.createExecution(trusted));assert.equal(admitted.state,'READY');
    if(kind==='expired')await prisma.tenant.update({where:{id:pending.tenant.id},data:{trialEndsAt:new Date(Date.now()-1)}});
    if(kind==='setup-only')await prisma.tenant.update({where:{id:pending.tenant.id},data:{trialFullAccess:false}});
    if(kind==='role-changed')await prisma.membership.update({where:{id:pending.member.id},data:{role:'staff'}});
    if(kind==='user-suspended')await prisma.user.update({where:{id:pending.user.id},data:{status:'suspended'}});
    if(kind==='membership-replaced'){
      await prisma.membership.delete({where:{id:pending.member.id}});
      await prisma.membership.create({data:{tenantId:pending.tenant.id,userId:pending.user.id,role:'tenant_owner',status:'active'}});
    }
    const resume=()=>asActor(pending,()=>executor.resume(pending.tenant.id,admitted.id));
    if(kind==='allow'){const r=await resume();assert.equal(r.actionExecutionId,admitted.id);assert.deepEqual(await counts(pending),{revisions:1,mutations:1,attempts:1});}
    else {await assert.rejects(resume);await empty(pending);assert.equal((await prisma.actionExecution.findUnique({where:{id:admitted.id}})).state,'READY');}
    record('admission-to-execution-authority-'+kind);
  }
  // Distinct first requests competing for the same predecessor cannot both write.
  const race=await fixture();const outcomes=await Promise.all([http(race,tenantPath,command(zero)),http(race,tenantPath,command(zero))]);
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[201,409]);assert.deepEqual(await counts(race),{revisions:1,mutations:1,attempts:1});
  record('concurrent-distinct-CAS-winner-exactly-one');
  const active=await fixture('tenant_owner',true);assert.equal((await http(active,tenantPath,command(zero))).status,201);
  assert.equal((await http(active,tenantPath+'/business_rules')).status,200);
  assert.equal((await http(active,'/api/governed-settings/personal')).status,200);
  const prefs={confirmed:true,durationMinutes:120,expectedGeneration:0},prefsKey=randomUUID();
  const prefResult=await http(active,'/api/governed-settings/personal',prefs,prefsKey);assert.equal(prefResult.status,201);
  assert.equal((await http(active,'/api/governed-settings/personal',prefs,prefsKey)).body.actionExecutionId,prefResult.body.actionExecutionId);
  record('active-tenant-history-and-personal-preference-replay-regression');
  const effective=await app.get(EntitlementsService).getEffectiveEntitlements(f.tenant.id);
  assert.notEqual(effective.features['widgets.runtime'],true);
  assert.equal(await prisma.tenantEntitlement.count({where:{featureKey:'widgets.runtime',enabled:true}}),0);
  assert.equal(await prisma.appointment.count(),0);assert.equal(await prisma.clientChannelLink.count(),0);
  assert.equal(report.realProviderCalls,0);
  record('no-widget-grant-booking-Client-link-or-external-dispatch');
  report.status='passed';
} catch(error) {
  report.status='failed';report.syntheticFailure={name:error?.name,message:String(error?.message).slice(0,500),stack:String(error?.stack).slice(0,1800)};process.exitCode=1;save();
} finally {
  if(app){await app.get(require(path.join(backend,'dist/src/prisma/prisma.service.js')).PrismaService).$disconnect().catch(()=>{});await app.close().catch(()=>{});}
  await prisma?.$disconnect();globalThis.fetch=originalFetch;
  if(started){try{await stage(plan.stop,env,state,{cancelled:null,terminate:null});report.clusterStopped=true;}catch{report.clusterStopped=false;report.status='failed-cleanup';process.exitCode=1;}}
  report.pidFileAbsent=!fs.existsSync(path.join(state,'pg/postmaster.pid'));
  report.sourceUnchanged=JSON.stringify(readSourceBinding())===JSON.stringify(source);
  if(!report.sourceUnchanged||!report.pidFileAbsent){report.status='failed';process.exitCode=1;}
  save();process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,clusterStopped:report.clusterStopped,sourceUnchanged:report.sourceUnchanged}));
