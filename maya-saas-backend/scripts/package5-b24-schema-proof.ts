import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';
import { CommunicationWebPushService } from '../src/communication-delivery/communication-web-push.service';
import { CommunicationDeliveryService } from '../src/communication-delivery/communication-delivery.service';
import type {
  CommunicationWebPushTransport,
  WebPushTransportOutcome,
} from '../src/communication-delivery/communication-web-push.transport';
import assert from 'node:assert/strict';
import {
  createECDH,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { ClientWebPushService } from '../src/crm/client-web-push.service';
import { normalizeWebPushSubscription } from '../src/crm/client-web-push.policy';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55491' ||
  !url.pathname.startsWith('/maya_c06_b24_')
)
  throw new Error('Owned isolated B24 PostgreSQL database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const config = new ConfigService({
  CRM_ENCRYPTION_KEY: 'synthetic-b24-encryption'.repeat(3),
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: 'synthetic-b24-telegram',
  MAYA_INBOX_BRIDGE_TOKEN: 'synthetic-b24-bridge'.repeat(3),
});
const encryption = new EncryptionService(config);
const context = new TenantContextService();
const channels = new ClientChannelAuthenticatorService(
  config,
  context,
  encryption,
);
const service = new ClientWebPushService(
  db as unknown as PrismaService,
  context,
  channels,
  encryption,
);
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cases: string[] = [];
let subjectCounter = 8200000000;
const scope = <T>(tenantId: string, fn: () => T) =>
  context.runAsPublicTenant(tenantId, fn);

