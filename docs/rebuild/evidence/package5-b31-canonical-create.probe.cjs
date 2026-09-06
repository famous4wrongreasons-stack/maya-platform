/** B31 regression: compiled HTTP/AI + canonical Client resolver + real Action
 * Engine/Prisma/PostgreSQL. Synthetic dedicated database; no live I/O. */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
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
const SERVICE = {id: 'svc-1', name: 'Synthetic cut', price: 2500, duration_minutes: 60, currency: 'RUB'};
const slots = [{start: START, end: END, staff_id: 'synthetic-provider', branch_id: null}];
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
  getServices: async () => [SERVICE], getStaff: async () => [], getAvailableSlots: async () => slots,
  resolveStaffIdForBooking: async () => null,
});
const creator = new Creator(db, context, encryption, crm);
const service = new Appointments(db, context, {}, crm, calendar, {assertLiveBookingEnabled: async () => {}}, {}, {log: async () => {}}, {publishForTenant: async () => {}}, undefined, undefined, undefined, undefined, creator);
const controller = new Controller(service);
const ai = Object.assign(Object.create(AiHandler.prototype), {appointmentsService: service});
const scoped = (f, fn) => context.runAsAuthPrincipal(f.principal, fn);
const dto = {staffId: 'synthetic-provider', serviceIds: [SERVICE.id], start: START, clientName: 'Synthetic account'};
const create = (f, key) => scoped(f, () => controller.createAppointment(f.principal, {...dto, clientPhone: f.user.phone}, key));
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
  await db.tenant.update({where: {id: external.tenantId}, data: {calendarSource: 'external'}});
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
  await db.tenant.update({where: {id: uncertain.tenantId}, data: {calendarSource: 'external'}});
  providerMode = 'unresolved';
  await assert.rejects(() => create(uncertain, 'b31-external-unknown'));
  await assert.rejects(() => create(uncertain, 'b31-external-unknown-repeat'));
  assert.deepEqual(await counts(uncertain), {appointments: 0, executions: 1});
  assert.equal((await db.actionExecution.findFirst({where: {tenantId: uncertain.tenantId}})).state, 'UNKNOWN');
  assert.equal(providerCalls, 2);
  results.crmUnknownNoBlindRetry = 'UNKNOWN; provider calls=1; appointments=0';
  console.log(JSON.stringify({verdict: 'PASS', compiledHttpAiAndCanonicalExecutor: true, realActionEngine: true, realPostgresql: true, syntheticOnly: true, realProductionMutations: 0, results}, null, 2));
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
