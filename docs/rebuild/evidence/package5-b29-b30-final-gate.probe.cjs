/** Isolated B29/B30 Final Gate reproduction. No HTTP/provider/production calls.
 * Actual compiled controller/service/repository/canceler against synthetic PG.
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
const {AppointmentsController} = req('./dist/src/appointments/appointments.controller.js');
const {AppointmentsService} = req('./dist/src/appointments/appointments.service.js');
const {TenantAppointmentRepository} = req('./dist/src/appointments/tenant-appointment.repository.js');
const {ClientAppointmentReadService} = req('./dist/src/crm/client-appointment-read.service.js');
const {ClientAppointmentCancelService} = req('./dist/src/crm/client-appointment-cancel.service.js');
const {ClientChannelAuthenticatorService} = req('./dist/src/crm/client-channel-authenticator.service.js');
const {TenantContextService} = req('./dist/src/tenancy/tenant-context.service.js');
const {UsersService} = req('./dist/src/users/users.service.js');
const {AuditLogService} = req('./dist/src/audit-log/audit-log.service.js');
const {EncryptionService} = req('./dist/src/encryption/encryption.service.js');
const {clientChannelSubjectHash} = req('./dist/src/crm/client-channel-subject.js');

const url = new URL(connectionString);
assert.equal(url.hostname, '127.0.0.1');
assert.match(url.port, /^55501$/);
assert.equal(url.pathname, '/maya_c06_b29_fg');

const db = new PrismaClient({adapter: new PrismaPg({connectionString})});
global.fetch = async () => {
  throw Error('Live HTTP forbidden');
};

const context = new TenantContextService();
const encryption = new EncryptionService(
  new ConfigService({CRM_ENCRYPTION_KEY: 'synthetic-b29-fg'.repeat(8)}),
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
const canceler = new ClientAppointmentCancelService(db, context, encryption, crm);
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
);
const controller = new AppointmentsController(service);
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scoped = (f, fn) => context.runAsAuthPrincipal(f.principal, fn);

async function identityState(tenantId) {
  return hash(
    await Promise.all(
      ['client', 'clientChannelLink', 'customerProfile', 'clientConsentFact'].map(
        (model) => db[model].findMany({where: {tenantId}, orderBy: {id: 'asc'}}),
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
      name: 'Synthetic B29 FG',
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
      verifier: 'synthetic-b29-fg',
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
        reason: 'synthetic B29 FG revocation',
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
  const appointment = await db.appointment.create({
    data: {
      tenantId,
      clientId: user.id,
      mayaClientId: clientB.id,
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

async function main() {
  const cancelCases = [];
  const rescheduleCases = [];
  for (const mode of ['missing', 'revoked', 'verified_to_other_client']) {
    const f = await fixture(mode);
    const before = await identityState(f.tenantId);
    if (mode === 'verified_to_other_client') {
      const visible = await scoped(f, () =>
        controller.listMyAppointments(f.principal),
      );
      assert(Array.isArray(visible));
      assert.equal(visible.length, 0);
    } else {
      await assert.rejects(async () =>
        scoped(f, () => controller.listMyAppointments(f.principal)),
      );
    }
    assert.equal(await identityState(f.tenantId), before);
    const executionsBefore = await db.actionExecution.count({
      where: {tenantId: f.tenantId},
    });
    let cancelError = null;
    try {
      await scoped(f, () =>
        controller.cancelAppointment(
          f.principal,
          f.appointment.id,
          'synthetic-b29-' + mode,
        ),
      );
    } catch (error) {
      cancelError = error;
    }
    const afterCancel = await db.appointment.findUnique({
      where: {id: f.appointment.id},
    });
    assert.equal(afterCancel.status, 'confirmed');
    assert.equal(afterCancel.mayaClientId, f.clientB.id);
    assert.equal(
      await db.actionExecution.count({where: {tenantId: f.tenantId}}),
      executionsBefore,
    );
    assert.equal(await identityState(f.tenantId), before);
    assert.ok(cancelError, 'B29 cancel must reject unauthorized target');
    cancelCases.push({
      mode,
      cancelAccepted: false,
      statusAfter: afterCancel.status,
      error: errorCode(cancelError),
      newActionExecutions: 0,
      actionEngineCancelCalls,
    });

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
    assert.equal(after.mayaClientId, f.clientB.id);
    assert.notEqual(f.clientA.id, f.clientB.id);
    assert.equal(after.startAt.toISOString().startsWith('2026-09-20'), true);
    assert.equal(
      await db.actionExecution.count({where: {tenantId: f.tenantId}}),
      executionsBefore,
    );
    assert.equal(await identityState(f.tenantId), before);
    assert.equal(
      await db.auditLog.count({
        where: {tenantId: f.tenantId, action: 'appointment.rescheduled'},
      }),
      1,
    );
    rescheduleCases.push({
      mode,
      verifiedReaderDisclosesTarget: false,
      rescheduleAccepted: true,
      targetClientIsOtherThanVerifiedOrAccountAssociatedClient: true,
      statusAfter: after.status,
      newActionExecutions: 0,
      clientLinkProfileConsentStateUnchanged: true,
    });
  }
  await new Promise((r) => setImmediate(r));
  assert.equal(providerCalls, 0);
  assert.equal(actionEngineCancelCalls, 0);
  console.log(
    JSON.stringify(
      {
        b29CancelNowRejectsUnauthorizedTarget: true,
        b30RescheduleStillAcceptsUnauthorizedTarget: true,
        cancelCases,
        rescheduleCases,
        route: 'POST /api/appointments/:id/reschedule',
        testedCalendarSource: 'internal',
        compiledControllerServiceRepositoryCanceler: true,
        realPostgresql: true,
        syntheticFixturesOnly: true,
        httpAuthenticationBypassClaimed: false,
        requiresAuthenticatedTenantMemberAndBookingFeature: true,
        actionEngineExecutionsCreated: 0,
        providerCalls,
        inboxRequestsIntercepted: inboxRequests,
        realProductionMutations: 0,
        realProductionPrivateReads: 0,
        limitations:
          'Does not execute external CRM cancellation, rescheduling, creation, or production HTTP.',
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