function subscription(label = randomUUID()) {
  const key = createECDH('prime256v1');
  key.generateKeys();
  return {
    endpoint: `https://push.example.invalid/subscription/${label}`,
    expirationTime: null,
    keys: {
      p256dh: key.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
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
      createHash('sha256').update('synthetic-b24-telegram').digest(),
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
        name: 'Synthetic B24',
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
    verifier: 'synthetic-b24-proof',
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
async function run() {
  assert.equal(await db.clientWebPushEndpoint.count(), 0);
  if (process.argv.includes('--replay-only')) {
    console.log(JSON.stringify({ cleanReplay: 'PASS', backfill: 0 }));
    return;
  }
  const a = await fixture();
  const b = await fixture(a.tenantId);
  const c = await fixture();
  const clientCount = await db.client.count();
  const linkCount = await db.clientChannelLink.count();
  const consentCount = await db.clientConsentFact.count();
  const sub = subscription();
  const register = (v: unknown, proof = a.proof) =>
    scope(a.tenantId, () => service.register(proof, v));
  const first = await register({ subscription: sub });
  assert.equal(first.status, 'ACTIVE');
  assert.equal(a.client.userId, null);
  cases.push(
    'real signed Telegram channel + verified Client without Maya User registers',
  );
  const before = await db.clientWebPushEndpoint.findUniqueOrThrow({
    where: { id: first.endpointId },
  });
  const retried = await Promise.all(
    Array.from({ length: 8 }, () => register({ subscription: sub })),
  );
  assert.ok(
    retried.every((r) => r.endpointId === first.endpointId && !r.changed),
  );
  assert.deepEqual(
    await db.clientWebPushEndpoint.findUnique({
      where: { id: first.endpointId },
    }),
    before,
  );
  cases.push('same Client retry/concurrent replay byte-identical, one episode');
  const saved = JSON.stringify(before);
  for (const secret of [sub.endpoint, sub.keys.p256dh, sub.keys.auth])
    assert.ok(!saved.includes(secret));
  assert.deepEqual(
    await scope(a.tenantId, () =>
      service.resolveForDelivery(a.tenantId, a.client.id, first.endpointId),
    ),
    sub,
  );
  assert.equal(
    await scope(c.tenantId, () =>
      service.resolveForDelivery(a.tenantId, a.client.id, first.endpointId),
    ),
    null,
  );
  cases.push(
    'no plaintext persistence; delivery decrypt + scoped HMAC; wrong tenant fails closed',
  );
  await assert.rejects(
    scope(a.tenantId, () => service.register(b.proof, { subscription: sub })),
  );
  await assert.rejects(
    scope(c.tenantId, () => service.register(c.proof, { subscription: sub })),
  );
  cases.push('same endpoint rejected across Clients and tenants');
  for (const bad of [
    JSON.stringify({ type: 'legacy_session', credential: 'synthetic' }),
    proofFor('999999999'),
    'not-a-proof',
  ])
    await assert.rejects(register({ subscription: subscription() }, bad));
  for (const key of ['chat_id', 'clientId', 'phone', 'tenantId'])
    await assert.rejects(
      register({ subscription: subscription(), [key]: 'forged' }),
    );
  await assert.rejects(
    scope(c.tenantId, () =>
      service.register(a.proof, { subscription: subscription() }),
    ),
  );
  cases.push(
    'legacy/missing/unlinked/forged/phone/wrong-tenant authority rejected',
  );
  for (let i = 1; i < 5; i++) await register({ subscription: subscription() });
  const capBefore = await db.clientWebPushEndpoint.findMany({
    where: { clientId: a.client.id },
    orderBy: { id: 'asc' },
  });
  await assert.rejects(register({ subscription: subscription() }));
  assert.deepEqual(
    await db.clientWebPushEndpoint.findMany({
      where: { clientId: a.client.id },
      orderBy: { id: 'asc' },
    }),
    capBefore,
  );
  cases.push(
    'active devices 1-5 accepted, sixth atomically rejected without eviction',
  );
  const racers = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      scope(b.tenantId, () =>
        service.register(b.proof, { subscription: subscription() }),
      ),
    ),
  );
  assert.equal(racers.filter((r) => r.status === 'fulfilled').length, 5);
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: b.client.id, endedAt: null },
    }),
    5,
  );
  cases.push('12 concurrent registrations cannot exceed five active endpoints');
  await assert.rejects(
    scope(a.tenantId, () =>
      service.unsubscribe(b.proof, { endpointId: first.endpointId }),
    ),
  );
  await assert.rejects(
    scope(c.tenantId, () =>
      service.unsubscribe(c.proof, { endpointId: first.endpointId }),
    ),
  );
  const end = await scope(a.tenantId, () =>
    service.unsubscribe(a.proof, { endpointId: first.endpointId }),
  );
  assert.equal(end.status, 'INACTIVE');
  assert.equal(
    (
      await scope(a.tenantId, () =>
        service.unsubscribe(a.proof, { endpointId: first.endpointId }),
      )
    ).changed,
    false,
  );
  assert.equal(
    await scope(a.tenantId, () =>
      service.resolveForDelivery(a.tenantId, a.client.id, first.endpointId),
    ),
    null,
  );
  await register({ subscription: subscription() });
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: a.client.id, endedAt: null },
    }),
    5,
  );
  cases.push(
    'unsubscribe exact owner only; repeat safe; inactive frees capacity and cannot deliver',
  );
  const victim = await db.clientWebPushEndpoint.findFirstOrThrow({
    where: { clientId: a.client.id, endedAt: null },
  });
  const replacementSub = subscription();
  const replacement = await register({
    subscription: replacementSub,
    expectedEndpointId: victim.id,
  });
  assert.equal(
    (
      await db.clientWebPushEndpoint.findUniqueOrThrow({
        where: { id: victim.id },
      })
    ).endReason,
    'REPLACED',
  );
  assert.equal(
    (
      await register({
        subscription: replacementSub,
        expectedEndpointId: victim.id,
      })
    ).endpointId,
    replacement.endpointId,
  );
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: a.client.id, endedAt: null },
    }),
    5,
  );
  await assert.rejects(
    register({ subscription: subscription(), expectedEndpointId: victim.id }),
  );
  cases.push(
    'explicit replacement atomic at cap; durable retry; stale replacement rejected',
  );
  await assert.rejects(
    db.clientWebPushEndpoint.update({
      where: { id: replacement.endpointId },
      data: { clientId: b.client.id },
    }),
  );
  await assert.rejects(
    db.clientWebPushEndpoint.update({
      where: { id: replacement.endpointId },
      data: { subscriptionEncrypted: JSON.stringify(sub) },
    }),
  );
  await assert.rejects(
    db.clientWebPushEndpoint.delete({ where: { id: replacement.endpointId } }),
  );
  await assert.rejects(
    scope(a.tenantId, () =>
      service.invalidateAfterDelivery(
        a.tenantId,
        a.client.id,
        replacement.endpointId,
        'unproven-unknown-attempt',
      ),
    ),
  );
  cases.push(
    'SQL ownership/ciphertext/history guards; unproven UNKNOWN cannot invalidate',
  );
  const registrationIdentityHash = hash('direct-forged');
  const { id: _id, ...copied } = before;
  void _id;
  await assert.rejects(
    db.clientWebPushEndpoint.create({
      data: {
        ...copied,
        id: randomUUID(),
        endpointHash: hash('forged-endpoint'),
        registrationIdentityHash,
        registrationEvidenceJson: {
          ...(before.registrationEvidenceJson as object),
          registrationIdentityHash,
        },
        terminationEvidenceJson: undefined,
      },
    }),
  );
  cases.push(
    'direct insert without transaction verified Client binding rejected',
  );
  const revocationIdentityHash = hash(['revoke', c.link.id]);
  const revocationEvidence = {
    contract: 'a18.client-channel-revocation.v1',
    revocationIdentityHash,
    tenantId: c.tenantId,
    linkId: c.link.id,
    actorProofHash: hash('owner'),
    reason: 'synthetic explicit revoke',
  };
  await db.clientChannelLink.update({
    where: { id: c.link.id },
    data: {
      revokedAt: new Date(),
      revocationIdentityHash,
      revocationEvidenceJson: revocationEvidence,
      revocationEvidenceHash: hash(revocationEvidence),
    },
  });
  await assert.rejects(
    scope(c.tenantId, () =>
      service.register(c.proof, { subscription: subscription() }),
    ),
  );
  cases.push('revoked ClientChannelLink cannot register');
  const invalid = subscription();
  assert.throws(() =>
    normalizeWebPushSubscription({
      ...invalid,
      endpoint: 'http://127.0.0.1/private',
    }),
  );
  assert.throws(() =>
    normalizeWebPushSubscription({
      ...invalid,
      keys: { ...invalid.keys, auth: 'invalid' },
    }),
  );
  assert.throws(() =>
    normalizeWebPushSubscription({ ...invalid, clientId: 'forged' }),
  );
  assert.throws(() =>
    normalizeWebPushSubscription({
      ...invalid,
      endpoint: 'https://push.example.invalid/' + 'a'.repeat(4096),
    }),
  );
  cases.push('strict encrypted-material input limits and key validation');
  assert.equal(await db.client.count(), clientCount);
  assert.equal(await db.clientChannelLink.count(), linkCount);
  assert.equal(await db.clientConsentFact.count(), consentCount);
  cases.push('no hidden Client/link/consent creation or historical backfill');
  await deliveryProof();
  console.log(
    JSON.stringify(
      {
        schemaAndRegistryProof: 'PASS',
        cases,
        total: cases.length,
        productionMutations: 0,
      },
      null,
      2,
    ),
  );
}
async function deliveryProof() {
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
      identitySecret: 'synthetic-b24-encryption'.repeat(3),
      payloadEncryptionSecret: 'synthetic-b24-encryption'.repeat(3),
      policyAttestationSecret: 'synthetic-b24-policy'.repeat(3),
    },
  );
  let sends = 0;
  let outcome: WebPushTransportOutcome = 'SUCCEEDED';
  const transport = {
    ready: () => true,
    accepts: () => true,
    send: () => {
      sends++;
      return Promise.resolve(outcome);
    },
  } as unknown as CommunicationWebPushTransport;
  const delivery = new CommunicationWebPushService(
    db as unknown as PrismaService,
    context,
    engine.runtime,
    engine.kernel,
    service,
    encryption,
    transport,
    config,
  );
  const d = await fixture();
  await db.customerProfile.create({
    data: {
      tenantId: d.tenantId,
      clientId: d.client.id,
      privacyConsentAt: new Date(),
    },
  });
  const ids: string[] = [];
  for (let i = 0; i < 5; i++)
    ids.push(
      (
        await scope(d.tenantId, () =>
          service.register(d.proof, { subscription: subscription() }),
        )
      ).endpointId,
    );
  const input = {
    tenantId: d.tenantId,
    clientId: d.client.id,
    sourceEventId: 'synthetic-b24-intent-1',
    messageType: 'appointment_reminder' as const,
    title: 'Synthetic reminder',
    bodyText: 'Synthetic canonical communication',
    expiresAt: new Date(Date.now() + 3600000),
  };
  const receipt = await scope(d.tenantId, () => delivery['deliver'](input));
  assert.equal(sends, 5);
  assert.equal('accepted' in receipt ? receipt.accepted : 0, 5);
  const campaigns = await db.marketingCampaign.count({
    where: { tenantId: d.tenantId, channel: 'web_push' },
  });
  assert.equal(campaigns, 1);
  await scope(d.tenantId, () => delivery['deliver'](input));
  assert.equal(sends, 5);
  assert.equal(
    await db.marketingCampaign.count({
      where: { tenantId: d.tenantId, channel: 'web_push' },
    }),
    1,
  );
  cases.push(
    'five device outcomes belong to one canonical communication; replay dispatches zero',
  );
  const persisted = JSON.stringify(
    await db.actionExecution.findMany({ where: { tenantId: d.tenantId } }),
  );
  assert.ok(!persisted.includes('push.example.invalid'));
  cases.push(
    'ActionExecution evidence contains no endpoint/plaintext delivery credentials',
  );
  await db.customerProfile.update({
    where: {
      tenantId_clientId: { tenantId: d.tenantId, clientId: d.client.id },
    },
    data: {
      notificationPreferencesJson: {
        version: 1,
        overrides: { reminder: false },
      },
    },
  });
  await assert.rejects(
    scope(d.tenantId, () =>
      delivery['deliver']({ ...input, sourceEventId: 'synthetic-disabled' }),
    ),
  );
  assert.equal(sends, 5);
  cases.push('current canonical preference prevents delivery');
  await db.customerProfile.update({
    where: {
      tenantId_clientId: { tenantId: d.tenantId, clientId: d.client.id },
    },
    data: { notificationPreferencesJson: Prisma.DbNull },
  });
  outcome = 'DETERMINISTIC_FAILED';
  await scope(d.tenantId, () =>
    delivery['deliver']({ ...input, sourceEventId: 'synthetic-rejected' }),
  );
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: d.client.id, endedAt: null },
    }),
    5,
  );
  cases.push('deterministic temporary/auth rejection does not revoke endpoint');
  outcome = 'UNKNOWN';
  const unknownInput = { ...input, sourceEventId: 'synthetic-unknown' };
  await assert.rejects(
    scope(d.tenantId, () => delivery['deliver'](unknownInput)),
  );
  const afterUnknown = sends;
  await assert.rejects(
    scope(d.tenantId, () => delivery['deliver'](unknownInput)),
  );
  assert.equal(sends, afterUnknown);
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: d.client.id, endedAt: null },
    }),
    5,
  );
  cases.push('UNKNOWN durable, no blind retry and no revocation');
  const unknownRow = await db.marketingDeliveryAttempt.findFirstOrThrow({
    where: { tenantId: d.tenantId, outcomeCode: 'web_push_dispatch_uncertain' },
  });
  await assert.rejects(
    scope(d.tenantId, () =>
      service.invalidateAfterDelivery(
        d.tenantId,
        d.client.id,
        ids[0],
        unknownRow.id,
      ),
    ),
  );
  cases.push('UNKNOWN attempt cannot forge permanent endpoint invalidation');
  outcome = 'PERMANENT_ENDPOINT_INVALID';
  await scope(d.tenantId, () =>
    delivery['deliver']({ ...input, sourceEventId: 'synthetic-permanent' }),
  );
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: d.client.id, endedAt: null },
    }),
    0,
  );
  assert.equal(
    await db.clientWebPushEndpoint.count({
      where: { clientId: d.client.id, endReason: 'PERMANENT_ENDPOINT_INVALID' },
    }),
    5,
  );
  const invalidAttempt = await db.marketingDeliveryAttempt.findFirstOrThrow({
    where: { tenantId: d.tenantId, outcomeCode: 'web_push_endpoint_invalid' },
    include: { recipient: true },
  });
  const exactId = invalidAttempt.recipient!.eligibilityEvidenceRef!.replace(
    'web-push-endpoint:',
    '',
  );
  const wrongId = ids.find((id) => id !== exactId)!;
  await assert.rejects(
    scope(d.tenantId, () =>
      service.invalidateAfterDelivery(
        d.tenantId,
        d.client.id,
        wrongId,
        invalidAttempt.id,
      ),
    ),
  );
  assert.equal(
    (
      await scope(d.tenantId, () =>
        service.invalidateAfterDelivery(
          d.tenantId,
          d.client.id,
          exactId,
          invalidAttempt.id,
        ),
      )
    ).changed,
    false,
  );
  cases.push(
    'permanent provider result terminates exact episode only; repeated finalization safe',
  );
  const beforeNone = sends;
  assert.equal(
    (
      await scope(d.tenantId, () =>
        delivery['deliver']({
          ...input,
          sourceEventId: 'synthetic-no-endpoint',
        }),
      )
    ).status,
    'NO_ELIGIBLE_ENDPOINT',
  );
  assert.equal(sends, beforeNone);
  cases.push('inactive/missing endpoints do not deliver');
  const x = await fixture();
  await db.customerProfile.create({
    data: {
      tenantId: x.tenantId,
      clientId: x.client.id,
      privacyConsentAt: new Date(),
    },
  });
  await scope(x.tenantId, () =>
    service.register(x.proof, { subscription: subscription() }),
  );
  const primary = new CommunicationDeliveryService(
    db as unknown as PrismaService,
    engine.runtime,
    config,
    delivery,
  );
  const originalFetch = globalThis.fetch;
  let primarySends = 0;
  globalThis.fetch = () => {
    primarySends++;
    return Promise.resolve(
      new Response(JSON.stringify({ message_id: 'synthetic-provider-ack' }), {
        status: 200,
      }),
    );
  };
  outcome = 'SUCCEEDED';
  const beforePrimary = sends;
  const primaryInput = {
    tenantId: x.tenantId,
    telegramChatId: '10009999',
    recipientIdentityRef: x.link.providerSubjectHash,
    messageType: 'appointment_reminder' as const,
    sourceType: 'legacy_bridge' as const,
    sourceEventId: 'synthetic-approved-client-intent',
    title: 'Synthetic reminder',
    bodyText: 'Synthetic body',
  };
  try {
    await scope(x.tenantId, () =>
      primary.deliverPackage2Telegram(primaryInput),
    );
    assert.equal(sends, beforePrimary + 1);
    await scope(x.tenantId, () =>
      primary.deliverPackage2Telegram(primaryInput),
    );
    assert.equal(sends, beforePrimary + 1);
    assert.equal(primarySends, 1);
    await scope(x.tenantId, () =>
      primary.deliverPackage2Telegram({
        ...primaryInput,
        sourceEventId: 'synthetic-no-canonical-identity',
        recipientIdentityRef: undefined,
      }),
    );
    assert.equal(sends, beforePrimary + 1);
    await scope(x.tenantId, () =>
      primary.deliverPackage2Telegram({
        ...primaryInput,
        sourceEventId: 'synthetic-stale-wanted-slot',
        messageType: 'wanted_slot_available',
      }),
    );
    assert.equal(sends, beforePrimary + 1);
    cases.push(
      'real canonical communication wiring dispatches verified Client push once; raw identity and non-actionable wanted slot do not send',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  const concurrentInput = {
    ...input,
    tenantId: x.tenantId,
    clientId: x.client.id,
    sourceEventId: 'synthetic-concurrent-communication',
  };
  const beforeConcurrent = sends;
  await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      scope(x.tenantId, () => delivery['deliver'](concurrentInput)),
    ),
  );
  assert.equal(sends, beforeConcurrent + 1);
  cases.push(
    'concurrent canonical communication attempts produce one logical device outcome',
  );
}

run()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
