import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../src/encryption/encryption.service';
import {
  ClientHabitsLimitError,
  normalizeClientHabit,
  serializeClientHabits,
  parseClientHabits,
  validateClientHabitsCiphertext,
} from '../src/action-engine/client-habits.policy';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_habits_v1_')
)
  throw new Error('Owned isolated B7 schema proof database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const crypto = new EncryptionService(
  new ConfigService({ CRM_ENCRYPTION_KEY: 'synthetic-habits-proof-only' }),
);
const cases: string[] = [];
function sized(bytes: number) {
  const entries = Array.from(
    { length: 12 },
    (_, i) => String(i).padStart(2, '0') + 'a'.repeat(198),
  );
  let needed =
    bytes -
    Buffer.byteLength(JSON.stringify({ version: 1, preferences: entries }));
  for (let i = 0; i < entries.length && needed > 0; i++) {
    const points = [...entries[i]];
    for (let j = 2; j < points.length && needed > 0; j++) {
      const delta = Math.min(3, needed);
      points[j] = delta === 3 ? '😀' : delta === 2 ? '€' : 'é';
      needed -= delta;
    }
    entries[i] = points.join('');
  }
  assert.equal(needed, 0);
  assert.equal(
    Buffer.byteLength(JSON.stringify({ version: 1, preferences: entries })),
    bytes,
  );
  return entries;
}
async function run() {
  assert.equal(await db.customerProfile.count(), 0);
  assert.equal(await db.client.count(), 0);
  if (process.argv.includes('--replay-only')) {
    console.log(JSON.stringify({ cleanReplay: 'PASS', backfill: 0 }));
    return;
  }
  const tenants = [randomUUID(), randomUUID()];
  for (const id of tenants)
    await db.tenant.create({
      data: { id, slug: id, name: 'Synthetic B7 only' },
    });
  const client = await db.client.create({ data: { tenantId: tenants[0] } });
  const foreign = await db.client.create({ data: { tenantId: tenants[1] } });
  const profile = await db.customerProfile.create({
    data: {
      tenantId: tenants[0],
      clientId: client.id,
      encryptedNotes: 'existing-staff-notes',
    },
  });
  assert.equal(profile.encryptedClientPreferences, null);
  assert.equal(client.userId, null);
  cases.push('nullable empty state, no backfill and Client without Maya User');
  const twelve = sized(8192),
    plain = serializeClientHabits(twelve);
  assert.equal(Buffer.byteLength(plain), 8192);
  assert.equal(twelve.length, 12);
  assert(twelve.every((x) => [...x].length === 200));
  const cipher = crypto.encrypt(plain);
  assert.equal(Buffer.byteLength(cipher), 10963);
  validateClientHabitsCiphertext(cipher);
  assert.deepEqual(parseClientHabits(crypto.decrypt(cipher)), twelve);
  await db.customerProfile.update({
    where: { id: profile.id },
    data: { encryptedClientPreferences: cipher },
  });
  cases.push(
    '12 entries, 200 code points each, 8192 plaintext bytes and 10963 persisted bytes accepted together',
  );
  for (const [label, action] of [
    ['13th entry', () => serializeClientHabits([...twelve, 'new preference'])],
    ['8193 plaintext bytes', () => serializeClientHabits(sized(8193))],
    ['201 code points', () => normalizeClientHabit('😀'.repeat(201))],
    [
      '10964 ciphertext bytes',
      () => validateClientHabitsCiphertext(cipher + 'A'),
    ],
  ] as const) {
    assert.throws(
      action,
      (e: unknown) =>
        e instanceof ClientHabitsLimitError &&
        JSON.stringify(e.getResponse()).includes(
          'CLIENT_PREFERENCES_LIMIT_EXCEEDED',
        ),
    );
    const after = await db.customerProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    assert.equal(after.encryptedClientPreferences, cipher);
    assert.equal(await db.actionTargetMutation.count(), 0);
    cases.push(label + ' rejected without changing ciphertext or generation');
  }
  assert.equal(normalizeClientHabit('😀'.repeat(200)), '😀'.repeat(200));
  cases.push(
    '200 supplementary Unicode code points accepted (not UTF-16 units)',
  );
  const before = await db.customerProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  await assert.rejects(
    db.customerProfile.update({
      where: { id: profile.id },
      data: { encryptedClientPreferences: cipher + 'A' },
    }),
  );
  assert.deepEqual(
    await db.customerProfile.findUniqueOrThrow({ where: { id: profile.id } }),
    before,
  );
  cases.push(
    'database rejects overlong persisted value atomically, preserving bytes and updatedAt',
  );
  for (const value of [
    '',
    'not-encrypted',
    'a'.repeat(16) + '.' + 'b'.repeat(22) + '.!',
  ]) {
    await assert.rejects(
      db.customerProfile.update({
        where: { id: profile.id },
        data: { encryptedClientPreferences: value },
      }),
    );
    cases.push('malformed encrypted representation rejected by database');
  }
  await assert.rejects(
    db.customerProfile.create({
      data: {
        tenantId: tenants[0],
        clientId: foreign.id,
        encryptedClientPreferences: cipher,
      },
    }),
  );
  cases.push('cross-tenant Client FK enforced');
  await assert.rejects(
    db.customerProfile.update({
      where: { id: profile.id },
      data: { clientId: null },
    }),
  );
  await assert.rejects(
    db.customerProfile.update({
      where: { id: profile.id },
      data: { clientId: foreign.id },
    }),
  );
  cases.push('established Client owner cannot be cleared or reassigned');
  const next = crypto.encrypt(
    serializeClientHabits(['explicit new preference']),
  );
  const updates = await Promise.all(
    [1, 2, 3].map(() =>
      db.customerProfile.updateMany({
        where: { id: profile.id, encryptedClientPreferences: cipher },
        data: { encryptedClientPreferences: next },
      }),
    ),
  );
  assert.equal(
    updates.reduce((n, v) => n + v.count, 0),
    1,
  );
  assert.equal(
    (await db.customerProfile.findUniqueOrThrow({ where: { id: profile.id } }))
      .encryptedClientPreferences,
    next,
  );
  cases.push('concurrent conditional commits have one winner');
  for (const value of [
    JSON.stringify({ version: 2, preferences: ['a'] }),
    JSON.stringify({ version: 1, preferences: ['a'], forged: true }),
    JSON.stringify({ version: 1, preferences: ['same', 'SAME'] }),
    JSON.stringify({ version: 1, preferences: [] }),
  ]) {
    assert.throws(() => parseClientHabits(value));
    cases.push('invalid or ambiguous plaintext envelope fails closed');
  }
  const after = await db.customerProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  assert.equal(after.encryptedNotes, 'existing-staff-notes');
  assert.equal(after.defaultVisitMood, null);
  assert.equal(after.notificationPreferencesJson, null);
  assert.equal(await db.clientConsentFact.count(), 0);
  assert.equal(await db.client.count(), 2);
  cases.push('staff notes, B5/B6, consent and Client count unchanged');
  console.log(
    JSON.stringify({
      schemaProof: 'PASS',
      passed: cases.length,
      cases,
      productionBusinessProviderMutations: 0,
      backfill: 0,
    }),
  );
}
run()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'B7 schema proof failed',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
