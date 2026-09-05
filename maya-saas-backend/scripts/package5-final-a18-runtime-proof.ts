import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { ClientChannelRuntimeService } from '../src/crm/client-channel-runtime.service';
import { ClientChannelLinkService } from '../src/crm/client-channel-link.service';
import { ClientLinkChallengeService } from '../src/crm/client-link-challenge.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
  type Package5Wave3ProviderGateway,
} from '../src/package5-wave3/package5-wave3.service';
import { Package5Wave3CanonicalCutoverService } from '../src/package5-wave3/package5-wave3-canonical-cutover.service';
import type { Package5Wave3ProductionGatewayService } from '../src/package5-wave3/package5-wave3-production-gateway.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CrmService } from '../src/crm/crm.service';
import { FEATURE_REQUIREMENT_DECISION_CONTRACT } from '../src/entitlements/entitlements.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_a18_challenge_v1_')
)
  throw new Error('Owned isolated proof DB required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const prisma = db as unknown as PrismaService;
const context = new TenantContextService();
const config = new ConfigService({
  CRM_ENCRYPTION_KEY: 'synthetic-a18-runtime-encryption',
  JWT_SECRET: 'synthetic-a18-runtime-jwt-secret',
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: '12345:synthetic-proof-only',
});
const encryption = new EncryptionService(config);
const auth = new ClientChannelAuthenticatorService(config, context, encryption);
const provider = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('No provider calls allowed');
    },
  },
) as Package5Wave3ProviderGateway;
const engine = createStandaloneCanonicalActionEngine(
  prisma,
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
    identitySecret: 'synthetic-a18-runtime-engine-identity'.repeat(3),
    payloadEncryptionSecret: 'synthetic-a18-runtime-payload'.repeat(3),
    policyAttestationSecret: 'synthetic-a18-runtime-policy'.repeat(3),
  },
);
const planner = new Package5Wave3ShadowService(
  engine.runtime,
  prisma,
  context,
  engine.kernel,
  provider,
);
const executor = new Package5Wave3ExecutableService(
  db,
  engine.ingress,
  engine.kernel,
  engine.runtime,
  planner,
  provider,
);
const facade = new Package5Wave3CanonicalCutoverService(
  planner,
  executor,
  context,
  prisma,
  encryption,
  {} as CrmService,
  provider as Package5Wave3ProductionGatewayService,
);
const runtime = () =>
  new ClientChannelRuntimeService(
    prisma,
    context,
    auth,
    encryption,
    facade,
    {} as CrmService,
  );
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const results: string[] = [];
const scope = <T>(tenant: string, work: () => T) =>
  context.runAsSystemTenant(tenant, work);
