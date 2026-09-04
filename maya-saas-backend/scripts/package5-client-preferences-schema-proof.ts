import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_preferences_v1_')
)
  throw new Error('Owned isolated Client preference proof database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const cases: string[] = [];
async function rejects(label: string, action: () => Promise<unknown>) {
  await assert.rejects(action);
  cases.push(label);
}
async function run() {
  assert.equal(await db.customerProfile.count(), 0);
  assert.equal(await db.appointment.count(), 0);
  assert.equal(await db.clientConsentFact.count(), 0);
  if (process.argv.includes('--replay-only')) {
    console.log(JSON.stringify({ cleanReplay: 'PASS', fakeBackfill: 0 }));
    return;
  }
  const tenants = [randomUUID(), randomUUID()];
  for (const id of tenants)
    await db.tenant.create({ data: { id, slug: id, name: 'Synthetic only' } });
  const a = await db.client.create({ data: { tenantId: tenants[0] } });
  const b = await db.client.create({ data: { tenantId: tenants[0] } });
  const foreign = await db.client.create({ data: { tenantId: tenants[1] } });
  const profile = await db.customerProfile.create({
    data: { tenantId: tenants[0], clientId: a.id },
  });
  const visit = await db.appointment.create({
    data: {
      tenantId: tenants[0],
      mayaClientId: a.id,
      staffExternalId: 'synthetic',
      serviceIds: [],
      startAt: new Date('2099-01-01T10:00:00Z'),
      endAt: new Date('2099-01-01T11:00:00Z'),
      blockedStartAt: new Date('2099-01-01T10:00:00Z'),
      blockedEndAt: new Date('2099-01-01T11:00:00Z'),
    },
  });
  assert.equal(profile.defaultVisitMood, null);
  assert.equal(profile.notificationPreferencesJson, null);
  assert.equal(visit.clientVisitMood, null);
  assert.equal(a.userId, null);
  cases.push('nullable unchosen state and Client without Maya User');
  for (const value of ['green', '', 'RED']) {
    await rejects('invalid profile mood ' + JSON.stringify(value), () =>
      db.customerProfile.update({
        where: { id: profile.id },
        data: { defaultVisitMood: value },
      }),
    );
    await rejects('invalid appointment mood ' + JSON.stringify(value), () =>
      db.appointment.update({
        where: { id: visit.id },
        data: { clientVisitMood: value },
      }),
    );
  }
  await rejects('cross-tenant profile owner rejected', () =>
    db.customerProfile.create({
      data: {
        tenantId: tenants[0],
        clientId: foreign.id,
        defaultVisitMood: 'red',
      },
    }),
  );
  await rejects('cross-tenant appointment owner rejected', () =>
    db.appointment.update({
      where: { id: visit.id },
      data: { mayaClientId: foreign.id, clientVisitMood: 'red' },
    }),
  );
  await rejects('appointment preference requires canonical Client', () =>
    db.appointment.update({
      where: { id: visit.id },
      data: { mayaClientId: null, clientVisitMood: 'red' },
    }),
  );
  const invalid: unknown[] = [
    null,
    [],
    {},
    { version: 1, overrides: {} },
    { version: 2, overrides: { reminder: true } },
    { version: 1, overrides: { reminder: 'true' } },
    { version: 1, overrides: { reminder_hours: 0 } },
    { version: 1, overrides: { reminder_hours: 49 } },
    { version: 1, overrides: { reminder_hours: 1.5 } },
    { version: 1, overrides: { reminder_hours: null } },
    { version: 1, overrides: { unknown: true } },
    { version: 1, overrides: { consent: true } },
    { version: 1, overrides: { marketing_freq: 'day' } },
    { version: 1, overrides: { quiet_from: 22 } },
    { version: 1, overrides: { quiet_from: 22, quiet_to: null } },
    { version: 1, overrides: { quiet_from: 24, quiet_to: 2 } },
    { version: 1, overrides: { reminder: true }, forged: true },
  ];
  for (const [index, value] of invalid.entries())
    await rejects(
      `invalid notification envelope ${index}`,
      () =>
        db.$executeRaw`UPDATE "CustomerProfile" SET "notificationPreferencesJson" = ${JSON.stringify(value)}::jsonb WHERE id = ${profile.id}`,
    );
  for (const overrides of [
    { reminder: false },
    { reminder_hours: 1 },
    { reminder_hours: 48 },
    { quiet_from: 22, quiet_to: 7 },
    { quiet_from: null, quiet_to: null },
    { marketing: false, marketing_freq: '2weeks' },
  ])
    await db.customerProfile.update({
      where: { id: profile.id },
      data: { notificationPreferencesJson: { version: 1, overrides } },
    });
  cases.push(
    'strict approved values, disable flag, range endpoints and quiet pair accepted',
  );
  await db.$transaction([
    db.customerProfile.update({
      where: { id: profile.id },
      data: {
        defaultVisitMood: 'red',
        notificationPreferencesJson: Prisma.DbNull,
      },
    }),
    db.appointment.update({
      where: { id: visit.id },
      data: { clientVisitMood: 'red' },
    }),
  ]);
  for (const data of [
    { clientId: b.id },
    { clientId: null },
    { tenantId: tenants[1] },
  ])
    await rejects('established profile owner immutable', () =>
      db.customerProfile.update({ where: { id: profile.id }, data }),
    );
  for (const data of [
    { mayaClientId: b.id },
    { mayaClientId: null },
    { tenantId: tenants[1] },
    { id: randomUUID() },
  ])
    await rejects('established appointment preference owner immutable', () =>
      db.appointment.update({ where: { id: visit.id }, data }),
    );
  const competing = await Promise.allSettled([
    db.customerProfile.update({
      where: { id: profile.id },
      data: { defaultVisitMood: 'blue' },
    }),
    db.customerProfile.update({
      where: { id: profile.id },
      data: { clientId: b.id },
    }),
    db.appointment.update({
      where: { id: visit.id },
      data: { mayaClientId: b.id },
    }),
  ]);
  assert.deepEqual(
    competing.map((x) => x.status),
    ['fulfilled', 'rejected', 'rejected'],
  );
  assert.equal(
    (await db.appointment.findUniqueOrThrow({ where: { id: visit.id } }))
      .clientVisitMood,
    'red',
  );
  cases.push(
    'concurrent reassignment rejected; changed default preserves exact visit choice',
  );
  const before = await db.customerProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  await db.customerProfile.findMany({
    where: { tenantId: tenants[0], clientId: a.id },
  });
  assert.deepEqual(
    await db.customerProfile.findUniqueOrThrow({ where: { id: profile.id } }),
    before,
  );
  assert.equal(await db.clientConsentFact.count(), 0);
  assert.equal(await db.client.count(), 3);
  cases.push('read has no row/timestamp/consent/Client effect');
  console.log(
    JSON.stringify({
      schemaProof: 'PASS',
      passed: cases.length,
      cases,
      fakeBackfill: 0,
      productionBusinessProviderMutations: 0,
    }),
  );
}
run()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Schema proof failed',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
