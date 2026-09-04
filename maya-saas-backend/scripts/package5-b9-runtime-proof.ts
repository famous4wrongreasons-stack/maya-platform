import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { CommunicationDeliveryService } from '../src/communication-delivery';
import type { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { ClientWantedSlotService } from '../src/crm/client-wanted-slot.service';
import type { CurrentClientChannel } from '../src/crm/client-channel-authenticator.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';
import type { Package5Wave3CanonicalCutoverService } from '../src/package5-wave3/package5-wave3-canonical-cutover.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_b9_runtime_v1_')
)
  throw new Error('Owned isolated B9 runtime proof database required');

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const context = new TenantContextService();
const config = new ConfigService({
  CRM_ENCRYPTION_KEY: 'synthetic-b9-runtime-encryption-only',
  ACTION_ENGINE_IDENTITY_SECRET: 'synthetic-b9-action-identity'.repeat(3),
  ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET: 'synthetic-b9-action-payload'.repeat(
    3,
  ),
  ACTION_ENGINE_POLICY_ATTESTATION_SECRET: 'synthetic-b9-action-policy'.repeat(
    3,
  ),
  MAYA_INBOX_BRIDGE_TOKEN: 'synthetic-b9-bridge-token-long-enough',
  MAYA_PACKAGE2_TELEGRAM_EXECUTOR_URL:
    'http://127.0.0.1:1/synthetic-b9-telegram',
});
const encryption = new EncryptionService(config);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cases: string[] = [];
const channelProofs = new Map<string, CurrentClientChannel>();
const authenticator = {
  authenticate: (proof: string) => {
    const channel = channelProofs.get(proof);
    return channel
      ? Promise.resolve(channel)
      : Promise.reject(new Error('Verified channel required'));
  },
} as unknown as ClientChannelAuthenticatorService;
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
    identitySecret: 'synthetic-b9-action-identity'.repeat(3),
    payloadEncryptionSecret: 'synthetic-b9-action-payload'.repeat(3),
    policyAttestationSecret: 'synthetic-b9-action-policy'.repeat(3),
  },
);
const channelRuntime = new ClientChannelRuntimeService(
  db as unknown as PrismaService,
  context,
  authenticator,
  encryption,
  {} as Package5Wave3CanonicalCutoverService,
);
const communication = new CommunicationDeliveryService(
  db as unknown as PrismaService,
  engine.runtime,
  config,
);
const wanted = (ingress = engine.ingress) =>
  new ClientWantedSlotService(
    db as unknown as PrismaService,
    context,
    authenticator,
    channelRuntime,
    ingress,
    engine.kernel,
    encryption,
    communication,
  );
const scope = <T>(tenantId: string, work: () => T) =>
  context.runAsSystemTenant(tenantId, work);

let providerDispatches = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  providerDispatches += 1;
  return Promise.resolve(
    new Response(
      JSON.stringify({ message_id: `synthetic-${providerDispatches}` }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ),
  );
};

type Base = Awaited<ReturnType<typeof baseFixture>>;

async function baseFixture(label: string) {
  const tenantId = `b9_${label}_${randomUUID()}`;
  await db.tenant.create({
    data: {
      id: tenantId,
      slug: tenantId,
      name: `B9 ${label}`,
      status: 'active',
    },
  });
  const branch = await db.branch.create({
    data: { tenantId, name: 'B9 branch', timezone: 'Europe/Moscow' },
  });
  const staff = await db.staff.create({
    data: {
      tenantId,
      branchId: branch.id,
      encryptedDisplayName: encryption.encrypt('Synthetic staff'),
      active: true,
    },
  });
  await db.staffProviderLink.create({
    data: {
      tenantId,
      staffId: staff.id,
      provider: 'yclients',
      externalId: `staff-${label}`,
    },
  });
  return { tenantId, branch, staff, externalStaffId: `staff-${label}` };
}

async function clientFixture(base: Base, label: string, withEndpoint = true) {
  const client = await db.client.create({ data: { tenantId: base.tenantId } });
  const address = String(7_000_000_000 + channelProofs.size + 1);
  const providerSubjectHash = clientChannelSubjectHash(
    encryption,
    'telegram',
    address,
  );
  const verificationIdentityHash = digest(['verification', label, client.id]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'package5-b9-runtime-proof',
    channelControlProofHash: digest(['channel', label, client.id]),
    clientAuthorityProofHash: digest(['authority', label, client.id]),
    verificationIdentityHash,
    tenantId: base.tenantId,
    provider: 'telegram',
    providerSubjectHash,
    clientId: client.id,
  };
  const link = await db.clientChannelLink.create({
    data: {
      tenantId: base.tenantId,
      clientId: client.id,
      provider: 'telegram',
      providerSubjectHash,
      verificationMethod: 'explicit_verified_challenge',
      verificationIdentityHash,
      verificationEvidenceJson: evidence,
      verificationEvidenceHash: digest(evidence),
    },
  });
  const proof = `verified-b9-channel-${randomUUID()}`;
  channelProofs.set(proof, {
    tenantId: base.tenantId,
    provider: 'telegram',
    providerSubjectHash,
    deliveryAddress: address,
    userId: null,
    channelControlProofHash: evidence.channelControlProofHash,
    validUntil: new Date(Date.now() + 3600_000),
  });
  await db.customerProfile.create({
    data: {
      tenantId: base.tenantId,
      clientId: client.id,
      privacyConsentAt: new Date(),
    },
  });
  if (withEndpoint)
    await scope(base.tenantId, () =>
      channelRuntime.refreshDeliveryAddress(proof),
    );
  return { client, link, proof, address, providerSubjectHash };
}

