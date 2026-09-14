/** Isolated B31 HTTP/AI create authority proof. No production HTTP/provider calls.
 * Actual compiled controller/service/repository against synthetic PostgreSQL.
 */
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {resolve} = require('node:path');
const {createHash, randomUUID} = require('node:crypto');

const backend = resolve(process.argv[2]);
const connectionString = process.argv[3];
const req = createRequire(resolve(backend, 'package.json'));
const {PrismaClient} = req('@prisma/client');
const {PrismaPg} = req('@prisma/adapter-pg');
const {ConfigService} = req('@nestjs/config');
const {AppointmentsController} = req(
  './dist/src/appointments/appointments.controller.js',
);
const {AppointmentsService} = req(
  './dist/src/appointments/appointments.service.js',
);
const {TenantAppointmentRepository} = req(
  './dist/src/appointments/tenant-appointment.repository.js',
);
const {ClientAppointmentReadService} = req(
  './dist/src/crm/client-appointment-read.service.js',
);
const {ClientAppointmentCancelService} = req(
  './dist/src/crm/client-appointment-cancel.service.js',
);
const {ClientAppointmentRescheduleService} = req(
  './dist/src/crm/client-appointment-reschedule.service.js',
);
const {ClientChannelAuthenticatorService} = req(
  './dist/src/crm/client-channel-authenticator.service.js',
);
const {TenantContextService} = req(
  './dist/src/tenancy/tenant-context.service.js',
);
const {UsersService} = req('./dist/src/users/users.service.js');
const {AuditLogService} = req('./dist/src/audit-log/audit-log.service.js');
const {EncryptionService} = req('./dist/src/encryption/encryption.service.js');
const {clientChannelSubjectHash} = req(
  './dist/src/crm/client-channel-subject.js',
);

const url = new URL(connectionString);
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.port, /^55501$/);
assert.equal(url.pathname, '/maya_c06_b31_fg');

const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
global.fetch = async () => {
  throw Error('Live HTTP forbidden');
};

const context = new TenantContextService();
const encryption = new EncryptionService(
  new ConfigService({CRM_ENCRYPTION_KEY: 'synthetic-b31-fg'.repeat(8)}),
);
const channels = new ClientChannelAuthenticatorService(
  new ConfigService(),
  context,
  encryption,
);
const unavailable = new Proxy(
  {},
  {get: () => () => { throw Error('Unexpected dependency'); }},
);
const users = new UsersService(db, encryption, context, unavailable);
const audit = new AuditLogService(db, context);
const repository = new TenantAppointmentRepository(db, context);

let providerCalls = 0;
let actionEngineCreateCalls = 0;
let inboxRequests = 0;
const START = '2026-09-20T13:00:00';
const SERVICE = {
  id: 'svc-1',
  name: 'Synthetic cut',
  price: 1000,
  duration_minutes: 60,
  currency: 'RUB',
};

const crm = {
  getServices: async () => [SERVICE],
  getStaff: async () => [],
  getCalendarSource: async () => 'internal',
  getAvailableSlots: async () => [
    {
      start: START,
      end: '2026-09-20T14:00:00',
      staff_id: 'synthetic-provider',
      branch_id: null,
    },
  ],
  resolveStaffIdForBooking: async () => null,
  createAppointment: async () => {
    providerCalls += 1;
    throw Error('Provider calls forbidden');
  },
  executeCreateAppointmentWithReceipt: async () => {
    actionEngineCreateCalls += 1;
    throw Error('Action Engine create should not be required for this HTTP path today');
  },
};
const calendar = {
  getServiceTiming: async () => ({
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  }),
};
const tenants = {
  assertLiveBookingEnabled: async () => {},
  assertBranchBelongsToTenant: async () => {},
};
const reader = new ClientAppointmentReadService(
  db,
  context,
  channels,
  encryption,
  crm,
);
const canceler = new ClientAppointmentCancelService(
  db,
  context,
  encryption,
  crm,
);
const rescheduler = new ClientAppointmentRescheduleService(
  db,
  context,
  encryption,
  crm,
);
const service = new AppointmentsService(
  db,
  context,
  repository,
  crm,
  calendar,
  tenants,
  users,
  audit,
  {publishForTenant: async () => { inboxRequests += 1; }},
  undefined,
  reader,
  canceler,
  rescheduler,
);
const controller = new AppointmentsController(service);
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scoped = (f, fn) => context.runAsAuthPrincipal(f.principal, fn);

async function identityState(tenantId) {
  return hash(
    await Promise.all(
      [
        'client',
        'clientChannelLink',
        'customerProfile',
        'clientConsentFact',
      ].map((model) =>
        db[model].findMany({where: {tenantId}, orderBy: {id: 'asc'}}),
      ),
    ),
  );
}

async function fixture(mode) {
  const tenantId = randomUUID();
  await db.tenant.create({
    data: {
      id: tenantId,
      slug: tenantId,
      name: 'Synthetic B31 FG',
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
  const clientA = await db.client.create({data: {tenantId, userId: user.id}});
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
  const cases = [];
  for (const mode of ['missing', 'revoked', 'verified_to_other_client']) {
    const f = await fixture(mode);
    const before = await identityState(f.tenantId);
    const executionsBefore = await db.actionExecution.count({
      where: {tenantId: f.tenantId},
    });
    const appointmentsBefore = await db.appointment.count({
      where: {tenantId: f.tenantId},
    });
    const result = await scoped(f, () =>
      controller.createAppointment(
        f.principal,
        {
          staffId: 'synthetic-provider',
          serviceIds: [SERVICE.id],
          start: START,
        },
        'synthetic-b31-' + mode,
      ),
    );
    const created = await db.appointment.findMany({
      where: {tenantId: f.tenantId},
    });
    assert.equal(appointmentsBefore, 0);
    assert.equal(created.length, 1);
    assert.equal(created[0].clientId, f.user.id);
    assert.equal(created[0].mayaClientId, null);
    assert.notEqual(created[0].mayaClientId, f.clientA.id);
    assert.equal(created[0].status, 'confirmed');
    assert.equal(
      await db.actionExecution.count({where: {tenantId: f.tenantId}}),
      executionsBefore,
    );
    assert.equal(await identityState(f.tenantId), before);
    assert.equal(providerCalls, 0);
    assert.equal(actionEngineCreateCalls, 0);
    cases.push({
      mode,
      createAccepted: true,
      appointmentClientIdIsAuthenticatedUser: created[0].clientId === f.user.id,
      mayaClientId: created[0].mayaClientId,
      verifiedClientA: f.clientA.id,
      newActionExecutions: 0,
      resultId: result.id || result.appointment?.id || created[0].id,
    });
  }
  await new Promise((r) => setImmediate(r));
  console.log(
    JSON.stringify(
      {
        b31HttpCreateStillAcceptsWithoutVerifiedClient: true,
        cases,
        route: 'POST /api/appointments',
        aiPath: 'createOwnAppointment -> createForClient',
        testedCalendarSource: 'internal',
        compiledControllerServiceRepository: true,
        realPostgresql: true,
        syntheticFixturesOnly: true,
        httpAuthenticationBypassClaimed: false,
        requiresAuthenticatedTenantMemberAndBookingFeature: true,
        actionEngineCreateCalls,
        providerCalls,
        inboxRequestsIntercepted: inboxRequests,
        realProductionMutations: 0,
        realProductionPrivateReads: 0,
        limitations:
          'Does not execute external CRM creation or production HTTP. B17 channel create was not invoked.',
      },
      null,
      2,
    ),
  );
}

main()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