async function rejects(label: string, work: () => Promise<unknown>) {
  await assert.rejects(work);
  results.push(label);
}
function telegram(id: string, authDate = Math.floor(Date.now() / 1000)) {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    user: JSON.stringify({ id: Number(id) }),
    query_id: `synthetic-${id}`,
  };
  const material = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const key = createHmac('sha256', 'WebAppData')
    .update(config.get<string>('MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN')!)
    .digest();
  fields.hash = createHmac('sha256', key).update(material).digest('hex');
  return JSON.stringify({
    type: 'telegram_init_data',
    credential: new URLSearchParams(fields).toString(),
  });
}
async function run() {
  const tenant = `a18_runtime_${randomUUID()}`,
    other = `a18_runtime_${randomUUID()}`;
  for (const id of [tenant, other])
    await db.tenant.create({
      data: { id, name: 'Synthetic runtime proof', slug: id, status: 'active' },
    });
  const client = await db.client.create({ data: { tenantId: tenant } });
  const wrongClient = await db.client.create({ data: { tenantId: tenant } });
  const proof = telegram('10001');
  await rejects('unbound Telegram cannot issue Client challenge', () =>
    scope(tenant, () => runtime().issue(proof)),
  );
  await rejects('unbound Telegram cannot consent', () =>
    scope(tenant, () =>
      runtime().submitConsent(proof, {
        privacy: true,
        marketing: false,
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  // Trusted exact Client resolution is an explicit synthetic precondition, not a phone/user heuristic.
  const fixtureIssuer = {
    resolverId: 'synthetic-trusted-client-resolution.v1',
    resolve: (receipt: string) => {
      assert.equal(receipt, 'synthetic-trusted-resolution-receipt');
      return Promise.resolve({
        tenantId: tenant,
        clientId: client.id,
        resolver: 'synthetic-trusted-client-resolution.v1',
        resolutionEvidenceRef: 'fixture:verified-exact-client',
        resolutionEvidenceHash: hash('fixture-client-authority'),
        issuerAuthorityHash: hash('fixture-issuer'),
        validUntil: new Date(Date.now() + 3600000),
      });
    },
  };
  const links = new ClientChannelLinkService(db, context, {
    verifyLink: () => Promise.reject(new Error('No direct first link')),
    verifyRevocation: () => Promise.reject(new Error('No rebind')),
  });
  const challengeService = new ClientLinkChallengeService(
    db,
    context,
    encryption,
    links,
    fixtureIssuer,
    auth,
  );
  const challenge = await scope(tenant, () =>
    challengeService.issue({
      resolutionProof: 'synthetic-trusted-resolution-receipt',
    }),
  );
  const linked = await scope(tenant, () =>
    runtime().consume(proof, challenge.token),
  );
  assert.equal(linked.link.clientId, client.id);
  assert.equal(
    (await db.client.findUniqueOrThrow({ where: { id: client.id } })).userId,
    null,
  );
  results.push(
    'real signed Telegram proof + valid challenge links Client without Maya User',
  );
  await rejects('replay rejected', () =>
    scope(tenant, () => runtime().consume(proof, challenge.token)),
  );
  const request = {
    privacy: true,
    marketing: false,
    idempotencyKey: randomUUID(),
  };
  const first = await scope(tenant, () =>
    runtime().submitConsent(proof, request),
  );
  const retry = await scope(tenant, () =>
    runtime().submitConsent(proof, request),
  );
  assert.deepEqual(first, retry);
  assert.equal(
    await db.clientConsentFact.count({ where: { tenantId: tenant } }),
    2,
  );
  assert.equal(
    await db.clientConsentFact.count({
      where: { tenantId: tenant, actorUserId: { not: null } },
    }),
    0,
  );
  results.push(
    'canonical guest consent success; retry/restart yields same two facts without fake User',
  );
  const original = await db.clientConsentFact.findMany({
    where: { tenantId: tenant },
    orderBy: { id: 'asc' },
  });
  const readBefore = await db.actionExecution.count();
  const state = await scope(tenant, () => runtime().status(proof));
  assert.deepEqual(state, {
    linked: true,
    privacy: true,
    marketing: false,
    marketing_decided: true,
    client_link_required: false,
  });
  assert.equal(await db.actionExecution.count(), readBefore);
  results.push('status read creates no execution or consent mutation');
  for (const extra of [
    { clientId: wrongClient.id },
    { userId: 'forged' },
    { tenantId: other },
    { phone: '+0000000' },
    { occurredAt: '2000-01-01' },
  ])
    await rejects(`consumer cannot override ${Object.keys(extra)[0]}`, () =>
      scope(tenant, () =>
        runtime().submitConsent(proof, { ...request, ...extra }),
      ),
    );
  await rejects('cross-tenant signed Telegram cannot select Client', () =>
    scope(other, () => runtime().submitConsent(proof, request)),
  );
  await rejects('forged signed Telegram rejected', () =>
    scope(tenant, () =>
      runtime().submitConsent(proof.replace('10001', '10002'), request),
    ),
  );
  await rejects('expired Telegram proof rejected', () =>
    scope(tenant, () =>
      runtime().submitConsent(
        telegram('10001', Math.floor(Date.now() / 1000) - 86401),
        request,
      ),
    ),
  );
  await rejects('future Telegram proof rejected', () =>
    scope(tenant, () =>
      runtime().submitConsent(
        telegram('10001', Math.floor(Date.now() / 1000) + 100),
        request,
      ),
    ),
  );
  const raceRequest = {
    privacy: false,
    marketing: true,
    idempotencyKey: randomUUID(),
  };
  const race = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      scope(tenant, () => runtime().submitConsent(proof, raceRequest)),
    ),
  );
  assert(race.some((result) => result.status === 'fulfilled'));
  await scope(tenant, () => runtime().submitConsent(proof, raceRequest));
  assert.equal(
    await db.clientConsentFact.count({ where: { tenantId: tenant } }),
    4,
  );
  for (const fact of original)
    assert.deepEqual(
      await db.clientConsentFact.findUniqueOrThrow({ where: { id: fact.id } }),
      fact,
    );
  results.push(
    'concurrent duplicate command has one outcome; revoke/new consent preserves original facts',
  );
  const readBaseline = await db.clientConsentFact.count({
    where: { tenantId: tenant },
  });
  const delivery = await scope(tenant, () =>
    runtime().telegramDeliveryConsent('10001'),
  );
  assert.equal(delivery.privacy, false);
  assert.equal(delivery.marketing, true);
  assert.equal(delivery.marketing_decided, true);
  assert.equal(
    (await scope(other, () => runtime().telegramDeliveryConsent('10001')))
      .marketing,
    false,
  );
  assert.equal(
    (await scope(tenant, () => runtime().telegramDeliveryConsent('999999')))
      .privacy,
    false,
  );
  assert.equal(
    await db.clientConsentFact.count({ where: { tenantId: tenant } }),
    readBaseline,
  );
  results.push(
    'tenant-qualified delivery reader observes canonical revocation and creates no facts or bindings',
  );
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@proof.invalid`,
      passwordHash: 'synthetic',
      role: 'client',
      tenantId: tenant,
      memberships: {
        create: { tenantId: tenant, role: 'client', status: 'active' },
      },
    },
  });
  const session = await db.authSession.create({
    data: {
      tenantId: tenant,
      userId: user.id,
      deviceLabel: 'synthetic',
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') }).sign(
    { user_id: user.id, tenant_id: tenant, session_id: session.id },
    { expiresIn: 3600 },
  );
  const pwa = JSON.stringify({ type: 'maya_jwt', credential: jwt });
  await db.client.update({
    where: { id: wrongClient.id },
    data: { userId: user.id },
  });
  await rejects('bare Client.userId does not issue first challenge', () =>
    scope(tenant, () => runtime().issue(pwa)),
  );
  await rejects('bare Client.userId does not authorize canonical consent', () =>
    scope(tenant, () =>
      facade.recordClientConsent(
        tenant,
        user.id,
        wrongClient.id,
        'privacy',
        true,
        new Date(),
        randomUUID(),
      ),
    ),
  );
  const pwaChallenge = await scope(tenant, () => runtime().issue(proof));
  const pwaLink = await scope(tenant, () =>
    runtime().consume(pwa, pwaChallenge.token),
  );
  assert.equal(pwaLink.link.clientId, client.id);
  await scope(tenant, () =>
    runtime().submitConsent(pwa, {
      privacy: true,
      marketing: false,
      idempotencyKey: randomUUID(),
    }),
  );
  assert.equal(
    (await db.client.findUniqueOrThrow({ where: { id: client.id } })).userId,
    null,
  );
  results.push(
    'verified channel can issue exact Client challenge; PWA consumes and consents without heuristic Client reassignment',
  );
  await db.authSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
  await rejects('revoked Maya session cannot consent', () =>
    scope(tenant, () => runtime().submitConsent(pwa, request)),
  );
  const expired = await scope(tenant, () => runtime().issue(proof));
  await rejects('phone-only payload cannot consume', () =>
    scope(tenant, () =>
      runtime().consume(
        JSON.stringify({ type: 'phone', credential: '+0000000' }),
        expired.token,
      ),
    ),
  );
  assert.equal(await db.clientChannelLink.count(), 2);
  console.log(
    JSON.stringify(
      {
        verdict: 'PASS',
        cases: results.length,
        results,
        providerWrites: 0,
        productionMutations: 0,
      },
      null,
      2,
    ),
  );
}
run()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : 'proof failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
