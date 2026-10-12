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
import httpModule from 'node:http';
import { installOwnerChat } from './local-owner-chat-runtime.mjs';
import { OWNER_HISTORY_REVIEW_PROFILE, HISTORY_REVIEW_QUESTIONS, historyReviewIngress, assertHistoryPlanningRequest } from './local-owner-history-review-policy.mjs';
import { CORE_OWNER_HISTORY_LIMITS } from './conversation-qualification/current-candidate-budget.mjs';
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
const report = { qualification: 'SYNTHETIC_EXISTING_HISTORY_REVIEW_HTTP_PG_NOT_LIVE_ACCEPTANCE', head: source.head, status: 'preparing', checks: [], completed: [], state, realProviderCalls: 0, diagnostic: createDiagnostic(false) };
const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
const control = { cancelled: null, terminate: null };
const cancel = () => { control.cancelled = 'SIGTERM'; control.terminate?.(); };
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
let started = false, prisma, app, runtime, chatRuntime, broker;
const originalFetch = globalThis.fetch;
try {
  save();
  for (const spec of plan.setup) {
    if (spec.name === 'pg-start') started = true;
    console.log(spec.name); await stage(spec, env, state, control); report.completed.push(spec.name); save();
  }
  const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg');
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: options.databaseUrl }) });
  const tenant = await prisma.tenant.create({ data: { name: 'Synthetic binary proof', slug: 'synthetic-binary-' + randomBytes(4).toString('hex'), status: 'trial', trialFullAccess: true, trialEndsAt: new Date(Date.now()+3600000), currentPeriodEnd: new Date('2099-01-01'), calendarSource: 'external' } });
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
  // Populate only the new synthetic database through canonical reconciliation,
  // before installing the review boundary. No retained database is opened.
  globalThis.fetch=wire;
  const { AppointmentReconciliationService }=load('crm/appointment-reconciliation.service.js');
  const imported=await context.runAsSystemTenant(tenant.id,()=>app.get(AppointmentReconciliationService).run({tenantId:tenant.id,from:new Date('2026-10-05T00:00:00+03:00'),to:new Date('2026-10-19T00:00:00+03:00'),holder:'synthetic-review-fixture'}));
  assert.equal(imported.status,'ran');
  const beforeRows=await prisma.appointment.findMany({orderBy:{id:'asc'}});
  const beforeRuns=await prisma.reconciliationRun.count();
  assert.equal(beforeRows.length,2);
  // Entitlements exist only on this disposable fixture, not the owner database.
  for(const key of ['ai.consultant','ai.owner','booking','booking.customer_app','crm.integration']) {
    await prisma.feature.upsert({where:{key},create:{key,name:key,module:'synthetic-review'},update:{}});
    await prisma.tenantEntitlement.upsert({where:{tenantId_featureKey:{tenantId:tenant.id,featureKey:key}},create:{tenantId:tenant.id,featureKey:key,enabled:true,reason:'synthetic-history-review-only'},update:{enabled:true}});
  }
  const channel=path.join(state,'channel');fs.mkdirSync(channel,{mode:0o700});fs.chownSync(channel,process.getuid(),process.getgid());
  const socket=path.join(channel,'b.sock');let modelCalls=0;
  broker=httpModule.createServer(async(req,res)=>{
    try {
      let body='';for await(const c of req)body+=c;
      assertHistoryPlanningRequest({body});
      const input=JSON.parse(JSON.parse(body).messages[1].content);
      const question=input.conversation.at(-1).content;
      const index=HISTORY_REVIEW_QUESTIONS.indexOf(question);assert.ok(index>=0);
      assert.equal(req.headers.authorization,undefined);
      assert.equal(req.headers['x-candidate-case'],['owner-personal-history','owner-personal-last-visit'][index]);
      modelCalls++;
      for(const marker of ['SYNTHETIC PRIVATE NOTE','Synthetic own name','Synthetic foreign name',personal.id,other.id])assert.ok(!body.includes(marker));
      const answer={semantic_plan:{parent_request:question,language:'ru',dialogue_act:'question',tasks:[{id:'own',intent:'booking.list_own',entities_json:JSON.stringify({period:['past','last_visit'][index]}),depends_on:[],confidence:1,requires_clarification:false,clarification_question:null}],context:{carried_slots:[],replaced_slots:[],unresolved_references:[]}},tool_call:{name:'appointments.own.list',arguments_json:'{}'}};
      res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
    } catch(error) { report.wireFailure=String(error.message).slice(0,300);res.writeHead(500);res.end('{}'); }
  });
  await new Promise(r=>broker.listen(socket,r));fs.chmodSync(socket,0o600);
  const target={host:'localhost',workDirectory:backend,brokerUid:process.getuid(),runnerUid:process.getuid(),brokerSocket:{path:socket,gid:process.getgid()}};
  const reviewLaunch={manifest:{profile:OWNER_HISTORY_REVIEW_PROFILE,ownerScope:scope,manifestSha256:'e'.repeat(64),limits:CORE_OWNER_HISTORY_LIMITS,admissionContext:{target}},admission:{expiresAt:Date.now()+1800000},assertCurrent(){assert.ok(alive);}};
  runtime=await installOwnerHistory({app,prisma:databaseService,require,backend,launch:{plan:{scope},assertCurrent:reviewLaunch.assertCurrent},nativeFetch:wire,readExistingOnly:true});
  chatRuntime=await installOwnerChat({app,prisma:databaseService,require,backend,launch:reviewLaunch,providerFetch:runtime.fetch});
  globalThis.fetch=chatRuntime.fetch;
  configureHttpApp(app);
  app.use((req,res,next)=>{const reason=historyReviewIngress(req.method,req.originalUrl,req.headers,req.body,origin,scope);if(reason)res.status(403).json({error:{code:reason}});else next();});
  await app.listen(apiPort,'127.0.0.1');
  const request=require('supertest');
  const h=(route,body,token)=>{const r=body===undefined?request(app.getHttpServer()).get(route):request(app.getHttpServer()).post(route).send(body);r.set('Origin',origin).timeout({response:60000,deadline:75000});if(token)r.set('Authorization','Bearer '+token);return r;};
  const check=name=>{report.checks.push(name);save();};
  const login=await h('/api/auth/login',{tenantSlug:tenant.slug,email,password:ownerPassword});assert.equal(login.status,201);const token=login.body.access_token;
  check('one-real-canonical-password-login-with-retained-verified-personal-context');
  const settings=await h('/api/governed-settings/tenant/client_capabilities',undefined,token);assert.equal(settings.status,200);
  const command={confirmed:true,namespace:'client_capabilities',expectedRevision:settings.body.revision,previousRevisionId:settings.body.previousRevisionId,content:{client_self_visit_history:true}};
  const settingKey=randomUUID();const changed=await h('/api/governed-settings/tenant',command,token).set('Idempotency-Key',settingKey);assert.equal(changed.status,201,'full trial setting '+JSON.stringify(changed.body));
  assert.equal((await h('/api/governed-settings/tenant',command,token).set('Idempotency-Key',settingKey)).body.actionExecutionId,changed.body.actionExecutionId);
  assert.equal((await h('/api/governed-settings/tenant',command,token).set('Idempotency-Key',randomUUID())).status,409);
  const consent=await h('/api/client-channel/consent',{privacy:true,marketing:false,idempotencyKey:'synthetic-review-consent'},token);assert.equal(consent.status,201);
  check('full-trial-canonical-A22-setting-idempotency-CAS-and-privacy-only-consent');
  const read=await h('/api/client-channel/appointments',undefined,token);assert.equal(read.status,200);assert.equal(read.body.length,1);
  assert.ok(!JSON.stringify(read.body).includes('Synthetic foreign'));assert.ok(!JSON.stringify(read.body).includes('SYNTHETIC PRIVATE NOTE'));
  check('personal-reader-one-own-visit-foreign-and-note-excluded');
  const chatMessages=[];let conversationId;
  for(const [index,question] of HISTORY_REVIEW_QUESTIONS.entries()) {
    chatMessages.push({role:'user',content:question});
    const response=await h('/api/ai/chat',{surface:'web',requestId:'synthetic-review-turn-'+index,messages:chatMessages,...(conversationId?{conversationId}:{})},token);
    assert.equal(response.status,201,'synthetic AChat '+JSON.stringify(response.body));
    const reply=response.body.reply;
    assert.equal(typeof reply,'string');
    assert.match(reply,/Synthetic service/,'synthetic reply '+reply);
    assert.match(reply,index===0?/сохранённой истории/:/Последний подтверждённый визит/);
    assert.ok(!reply.includes('Synthetic foreign')&&!reply.includes('SYNTHETIC PRIVATE NOTE'));
    chatMessages.push({role:'assistant',content:reply});conversationId=response.body.conversationId;
    check(index===0?'actual-AiCore-C9-own-history-tool-and-server-composed-answer':'second-question-with-private-assistant-history-only-user-text-reaches-model');
  }
  assert.equal(modelCalls,2);check('exactly-two-synthetic-planner-calls-no-private-result-generation-call');
  const restored=await h('/api/ai/conversation',undefined,token);assert.equal(restored.status,200);
  assert.equal(restored.body.turns.filter(t=>t.role==='user').length,2);
  assert.equal(restored.body.turns.filter(t=>t.role==='assistant').length,2);
  check('canonical-two-user-turns-two-replies-persist-and-restore');
  for(const route of ['/api/integrations/crm/activate','/api/widgets/act','/api/client-channel/challenges','/api/auth/phone/start','/api/ai/tools/execute'])assert.equal((await h(route,{},token)).status,403);
  assert.equal((await h('/api/ai/chat',{surface:'web',requestId:'synthetic-review-forbidden',messages:[{role:'user',content:'Запиши меня'}]},token)).status,403);
  check('HTTP-import-booking-binding-SMS-direct-tool-and-new-question-refused');
  assert.equal((await runtime.importOnce()).status,'failed');
  await assert.rejects(context.runAsSystemTenant(tenant.id,()=>app.get(AppointmentReconciliationService).run({tenantId:tenant.id,from:new Date(),to:new Date(),holder:'must-refuse'})));
  const { ActionEngineRuntimeService }=load('action-engine/action-engine.runtime.js');
  assert.throws(()=>app.get(ActionEngineRuntimeService).execute({}));
  check('internal-import-and-business-execution-refused');
  const { CrmService:Crm }=load('crm/crm.service.js');app.get(Crm).adapterCache.get(tenant.id).expiresAt=Date.now()-1;
  assert.equal((await h('/api/client-channel/appointments',undefined,token)).body.length,1);
  check('catalogue-cache-expiry-label-refresh-no-journal');
  await prisma.clientChannelLink.update({where:{id:linked.link.id},data:{revokedAt:new Date()}});
  assert.notEqual((await h('/api/client-channel/appointments',undefined,token)).status,200);
  check('revoked-current-client-link-refuses-history');
  assert.deepEqual(await prisma.appointment.findMany({orderBy:{id:'asc'}}),beforeRows);
  assert.equal(await prisma.reconciliationRun.count(),beforeRuns);
  assert.equal(await prisma.tenantEntitlement.count({where:{featureKey:'widgets.runtime',enabled:true}}),0);
  check('existing-journal-byte-values-unchanged-no-reimport-or-widget-grant');
  alive=false;assert.equal((await h('/api/client-channel/appointments',undefined,token)).status,403);
  check('expired-local-allowance-refuses-read');
  report.status='passed';
} catch(error) {
  report.status='failed';report.syntheticFailure={name:error?.name,message:String(error?.message).slice(0,1000),stack:String(error?.stack).slice(0,1800)};process.exitCode=1;save();
} finally {
  chatRuntime?.stop();runtime?.stop();
  if(app){await app.get(require(path.join(backend,'dist/src/prisma/prisma.service.js')).PrismaService).$disconnect().catch(()=>{});await app.close().catch(()=>{});}
  if(broker)await new Promise(r=>broker.close(r));
  await prisma?.$disconnect();globalThis.fetch=originalFetch;
  if(started){try{await stage(plan.stop,env,state,{cancelled:null,terminate:null});report.clusterStopped=true;}catch{report.clusterStopped=false;report.status='failed-cleanup';process.exitCode=1;}}
  report.pidFileAbsent=!fs.existsSync(path.join(state,'pg/postmaster.pid'));
  report.sourceUnchanged=JSON.stringify(readSourceBinding())===JSON.stringify(source);
  if(!report.sourceUnchanged||!report.pidFileAbsent){report.status='failed';process.exitCode=1;}
  save();process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,clusterStopped:report.clusterStopped,sourceUnchanged:report.sourceUnchanged}));
