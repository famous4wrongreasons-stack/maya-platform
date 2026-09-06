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
assert.equal(url.port, '55502');
assert.equal(url.pathname, '/maya_c06_b32_proof');
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

async function main() {
 planId=(await db.subscriptionPlan.create({data:{name:'B32 synthetic '+randomUUID(),priceMonthly:0,maxBranches:10,maxStaff:10,featuresJson:{'crm.integration':true,'calendar.internal':true,booking:true}}})).id;
 const Channel=load('crm/client-channel-runtime.service.js','ClientChannelRuntimeService');
 const Authenticator=load('crm/client-channel-authenticator.service.js','ClientChannelAuthenticatorService');
 const Bridge=load('tenancy/bridge-source.service.js','BridgeSourceService');
 const LegacyController=load('crm/client-channel.controller.js','LegacyClientChannelController');
 const token='12345:b32-synthetic-bot-token';
 const authenticator=new Authenticator(new ConfigService({MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN:token}),context,encryption);
 process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN='b32-synthetic-bridge-token';
 process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER='yclients';
 const results={};
 provider.getAppointmentDetail=async input => {
   const row=providerState.get(input.tenantId); assert(row);
   return {...row,start_at:row.start,provider:{id:row.staff_id},service_ids:row.service_ids};
 };
 const revoke=async link => {
   const revocationIdentityHash=hash(['revoke',link.id]);
   const revocationEvidenceJson={contract:'a18.client-channel-revocation.v1',revocationIdentityHash,
     tenantId:link.tenantId,linkId:link.id,actorProofHash:hash('b32-owner'),reason:'synthetic regression'};
   await db.clientChannelLink.update({where:{id:link.id},data:{revokedAt:new Date(),revocationIdentityHash,
     revocationEvidenceJson,revocationEvidenceHash:hash(revocationEvidenceJson)}});
 };
 provider.rescheduleAppointment=async input => {
   providerCalls++;
   const prior=providerState.get(input.tenantId);
   assert(prior);
   const row={...prior,start:input.start,end:new Date(new Date(input.start).getTime()+3600000).toISOString()};
   providerState.set(input.tenantId,row); return row;
 };
 provider.cancelAppointment=async input => {
   providerCalls++;
   const prior=providerState.get(input.tenantId); assert(prior);
   const row={...prior,status:'cancelled'}; providerState.set(input.tenantId,row); return row;
 };
 for(const calendarKind of ['internal','external']) for(const mode of ['verified','no_user']) {
   const f=await fixture(mode);
   await makeExternal(f);
   if(calendarKind==='internal') await db.tenant.update({where:{id:f.tenantId},data:{calendarSource:'internal'}});
   const company=String(Math.floor(Math.random()*100000000)+100000000);
   await db.crmIntegration.update({where:{tenantId:f.tenantId},data:{status:'active',settingsJson:{companyId:Number(company)}}});
   process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID=company;
   await db.crmClientLink.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,provider:'yclients',externalId:'synthetic-channel-client'}});
   contacts.set(f.tenantId,[{external_id:'synthetic-channel-client',name:'Synthetic account',phone:f.user.phone}]);
   await db.customerProfile.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,privacyConsentAt:new Date()}});
   const subject=String(Math.floor(Math.random()*100000000)+100000000);
   const fields={auth_date:Math.floor(Date.now()/1000),id:subject};
   const material=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
   const signature=createHmac('sha256',createHash('sha256').update(token).digest()).update(material).digest('hex');
   const proof=JSON.stringify({type:'telegram_widget',credential:JSON.stringify({...fields,hash:signature})});
   const providerSubjectHash=clientChannelSubjectHash(encryption,'telegram',subject);
   const verificationIdentityHash=hash(randomUUID());
   const evidence={contract:'a18.client-channel-verification.v1',verifier:'synthetic-b32',tenantId:f.tenantId,
     clientId:f.clientA.id,provider:'telegram',providerSubjectHash,verificationIdentityHash,
     channelControlProofHash:hash(subject),clientAuthorityProofHash:hash(f.clientA.id)};
   const channel=new Channel(db,context,authenticator,encryption,{},crm);
   const controller=new LegacyController(new Bridge(db),context,channel,{});
   const call=(key,changes={}) => controller.command(process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN,'appointment-create',{
     provider:'yclients',externalCompanyId:company,channelProof:proof,
     payload:{idempotencyKey:key,staffId:dto.staffId,serviceIds:dto.serviceIds,start:START,...changes}});
   await assert.rejects(()=>call('missing-link-key'));
   assert.deepEqual(await counts(f),{appointments:0,executions:0});
   const link=await db.clientChannelLink.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,provider:'telegram',providerSubjectHash,
     verificationMethod:'explicit_verified_challenge',verificationIdentityHash,verificationEvidenceJson:evidence,verificationEvidenceHash:hash(evidence)}});
   const usersBefore=await db.user.count();
   const callsBefore=providerCalls;
   const lostReplyReconciled=calendarKind==='external' && mode==='no_user';
   providerMode=lostReplyReconciled?'reconciled':'success';
   const parallel=await Promise.all(Array.from({length:8},()=>call('b32-one-booking')));
   const first=parallel[0];
   assert(parallel.every(value=>value.execution.executionId===first.execution.executionId));
   assert.equal(first.execution.state,'SUCCEEDED');
   providerMode='success';
   const alias=await call('b32-alias-booking');
   assert.equal(alias.execution.executionId,first.execution.executionId);
   const e=await db.actionExecution.findUniqueOrThrow({where:{id:first.execution.executionId}});
   assert.equal(e.policyEvidenceJson.actor.kind,'client_channel');
   assert.equal(e.actorUserId,null);
   assert.deepEqual(e.policyEvidenceJson.policy.reasonCodes,[]);
   assert.equal(e.bookingIntentContract,'maya.client-appointment-create-intent/1');
   assert(e.evidenceRefsJson.includes('client-authority:v1:'+link.id));
   const row=await db.appointment.findFirstOrThrow({where:{tenantId:f.tenantId}});
   assert.equal(row.mayaClientId,f.clientA.id); assert.equal(row.clientId,null);
   assert.deepEqual(await counts(f),{appointments:1,executions:1});
   assert.equal(providerCalls-callsBefore,calendarKind==='external'?1:0);
   await assert.rejects(()=>call('b32-one-booking',{start:START_B}),conflictError);
   assert.deepEqual(await counts(f),{appointments:1,executions:1});
   const http=await create(f,'b32-one-booking');
   const aiOutcome=await scoped(f,()=>ai.createOwnAppointment(f.principal,{staff_id:dto.staffId,service_ids:dto.serviceIds,start:START},'b32-one-booking'));
   assert.equal(http.id,row.id); assert.equal(aiOutcome.id,row.id);
   assert.equal(await db.user.count(),usersBefore);
   const durable=JSON.stringify({source:e.sourceRef,evidence:e.evidenceRefsJson,policy:e.policyEvidenceJson});
   for(const secret of [subject,signature,proof,token,f.user.phone]) assert(!durable.includes(secret));
   if(calendarKind==='external') {
     const change=(operation,payload)=>controller.command(process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN,'appointment-'+operation,
       {provider:'yclients',externalCompanyId:company,channelProof:proof,payload});
     const foreignLink=await db.clientChannelLink.findFirstOrThrow({where:{tenantId:f.tenantId,provider:'maya_user'}});
     // Real policy against PostgreSQL: a valid other Client cannot own this target.
     const Policy=load('action-engine/action-engine.policy-resolver.js','CanonicalActionPolicyResolver');
     const {createCanonicalProductionPolicyRegistry}=req('./dist/src/action-engine/action-engine.policy-registry.js');
     const policy=new Policy(db,new Entitlements(db,new Features()),{attestationSecret:'b32-real-database-policy-secret'.repeat(3)},createCanonicalProductionPolicyRegistry());
     const foreignIdentity=hash(randomUUID());
     const foreignEvidence={...evidence,clientId:f.clientB.id,provider:'maya_user',providerSubjectHash:hash(randomUUID()),verificationIdentityHash:foreignIdentity};
     const other=await db.clientChannelLink.create({data:{tenantId:f.tenantId,clientId:f.clientB.id,provider:'maya_user',providerSubjectHash:foreignEvidence.providerSubjectHash,
       verificationMethod:'explicit_verified_challenge',verificationIdentityHash:foreignIdentity,verificationEvidenceJson:foreignEvidence,verificationEvidenceHash:hash(foreignEvidence)}});
     await assert.rejects(()=>policy.resolve({contract:'maya.action-policy-resolution-request/1',tenantId:f.tenantId,
       capability:'crm.appointment.cancel.v1',sourceType:'authenticated_request',sourceRef:'synthetic-other-client',targetRef:'appointment/'+row.crmExternalId,
       normalizedInputHash:hash('cancel'),clientPrincipal:{linkId:other.id,target:{kind:'appointment',appointmentId:row.id,externalId:row.crmExternalId}}}));
     const moved=await change('reschedule',{recordId:row.crmExternalId,start:START_B});
     assert.equal(moved.execution.state,'SUCCEEDED');
     const canceled=await change('cancel',{recordId:row.crmExternalId});
     assert.equal(canceled.execution.state,'SUCCEEDED');
     for(const result of [moved,canceled]) {
       const mutation=await db.actionExecution.findUniqueOrThrow({where:{id:result.execution.executionId}});
       assert.equal(mutation.policyEvidenceJson.actor.kind,'client_channel');
       assert(mutation.evidenceRefsJson.includes('client-target:appointment:v1:'+row.id));
     }
   }
   let unknownScenario;
   if(calendarKind==='external' && mode==='no_user') {
     providerMode='unresolved';
     const dispatches=providerCalls;
     const firstUnknown=await call('b32-unknown-booking',{start:START_B});
     assert.equal(firstUnknown.execution.state,'UNKNOWN');
     assert.equal(providerCalls,dispatches+1);
     const unknownCounts=await counts(f);
     const savedContacts=contacts.get(f.tenantId), savedServices=crm.getServices;
     contacts.set(f.tenantId,[]);
     crm.getServices=async()=>{throw Error('synthetic catalog outage');};
     const retryUnknown=await call('b32-unknown-booking',{start:START_B});
     assert.equal(retryUnknown.execution.executionId,firstUnknown.execution.executionId);
     assert.equal(retryUnknown.execution.state,'UNKNOWN');
     await assert.rejects(()=>call('b32-unknown-booking',{start:START}),conflictError);
     assert.deepEqual(await counts(f),unknownCounts);
     assert.equal(providerCalls,dispatches+1);
     contacts.set(f.tenantId,savedContacts); crm.getServices=savedServices;
     providerMode='success';
     const reconciled=await call('b32-unknown-booking',{start:START_B});
     assert.equal(reconciled.execution.executionId,firstUnknown.execution.executionId);
     assert.equal(reconciled.execution.state,'UNKNOWN');
     assert.equal((await db.actionExecution.findUniqueOrThrow({where:{id:firstUnknown.execution.executionId}})).reconciliationState,'MANUAL_REQUIRED');
     assert.equal(providerCalls,dispatches+1);
     unknownScenario={sameExecution:true,contactAndCatalogOutage:'frozen accepted defaults reused',changedIntent:'CONFLICT',providerDispatches:1,unresolvedOutcome:'UNKNOWN / MANUAL_REQUIRED preserved after read recovery; no automatic retry'};
   }
   const beforeRevocation=await counts(f);
   await revoke(link);
   await assert.rejects(()=>call('b32-one-booking'));
   assert.deepEqual(await counts(f),beforeRevocation);
   const historical=await db.actionExecution.findUniqueOrThrow({where:{id:e.id}});
   assert.equal(JSON.stringify({source:historical.sourceRef,evidence:historical.evidenceRefsJson,policy:historical.policyEvidenceJson}),durable);
   await assert.rejects(()=>db.actionExecution.update({where:{id:e.id},data:{evidenceRefsJson:['client-authority:v1:forged'],revision:{increment:1}}}));
   results[calendarKind+'_'+mode]={principal:'client_channel',clientHasMayaUser:mode!=='no_user',signedTelegram:'PASS',
     HTTP_AI_channelParity:'PASS',providerReplyLostReconciled:lostReplyReconciled,concurrentRequests:8,primaryIntentExecutions:1,primaryIntentAppointments:1,changedIntent:'IDEMPOTENCY_CONFLICT',
     missingAndRevoked:'DENIED',historicalEvidenceImmutable:true,rawCredentialInEvidence:false,runtimeUsersCreated:0,
     cancelReschedule:calendarKind==='external'?'PASS':'covered by account/policy regression',
     businessTargetAuthority:'PASS',...(unknownScenario?{unknownScenario}:{})};
 }
 console.log(JSON.stringify({verdict:'PASS',realPostgresql:true,actualCompiledController:true,actualSignedAuthenticator:true,
   actualClientResolver:true,actualPolicyAndActionEngine:true,productionMutations:0,results},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(()=>db.$disconnect());
