/** Isolated B30 reschedule authority proof. No HTTP/provider/production calls.
 * Actual compiled controller/service/rescheduler against synthetic PostgreSQL.
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
assert.equal(url.pathname, '/maya_c06_b30_fg');

const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
global.fetch = async () => {
  throw Error('Live HTTP forbidden');
};

const context = new TenantContextService();
const encryption = new EncryptionService(
  new ConfigService({CRM_ENCRYPTION_KEY: 'synthetic-b30-fg'.repeat(8)}),
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
let actionEngineCancelCalls = 0;
let actionEngineRescheduleCalls = 0;
let crmRescheduleCalls = 0;
let inboxRequests = 0;
const NEW_START = '2026-09-20T13:00:00';
const SERVICE = {
  id: 'svc-1',
  name: 'Synthetic cut',
  price: 1000,
  currency: 'RUB',
};

const crm = {
  getServices: async () => [SERVICE],
  getStaff: async () => [],
  getAvailableSlots: async () => [
    {
      start: NEW_START,
      end: '2026-09-20T14:00:00',
      staff_id: 'synthetic-provider',
      branch_id: null,
    },
  ],
  resolveStaffIdForBooking: async () => null,
  cancelAppointment: async () => {
    providerCalls += 1;
    throw Error('Provider calls forbidden');
  },
  rescheduleAppointment: async () => {
    providerCalls += 1;
    throw Error('Provider calls forbidden');
  },
  createAppointment: async () => {
    providerCalls += 1;
    throw Error('Provider calls forbidden');
  },
  executeInternalAppointmentCancelWithReceipt: async () => {
    actionEngineCancelCalls += 1;
    throw Error('Action Engine should not run for unauthorized cancel');
  },
  executeCancelAppointmentWithReceipt: async () => {
    actionEngineCancelCalls += 1;
    throw Error('Action Engine should not run for unauthorized cancel');
  },
  executeInternalAppointmentRescheduleWithReceipt: async (
    tenantId,
    params,
    invocation,
  ) => {
    actionEngineRescheduleCalls += 1;
    await invocation.authorizationCheck?.();
    const startAt = new Date(params.start);
    const endAt = new Date(startAt.getTime() + 3600000);
    const written = await db.appointment.updateMany({
      where: {
        id: params.externalId,
        tenantId,
      },
      data: {
        startAt,
        endAt,
        blockedStartAt: startAt,
        blockedEndAt: endAt,
      },
    });
    assert.equal(written.count, 1);
    return {
      value: {
        external_id: params.externalId,
        status: 'confirmed',
        start: params.start,
      },
      execution: {state: 'SUCCEEDED', executionId: 'synthetic-b30'},
    };
  },
  executeRescheduleAppointmentWithReceipt: async () => {
    crmRescheduleCalls += 1;
    throw Error('CRM executor should not run for internal synthetic proof');
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
      name: 'Synthetic B30 FG',
      status: 'active',
      calendarSource: 'internal',
    },
  });
  const user = await db.user.create({
    data: {
      email: randomUUID() + '@invalid.test',
      passwordHash: 'synthetic',
      encryptedName: encryption.encrypt('Synthetic account'),
      role: 'client',
      status: 'active',
    },
  });
  await db.membership.create({
    data: {tenantId, userId: user.id, role: 'client', status: 'active'},
  });
  const clientA = await db.client.create({
    data: {
      tenantId,
      userId: mode === 'owned_without_user' ? null : user.id,
    },
  });
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
      verifier: 'synthetic-b30-fg',
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
        reason: 'synthetic B30 FG revocation',
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
  const startAt = new Date(Date.now() + 7 * 86400000);
  const endAt = new Date(startAt.getTime() + 3600000);
  const ownerId =
    mode === 'owned' || mode === 'owned_without_user' ? clientA.id : clientB.id;
  const appointment = await db.appointment.create({
    data: {
      tenantId,
      clientId: user.id,
      mayaClientId: ownerId,
      source: 'internal',
      staffExternalId: 'synthetic-provider',
      serviceIds: [SERVICE.id],
      startAt,
      endAt,
      blockedStartAt: startAt,
      blockedEndAt: endAt,
      status: 'confirmed',
    },
  });
  return {
    tenantId,
    user,
    clientA,
    clientB,
    appointment,
    principal: {tenantId, userId: user.id, role: 'client'},
  };
}

function errorCode(error) {
  return (
    error?.response?.error?.code ||
    error?.response?.message ||
    error?.message ||
    String(error)
  );
}

async function denyReschedule(mode) {
  const f = await fixture(mode);
  const before = await identityState(f.tenantId);
  const executionsBefore = await db.actionExecution.count({
    where: {tenantId: f.tenantId},
  });
  const startBefore = f.appointment.startAt.toISOString();
  const aeBefore = actionEngineRescheduleCalls;
  let error = null;
  try {
    await scoped(f, () =>
      controller.rescheduleAppointment(
        f.principal,
        f.appointment.id,
        {start: NEW_START},
        'synthetic-b30-' + mode,
      ),
    );
  } catch (caught) {
    error = caught;
  }
  const after = await db.appointment.findUnique({
    where: {id: f.appointment.id},
  });
  assert.ok(error, 'B30 reschedule must reject unauthorized target');
  assert.equal(after.status, 'confirmed');
  assert.equal(after.mayaClientId, f.clientB.id);
  assert.equal(after.startAt.toISOString(), startBefore);
  assert.equal(
    await db.actionExecution.count({where: {tenantId: f.tenantId}}),
    executionsBefore,
  );
  assert.equal(await identityState(f.tenantId), before);
  assert.equal(actionEngineRescheduleCalls, aeBefore);
  assert.equal(crmRescheduleCalls, 0);
  assert.equal(providerCalls, 0);
  return {
    mode,
    rescheduleAccepted: false,
    statusAfter: after.status,
    startUnchanged: true,
    error: errorCode(error),
    newActionExecutions: 0,
    actionEngineRescheduleCalls: 0,
  };
}

async function acceptOwned(mode) {
  const f = await fixture(mode);
  const executionsBefore = await db.actionExecution.count({
    where: {tenantId: f.tenantId},
  });
  const aeBefore = actionEngineRescheduleCalls;
  const result = await scoped(f, () =>
    controller.rescheduleAppointment(
      f.principal,
      f.appointment.id,
      {start: NEW_START},
      'synthetic-b30-' + mode,
    ),
  );
  assert.equal(result.ok, true);
  const after = await db.appointment.findUnique({
    where: {id: f.appointment.id},
  });
  assert.equal(after.status, 'confirmed');
  assert.equal(after.mayaClientId, f.clientA.id);
  assert.equal(after.startAt.toISOString().startsWith('2026-09-20'), true);
  assert.notEqual(after.startAt.toISOString(), f.appointment.startAt.toISOString());
  assert.equal(actionEngineRescheduleCalls, aeBefore + 1);
  assert.equal(crmRescheduleCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(
    await db.actionExecution.count({where: {tenantId: f.tenantId}}),
    executionsBefore,
  );
  return {
    mode,
    rescheduleAccepted: true,
    clientWithoutMayaUser: mode === 'owned_without_user',
    actionEngineRescheduleCalls: 1,
    newActionExecutionsFromRoute: 0,
    localAppointmentMutatedByExecutorMock: true,
  };
}

async function main() {
  const denied = [];
  for (const mode of ['missing', 'revoked', 'verified_to_other_client']) {
    denied.push(await denyReschedule(mode));
  }
  const owned = await acceptOwned('owned');
  const withoutUser = await acceptOwned('owned_without_user');
  await new Promise((r) => setImmediate(r));
  assert.equal(providerCalls, 0);
  assert.equal(actionEngineCancelCalls, 0);
  assert.equal(crmRescheduleCalls, 0);
  assert.equal(
    denied.every((item) => item.error === 'client_link_required' || item.error === 'not_found' || item.mode === 'verified_to_other_client'),
    true,
  );
  assert.equal(denied[0].error, 'client_link_required');
  assert.equal(denied[1].error, 'client_link_required');
  assert.equal(denied[2].error, 'not_found');
  console.log(
    JSON.stringify(
      {
        b30RescheduleNowRejectsUnauthorizedTarget: true,
        denied,
        owned,
        withoutUser,
        route: 'POST /api/appointments/:id/reschedule',
        testedCalendarSource: 'internal',
        compiledControllerServiceRescheduler: true,
        realPostgresql: true,
        syntheticFixturesOnly: true,
        httpAuthenticationBypassClaimed: false,
        requiresAuthenticatedTenantMemberAndVerifiedClient: true,
        actionEngineExecutionsCreatedByRoute: 0,
        actionEngineRescheduleCalls,
        providerCalls,
        inboxRequestsIntercepted: inboxRequests,
        realProductionMutations: 0,
        realProductionPrivateReads: 0,
        limitations:
          'Executor is a local synthetic Action Engine stand-in; it does not call YClients or production HTTP.',
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