const command = (base: Base, start: Date, key: string = randomUUID()) => ({
  desiredStartAt: start.toISOString(),
  externalStaffId: base.externalStaffId,
  idempotencyKey: `b9-proof:${key}`,
});

async function run() {
  const base = await baseFixture('primary');
  const a = await clientFixture(base, 'a');
  const other = await baseFixture('other');
  const foreign = await clientFixture(other, 'foreign');
  assert.deepEqual(
    await scope(base.tenantId, () =>
      channelRuntime.resolveVerifiedDeliveryEndpoint(a.client.id, a.link.id),
    ),
    {
      provider: 'telegram',
      address: a.address,
      identityRef: a.providerSubjectHash,
    },
  );
  assert.equal(
    await scope(other.tenantId, () =>
      channelRuntime.resolveVerifiedDeliveryEndpoint(a.client.id, a.link.id),
    ),
    null,
  );
  const forged = await clientFixture(base, 'forged-endpoint', false);
  assert.equal(
    await scope(base.tenantId, () =>
      channelRuntime.resolveVerifiedDeliveryEndpoint(
        forged.client.id,
        forged.link.id,
      ),
    ),
    null,
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT set_config(
        'maya.client_channel_delivery_subject_hash',
        ${forged.providerSubjectHash},
        true
      )
    `);
    await tx.clientChannelLink.update({
      where: { id: forged.link.id },
      data: { deliveryAddressEncrypted: encryption.encrypt('79999999999') },
    });
  });
  assert.equal(
    await scope(base.tenantId, () =>
      channelRuntime.resolveVerifiedDeliveryEndpoint(
        forged.client.id,
        forged.link.id,
      ),
    ),
    null,
  );
  await assert.rejects(() =>
    scope(base.tenantId, () =>
      channelRuntime.refreshDeliveryAddress('unverified-payload'),
    ),
  );
  const persistedLinks = JSON.stringify(await db.clientChannelLink.findMany());
  assert(!persistedLinks.includes(a.address));
  assert(!persistedLinks.includes(forged.address));
  cases.push(
    'correct decrypt/HMAC resolves; missing, forged, wrong-tenant and unverified endpoint paths fail closed',
  );
  const start = new Date('2040-01-01T10:00:00.000Z');
  const beforeRead = {
    clients: await db.client.count(),
    interests: await db.clientWantedSlotInterest.count(),
    executions: await db.actionExecution.count(),
  };
  assert.equal(
    (await scope(base.tenantId, () => wanted().referralRead(a.proof))).status,
    'unavailable',
  );
  assert.deepEqual(
    {
      clients: await db.client.count(),
      interests: await db.clientWantedSlotInterest.count(),
      executions: await db.actionExecution.count(),
    },
    beforeRead,
  );
  await assert.rejects(() =>
    scope(base.tenantId, () => wanted().referralRead('phone-only')),
  );
  assert.equal(await db.client.count(), beforeRead.clients);
  cases.push(
    'referral read is byte-equivalent and never creates Client/value facts',
  );

  const stable = command(base, start, 'same-command');
  const concurrent = await Promise.all(
    Array.from({ length: 4 }, () =>
      scope(base.tenantId, () => wanted().add(a.proof, stable)),
    ),
  );
  assert(
    concurrent.every((row) => row.interestId === concurrent[0].interestId),
  );
  assert.equal(
    await db.clientWantedSlotInterest.count({
      where: { tenantId: base.tenantId, clientId: a.client.id },
    }),
    1,
  );
  assert.equal(await db.clientConsentFact.count(), 0);
  cases.push(
    'verified Client concurrent retry converges to one exact-time interest and no consent',
  );

  for (const [proof, tenantId] of [
    ['unbound-channel', base.tenantId],
    ['phone-only', base.tenantId],
    [foreign.proof, base.tenantId],
  ] as const)
    await assert.rejects(() =>
      scope(tenantId, () =>
        wanted().add(
          proof,
          command(base, new Date('2040-01-02T10:00:00.000Z')),
        ),
      ),
    );
  assert.equal(await db.client.count(), beforeRead.clients);
  cases.push(
    'missing, phone-only and cross-tenant identity fail closed with no Client creation',
  );

  const crashing = Object.create(engine.ingress) as typeof engine.ingress;
  crashing.createExecution = async (request) => {
    await engine.ingress.createExecution(request);
    throw new Error('synthetic crash after durable admission');
  };
  const restart = command(
    base,
    new Date('2040-01-03T10:00:00.000Z'),
    'restart',
  );
  await assert.rejects(() =>
    scope(base.tenantId, () => wanted(crashing).add(a.proof, restart)),
  );
  const resumed = await scope(base.tenantId, () =>
    wanted().add(a.proof, restart),
  );
  assert.equal(resumed.outcome, 'created');
  cases.push(
    'failure after resolution resumes one durable command without duplicate effect',
  );

  for (let day = 4; day <= 11; day += 1)
    await scope(base.tenantId, () =>
      wanted().add(
        a.proof,
        command(
          base,
          new Date(`2040-01-${String(day).padStart(2, '0')}T10:00:00.000Z`),
          `cap-${day}`,
        ),
      ),
    );
  assert.equal(
    await db.clientWantedSlotInterest.count({
      where: {
        tenantId: base.tenantId,
        clientId: a.client.id,
        status: 'ACTIVE',
      },
    }),
    10,
  );
  await assert.rejects(() =>
    scope(base.tenantId, () =>
      wanted().add(
        a.proof,
        command(base, new Date('2040-02-01T10:00:00.000Z'), 'cap-overflow'),
      ),
    ),
  );
  assert.equal(
    await db.clientWantedSlotInterest.count({
      where: {
        tenantId: base.tenantId,
        clientId: a.client.id,
        status: 'ACTIVE',
      },
    }),
    10,
  );
  assert.equal(
    await db.actionExecution.count({
      where: {
        tenantId: base.tenantId,
        state: 'FAILED',
        finalOutcomeCode: 'client_wanted_slot_limit_exceeded',
      },
    }),
    1,
  );
  cases.push('active interests 1-10 accepted and 11th rejected atomically');

  const matchBase = await baseFixture('matching');
  const matchAt = new Date('2041-03-01T10:00:00.000Z');
  const candidates = [];
  for (let index = 0; index < 5; index += 1) {
    const candidate = await clientFixture(matchBase, `candidate-${index}`);
    const receipt = await scope(matchBase.tenantId, () =>
      wanted().add(
        candidate.proof,
        command(matchBase, matchAt, `candidate-${index}`),
      ),
    );
    candidates.push({ ...candidate, interestId: receipt.interestId });
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const ordered = await db.clientWantedSlotInterest.findMany({
    where: { id: { in: candidates.map((row) => row.interestId) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const earliest = candidates.find((row) => row.interestId === ordered[0].id)!;
  await db.customerProfile.update({
    where: {
      tenantId_clientId: {
        tenantId: matchBase.tenantId,
        clientId: earliest.client.id,
      },
    },
    data: {
      notificationPreferencesJson: {
        version: 1,
        overrides: { freed_slot: false },
      },
    },
  });
  const matched = await scope(matchBase.tenantId, () =>
    wanted().matchAvailable({
      availableStartAt: matchAt.toISOString(),
      externalStaffId: matchBase.externalStaffId,
      sourceEventId: 'synthetic-availability-event-v1',
    }),
  );
  assert.equal(matched.matched, 3);
  assert.equal(providerDispatches, 3);
  assert.equal(
    await db.clientWantedSlotInterest.count({
      where: {
        tenantId: matchBase.tenantId,
        matchedSourceEventId: 'synthetic-availability-event-v1',
      },
    }),
    3,
  );
  assert.equal(
    (
      await db.clientWantedSlotInterest.findUniqueOrThrow({
        where: { id: earliest.interestId },
      })
    ).status,
    'ACTIVE',
  );
  assert.equal(
    (
      await scope(matchBase.tenantId, () =>
        wanted().matchAvailable({
          availableStartAt: matchAt.toISOString(),
          externalStaffId: matchBase.externalStaffId,
          sourceEventId: 'synthetic-availability-event-v1',
        }),
      )
    ).matched,
    0,
  );
  assert.equal(providerDispatches, 3);
  cases.push(
    'earliest eligible ordering skips opt-out, fan-out is three, retry sends nothing twice',
  );

  const rawAddresses = candidates.map((candidate) => candidate.address);
  const actionRows = await db.actionExecution.findMany({
    where: { tenantId: matchBase.tenantId },
  });
  const campaigns = await db.marketingCampaign.findMany({
    where: { tenantId: matchBase.tenantId },
    include: { recipients: true },
  });
  const durableEvidence = JSON.stringify({ actionRows, campaigns });
  for (const raw of rawAddresses) assert(!durableEvidence.includes(raw));
  assert(
    actionRows
      .filter((row) => row.actionClass === 'send_appointment_reminder')
      .every((row) => /^[^:]+:[a-f0-9]{64}$/.test(row.targetRef)),
  );
  assert.equal(await db.clientConsentFact.count(), 0);
  cases.push(
    'delivery address never appears in durable action/campaign evidence; HMAC drives send identity',
  );

  console.log(
    JSON.stringify(
      {
        executableProof: 'PASS',
        passed: cases.length,
        cases,
        providerWrites: providerDispatches,
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
  .finally(async () => {
    globalThis.fetch = originalFetch;
    await db.$disconnect();
  });
