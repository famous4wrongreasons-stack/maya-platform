// The actual retained-mode child/IPC/web relay over a fresh synthetic database.
// OS sandbox permits only this private PG and HTTP listener, no provider network.
// Never consumes an owner permit, retained DB, real provider key or real login.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PRIVATE_KEYS, profileEnvironment, migrationConfigSource } from './local-onboarding-profile.mjs';
import { realReadEnvironment } from './local-yclients-read-profile.mjs';
import { stage } from './local-onboarding.mjs';
import { createDiagnostic, readSessionPlan, readSourceBinding, runReadRuntime } from './local-yclients-read.mjs';
import { diagnosticSandboxPolicy } from './local-yclients-read-diagnostic.mjs';
import { readOwnerHistoryLaunch } from './local-owner-history-launch.mjs';
import { installOwnerHistory } from './local-owner-history-runtime.mjs';
import { OWNER_HISTORY_PROFILE, OWNER_HISTORY_ADMISSION, ownerHistoryIngress } from './local-owner-history-policy.mjs';
import { resumePlan } from './local-yclients-read-resume.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url), output = process.argv[2];
assert.equal(process.platform, 'darwin');
assert.ok(process.argv.length === 3 && output && path.isAbsolute(output) && !fs.existsSync(output));
const source = readSourceBinding(), hash = b => createHash('sha256').update(b).digest('hex');
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
const report = { qualification: 'SYNTHETIC_HISTORY_HTTP_PG_BINARY_NOT_LIVE_ACCEPTANCE', head: source.head, status: 'preparing', checks: [], completed: [], state, realProviderCalls: 0, diagnostic: createDiagnostic(false) };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const control = { cancelled: null, terminate: null };
const cancel = () => { control.cancelled = 'SIGTERM'; control.terminate?.(); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
let started = false, prisma, running, app, runtime;
const originalFetch = globalThis.fetch;
try {
  save();
  for (const spec of plan.setup) {
    if (spec.name === 'pg-start') started = true;
    console.log(spec.name); await stage(spec, env, state, control); report.completed.push(spec.name); save();
  }
  const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: options.databaseUrl }) });
  const tenant = await prisma.tenant.create({ data: { name: 'Synthetic binary proof', slug: 'synthetic-binary-' + randomBytes(4).toString('hex'), status: 'active', trialFullAccess: false, currentPeriodEnd: new Date('2099-01-01'), calendarSource: 'external' } });
  const ownerPassword = 'Synthetic-only-never-real-42!', email = 'synthetic@example.invalid';
  const owner = await prisma.user.create({ data: { tenantId: tenant.id, email, passwordHash: await require('bcrypt').hash(ownerPassword, 10), role: 'tenant_owner', status: 'active' } });
  await prisma.membership.create({ data: { tenantId: tenant.id, userId: owner.id, role: 'tenant_owner', status: 'active', joinedAt: new Date() } });
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Synthetic', timezone: 'Europe/Moscow' } });
  const { EncryptionService } = require(path.join(backend, 'dist/src/encryption/encryption.service.js'));
  const encryption = new EncryptionService({ get: key => keys[key] });
  await prisma.crmIntegration.create({ data: { tenantId: tenant.id, provider: 'yclients', status: 'active', verifiedAt: new Date(), encryptedApiToken: encryption.encrypt('SYNTHETIC_USER_TOKEN_NOT_REAL'), settingsJson: { companyId: 12345, branchBinding: { contract: 'maya.crm-branch-binding/1', companyId: 12345, branchId: branch.id }, acceptedImportSnapshotHash: 'a'.repeat(64) } } });
  const scope = { stateDirectory: state, initialManifestSha256: '1'.repeat(64), privateStateSha256: '2'.repeat(64), restartReceiptPath: state + '/restart.json', restartReceiptSha256: '3'.repeat(64), tenantId: tenant.id, userId: owner.id, branchId: branch.id, tenantSlug: tenant.slug, companyId: '12345' };
  const permit = { contract: OWNER_HISTORY_PROFILE, candidateCommit: source.head, sourceSha256: hash(JSON.stringify(source)), scope, origin,
    day: '2026-10-12', timezone: 'Europe/Moscow', notBefore: new Date().toISOString(), expiresAt: new Date(Date.now()+1800000).toISOString(), ownerApprovalRef: 'synthetic-history-proof-not-live-authorization' };
  const permitPath = path.join(state, 'plan.json'), bytes = JSON.stringify(permit), pin = hash(bytes);
  fs.writeFileSync(permitPath, bytes, { mode: 0o600, flag: 'wx' });
  const launch = readOwnerHistoryLaunch(permitPath, pin, permit.ownerApprovalRef, readSourceBinding, 'claim');
  const runtimeEnv = realReadEnvironment(process.env, options, 'SYNTHETIC_PARTNER_NOT_REAL');
  // Full emitted AppModule and guards, with only the provider wire replaced.
  for (const key of Object.keys(process.env)) if (/DATABASE|TELEGRAM|YCLIENTS|DEEPSEEK|OPENAI|SMS|SCHEDULER/.test(key)) delete process.env[key];
  Object.assign(process.env, runtimeEnv);
  require('reflect-metadata');
  const load = file => require(path.join(backend,'dist/src',file));
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = load('app.module.js');
  const { configureHttpApp } = load('bootstrap/configure-http-app.js');
  const { PrismaService } = load('prisma/prisma.service.js');
  const { TenantContextService } = load('tenancy/tenant-context.service.js');
  const { ClientChannelLinkService } = load('crm/client-channel-link.service.js');
  const { clientChannelSubjectHash } = load('crm/client-channel-subject.js');
  const { AuthSessionService } = load('auth/auth-session.service.js');
  const { CrmService } = load('crm/crm.service.js');
  globalThis.fetch = async () => { throw Error('Synthetic proof unlisted external request'); };
  app = await NestFactory.create(AppModule,{bodyParser:false,logger:false,abortOnError:false});
  const databaseService=app.get(PrismaService), context=app.get(TenantContextService);
  const personal = await prisma.client.create({data:{tenantId:tenant.id,userId:owner.id}});
  const other = await prisma.client.create({data:{tenantId:tenant.id}});
  for(const [client,externalId] of [[personal,'701'],[other,'702']]) await prisma.crmClientLink.create({data:{tenantId:tenant.id,clientId:client.id,provider:'yclients',externalId}});
  const proof = {tenantId:tenant.id,clientId:personal.id,provider:'maya_user',providerSubjectHash:clientChannelSubjectHash(encryption,'maya_user',owner.id),
    method:'proven_user_client_link',verificationIdentityHash:hash('synthetic-identity'),verifier:'synthetic-history-only.v1',channelControlProofHash:hash('synthetic-channel'),clientAuthorityProofHash:hash('synthetic-client'),validUntil:new Date(Date.now()+600000)};
  const linkOwner=new ClientChannelLinkService(databaseService,context,{verifyLink:async()=>proof,verifyRevocation:async()=>{throw Error('not used');}});
  const linked=await context.runAsSystemTenant(tenant.id,()=>linkOwner.link({proof:'synthetic-proof-never-real'}));
  let wireMode='happy', wireCalls=0, alive=true;
  const record=(id,client,day='2026-10-10')=>({id,company_id:12345,staff_id:51,datetime:day+'T12:00:00+03:00',seance_length:3600,length:3600,deleted:false,attendance:1,visit_attendance:1,
    client:{id:client,name:client===701?'Synthetic own name':'Synthetic foreign name',phone:'SYNTHETIC-NO-PHONE'},services:[{id:91,title:'Synthetic service',cost:500,amount:1}],comment:'SYNTHETIC PRIVATE NOTE'});
  const wire=async raw=>{
    wireCalls++; const u=new URL(String(raw));
    if(u.pathname.includes('/records/')) {
      if(wireMode==='outside-window') return Response.json({success:true,data:[record(9001,701,'2026-09-01')]});
      if(wireMode==='source-change') await prisma.crmIntegration.update({where:{tenantId:tenant.id},data:{settingsJson:{companyId:99999}}});
      if(wireMode==='expire') alive=false;
      if(wireMode==='overfilled') return Response.json({success:true,data:Array(201).fill(record(1,701))});
      if(wireMode==='partial') return Response.json({success:true,data:Array.from({length:200},(_,i)=>record(1000+i,701))});
      return Response.json({success:true,data:[record(1,701),record(2,702)]});
    }
    if(u.pathname.includes('book_services')) return Response.json({success:true,data:{services:[{id:91,title:'Synthetic service',price_min:500,seance_length:3600}]}});
    if(u.pathname.includes('service_categories')) return Response.json({success:true,data:[]});
    if(u.pathname.includes('staff')) return Response.json({success:true,data:[{id:51,name:'Synthetic staff',bookable:true}]});
    throw Error('Synthetic unlisted wire');
  };
  runtime=await installOwnerHistory({app,prisma:databaseService,require,backend,launch:{plan:permit,assertPermitCurrent(){assert.ok(alive);launch.assertPermitCurrent();},assertCurrent(){assert.ok(alive);launch.assertCurrent();}},nativeFetch:wire});
  globalThis.fetch=runtime.fetch;
  configureHttpApp(app);
  app.use((req,res,next)=>{const reason=ownerHistoryIngress(req.method,req.originalUrl,req.headers,req.body,origin,scope);if(reason)res.status(403).json({error:{code:reason}});else next();});
  await app.init();
  report.httpLifecycle=[];
  const server=app.getHttpServer();
  for(const event of ['listening','connection','request','close']) server.on(event,()=>{report.httpLifecycle.push({event,phase:report.phase??'initial',at:new Date().toISOString()});save();});
  const request=require('supertest');
  const http=(route,body,token)=>{report.phase='http-'+route;save();const r=body===undefined?request(app.getHttpServer()).get(route):request(app.getHttpServer()).post(route).send(body);r.set('Origin',origin).timeout({response:20000,deadline:30000});if(token)r.set('Authorization','Bearer '+token);return r;};
  const login=await http('/api/auth/login',{tenantSlug:tenant.slug,email,password:ownerPassword});assert.equal(login.status,201);const token=login.body.access_token;
  const empty=await http('/api/client-channel/appointments',undefined,token);assert.equal(empty.status,200);assert.deepEqual(empty.body,[]);
  assert.equal(wireCalls,0);assert.equal(await prisma.reconciliationRun.count({where:{tenantId:tenant.id}}),0);
  report.checks.push('canonical-password-login-and-GET-do-not-import');save();
  const [result,race]=await Promise.all([runtime.importOnce(),runtime.importOnce()]);
  assert.equal(result.status,'ran');assert.equal(result.completeness,'complete');assert.equal(result.fetched,2);assert.equal(race.status,'failed');
  const rows=await prisma.appointment.findMany({where:{tenantId:tenant.id}});assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.mayaClientId===personal.id).length,1);assert.equal(rows.filter(r=>r.mayaClientId===other.id).length,1);
  assert.equal((await runtime.importOnce()).status,'failed');assert.equal(await prisma.reconciliationRun.count({where:{tenantId:tenant.id}}),1);
  report.checks.push('real-adapter-to-canonical-reconciliation-two-distinct-clients','one-import-concurrent-and-later-replay-refused');
  // Real acceptance reached this read after the five-minute canonical adapter
  // cache expired. Reproduce that boundary without sleeping or changing clocks.
  const cachedAdapter=app.get(CrmService).adapterCache.get(tenant.id);assert.ok(cachedAdapter);cachedAdapter.expiresAt=Date.now()-1;
  const personalRead=await http('/api/client-channel/appointments',undefined,token);assert.equal(personalRead.status,200);assert.equal(personalRead.body.length,1);
  assert.ok(!JSON.stringify(personalRead.body).includes('Synthetic foreign'));assert.ok(!JSON.stringify(personalRead.body).includes('SYNTHETIC PRIVATE NOTE'));
  report.checks.push('canonical-personal-reader-excludes-foreign-records-and-notes');
  report.checks.push('expired-adapter-cache-refreshes-labels-without-reimport');
  const settings=await http('/api/governed-settings/tenant/client_capabilities',undefined,token);assert.equal(settings.status,200);
  const command={confirmed:true,namespace:'client_capabilities',expectedRevision:settings.body.revision,previousRevisionId:settings.body.previousRevisionId,content:{client_self_visit_history:true}};
  const changed=await http('/api/governed-settings/tenant',command,token).set('Idempotency-Key',randomUUID());assert.equal(changed.status,201,'synthetic governed setting '+JSON.stringify(changed.body));
  const stale=await http('/api/governed-settings/tenant',command,token).set('Idempotency-Key',randomUUID());assert.equal(stale.status,409);
  const consent=await http('/api/client-channel/consent',{privacy:true,marketing:false,idempotencyKey:'synthetic-history-consent'},token);assert.equal(consent.status,201,'synthetic consent '+JSON.stringify(consent.body));
  report.checks.push('governed-history-setting-canonical-CAS-and-explicit-private-consent');
  for(const route of ['/api/ai/chat','/api/widgets/intent','/api/auth/phone/start','/api/client-channel/challenges','/api/integrations/crm/activate']) assert.equal((await http(route,{},token)).status,403);
  const foreignUser=await prisma.user.create({data:{tenantId:tenant.id,email:'foreign@example.invalid',passwordHash:await require('bcrypt').hash(ownerPassword,10),role:'tenant_owner',status:'active'}});
  await prisma.membership.create({data:{tenantId:tenant.id,userId:foreignUser.id,role:'tenant_owner',status:'active'}});
  assert.equal((await http('/api/auth/login',{tenantSlug:tenant.slug,email:foreignUser.email,password:ownerPassword})).status,403);
  report.checks.push('business-model-SMS-binding-and-foreign-owner-refused');save();
  // Fresh synthetic permits only. No live owner permits or state are reused.
  const install=async mode=>{
    report.phase='install-'+mode;save();runtime.stop();wireMode=mode;alive=true;
    // New AppModule per case avoids retaining an interceptor from a stopped qualification.
    await app.get(PrismaService).$disconnect();await app.close();globalThis.fetch=async()=>{throw Error('startup provider forbidden');};
    app=await NestFactory.create(AppModule,{bodyParser:false,logger:false,abortOnError:false});
    report.phase='install-runtime-'+mode;save();runtime=await installOwnerHistory({app,prisma:app.get(PrismaService),require,backend,launch:{plan:permit,assertPermitCurrent(){assert.ok(alive);launch.assertPermitCurrent();},assertCurrent(){assert.ok(alive);launch.assertCurrent();}},nativeFetch:wire});globalThis.fetch=runtime.fetch;
    return runtime;
  };
  await install('outside-window');assert.equal((await runtime.importOnce()).status,'failed');
  assert.equal(await prisma.appointment.count({where:{tenantId:tenant.id}}),2);
  report.checks.push('out-of-window-source-row-refused-before-any-appointment-write');
  await install('overfilled');assert.equal((await runtime.importOnce()).status,'failed');
  let last=await prisma.reconciliationRun.findFirst({where:{tenantId:tenant.id},orderBy:{startedAt:'desc'}});assert.equal(last.completeness,null);assert.equal(last.failureCode,'reconciliation_failed');
  assert.equal(await prisma.appointment.count({where:{tenantId:tenant.id}}),2);
  report.checks.push('overfilled-page-fails-without-false-completion-or-extra-rows');
  await install('happy');
  const { AppointmentChangeService } = load('crm/appointment-change.service.js');
  const writer=app.get(AppointmentChangeService), write=writer.applyObservation.bind(writer);let writeCount=0;
  writer.applyObservation=async input=>{const outcome=await write(input);writeCount++;runtime.stop();return outcome;};
  assert.equal((await runtime.importOnce()).status,'failed');assert.equal(writeCount,1);
  report.checks.push('stop-between-rows-cannot-restore-unrestricted-writer');
  await install('happy');
  const lateWriter=app.get(AppointmentChangeService), lateWrite=lateWriter.applyObservation.bind(lateWriter);let completedWrites=0;
  lateWriter.applyObservation=async input=>{const outcome=await lateWrite(input);if(++completedWrites===2)alive=false;return outcome;};
  assert.equal((await runtime.importOnce()).status,'failed');
  const lateRun=await prisma.reconciliationRun.findFirst({where:{tenantId:tenant.id},orderBy:{startedAt:'desc'}});
  assert.equal(lateRun.completeness,null);assert.equal(lateRun.finishedAt,null);assert.equal(lateRun.failureCode,'reconciliation_failed');alive=true;
  report.checks.push('expiry-after-final-row-cannot-mark-reconciliation-complete');
  await install('partial');const partialStart=performance.now();const partial=await runtime.importOnce();report.partialReconciliationMs=Math.round(performance.now()-partialStart);assert.equal(partial.status,'ran');assert.equal(partial.completeness,'truncated');
  assert.equal(await prisma.appointment.count({where:{tenantId:tenant.id,crmExternalId:'2'}}),1);
  report.checks.push('nonprogressing-source-remains-truncated-no-absence-deletion');
  await install('expire');assert.equal((await runtime.importOnce()).status,'failed');
  report.checks.push('execution-revocation-during-wire-refuses-result');
  alive=true;
  const priorIntegration=await prisma.crmIntegration.findUnique({where:{tenantId:tenant.id},select:{settingsJson:true}});
  await install('source-change');assert.equal((await runtime.importOnce()).status,'failed');
  await prisma.crmIntegration.update({where:{tenantId:tenant.id},data:priorIntegration});
  report.checks.push('company-change-in-flight-refused');
  runtime.stop();await app.close();app=null;globalThis.fetch=originalFetch;
  // Actual child IPC + relay + lifecycle with OS-level provider-network denial.
  plan.ownerHistory=true;plan.durationMs=1800000;plan.executionExpiresAt=permit.expiresAt;plan.providerAdmission=OWNER_HISTORY_ADMISSION;
  const childArgs=[...plan.runtime.args,'--owner-history-plan',permitPath,pin,permit.ownerApprovalRef];
  plan.runtime={...plan.runtime,command:'/usr/bin/sandbox-exec',args:['-p',diagnosticSandboxPolicy(pgPort,apiPort),process.execPath,...childArgs]};
  running=runReadRuntime(plan,runtimeEnv,state,control,report,save);let failure;void running.catch(e=>{failure=e;});
  const until=Date.now()+90000;
  while(report.status!=='ready'||!report.diagnostic.history){if(failure)throw failure;assert.ok(Date.now()<until,'binary_history_deadline');await delay(100);}
  assert.equal(report.diagnostic.history.status,'failed');
  assert.ok((await originalFetch(origin)).ok);assert.ok(Date.parse(report.expiresAt)<=Date.parse(permit.expiresAt));
  report.checks.push('actual-child-IPC-import-command-relay-and-network-denial-safe-receipt');
  control.cancelled='SYNTHETIC_PROOF_COMPLETE';control.terminate?.();await running;
  assert.equal(report.runtimeGroupAbsent,true);assert.equal(Object.hasOwn(runtimeEnv,'YCLIENTS_PARTNER_TOKEN'),false);
  report.checks.push('clean-binary-stop-parent-key-discarded');report.status='passed';
} catch(error) {
  // Fixtures have no owner data. Record closed name/message for synthetic diagnosis only.
  report.status='failed';report.syntheticFailure={name:error?.name,message:String(error?.message).slice(0,500),stack:String(error?.stack).slice(0,1800)};process.exitCode=1;save();
} finally {
  runtime?.stop();await app?.close().catch(()=>{});globalThis.fetch=originalFetch;
  control.terminate?.();await running?.catch(()=>{});await prisma?.$disconnect();
  if(started){try{await stage(plan.stop,env,state,{cancelled:null,terminate:null});report.clusterStopped=true;}catch{report.clusterStopped=false;report.status='failed-cleanup';process.exitCode=1;}}
  report.pidFileAbsent=!fs.existsSync(path.join(state,'pg/postmaster.pid'));
  report.sourceUnchanged=JSON.stringify(readSourceBinding())===JSON.stringify(source);
  if(!report.sourceUnchanged||!report.pidFileAbsent){report.status='failed';process.exitCode=1;}
  save();process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,clusterStopped:report.clusterStopped,sourceUnchanged:report.sourceUnchanged}));
