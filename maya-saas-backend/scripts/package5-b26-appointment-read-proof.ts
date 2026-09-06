import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ClientAppointmentReadService } from '../src/crm/client-appointment-read.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { EncryptionService } from '../src/encryption/encryption.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { AppointmentsController } from '../src/appointments/appointments.controller';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55494' ||
  url.pathname !== '/maya_c06_b26_owned'
)
  throw new Error('Owned isolated B26 database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const config = new ConfigService({
  CRM_ENCRYPTION_KEY: 'synthetic-b26-encryption'.repeat(3),
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: 'synthetic-b26-telegram',
});
const encryption = new EncryptionService(config);
const context = new TenantContextService();
const channels = new ClientChannelAuthenticatorService(
  config,
  context,
  encryption,
);
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
let subjectCounter = 8300000000;
const cases: string[] = [];
const providerState = {
  records: [{ id: 'unmatched-remote-record', status: 'confirmed' }],
  writes: 0,
  clientRecordLookups: 0,
};
let catalogFailure = false;
const crm = {
  getServices: () =>
    catalogFailure
      ? Promise.reject(new Error('synthetic catalog unavailable'))
      : Promise.resolve([]),
  getStaff: () =>
    catalogFailure
      ? Promise.reject(new Error('synthetic catalog unavailable'))
      : Promise.resolve([]),
  getClientAppointments: () => {
    providerState.clientRecordLookups++;
    throw new Error('Forbidden phone CRM lookup');
  },
};
const reader = new ClientAppointmentReadService(
  db as never,
  context,
  channels,
  encryption,
  crm as never,
);
const appointments = new AppointmentsService(
  db as never,
  context,
  {} as never,
  crm as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  undefined,
  reader,
);
const controller = new AppointmentsController(appointments);
const scope = <T>(tenantId: string, fn: () => T) =>
  context.runAsPublicTenant(tenantId, fn);
async function state() {
  return hash(
    await Promise.all([
      db.appointment.findMany({ orderBy: { id: 'asc' } }),
      db.client.findMany({ orderBy: { id: 'asc' } }),
      db.clientChannelLink.findMany({ orderBy: { id: 'asc' } }),
      db.clientConsentFact.findMany({ orderBy: { id: 'asc' } }),
      db.customerProfile.findMany({ orderBy: { id: 'asc' } }),
      db.user.findMany({ orderBy: { id: 'asc' } }),
      db.membership.findMany({ orderBy: { id: 'asc' } }),
      Promise.resolve(providerState),
    ]),
  );
}
async function unchanged(name: string, fn: () => Promise<unknown>) {
  const before = await state();
  await fn();
  assert.equal(
    await state(),
    before,
    name + ': business/provider state changed',
  );
  cases.push(name);
}
function proofFor(subject: string) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    id: subject,
  };
  const material = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const signed = {
    ...fields,
    hash: createHmac(
      'sha256',
      createHash('sha256').update('synthetic-b26-telegram').digest(),
    )
      .update(material)
      .digest('hex'),
  };
  return JSON.stringify({
    type: 'telegram_widget',
    credential: JSON.stringify(signed),
  });
}
async function fixture(tenantId?: string) {
  if (!tenantId) {
    tenantId = randomUUID();
    await db.tenant.create({
      data: {
        id: tenantId,
        slug: tenantId,
        name: 'Synthetic B26',
        status: 'active',
      },
    });
  }
  const client = await db.client.create({ data: { tenantId } });
  const subject = String(++subjectCounter);
  const providerSubjectHash = clientChannelSubjectHash(
    encryption,
    'telegram',
    subject,
  );
  const verificationIdentityHash = hash(['link', client.id]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'synthetic-b26-proof',
    channelControlProofHash: hash(['channel', subject]),
    clientAuthorityProofHash: hash(['client', client.id]),
    verificationIdentityHash,
    tenantId,
    provider: 'telegram',
    providerSubjectHash,
    clientId: client.id,
  };
  const link = await db.clientChannelLink.create({
    data: {
      tenantId,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: hash(evidence),
    },
  });

  return { tenantId, client, link, proof: proofFor(subject) };
}

