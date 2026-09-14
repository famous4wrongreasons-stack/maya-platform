/** Approved B31 Option A runtime regression: compiled HTTP/AI + canonical Client resolver + real Action
 * Engine/Prisma/PostgreSQL. Synthetic dedicated database; no live I/O. */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
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
  if (process.argv[4] === '--resume' || process.argv[4] === '--race') {
    const tenantId = process.argv[5];
    const clientA = await db.client.findFirstOrThrow({where:{tenantId,userId:{not:null}},include:{user:true}});
    const f = {tenantId,clientA,user:clientA.user,principal:{tenantId,userId:clientA.userId,role:'client'}};
    if(process.argv[4] === '--race') while(Date.now()<Number(process.argv[6])) await new Promise(resolve=>setTimeout(resolve,5));
    const invokedAt=Date.now();
    const result = await create(f,process.argv[4] === '--race' ? 'b31-cross-process' : 'b31-crash-key');
    const execution = await db.actionExecution.findFirstOrThrow({where:{tenantId}});
    console.log(JSON.stringify({appointmentId:result.id,executionId:execution.id,state:execution.state,providerCalls,invokedAt}));
    return;
  }
  planId = (await db.subscriptionPlan.create({data: {name: 'B31 synthetic ' + randomUUID(), priceMonthly: 0, maxBranches: 10, maxStaff: 10, featuresJson: {'crm.integration': true, 'calendar.internal': true, booking: true}}})).id;
  const results = {};
  for (const mode of ['missing', 'revoked']) {
    const f = await fixture(mode);
    await assert.rejects(() => create(f, 'b31-' + mode));
    assert.deepEqual(await counts(f), {appointments: 0, executions: 0});
    results[mode] = 'denied; appointments=0; executions=0';
  }
  const f = await fixture('verified');
  const batch = await Promise.allSettled(Array.from({length: 12}, (_, i) => create(f, 'b31-concurrent-' + i)));
  const accepted = batch.filter(item => item.status === 'fulfilled');
  if (accepted.length !== batch.length) throw batch.find(item => item.status === 'rejected').reason;
  const repeat = await create(f, 'b31-repeat');
  const aiResult = await scoped(f, () => ai.createOwnAppointment(f.principal, {staff_id: dto.staffId, service_ids: dto.serviceIds, start: dto.start}, 'b31-ai-repeat'));
  const row = await db.appointment.findUnique({where: {id: repeat.id}});
  assert.equal(row.mayaClientId, f.clientA.id);
  assert.equal(row.clientId, null);
  assert.equal(row.tenantId, f.tenantId);
  assert.deepEqual(await counts(f), {appointments: 1, executions: 1});
  assert(accepted.every(item => item.value.id === repeat.id));
  assert.equal(aiResult.id, repeat.id);
  const execution = await db.actionExecution.findFirst({where: {tenantId: f.tenantId}});
  assert.equal(execution.state, 'SUCCEEDED');
  assert.equal(execution.actionClass, 'create_appointment');
  assert.equal(row.id, 'appointment-action:' + execution.id);
  results.concurrentHttpAndAi = {requests: 14, immediateAccepted: accepted.length, transientFailures: batch.length - accepted.length, appointments: 1, executions: 1, actionClass: execution.actionClass, exactCanonicalClient: true};
  const noUser = await fixture('no_user');
  const guest = await create(noUser, 'b31-guest');
  assert.equal((await db.appointment.findUnique({where: {id: guest.id}})).mayaClientId, noUser.clientA.id);
  assert.equal((await db.client.findUnique({where: {id: noUser.clientA.id}})).userId, null);
  await db.crmClientLink.create({data: {tenantId: noUser.tenantId, clientId: noUser.clientA.id, provider: 'yclients', externalId: 'guest-external'}});
  contacts.set(noUser.tenantId, [{external_id: 'guest-external', name: 'Synthetic account', phone: noUser.user.phone}]);
  const guestAi = await scoped(noUser, () => ai.createOwnAppointment(noUser.principal, {staff_id: dto.staffId, service_ids: dto.serviceIds, start: dto.start}, 'b31-ai-guest'));
  assert.equal(guestAi.id, guest.id);
  assert.deepEqual(await counts(noUser), {appointments: 1, executions: 1});
  results.clientWithoutMayaUser = 'PASS — HTTP contact and AI exact CRM binding';
  const wrong = await fixture('verified');
  await assert.rejects(() => scoped(wrong, () => service.createForClient(wrong.tenantId, f.user.id, dto)));
  await assert.rejects(() => scoped(wrong, () => service.createForClient(f.tenantId, wrong.user.id, dto)));
  assert.deepEqual(await counts(wrong), {appointments: 0, executions: 0});
  const forged = await scoped(wrong, () => service.createForClient(wrong.tenantId, wrong.user.id, {...dto, clientPhone: wrong.user.phone, clientId: wrong.clientB.id, tenantId: f.tenantId}));
  assert.equal((await db.appointment.findUnique({where: {id: forged.id}})).mayaClientId, wrong.clientA.id);
  results.wrongContext = 'denied before ingress; caller ownership ignored';
  assert.equal(providerCalls, 0);
  results.internalProviderWrites = 0;
  const external = await fixture('verified');
  await makeExternal(external);
  providerMode = 'reconciled';
  const recovered = await create(external, 'b31-external-reconcile');
  const externalRow = await db.appointment.findUnique({where: {id: recovered.id}});
  assert.equal(externalRow.mayaClientId, external.clientA.id);
  assert.equal(externalRow.tenantId, external.tenantId);
  assert.equal(providerCalls, 1);
  assert.deepEqual(await counts(external), {appointments: 1, executions: 1});
  assert.equal((await db.actionExecution.findFirst({where: {tenantId: external.tenantId}})).state, 'SUCCEEDED');
  results.crmUnknownReconciled = 'one provider dispatch; one canonical Appointment; SUCCEEDED';
  const uncertain = await fixture('verified');
  await makeExternal(uncertain);
  providerMode = 'unresolved';
  await assert.rejects(() => create(uncertain, 'b31-external-unknown'));
  await assert.rejects(() => create(uncertain, 'b31-external-unknown-repeat'));
  assert.deepEqual(await counts(uncertain), {appointments: 0, executions: 1});
  assert.equal((await db.actionExecution.findFirst({where: {tenantId: uncertain.tenantId}})).state, 'UNKNOWN');
  assert.equal(providerCalls, 2);
  results.crmUnknownNoBlindRetry = 'UNKNOWN; provider calls=1; appointments=0';
  // Every accepted alias, including a cross-initiator retry, is durable.
  assert.equal(await bindingCount(f), 14);
  const parity = await create(f,'b31-parity');
  const parityAi = await scoped(f,()=>ai.createOwnAppointment(f.principal,{staff_id:dto.staffId,service_ids:dto.serviceIds,start:dto.start},'b31-parity'));
  assert.equal(parityAi.id,parity.id);
  assert.equal(await bindingCount(f),15);
  const allBindings = await db.actionExecutionIdempotencyBinding.findMany({where:{tenantId:f.tenantId}});
  assert(allBindings.every(b=>b.clientId===f.clientA.id && b.actionExecutionId===execution.id && b.idempotencyScope==='appointments.client.create.v1'));
  assert.equal(execution.bookingIntentContract,'maya.client-appointment-create-intent/1');
  assert.match(execution.bookingIntentHash,/^[a-f0-9]{64}$/);
  results.httpAiSameKey = 'same binding / same execution / same Appointment';
  // Equivalent normalized inputs ignore phone presentation and transport extras.
  const equivalent = await create(f,'b31-repeat',{start:'2099-09-20T13:00:00+03:00',serviceIds:['svc-1','svc-1'],clientName:' Synthetic account ',clientPhone:'8'+f.user.phone.slice(2),traceId:'irrelevant',requestTimestamp:'changed'});
  assert.equal(equivalent.id,repeat.id);
  const branch = await db.branch.create({data:{tenantId:f.tenantId,name:'Synthetic branch',timezone:'Europe/Moscow'}});
  for (const [label,change] of Object.entries({time:{start:START_B},services:{serviceIds:['svc-2']},staff:{staffId:'synthetic-provider-2'},branch:{branchId:branch.id},duration:{durationMinutes:45},name:{clientName:'Changed booking name'},phone:{clientPhone:'+79998887766'},notes:{notes:'Changed booking intent'}})) {
    await assert.rejects(()=>create(f,'b31-repeat',change),conflictError,label);
    assert.deepEqual(await counts(f),{appointments:1,executions:1});
  }
  const beforeAlias = await bindingCount(f);
  assert.equal((await create(f,'b31-secondary-key')).id,repeat.id);
  await assert.rejects(()=>create(f,'b31-secondary-key',{start:START_B}),conflictError);
  assert.equal(await bindingCount(f),beforeAlias+1);
  results.secondaryAliasGap = 'K1+A / K2+A => same E1; K2+B => IDEMPOTENCY_CONFLICT';
  results.changedBusinessTerms = 'time/service/staff/branch/duration/contact/notes: conflict, no new execution/outcome';

  const otherUser = await db.user.create({data:{email:randomUUID()+'@invalid.test',phone:'+7999'+String(Math.floor(Math.random()*1e7)).padStart(7,'0'),passwordHash:'synthetic',encryptedName:encryption.encrypt('Synthetic account'),role:'client',status:'active'}});
  await db.membership.create({data:{tenantId:f.tenantId,userId:otherUser.id,role:'client',status:'active'}});
  const subject = clientChannelSubjectHash(encryption,'maya_user',otherUser.id);
  const verificationIdentityHash = hash(randomUUID());
  const ev={contract:'a18.client-channel-verification.v1',verifier:'synthetic-b31-binding',tenantId:f.tenantId,clientId:f.clientB.id,provider:'maya_user',providerSubjectHash:subject,verificationIdentityHash,channelControlProofHash:hash(otherUser.id),clientAuthorityProofHash:hash(f.clientB.id)};
  await db.clientChannelLink.create({data:{tenantId:f.tenantId,clientId:f.clientB.id,provider:'maya_user',providerSubjectHash:subject,verificationMethod:'explicit_verified_challenge',verificationIdentityHash,verificationEvidenceJson:ev,verificationEvidenceHash:hash(ev)}});
  const differentClient={...f,user:otherUser,principal:{tenantId:f.tenantId,userId:otherUser.id,role:'client'}};
  await assert.rejects(()=>create(differentClient,'b31-repeat'),conflictError);
  assert.deepEqual(await counts(f),{appointments:1,executions:1});
  results.changedCanonicalClient = 'verified Client B cannot reuse Client A key; conflict and zero new outcomes';
  const isolated=await fixture('verified');
  await assert.rejects(()=>scoped(isolated,()=>controller.createAppointment({...isolated.principal,tenantId:f.tenantId},{...dto,clientPhone:isolated.user.phone},'b31-repeat')));
  assert.deepEqual(await counts(isolated),{appointments:0,executions:0});
  assert.equal(await bindingCount(isolated),0);
  await create(isolated,'b31-repeat');
  assert.deepEqual(await counts(isolated),{appointments:1,executions:1});
  results.tenantIsolation = 'forged context denied before ingress; authorized different tenant owns an independent scoped identity';

  const sameRace=await fixture('verified');
  const sameRaceRows=await Promise.all(Array.from({length:12},()=>create(sameRace,'one-key')));
  assert.equal(new Set(sameRaceRows.map(x=>x.id)).size,1);
  assert.deepEqual(await counts(sameRace),{appointments:1,executions:1});
  assert.equal(await bindingCount(sameRace),1);
  const differentRace=await fixture('verified');
  const raceResults=await Promise.allSettled([create(differentRace,'one-key'),create(differentRace,'one-key',{start:START_B})]);
  assert.equal(raceResults.filter(x=>x.status==='fulfilled').length,1);
  assert(raceResults.some(x=>x.status==='rejected'&&conflictError(x.reason)));
  assert.deepEqual(await counts(differentRace),{appointments:1,executions:1});
  assert.equal(await bindingCount(differentRace),1);
  results.concurrentSameKey = {sameIntent:'12 requests / 1 binding / 1 execution / 1 Appointment',differentIntent:'1 accepted / 1 conflict / 1 binding / 1 execution / 1 Appointment'};

  const crash=await fixture('verified');
  const executeWithReceipt=runtime.executeWithReceipt.bind(runtime);
  runtime.executeWithReceipt=async request=>{await runtime.canonicalIngress.createExecution(request);throw Error('synthetic crash after binding commit');};
  await assert.rejects(()=>create(crash,'b31-crash-key'),/synthetic crash after binding commit/);
  runtime.executeWithReceipt=executeWithReceipt;
  assert.deepEqual(await counts(crash),{appointments:0,executions:1});
  assert.equal(await bindingCount(crash),1);
  const crashExecution=await db.actionExecution.findFirstOrThrow({where:{tenantId:crash.tenantId}});
  assert.equal(crashExecution.state,'READY');
  const child=spawnSync(process.execPath,[__filename,backend,connectionString,'--resume',crash.tenantId],{encoding:'utf8',timeout:30000});
  if(child.status!==0) throw Error('Restart proof failed: '+child.stderr);
  const resumed=JSON.parse(child.stdout.trim());
  assert.equal(resumed.executionId,crashExecution.id);
  assert.equal(resumed.state,'SUCCEEDED');
  assert.equal(resumed.providerCalls,0);
  assert.deepEqual(await counts(crash),{appointments:1,executions:1});
  assert.equal(await bindingCount(crash),1);
  results.crashRestart = 'new Node process resumed the committed binding/execution and produced its sole Appointment';
  const crossProcess=await fixture('verified');
  const fireAt=String(Date.now()+2500);
  const processes=await Promise.all(Array.from({length:2},()=>runChild(process.execPath,[__filename,backend,connectionString,'--race',crossProcess.tenantId,fireAt],{timeout:30000})));
  const outcomes=processes.map(child=>JSON.parse(child.stdout.trim()));
  assert.equal(outcomes[0].executionId,outcomes[1].executionId);
  assert.equal(outcomes[0].appointmentId,outcomes[1].appointmentId);
  assert(Math.abs(outcomes[0].invokedAt-outcomes[1].invokedAt)<100);
  assert.deepEqual(await counts(crossProcess),{appointments:1,executions:1});
  assert.equal(await bindingCount(crossProcess),1);
  results.crossProcessConcurrency='two independent Node runtimes; concurrent first requests; one binding/execution/Appointment';

  const getServices=crm.getServices;
  crm.getServices=async()=>{throw Error('synthetic catalog metadata unavailable');};
  assert.equal((await create(f,'b31-repeat')).id,repeat.id);
  crm.getServices=getServices;
  await db.user.update({where:{id:f.user.id},data:{encryptedName:encryption.encrypt('New profile display name')}});
  const frozenContact=await scoped(f,()=>ai.createOwnAppointment(f.principal,{staff_id:dto.staffId,service_ids:dto.serviceIds,start:dto.start},'b31-parity'));
  assert.equal(frozenContact.id,repeat.id);
  results.immutableDefaults='bound replay uses accepted contact/timezone; unavailable catalog labels do not change durable outcome';


  const providerCountBefore=providerCalls;
  const unknownExecution=await db.actionExecution.findFirstOrThrow({where:{tenantId:uncertain.tenantId}});
  await assert.rejects(()=>create(uncertain,'b31-external-unknown'));
  await assert.rejects(()=>create(uncertain,'b31-external-unknown',{start:START_B}),conflictError);
  assert.equal((await db.actionExecution.findFirstOrThrow({where:{tenantId:uncertain.tenantId}})).id,unknownExecution.id);
  assert.deepEqual(await counts(uncertain),{appointments:0,executions:1});
  assert.equal(providerCalls,providerCountBefore);
  const succeededAgain=await create(external,'b31-external-reconcile');
  assert.equal(succeededAgain.id,recovered.id);
  assert.equal(providerCalls,providerCountBefore);
  results.unknownImmutableIntent = 'same key => same UNKNOWN execution/reconciliation; changed key intent => conflict; no new provider operation';
  results.succeededReplay = 'same execution/outcome; no provider dispatch';
  await db.crmIntegration.update({where:{tenantId:external.tenantId},data:{settingsJson:{companyId:43}}});
  await assert.rejects(()=>create(external,'b31-external-reconcile'),conflictError);
  await makeExternal(f);
  await assert.rejects(()=>create(f,'b31-repeat'),conflictError);
  assert.equal(providerCalls,providerCountBefore);
  results.changedCalendarTarget = 'changed company or calendar source => conflict; zero provider writes';
  console.log(JSON.stringify({verdict: 'PASS', compiledHttpAiAndCanonicalExecutor: true, realActionEngine: true, realPostgresql: true, syntheticOnly: true, realProductionMutations: 0, results}, null, 2));
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
