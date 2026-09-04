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
import { ClientPreferencesService } from '../src/crm/client-preferences.service';
import type { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_preferences_runtime_v1_')
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
  authenticate: async (proof: string) => ({
    ...(await authenticator.authenticate(proof)),
    userId: null,
  }),
} as unknown as ClientChannelAuthenticatorService;
const runtime = (ingress = engine.ingress) =>
  new ClientPreferencesService(
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
async function run() {
  const tenant = `preferences_${randomUUID()}`,
    other = `preferences_${randomUUID()}`;
  for (const id of [tenant, other])
    await db.tenant.create({
      data: {
        id,
        slug: id,
        name: 'Synthetic preferences proof',
        status: 'active',
      },
    });
  const a = await db.client.create({ data: { tenantId: tenant } }),
    b = await db.client.create({ data: { tenantId: tenant } }),
    foreign = await db.client.create({ data: { tenantId: other } });
  async function linked(t: string, clientId: string) {
    const proof = channel(t, randomUUID());
    const issued = await scope(t, () =>
      service().issue(resolution(t, clientId)),
    );
    await scope(t, () =>
      service().consume({ channelProof: proof, token: issued.token }),
    );
    return proof;
  }
  const aProof = await linked(tenant, a.id),
    bProof = await linked(tenant, b.id),
    otherProof = await linked(other, foreign.id);
  const update = (
    cmd: unknown,
    proof = aProof,
    kind: 'notifications' | 'visit_mood' = 'notifications',
    t = tenant,
    instance = runtime(),
  ) => scope(t, () => instance.update(proof, kind, cmd));
  const read = (proof = aProof, t = tenant) =>
    scope(t, () => runtime().read(proof));
  const command = (prefs: unknown, expectedGeneration: number) => ({
    prefs,
    expectedGeneration,
    idempotencyKey: randomUUID(),
  });
  const initial = await counts();
  const initialView = await read();
  assert.deepEqual(initialView.prefs, {});
  assert.equal(initialView.expectedGeneration, 0);
  assert.deepEqual(
    initialView.inheritance.reminderLeadTimesMinutes,
    [1440, 120],
  );
  assert.equal(a.userId, null);
  assert.equal((await update(command({}, 0))).outcome, 'no_op');
  assert.equal((await update(command({ reminder: true }, 0))).outcome, 'no_op');
  assert.deepEqual(await counts(), initial);
  cases.push(
    'guest Client read/empty/effective-neutral no-op creates no business or execution facts',
  );
  await db.appointmentNotificationSetting.create({
    data: { tenantId: tenant, enabled: false, leadTimesMinutes: [180] },
  });
  assert.equal(
    (await update(command({ reminder: false }, 0), bProof)).outcome,
    'no_op',
  );
  assert.equal(
    (await update(command({ reminder_hours: 3 }, 0), bProof)).outcome,
    'no_op',
  );
  assert.deepEqual(await counts(), initial);
  await db.appointmentNotificationSetting.update({
    where: { tenantId: tenant },
    data: { enabled: true, leadTimesMinutes: [1440, 120] },
  });
  cases.push(
    'matching explicit inherited policy is no-op; no hidden three-hour default',
  );
  for (const prefs of [
    { reminder_hours: 0 },
    { reminder_hours: 49 },
    { reminder_hours: '3' },
    { reminder: false, reminder_hours: 2 },
    { reminder: 'false' },
    { quiet_from: 22 },
    { clientId: b.id },
    { consent: true },
  ])
    await rejected(
      () => update(command(prefs, 0)),
      'invalid/contradictory preference patch rejected',
    );
  await rejected(
    () => update({ ...command({ reminder: false }, 0), clientId: b.id }),
    'consumer Client override rejected',
  );
  await rejected(
    () => update({ ...command({ reminder: false }, 0), phone: 'synthetic' }),
    'phone cannot authorize preference mutation',
  );
  const missing = channel(tenant, 'unlinked');
  await rejected(
    () => read(missing),
    'unlinked authenticated channel read fails closed',
  );
  await rejected(
    () => update(command({}, 0), missing),
    'unlinked no-op cannot create Client',
  );
  assert.deepEqual(await counts(), initial);
  const first = command({ reminder: false }, 0);
  const result = await update(first);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.targetGeneration, 1);
  const afterFirst = await counts();
  assert.deepEqual(await update(first), result);
  assert.deepEqual(
    await update(first, aProof, 'notifications', tenant, runtime()),
    result,
  );
  assert.deepEqual(await counts(), afterFirst);
  cases.push('duplicate and restarted executor reuse one durable result');
  assert.equal(
    (await update(command({ reminder: false }, 1))).outcome,
    'no_op',
  );
  assert.deepEqual(await counts(), afterFirst);
  await rejected(
    () => update({ ...first, prefs: { reminder: true } }),
    'changed material cannot reuse source identity',
  );
  const concurrent = command({ reminder: true, reminder_hours: 2 }, 1);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => update(concurrent)),
  );
  assert(
    results.every((x) => x.actionExecutionId === results[0].actionExecutionId),
  );
  assert.equal(await db.actionTargetMutation.count(), 2);
  cases.push('four concurrent retries produce one target generation/effect');
  const different = await Promise.allSettled([
    update(command({ reminder_hours: 4 }, 2)),
    update(command({ reminder_hours: 5 }, 2)),
  ]);
  assert.equal(different.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(different.filter((x) => x.status === 'rejected').length, 1);
  assert.equal(await db.actionTargetMutation.count(), 3);
  cases.push('different concurrent commands at one generation have one winner');
  const crashCmd = command({ marketing: false }, 3);
  const crashingIngress = Object.create(
    engine.ingress,
  ) as typeof engine.ingress;
  crashingIngress.createExecution = async (request) => {
    await engine.ingress.createExecution(request);
    throw new Error('synthetic crash after durable admission');
  };
  await rejected(
    () =>
      update(
        crashCmd,
        aProof,
        'notifications',
        tenant,
        runtime(crashingIngress),
      ),
    'crash before business mutation',
  );
  assert.equal(await db.actionTargetMutation.count(), 3);
  assert.equal((await update(crashCmd)).targetGeneration, 4);
  cases.push('restart resumes admitted command and commits one effect');
  const data = {
    tenantId: tenant,
    mayaClientId: a.id,
    staffExternalId: 'synthetic',
    serviceIds: [],
    startAt: new Date('2099-01-01T10:00:00Z'),
    endAt: new Date('2099-01-01T11:00:00Z'),
    blockedStartAt: new Date('2099-01-01T10:00:00Z'),
    blockedEndAt: new Date('2099-01-01T11:00:00Z'),
    crmProvider: 'yclients',
  };
  const visit = await db.appointment.create({
    data: { ...data, crmExternalId: 'synthetic-a' },
  });
  const nextVisit = await db.appointment.create({
    data: { ...data, crmExternalId: 'synthetic-b' },
  });
  const mood = {
    provider: 'yclients',
    recordId: 'synthetic-a',
    mood: 'red',
    expectedGeneration: 0,
    idempotencyKey: randomUUID(),
  };
  await rejected(
    () => update(mood, bProof, 'visit_mood'),
    'another Client cannot change appointment mood',
  );
  await rejected(
    () => update(mood, otherProof, 'visit_mood', other),
    'other tenant cannot change appointment mood',
  );
  await db.$executeRawUnsafe(
    `CREATE FUNCTION proof_preference_crash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic crash between profile and appointment'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER proof_preference_crash BEFORE UPDATE OF "clientVisitMood" ON "Appointment" FOR EACH ROW EXECUTE FUNCTION proof_preference_crash()`,
  );
  await rejected(
    () => update(mood, aProof, 'visit_mood'),
    'crash between profile and appointment rolls back both business writes',
  );
  assert.equal((await read()).defaultVisitMood, null);
  assert.equal(
    (await db.appointment.findUniqueOrThrow({ where: { id: visit.id } }))
      .clientVisitMood,
    null,
  );
  await db.$executeRawUnsafe(
    'DROP TRIGGER proof_preference_crash ON "Appointment"',
  );
  await db.$executeRawUnsafe('DROP FUNCTION proof_preference_crash()');
  const saved = await update(mood, aProof, 'visit_mood');
  cases.push('same admitted mood command resumes after atomic rollback');
  assert.deepEqual(await update(mood, aProof, 'visit_mood'), saved);
  const moodCounts = await counts();
  assert.equal(
    (
      await update(
        { ...mood, expectedGeneration: 1, idempotencyKey: randomUUID() },
        aProof,
        'visit_mood',
      )
    ).outcome,
    'no_op',
  );
  assert.deepEqual(await counts(), moodCounts);
  await update(
    {
      ...mood,
      recordId: 'synthetic-b',
      mood: 'blue',
      expectedGeneration: 1,
      idempotencyKey: randomUUID(),
    },
    aProof,
    'visit_mood',
  );
  assert.equal(
    (await db.appointment.findUniqueOrThrow({ where: { id: visit.id } }))
      .clientVisitMood,
    'red',
  );
  assert.equal(
    (await db.appointment.findUniqueOrThrow({ where: { id: nextVisit.id } }))
      .clientVisitMood,
    'blue',
  );
  assert.equal((await read()).defaultVisitMood, 'blue');
  cases.push(
    'exact visit choice stays independent from prospective default; retries and no-op safe',
  );
  await db.appointment.update({
    where: { id: nextVisit.id },
    data: { startAt: new Date('2000-01-01T10:00:00Z') },
  });
  await rejected(
    () =>
      update(
        {
          ...mood,
          recordId: 'synthetic-b',
          mood: 'red',
          expectedGeneration: 2,
          idempotencyKey: randomUUID(),
        },
        aProof,
        'visit_mood',
      ),
    'historical appointment mutation rejected',
  );
  await rejected(
    () =>
      update(
        {
          ...mood,
          provider: 'altegio',
          expectedGeneration: 2,
          idempotencyKey: randomUUID(),
        },
        aProof,
        'visit_mood',
      ),
    'same external id in another provider is not a target',
  );
  assert.equal(await db.clientConsentFact.count(), 0);
  assert.equal(await db.client.count(), 3);
  assert.equal(await db.customerProfile.count(), 1);
  assert.deepEqual((await read(bProof)).prefs, {});
  cases.push(
    'no consent mutation, hidden Client creation or cross-Client state',
  );
  console.log(
    JSON.stringify({
      executableProof: 'PASS',
      passed: cases.length,
      cases,
      productionBusinessProviderMutations: 0,
    }),
  );
}
run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : 'Proof failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