async function appointment(
  f: Awaited<ReturnType<typeof fixture>>,
  minutes = 120,
) {
  const startAt = new Date(Date.now() + minutes * 60000),
    endAt = new Date(startAt.getTime() + 3600000);
  return db.appointment.create({
    data: {
      tenantId: f.tenantId,
      mayaClientId: f.client.id,
      staffExternalId: 'synthetic-staff',
      serviceIds: [],
      startAt,
      endAt,
      blockedStartAt: startAt,
      blockedEndAt: endAt,
      totalPriceKopecks: 12345,
      notes: 'synthetic own note',
    },
  });
}
async function account(f: Awaited<ReturnType<typeof fixture>>, linked = true) {
  const user = await db.user.create({
    data: {
      tenantId: null,
      email: randomUUID() + '@invalid.test',
      passwordHash: 'synthetic',
      role: 'client',
      phone: '+79990000000',
    },
  });
  await db.membership.create({
    data: { tenantId: f.tenantId, userId: user.id, role: 'client' },
  });
  if (linked) {
    const providerSubjectHash = clientChannelSubjectHash(
      encryption,
      'maya_user',
      user.id,
    );
    const verificationIdentityHash = hash(['account', user.id]);
    const evidence = {
      contract: 'a18.client-channel-verification.v1',
      verifier: 'synthetic-b26',
      tenantId: f.tenantId,
      clientId: f.client.id,
      provider: 'maya_user',
      providerSubjectHash,
      verificationIdentityHash,
      channelControlProofHash: hash(user.id),
      clientAuthorityProofHash: hash(f.client.id),
    };
    await db.clientChannelLink.create({
      data: {
        tenantId: f.tenantId,
        clientId: f.client.id,
        provider: 'maya_user',
        providerSubjectHash,
        verificationMethod: 'explicit_verified_challenge',
        verificationIdentityHash,
        verificationEvidenceJson: evidence,
        verificationEvidenceHash: hash(evidence),
      },
    });
  }
  return user;
}
const get = (tenantId: string, userId: string) =>
  context.runAsAuthPrincipal({ tenantId, userId, role: 'client' }, () =>
    controller.listMyAppointments({
      tenantId,
      userId,
      role: 'client',
    } as never),
  );
async function revoke(link: Awaited<ReturnType<typeof fixture>>['link']) {
  const revocationIdentityHash = hash(['revoke', link.id]);
  const evidence = {
    contract: 'a18.client-channel-revocation.v1',
    revocationIdentityHash,
    tenantId: link.tenantId,
    linkId: link.id,
    actorProofHash: hash('synthetic-owner'),
    reason: 'synthetic-proof',
  };
  await db.clientChannelLink.update({
    where: { id: link.id },
    data: {
      revokedAt: new Date(),
      revocationIdentityHash,
      revocationEvidenceJson: evidence,
      revocationEvidenceHash: hash(evidence),
    },
  });
}

