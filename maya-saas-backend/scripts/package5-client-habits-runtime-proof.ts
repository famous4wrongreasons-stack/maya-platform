import { ClientHabitsLimitError } from '../src/action-engine/client-habits.policy';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { ClientChannelLinkService } from '../src/crm/client-channel-link.service';
import {
  ClientLinkChallengeService,
  type AuthenticatedClientChannel,
  type TrustedClientResolution,
} from '../src/crm/client-link-challenge.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { ClientHabitsService } from '../src/crm/client-habits.service';
import type { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_habits_runtime_v1_')
)
  throw new Error(
    'Challenge proof requires its owned isolated PostgreSQL database',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const context = new TenantContextService();
const encryption = new EncryptionService(
  new ConfigService({
    CRM_ENCRYPTION_KEY: 'synthetic-a18-challenge-proof-only',
  }),
);
const hash = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cases: string[] = [];
const resolutions = new Map<string, TrustedClientResolution>();
const channels = new Map<string, AuthenticatedClientChannel>();
const links = new ClientChannelLinkService(db, context, {
  verifyLink: () =>
    Promise.reject(
      new Error('No standalone first-link verifier in this proof'),
    ),
  verifyRevocation: () =>
    Promise.reject(new Error('No revocation fixture requested')),
});
// These explicit synthetic authority/authentication receipts are local fixtures.
// The real token issuance, HMAC, SQL constraints and atomic consumer are exercised.
const issuer = {
  resolverId: 'synthetic-trusted-resolution.v1',
  resolve: (proof: string) =>
    resolutions.has(proof)
      ? Promise.resolve(resolutions.get(proof)!)
      : Promise.reject(new Error('No trusted exact Client resolution')),
};
const authenticator = {
  authenticate: (proof: string) =>
    channels.has(proof)
      ? Promise.resolve(channels.get(proof)!)
      : Promise.reject(new Error('No verified current channel authentication')),
};
const service = (writer = links, auth = authenticator) =>
  new ClientLinkChallengeService(db, context, encryption, writer, issuer, auth);
const scope = <T>(tenant: string, work: () => T) =>
  context.runAsSystemTenant(tenant, work);
async function rejected(work: () => Promise<unknown>, label: string) {
  await assert.rejects(work);
  cases.push(label);
}
function resolution(tenantId: string, clientId: string) {
  const proof = `synthetic-resolution-${randomUUID()}`;
  resolutions.set(proof, {
    tenantId,
    clientId,
    resolver: issuer.resolverId,
    resolutionEvidenceRef: `fixture:${randomUUID()}`,
    resolutionEvidenceHash: hash(proof),
    issuerAuthorityHash: hash(['issuer', proof]),
    validUntil: new Date(Date.now() + 3600_000),
  });
  return { resolutionProof: proof };
}
function channel(
  tenantId: string,
  name: string,
  provider: 'telegram' | 'maya_user' = 'telegram',
) {
  const proof = `synthetic-channel-${randomUUID()}`;
  channels.set(proof, {
    tenantId,
    provider,
    providerSubjectHash: hash([provider, name]),
    deliveryAddress: provider === 'telegram' ? '100000001' : name,
    channelControlProofHash: hash(proof),
    validUntil: new Date(Date.now() + 3600_000),
  });
  return proof;
}
const engine = createStandaloneCanonicalActionEngine(
  db as unknown as PrismaService,
  {
    resolveFeatureRequirements: (
      tenantId,
      features,
      evaluatedAt = new Date(),
    ) =>
      Promise.resolve({
        contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
        tenantId,
        planId: null,
        requiredFeatures: features.map((featureKey) => ({
          featureKey,
          enabled: true,
        })),
        allowed: true,
        evaluatedAt,
        validUntil: null,
      }),
  },
  {
    identitySecret: 'synthetic-client-preferences-identity'.repeat(3),
    payloadEncryptionSecret: 'synthetic-client-preferences-payload'.repeat(3),
    policyAttestationSecret: 'synthetic-client-preferences-policy'.repeat(3),
  },
);
const runtimeAuth = {
  authenticate: async (proof: string) => {
    const channel = await authenticator.authenticate(proof);
    assert.equal(channel.tenantId, context.requireTenantId());
    return { ...channel, userId: null };
  },
} as unknown as ClientChannelAuthenticatorService;
const runtime = (ingress = engine.ingress) =>
  new ClientHabitsService(
    db as unknown as PrismaService,
    context,
    runtimeAuth,
    ingress,
    engine.kernel,
    encryption,
  );
const counts = async () => [
  await db.client.count(),
  await db.customerProfile.count(),
  await db.clientConsentFact.count(),
  await db.actionExecution.count(),
  await db.actionTargetMutation.count(),
];
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
  const tenant = `habits_${randomUUID()}`,
    other = `habits_${randomUUID()}`;
  for (const id of [tenant, other])
    await db.tenant.create({
      data: { id, slug: id, name: 'Synthetic habits', status: 'active' },
    });
  async function fixture(t = tenant) {
    const client = await db.client.create({ data: { tenantId: t } });
    const proof = channel(t, randomUUID());
    const issued = await scope(t, () =>
      service().issue(resolution(t, client.id)),
    );
    await scope(t, () =>
      service().consume({ channelProof: proof, token: issued.token }),
    );
    return { client, proof };
  }
  const a = await fixture(),
    b = await fixture(),
    foreign = await fixture(other);
  const cmd = (preference: string, expectedGeneration: number) => ({
    preference,
    expectedGeneration,
    idempotencyKey: randomUUID(),
  });
  const add = (
    command: unknown,
    proof = a.proof,
    t = tenant,
    instance = runtime(),
  ) => scope(t, () => instance.add(proof, command));
  const read = (proof = a.proof, t = tenant) =>
    scope(t, () => runtime().read(proof));
  const profile = (clientId = a.client.id) =>
    db.customerProfile.findUnique({
      where: { tenantId_clientId: { tenantId: tenant, clientId } },
    });
  const start = await counts();
  assert.deepEqual((await read()).preferences, []);
  assert.equal((await add(cmd('', 0))).outcome, 'no_op');
  assert.deepEqual(await counts(), start);
  cases.push(
    'read and empty no-op do not create Client/profile/execution/generation',
  );
  for (const [proof, t, label] of [
    [channel(tenant, 'unbound'), tenant, 'missing binding'],
    ['phone-only', tenant, 'phone identity'],
    ['legacy-phone-session', tenant, 'legacy session'],
    [foreign.proof, tenant, 'cross tenant'],
  ] as const)
    await rejected(() => add(cmd('no', 0), proof, t), label);
  await rejected(
    () => add({ ...cmd('forged', 0), clientId: b.client.id }),
    'forged Client payload',
  );
  await rejected(
    () => add({ ...cmd('forged', 0), tenantId: other }),
    'forged tenant payload',
  );
  assert.deepEqual(await counts(), start);
  const original = cmd('Prefer a quiet visit', 0);
  const done = await add(original);
  assert.equal(done.targetGeneration, 1);
  assert.equal(a.client.userId, null);
  assert.deepEqual((await read()).preferences, ['Prefer a quiet visit']);
  cases.push(
    'verified guest Client without Maya User stores canonical encrypted habit',
  );
  const originalState = await profile();
  const doneCounts = await counts();
  assert.deepEqual(await add(original), done);
  assert.deepEqual(await add({ ...original, expectedGeneration: 1 }), done);
  assert.equal((await add(cmd('prefer a quiet visit', 1))).outcome, 'no_op');
  assert.deepEqual(await counts(), doneCounts);
  assert.deepEqual(await profile(), originalState);
  cases.push(
    'duplicate, restart and identical no-op preserve byte-identical ciphertext and generation',
  );
  await rejected(
    () => add({ ...original, preference: 'changed' }),
    'changed material cannot reuse identity',
  );
  const same = cmd('No scented products', 1);
  const results = await Promise.all(Array.from({ length: 4 }, () => add(same)));
  assert(
    results.every((x) => x.actionExecutionId === results[0].actionExecutionId),
  );
  assert.equal((await read()).expectedGeneration, 2);
  cases.push('four concurrent identical commands have one durable effect');
  const varied = await Promise.allSettled([
    add(cmd('Use warm water', 2)),
    add(cmd('Use cool water', 2)),
  ]);
  assert.equal(varied.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal((await read()).expectedGeneration, 3);
  cases.push('different concurrent commands at one generation have one winner');
  const crashing = Object.create(engine.ingress) as typeof engine.ingress;
  crashing.createExecution = async (request) => {
    await engine.ingress.createExecution(request);
    throw new Error('synthetic crash after admission');
  };
  const restart = cmd('Please explain the steps', 3);
  const beforeCrash = await profile();
  await rejected(
    () => add(restart, a.proof, tenant, runtime(crashing)),
    'crash before domain write',
  );
  assert.deepEqual(await profile(), beforeCrash);
  assert.equal((await add(restart)).targetGeneration, 4);
  cases.push(
    'restart resumes durable admitted child without lost or repeated effect',
  );
  const stable = await profile();
  const overflow = cmd('😀'.repeat(201), 4);
  await assert.rejects(
    () => add(overflow),
    (e) =>
      e instanceof ClientHabitsLimitError &&
      (e.getResponse() as { code: string }).code ===
        'CLIENT_PREFERENCES_LIMIT_EXCEEDED',
  );
  assert.deepEqual(await profile(), stable);
  assert.equal((await read()).expectedGeneration, 4);
  cases.push('201-code-point overflow preserves existing state and generation');
  const exact = await fixture();
  const twelve = sized(8192);
  for (let i = 0; i < 12; i++)
    assert.equal(
      (await add(cmd(twelve[i], i), exact.proof)).targetGeneration,
      i + 1,
    );
  const exactProfile = await profile(exact.client.id);
  assert(exactProfile?.encryptedClientPreferences);
  assert.equal(
    Buffer.byteLength(exactProfile.encryptedClientPreferences),
    10963,
  );
  assert.equal(
    Buffer.byteLength(
      encryption.decrypt(exactProfile.encryptedClientPreferences),
    ),
    8192,
  );
  assert.deepEqual((await read(exact.proof)).preferences, twelve);
  cases.push(
    'runtime accepts 12 entries, each 200 code points, at exact 8192/10963 byte boundaries',
  );
  await assert.rejects(
    () => add(cmd('13th', 12), exact.proof),
    ClientHabitsLimitError,
  );
  assert.deepEqual(await profile(exact.client.id), exactProfile);
  assert.equal((await read(exact.proof)).expectedGeneration, 12);
  cases.push(
    '13th entry rejected with byte-identical ciphertext and unchanged generation',
  );
  const tooLarge = await fixture();
  const over = sized(8193);
  for (let i = 0; i < 11; i++) await add(cmd(over[i], i), tooLarge.proof);
  const previous = await profile(tooLarge.client.id);
  await assert.rejects(
    () => add(cmd(over[11], 11), tooLarge.proof),
    ClientHabitsLimitError,
  );
  assert.deepEqual(await profile(tooLarge.client.id), previous);
  assert.equal((await read(tooLarge.proof)).expectedGeneration, 11);
  cases.push('8193 plaintext bytes rejected atomically before domain mutation');
  const excessiveEncryption = Object.create(encryption) as EncryptionService;
  excessiveEncryption.encrypt = () => 'A'.repeat(10964);
  const guarded = new ClientHabitsService(
    db as unknown as PrismaService,
    context,
    runtimeAuth,
    engine.ingress,
    engine.kernel,
    excessiveEncryption,
  );
  await assert.rejects(
    () => add(cmd('Cipher boundary', 4), a.proof, tenant, guarded),
    ClientHabitsLimitError,
  );
  assert.deepEqual(await profile(), stable);
  assert.equal((await read()).expectedGeneration, 4);
  cases.push(
    '10964 persisted bytes rejected and transaction leaves prior ciphertext/generation unchanged',
  );
  const rawExecution = await db.actionExecution.findUniqueOrThrow({
    where: { id: done.actionExecutionId! },
  });
  assert(!JSON.stringify(rawExecution).includes('Prefer a quiet visit'));
  assert(rawExecution.normalizedInputEncrypted);
  const successful = await db.actionExecution.findMany({
    where: { state: 'SUCCEEDED' },
  });
  assert(successful.every((x) => x.executionAttemptCount === 1));
  assert.equal(await db.actionTargetMutation.count(), successful.length);
  assert.equal(await db.clientConsentFact.count(), 0);
  assert.deepEqual((await read(b.proof)).preferences, []);
  assert.equal(await db.client.count(), 5);
  cases.push(
    'encrypted execution payload, immutable HMAC audit, no consent or hidden Client creation',
  );
  console.log(
    JSON.stringify(
      {
        executableProof: 'PASS',
        passed: cases.length,
        cases,
        productionBusinessProviderMutations: 0,
      },
      null,
      2,
    ),
  );
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
