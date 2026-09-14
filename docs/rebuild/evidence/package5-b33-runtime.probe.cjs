/** B32 approved principal regression: actual compiled bridge controller, bridge tenant resolver,
 * signed Telegram authenticator, canonical Client resolver, policy and Action Engine.
 * Real owned PostgreSQL; synthetic credentials/contact/provider only; no live I/O. */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {createHash, createHmac, randomUUID} = require('node:crypto');
const {spawnSync, execFile} = require('node:child_process');
const {promisify} = require('node:util');
const runChild = promisify(execFile);
const backend = resolve(process.argv[2]);
const connectionString = process.argv[3];
const url = new URL(connectionString);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55503');
assert.equal(url.pathname, '/maya_c06_b33_proof');
const req = createRequire(resolve(backend, 'package.json'));
const {PrismaClient} = req('@prisma/client');
const {PrismaPg} = req('@prisma/adapter-pg');
const {ConfigService} = req('@nestjs/config');
const load = (file, name) => req('./dist/src/' + file)[name];
const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
global.fetch = async () => { throw Error('Live HTTP forbidden'); };
const Context = load('tenancy/tenant-context.service.js', 'TenantContextService');
const Encryption = load('encryption/encryption.service.js', 'EncryptionService');
const Creator = load('appointments/client-appointment-create.service.js', 'ClientAppointmentCreateService');
const Crm = load('crm/crm.service.js', 'CrmService');
const Appointments = load('appointments/appointments.service.js', 'AppointmentsService');
const Controller = load('appointments/appointments.controller.js', 'AppointmentsController');
const AiHandler = load('ai-tools/ai-tool-handler.service.js', 'AiToolHandlerService');
const Entitlements = load('entitlements/entitlements.service.js', 'EntitlementsService');
const Features = load('entitlements/feature-registry.service.js', 'FeatureRegistryService');
const {createStandaloneCanonicalActionEngineRuntime} = req('./dist/src/action-engine/index.js');
const {CrmOutcomeUnknownError} = req('./dist/src/crm/crm-request.errors.js');
const {clientChannelSubjectHash} = req('./dist/src/crm/client-channel-subject.js');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = new Context();
const encryption = new Encryption(new ConfigService({CRM_ENCRYPTION_KEY: 'synthetic-b31-proof'.repeat(8)}));
const runtime = createStandaloneCanonicalActionEngineRuntime(db, new Entitlements(db, new Features()), {
  identitySecret: 'b31-synthetic-identity-secret-not-production'.repeat(3),
  payloadEncryptionSecret: 'b31-synthetic-payload-secret-not-production'.repeat(3),
});
const START = '2099-09-20T10:00:00.000Z';
const END = '2099-09-20T11:00:00.000Z';
const START_B = '2099-09-20T12:00:00.000Z';
const SERVICE = {id: 'svc-1', name: 'Synthetic cut', price: 2500, duration_minutes: 60, currency: 'RUB'};
const slots = [{start: START, end: END, staff_id: 'synthetic-provider', branch_id: null}, {start: START_B, end: '2099-09-20T13:00:00.000Z', staff_id: 'synthetic-provider', branch_id: null}];
let providerCalls = 0;
let providerMode = 'success';
const providerState = new Map();
const contacts = new Map();
let planId;
const provider = {
  createAppointment: async input => {
    providerCalls++;
    const result = {external_id: randomUUID(), status: 'confirmed', start: input.start, end: new Date(Date.parse(input.start)+3600000).toISOString(), staff_id: input.staffId, service_ids: input.serviceIds, branch_id: null};
    providerState.set(input.tenantId, result);
    if (providerMode !== 'success') throw new CrmOutcomeUnknownError('Synthetic provider response lost');
    return result;
  },
  getClientAppointments: async input => {
    if (providerMode === 'unresolved') throw new CrmOutcomeUnknownError('Synthetic provider read unavailable');
    return providerState.has(input.tenantId) ? [providerState.get(input.tenantId)] : [];
  },
};
const calendar = {getAvailableSlots: async () => slots, getServiceTiming: async () => ({durationMinutes: 60, bufferBeforeMinutes: 10, bufferAfterMinutes: 5})};
const crm = Object.assign(Object.create(Crm.prototype), {
  prisma: db, tenantContext: context, encryptionService: encryption, actionEngineRuntime: runtime, internalCalendarService: calendar,
  getCalendarSource: async tenantId => (await db.tenant.findUnique({where: {id: tenantId}})).calendarSource,
  getClientRegistry: async tenantId => ({provider: 'yclients', clients: contacts.get(tenantId) ?? []}),
  getExternalProviderKey: async () => 'yclients', getAdapterForTenant: async () => provider,
  getServices: async () => [SERVICE, {...SERVICE, id: 'svc-2'}], getStaff: async () => [], getAvailableSlots: async () => slots,
  resolveStaffIdForBooking: async () => null,
});
const creator = new Creator(db, context, encryption, crm);
const service = new Appointments(db, context, {}, crm, calendar, {assertLiveBookingEnabled: async () => {}}, {}, {log: async () => {}}, {publishForTenant: async () => {}}, undefined, undefined, undefined, undefined, creator);
const controller = new Controller(service);
const ai = Object.assign(Object.create(AiHandler.prototype), {appointmentsService: service});
const scoped = (f, fn) => context.runAsAuthPrincipal(f.principal, fn);
const dto = {staffId: 'synthetic-provider', serviceIds: [SERVICE.id], start: START, clientName: 'Synthetic account'};
const create = (f, key, changes = {}) => scoped(f, () => controller.createAppointment(f.principal, {...dto, clientPhone: f.user.phone, ...changes}, key));
const bindingCount = f => db.actionExecutionIdempotencyBinding.count({where:{tenantId:f.tenantId}});
const conflictError = error => error?.getStatus?.() === 409 && error.getResponse()?.error?.code === 'IDEMPOTENCY_CONFLICT';
const makeExternal = async f => {
 await db.crmIntegration.create({data:{tenantId:f.tenantId,provider:'yclients',encryptedApiToken:'synthetic-no-live-token',settingsJson:{companyId:42}}});
 await db.tenant.update({where:{id:f.tenantId},data:{calendarSource:'external'}});
};
const counts = async f => ({appointments: await db.appointment.count({where: {tenantId: f.tenantId}}), executions: await db.actionExecution.count({where: {tenantId: f.tenantId}})});
async function fixture(mode) {
  const tenantId = randomUUID();
  await db.tenant.create({
    data: {
      id: tenantId,
      slug: tenantId,
      name: 'Synthetic B31 FG',
      planId,
      status: 'active',
      calendarSource: 'internal',
    },
  });
  const user = await db.user.create({
    data: {
      email: randomUUID() + '@invalid.test',
      phone: '+7999' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0'),
      passwordHash: 'synthetic',
      encryptedName: encryption.encrypt('Synthetic account'),
      role: 'client',
      status: 'active',
    },
  });
  await db.membership.create({
    data: {tenantId, userId: user.id, role: 'client', status: 'active'},
  });
  const clientA = await db.client.create({data: {tenantId, ...(mode === 'no_user' ? {} : {userId: user.id})}});
  const clientB = await db.client.create({data: {tenantId}});
  if (mode !== 'missing') {
    const providerSubjectHash = clientChannelSubjectHash(
      encryption,
      'maya_user',
      user.id,
    );
    const verificationIdentityHash = hash(randomUUID());
    const evidence = {
      contract: 'a18.client-channel-verification.v1',
      verifier: 'synthetic-b31-fg',
      tenantId,
      clientId: clientA.id,
      provider: 'maya_user',
      providerSubjectHash,
      verificationIdentityHash,
      channelControlProofHash: hash(user.id),
      clientAuthorityProofHash: hash(clientA.id),
    };
    const link = await db.clientChannelLink.create({
      data: {
        tenantId,
        clientId: clientA.id,
        provider: 'maya_user',
        providerSubjectHash,
        verificationMethod: 'explicit_verified_challenge',
        verificationIdentityHash,
        verificationEvidenceJson: evidence,
        verificationEvidenceHash: hash(evidence),
      },
    });
    if (mode === 'revoked') {
      const revocationIdentityHash = hash(['revoke', link.id]);
      const revocationEvidenceJson = {
        contract: 'a18.client-channel-revocation.v1',
        revocationIdentityHash,
        tenantId,
        linkId: link.id,
        actorProofHash: hash(user.id),
        reason: 'synthetic B31 FG revocation',
      };
      await db.clientChannelLink.update({
        where: {id: link.id},
        data: {
          revokedAt: new Date(),
          revocationIdentityHash,
          revocationEvidenceJson,
          revocationEvidenceHash: hash(revocationEvidenceJson),
        },
      });
    }
  }
  return {
    tenantId,
    user,
    clientA,
    clientB,
    principal: {tenantId, userId: user.id, role: 'client'},
  };
}


