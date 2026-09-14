/** Post-B31 Final Gate: actual compiled bridge controller, bridge tenant resolver,
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
assert.equal(url.port, '55501');
assert.equal(url.pathname, '/maya_c06_b31_fg');
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
    const result = {external_id: randomUUID(), status: 'confirmed', start: input.start, end: END, staff_id: input.staffId, service_ids: input.serviceIds, branch_id: null};
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
 planId=(await db.subscriptionPlan.create({data:{name:'Final Gate synthetic '+randomUUID(),priceMonthly:0,maxBranches:10,maxStaff:10,featuresJson:{'crm.integration':true,'calendar.internal':true,booking:true}}})).id;
 const Channel=load('crm/client-channel-runtime.service.js','ClientChannelRuntimeService');
 const Authenticator=load('crm/client-channel-authenticator.service.js','ClientChannelAuthenticatorService');
 const Bridge=load('tenancy/bridge-source.service.js','BridgeSourceService');
 const LegacyController=load('crm/client-channel.controller.js','LegacyClientChannelController');
 const token='12345:synthetic-final-gate-bot-token';
 const authenticator=new Authenticator(new ConfigService({MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN:token}),context,encryption);
 process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN='synthetic-final-gate-bridge-token';
 process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER='yclients';
 const results={};
 for(const mode of ['verified','no_user']) {
  const f=await fixture(mode);
  await makeExternal(f);
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
  const evidence={contract:'a18.client-channel-verification.v1',verifier:'synthetic-final-gate',tenantId:f.tenantId,clientId:f.clientA.id,provider:'telegram',providerSubjectHash,verificationIdentityHash,channelControlProofHash:hash(subject),clientAuthorityProofHash:hash(f.clientA.id)};
  await db.clientChannelLink.create({data:{tenantId:f.tenantId,clientId:f.clientA.id,provider:'telegram',providerSubjectHash,verificationMethod:'explicit_verified_challenge',verificationIdentityHash,verificationEvidenceJson:evidence,verificationEvidenceHash:hash(evidence)}});
  const channel=new Channel(db,context,authenticator,encryption,{},crm);
  const controller=new LegacyController(new Bridge(db),context,channel,{});
  const resolved=await context.runAsPublicTenant(f.tenantId,()=>db.$transaction(tx=>channel.resolve(proof,tx)));
  assert.equal(resolved.clientId,f.clientA.id);
  assert.equal(resolved.tenantId,f.tenantId);
  // Exact key material used by the published normal/streaming chat finalizer.
  const key=intent=>'chat-booking:'+hash([intent,dto.staffId,[...new Set(dto.serviceIds)].sort(),START]);
  const call=identity=>controller.command(process.env.MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN,'appointment-create',{provider:'yclients',externalCompanyId:company,channelProof:proof,payload:{idempotencyKey:identity,staffId:dto.staffId,serviceIds:dto.serviceIds,start:START}});
  const before=providerCalls;
  const first=await call(key('synthetic-turn-1'));
  const alias=await call(key('synthetic-turn-2'));
  const replay=await call(key('synthetic-turn-1'));
  assert.equal(first.execution.executionId,alias.execution.executionId);
  assert.equal(first.execution.executionId,replay.execution.executionId);
  const e=await db.actionExecution.findUnique({where:{id:first.execution.executionId}});
  assert.equal(first.accepted,true);
  assert.equal(e.state,'NOT_EXECUTED');
  assert.equal(e.policyDecision,'DENY');
  assert.equal(e.notExecutedReasonCode,'policy_denied');
  assert.deepEqual(e.policyEvidenceJson.policy.reasonCodes,['actor_required']);
  assert.equal(e.actorUserId,null);
  assert.equal(e.sourceType,'authenticated_request');
  assert.equal(e.policyEvidenceJson.tenant.allowed,true);
  assert.equal(e.policyEvidenceJson.entitlement.allowed,true);
  assert.equal(e.bookingIntentContract,null);
  assert.equal(await bindingCount(f),0);
  assert.equal(providerCalls-before,0);
  assert.deepEqual(await counts(f),{appointments:0,executions:1});
  results[mode]={signedTelegramAuthentication:'PASS',bridgeSecretAndExactIntegrationResolution:'PASS',verifiedCanonicalClientResolution:'PASS',clientHasMayaUser:mode!=='no_user',canonicalConsentPresent:true,activeTenantAndEntitlements:'PASS',publicTenantContext:true,requestSource:'authenticated_request',actorUserId:null,returnedAccepted:true,executionState:e.state,policyDecision:e.policyDecision,reasonCodes:e.policyEvidenceJson.policy.reasonCodes,retrySameDeniedExecution:true,actionExecutions:1,appointments:0,providerCalls:0,immutableBindings:0};
 }
 console.log(JSON.stringify({verdict:'CONFIRMED_BLOCKER_B32',scope:'published chat appointment-create / actual compiled LegacyClientChannelController',realPostgresql:true,actualBridgeResolver:true,actualSignedChannelAuthenticator:true,actualVerifiedClientResolver:true,actualCanonicalPolicyAndKernel:true,syntheticOnly:true,realProductionMutations:0,results},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>db.$disconnect());