async function main() {
  const a = await fixture(),
    b = await fixture(a.tenantId),
    otherTenant = await fixture();
  const ap = await appointment(a),
    bp = await appointment(b),
    cp = await appointment(otherTenant);
  await db.client.updateMany({
    where: { id: { in: [a.client.id, b.client.id] } },
    data: { phoneHash: hash('shared-synthetic-phone') },
  });
  const userA = await account(a),
    userB = await account(b),
    unlinkedUser = await account(a, false);
  await unchanged(
    'verified channel Client without Maya User reads only own canonical Appointment',
    async () => {
      assert.equal(a.client.userId, null);
      const rows = await scope(a.tenantId, () => reader.forChannel(a.proof));
      assert.deepEqual(
        rows.map((x) => x.id),
        [ap.id],
      );
      assert.equal(rows[0].total_price, 123.45);
    },
  );
  await unchanged(
    'real GET controller account route requires verified durable binding; duplicate phones irrelevant',
    async () => {
      assert.deepEqual(
        (await get(a.tenantId, userA.id)).map((x) => x.id),
        [ap.id],
      );
      assert.deepEqual(
        (await get(b.tenantId, userB.id)).map((x) => x.id),
        [bp.id],
      );
      assert.equal(userA.phone, userB.phone);
    },
  );
  await unchanged('missing binding/account phone alone rejected', () =>
    assert.rejects(get(a.tenantId, unlinkedUser.id)),
  );
  await unchanged('missing channel binding rejected', () =>
    assert.rejects(
      scope(a.tenantId, () => reader.forChannel(proofFor('8399999999'))),
    ),
  );
  for (const [key, value] of [
    ['phone', '+79990000000'],
    ['chat_id', '8300000001'],
    ['clientId', b.client.id],
  ]) {
    await unchanged('forged ' + key + ' in channel proof rejected', () =>
      assert.rejects(
        scope(a.tenantId, () =>
          reader.forChannel(
            JSON.stringify({ ...JSON.parse(a.proof), [key]: value }),
          ),
        ),
      ),
    );
  }
  await unchanged(
    'forged account/Client identifiers conflict with authenticated context',
    () =>
      assert.rejects(async () =>
        context.runAsAuthPrincipal(
          { tenantId: a.tenantId, userId: userA.id, role: 'client' },
          () => reader.forAccount(a.tenantId, userB.id),
        ),
      ),
  );
  await unchanged('cross-tenant channel cannot select appointments', () =>
    assert.rejects(
      scope(otherTenant.tenantId, () => reader.forChannel(a.proof)),
    ),
  );
  await unchanged('cross-tenant account cannot select appointments', () =>
    assert.rejects(get(otherTenant.tenantId, userA.id)),
  );
  await unchanged(
    'another Client/tenant appointment never projected',
    async () => {
      const rows = await scope(a.tenantId, () => reader.forChannel(a.proof));
      assert(!rows.some((x) => x.id === bp.id || x.id === cp.id));
    },
  );
  await unchanged(
    '20 concurrent GETs and repeated reads leave all rows unchanged',
    async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => get(a.tenantId, userA.id)),
      );
      for (const rows of results)
        assert.deepEqual(
          rows.map((x) => x.id),
          [ap.id],
        );
    },
  );
  const empty = await fixture(a.tenantId);
  await unchanged(
    'missing local Appointment and unmatched remote record do not trigger materialization',
    async () => {
      assert.deepEqual(
        await scope(empty.tenantId, () => reader.forChannel(empty.proof)),
        [],
      );
      assert.equal(providerState.clientRecordLookups, 0);
    },
  );
  await db.appointment.update({
    where: { id: ap.id },
    data: { status: 'cancelled' },
  });
  await unchanged(
    'stale canonical state is returned without remote refresh',
    async () => {
      assert.equal((await get(a.tenantId, userA.id))[0].status, 'cancelled');
      assert.equal(providerState.records[0].status, 'confirmed');
    },
  );
  catalogFailure = true;
  await unchanged(
    'public catalog/provider read failure preserves canonical rows and state',
    async () => {
      const rows = await get(a.tenantId, userA.id);
      assert.equal(rows[0].id, ap.id);
      assert.equal(rows[0].total_price, 123.45);
      assert.deepEqual(rows[0].services, []);
    },
  );
  catalogFailure = false;
  const ambiguous = await fixture(a.tenantId);
  await db.crmClientLink.create({
    data: {
      tenantId: a.tenantId,
      clientId: ambiguous.client.id,
      provider: 'yclients',
      externalId: 'ambiguous-synthetic-client',
    },
  });
  await db.unresolvedClientIdentityHold.create({
    data: {
      tenantId: a.tenantId,
      provider: 'yclients',
      externalId: 'ambiguous-synthetic-client',
      reasonCode: 'loyalty_identity_unresolved',
      sourceNamespace: 'synthetic-b26',
      sourceEvidenceHash: hash('hold'),
      unresolvedPrincipalCount: 2,
    },
  });
  await unchanged('ambiguous canonical Client fails closed', () =>
    assert.rejects(scope(a.tenantId, () => reader.forChannel(ambiguous.proof))),
  );
  const guarded = new ClientAppointmentReadService(
    db as never,
    context,
    {
      authenticate: async (_proof: string, tx: PrismaClient) => {
        await tx.appointment.update({
          where: { id: ap.id },
          data: { notes: 'forbidden' },
        });
        return {} as never;
      },
    } as never,
    encryption,
    crm as never,
  );
  await unchanged(
    'PostgreSQL read-only transaction rejects a future helper business write',
    () => assert.rejects(scope(a.tenantId, () => guarded.forChannel(a.proof))),
  );
  await revoke(a.link);
  await unchanged('revoked link returns no private projection', () =>
    assert.rejects(scope(a.tenantId, () => reader.forChannel(a.proof))),
  );
  const summary = {
    contract: 'package5-b26-readonly-proof.v1',
    verdict: 'PASS',
    cases,
    readScenariosWithByteEquivalentBusinessAndProviderState: cases.length,
    productionMutations: 0,
    providerWrites: 0,
    clientRecordLookups: providerState.clientRecordLookups,
    newSchema: false,
  };
  writeFileSync(
    '/tmp/maya-b26-implementation/executable-proof.json',
    JSON.stringify(summary, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}
void main().finally(() => db.$disconnect());