const Channel=load('crm/client-channel-runtime.service.js','ClientChannelRuntimeService');
const Authenticator=load('crm/client-channel-authenticator.service.js','ClientChannelAuthenticatorService');
const Bridge=load('tenancy/bridge-source.service.js','BridgeSourceService');
const LegacyController=load('crm/client-channel.controller.js','LegacyClientChannelController');
const token='12345:b33-synthetic-bot-token';
const authenticator=new Authenticator(new ConfigService({MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN:token}),context,encryption);
process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN='b33-synthetic-bridge-token';
process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER='yclients';
const channel=new Channel(db,context,authenticator,encryption,{},crm);
const bridgeController=new LegacyController(new Bridge(db),context,channel,{});
function command(f,operation,payload){
 process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID=f.company;
 return bridgeController.command(process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN,operation,{
  provider:'yclients',externalCompanyId:f.company,channelProof:f.proof,payload});
}
async function channelFixture(calendarKind){
 const f=await fixture('no_user'); await makeExternal(f);
 if(calendarKind==='internal')await db.tenant.update({where:{id:f.tenantId},data:{calendarSource:'internal'}});
 f.company=String(Math.floor(Math.random()*100000000)+100000000);
 await db.crmIntegration.update({where:{tenantId:f.tenantId},data:{status:'active',settingsJson:{companyId:Number(f.company)}}});
 await db.crmClientLink.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,provider:'yclients',externalId:'synthetic-channel-client'}});
 contacts.set(f.tenantId,[{external_id:'synthetic-channel-client',name:'Synthetic account',phone:f.user.phone}]);
 await db.customerProfile.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,privacyConsentAt:new Date()}});
 const subject=String(Math.floor(Math.random()*100000000)+100000000);
 const fields={auth_date:Math.floor(Date.now()/1000),id:subject};
 const material=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const signature=createHmac('sha256',createHash('sha256').update(token).digest()).update(material).digest('hex');
 f.widget={...fields,hash:signature};
 f.proof=JSON.stringify({type:'telegram_widget',credential:JSON.stringify(f.widget)});
 const providerSubjectHash=clientChannelSubjectHash(encryption,'telegram',subject),verificationIdentityHash=hash(randomUUID());
 const evidence={contract:'a18.client-channel-verification.v1',verifier:'synthetic-b33',tenantId:f.tenantId,clientId:f.clientA.id,provider:'telegram',providerSubjectHash,verificationIdentityHash,channelControlProofHash:hash(subject),clientAuthorityProofHash:hash(f.clientA.id)};
 f.link=await db.clientChannelLink.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,provider:'telegram',providerSubjectHash,verificationMethod:'explicit_verified_challenge',verificationIdentityHash,verificationEvidenceJson:evidence,verificationEvidenceHash:hash(evidence)}});
 return f;
}
const event=()=>({id:randomUUID(),kind:'client_booking_confirmation.v1',sourceStatement:'Подтверждаю запись',sourceContext:'Synthetic proposal: 20 September 2099, service and staff'});
const receipt=(f,c)=>command(f,'booking-confirmation',c);
const book=(f,c,changes={})=>command(f,'chat-appointment-create',{confirmationId:c.id,staffId:dto.staffId,serviceIds:dto.serviceIds,start:START,...changes});
async function main(){
 if(['receipt-crash','model-crash'].includes(process.argv[4])){
  const input=JSON.parse(require('node:fs').readFileSync(process.argv[5],'utf8'));
  await receipt(input.f,input.c);
  if(process.argv[4]==='model-crash'){const model={staffId:dto.staffId,serviceIds:dto.serviceIds,start:START};assert(model.start);}
  process.kill(process.pid,'SIGKILL');
 }
 if(process.argv[4]==='crash'){
  const input=JSON.parse(require('node:fs').readFileSync(process.argv[5],'utf8'));
  contacts.set(input.f.tenantId,[{external_id:'synthetic-channel-client',name:'Synthetic account',phone:input.f.user.phone}]);
  provider.createAppointment=async()=>{require('node:fs').writeFileSync(process.argv[5]+'.attempt','one synthetic provider attempt');process.kill(process.pid,'SIGKILL');};
  await book(input.f,input.c);throw Error('Crash injection did not run');
 }
 if(process.argv[4]==='replay'){
  const input=JSON.parse(require('node:fs').readFileSync(process.argv[5],'utf8'));
  console.log(JSON.stringify(await receipt(input.f,input.c))); return;
 }
 planId=(await db.subscriptionPlan.create({data:{name:'B33 synthetic '+randomUUID(),priceMonthly:0,maxBranches:10,maxStaff:10,featuresJson:{'crm.integration':true,'calendar.internal':true,booking:true}}})).id;
 const results={};
 for(const kind of ['internal','external'])for(const mode of (kind==='external'?['success','unresolved']:['success'])){
  providerMode=mode; const f=await channelFixture(kind),c=event();const before=providerCalls;
  await assert.rejects(()=>book(f,c));assert.deepEqual(await counts(f),{appointments:0,executions:0});
  if(kind==='internal'){
   const py=spawnSync('python3',[resolve(__dirname,'package5-b33-chat-confirmation.probe.py'),resolve(backend,'..')],{input:JSON.stringify({token,widget:f.widget,confirmation:c,start:START,changedStart:START_B,staffId:dto.staffId,serviceIds:dto.serviceIds}),encoding:'utf8'});
   assert.equal(py.status,0,py.stderr);const proof=JSON.parse(py.stdout);assert(proof.receiptBeforeModel);assert(proof.changedModelResultKeepsConfirmation);
   require('node:fs').writeFileSync('/tmp/maya-b33-owned-20260906/python-confirmation-proof.json',JSON.stringify(proof,null,2));
  }
  const receipts=await Promise.all(Array.from({length:8},()=>receipt(f,c)));
  assert(receipts.every(r=>r.confirmationId===c.id&&r.idempotencyKey===receipts[0].idempotencyKey));
  assert.equal(await db.clientBookingConfirmation.count({where:{id:c.id}}),1);
  // Kill/restart boundary before model; the child rebuilds services and reopens PostgreSQL.
  const path='/tmp/maya-b33-owned-20260906/replay-'+randomUUID()+'.json';
  require('node:fs').writeFileSync(path,JSON.stringify({f,c}));
  const child=await runChild(process.execPath,[__filename,backend,connectionString,'replay',path]);
  assert.deepEqual(JSON.parse(child.stdout),receipts[0]);
  for(const crash of ['receipt-crash','model-crash']){
   await assert.rejects(()=>runChild(process.execPath,[__filename,backend,connectionString,crash,path]),e=>e.signal==='SIGKILL');
   assert.deepEqual(await receipt(f,c),receipts[0]);assert.deepEqual(await counts(f),{appointments:0,executions:0});
  }
  require('node:fs').unlinkSync(path);
  // Model resolves locally, then can crash before B31: still no E and same C/K.
  const modelIntent={staffId:dto.staffId,serviceIds:dto.serviceIds,start:START};
  assert.deepEqual(await counts(f),{appointments:0,executions:0});assert.deepEqual(await receipt(f,c),receipts[0]);
  const parallel=await Promise.all(Array.from({length:8},()=>book(f,c,modelIntent)));
  const first=parallel[0];assert(parallel.every(r=>r.execution.executionId===first.execution.executionId));
  assert.equal(first.execution.state,mode==='unresolved'?'UNKNOWN':'SUCCEEDED');
  for(const changes of [{start:START_B},{staffId:'other-staff'},{serviceIds:['svc-2']}])await assert.rejects(()=>book(f,c,changes),conflictError);
  const expected={appointments:mode==='unresolved'?0:1,executions:1};assert.deepEqual(await counts(f),expected);
  const retry=await book(f,c);assert.equal(retry.execution.executionId,first.execution.executionId);
  assert.equal(providerCalls-before,kind==='external'?1:0);
  const saved=await db.actionExecution.findUniqueOrThrow({where:{id:first.execution.executionId}});
  assert.equal(saved.actorUserId,null);assert.equal(saved.policyEvidenceJson.actor.kind,'client_channel');
  for(const a of await db.appointment.findMany({where:{tenantId:f.tenantId}})){assert.equal(a.mayaClientId,f.clientA.id);assert.equal(a.tenantId,f.tenantId);}
  const beforeAuthority=await counts(f);
  const other=await channelFixture(kind);await assert.rejects(()=>receipt(other,c));await assert.rejects(()=>book(other,c));
  assert.deepEqual(await counts(f),beforeAuthority);assert.deepEqual(await counts(other),{appointments:0,executions:0});
  if(mode==='success'){
   // Existing account HTTP and AI reuse the same B31 identity/outcome.
   const k=receipts[0].idempotencyKey;
   const http=await create(f,k);
   const row=await db.appointment.findFirstOrThrow({where:{tenantId:f.tenantId}});
   assert.equal(http.id,row.id);
   const aiResult=await scoped(f,()=>ai.createOwnAppointment(f.principal,{staff_id:dto.staffId,service_ids:dto.serviceIds,start:START},k));
   assert.equal(aiResult.id,row.id);
   results[kind+'_'+mode]={sameReceipt:true,sameKey:true,oneExecution:true,changedTimeServiceStaff:'CONFLICT',restartBeforeModel:true,crashBeforeBinding:true};
  }else{
   providerMode='success';const reconciled=await book(f,c);assert.equal(reconciled.execution.executionId,first.execution.executionId);assert.equal(providerCalls-before,1);
   results[kind+'_'+mode]={sameExecution:true,changedModelIntent:'CONFLICT',providerCreates:1,unknownEscape:0};
  }
 }
 // Concurrent divergent model interpretation from a fresh receipt.
 providerMode='success';const f=await channelFixture('external'),c=event();await receipt(f,c);const before=providerCalls;
 const race=await Promise.allSettled([book(f,c),book(f,c,{start:START_B})]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected'&&conflictError(r.reason)).length,1);
 assert.deepEqual(await counts(f),{appointments:1,executions:1});assert.equal(providerCalls-before,1);
 const next=event();assert.notEqual((await receipt(f,next)).idempotencyKey,(await receipt(f,c)).idempotencyKey);
 const crashFixture=await channelFixture('external'),crashEvent=event();await receipt(crashFixture,crashEvent);
 const crashPath='/tmp/maya-b33-owned-20260906/crash-'+randomUUID()+'.json';require('node:fs').writeFileSync(crashPath,JSON.stringify({f:crashFixture,c:crashEvent}));
 await assert.rejects(()=>runChild(process.execPath,[__filename,backend,connectionString,'crash',crashPath]),e=>e.signal==='SIGKILL');
 assert.equal(require('node:fs').readFileSync(crashPath+'.attempt','utf8'),'one synthetic provider attempt');
 const pending=await db.actionExecution.findFirstOrThrow({where:{tenantId:crashFixture.tenantId}});assert.equal(pending.state,'EXECUTING');
 const retried=await book(crashFixture,crashEvent);assert.equal(retried.execution.executionId,pending.id);
 await assert.rejects(()=>book(crashFixture,crashEvent,{start:START_B}),conflictError);assert.deepEqual(await counts(crashFixture),{appointments:0,executions:1});
 require('node:fs').unlinkSync(crashPath);require('node:fs').unlinkSync(crashPath+'.attempt');
 results.crashAfterBinding={realChildSIGKILL:true,durableState:'EXECUTING',sameExecution:true,changedIntent:'CONFLICT',newExecutions:0};
 console.log(JSON.stringify({verdict:'PASS',actualCompiledBridge:true,actualSignedAuthenticator:true,realPostgreSQL:true,clientWithoutUser:true,results,concurrentDivergent:'one accepted intent and conflict',newExplicitConfirmation:'new receipt/key',productionMutations:0},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(()=>db.$disconnect());
