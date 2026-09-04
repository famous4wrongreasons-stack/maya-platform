import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from '../src/crm/client-channel-link.service';
import {
  ClientLinkChallengeService,
  type AuthenticatedClientChannel,
  type TrustedClientResolution,
} from '../src/crm/client-link-challenge.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_a18_challenge_v1_')
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
async function clock() {
  const [row] = await db.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
  );
  return row.now;
}
async function run() {
  assert.equal(await db.clientLinkChallenge.count(), 0);
  assert.equal(await db.clientChannelLink.count(), 0);
  if (process.argv.includes('--replay-only')) {
    console.log(
      JSON.stringify({
        cleanReplay: 'PASS',
        clientLinkChallenges: 0,
        clientChannelLinks: 0,
      }),
    );
    return;
  }
  const tenant = `challenge_${randomUUID()}`,
    other = `challenge_${randomUUID()}`;
  for (const id of [tenant, other])
    await db.tenant.create({
      data: { id, name: 'Synthetic challenge proof', slug: id },
    });
  const a = await db.client.create({ data: { tenantId: tenant } }),
    b = await db.client.create({ data: { tenantId: tenant } });
  const foreign = await db.client.create({ data: { tenantId: other } });
  const issue = (request: unknown, t = tenant) =>
    scope(t, () => service().issue(request));
  const consume = (token: string, channelProof: string, t = tenant) =>
    scope(t, () => service().consume({ token, channelProof }));
  const first = await issue(resolution(tenant, a.id));
  const firstRow = await db.clientLinkChallenge.findUniqueOrThrow({
    where: { id: first.challengeId },
  });
  assert.equal(
    firstRow.expiresAt.getTime() - firstRow.issuedAt.getTime(),
    600_000,
  );
  assert.equal(firstRow.policyVersion, 1);
  assert.equal(a.userId, null);
  assert.equal(Buffer.from(first.token, 'base64url').length, 32);
  assert(!JSON.stringify(firstRow).includes(first.token));
  cases.push(
    'server-issued opaque 256-bit token; HMAC-only at rest; exact TTL 600 seconds',
  );
  const guestChannel = channel(tenant, 'guest');
  const linked = await consume(first.token, guestChannel);
  assert.equal(linked.link.clientId, a.id);
  assert.equal(linked.link.verificationIdentityHash, firstRow.tokenHash);
  assert.equal(
    await db.clientChannelLink.count({
      where: { verificationIdentityHash: firstRow.tokenHash, tenantId: tenant },
    }),
    1,
  );
  assert.equal(
    (
      await db.clientLinkChallenge.findUniqueOrThrow({
        where: { id: first.challengeId },
      })
    ).consumedLinkId,
    linked.link.id,
  );
  cases.push(
    'valid guest challenge atomically creates exactly one correlated link without Maya User',
  );
  await rejected(
    () => consume(first.token, guestChannel),
    'second committed consume rejected including restarted service',
  );
  await rejected(
    () => consume(firstRow.tokenHash, guestChannel),
    'stored HMAC is not an accepted bearer',
  );
  const pwa = await issue(resolution(tenant, b.id));
  const pwaResult = await consume(
    pwa.token,
    channel(tenant, 'verified-pwa', 'maya_user'),
  );
  assert.equal(pwaResult.link.provider, 'maya_user');
  assert.equal(pwaResult.link.clientId, b.id);
  cases.push(
    'verified PWA channel plus Client-bound challenge uses the same consumer',
  );
  for (const key of [
    'clientId',
    'tenantId',
    'phone',
    'provider',
    'providerSubjectHash',
    'expiresAt',
    'policyVersion',
  ]) {
    await rejected(
      () => issue({ ...resolution(tenant, a.id), [key]: 'forged' }),
      `issuance ${key} override rejected`,
    );
    await rejected(
      () =>
        scope(tenant, () =>
          service().consume({
            token: first.token,
            channelProof: guestChannel,
            [key]: 'forged',
          }),
        ),
      `consumer ${key} override rejected`,
    );
  }
  await rejected(
    () => issue({ phone: 'synthetic-phone' }),
    'phone-only request cannot issue challenge',
  );
  await rejected(
    () => issue({ resolutionProof: 'synthetic-phone-match-only' }),
    'phone-only resolution is not accepted authority',
  );
  await rejected(
    () => issue({ resolutionProof: guestChannel }),
    'Telegram channel identity alone cannot issue challenge',
  );
  await rejected(
    () => issue({ resolutionProof: 'synthetic-ambiguous-resolution' }),
    'ambiguous resolution issues no challenge',
  );
  await rejected(
    () => issue(resolution(tenant, a.id), other),
    'forged tenant rejected at issuer boundary',
  );
  await rejected(
    () => issue(resolution(tenant, foreign.id)),
    'cross-tenant Client rejected by issuer',
  );
  const wrongTenantToken = await issue(resolution(tenant, a.id));
  await rejected(
    () =>
      consume(wrongTenantToken.token, channel(other, 'other-tenant'), other),
    'valid foreign channel cannot consume another tenant token',
  );
  await rejected(
    () => consume(wrongTenantToken.token, 'synthetic-unverified-channel'),
    'token alone without authenticated channel rejected',
  );
  const malformed = resolution(tenant, a.id);
  resolutions.get(malformed.resolutionProof)!.resolver = 'unapproved-resolver';
  await rejected(
    () => issue(malformed),
    'unapproved server resolver reference rejected',
  );
  const stale = resolution(tenant, a.id);
  resolutions.get(stale.resolutionProof)!.validUntil = new Date(0);
  await rejected(
    () => issue(stale),
    'expired resolution proof issues no challenge',
  );

  const race = await issue(resolution(tenant, a.id));
  const raceAuth = channel(tenant, 'race');
  const outcomes = await Promise.allSettled(
    Array.from({ length: 8 }, () => consume(race.token, raceAuth)),
  );
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(
    await db.clientChannelLink.count({
      where: {
        tenantId: tenant,
        providerSubjectHash: channels.get(raceAuth)!.providerSubjectHash,
      },
    }),
    1,
  );
  cases.push('eight concurrent consumes yield one winner');
  const crossRace = await issue(resolution(tenant, a.id));
  const providerRace = await Promise.allSettled([
    consume(crossRace.token, channel(tenant, 'crossrace', 'maya_user')),
    consume(crossRace.token, channel(tenant, 'crossrace', 'telegram')),
  ]);
  assert.equal(providerRace.filter((x) => x.status === 'fulfilled').length, 1);
  cases.push('one token competing across providers has one winner');
  const tokens = await Promise.all([
    issue(resolution(tenant, a.id)),
    issue(resolution(tenant, b.id)),
  ]);
  const oneSubject = channel(tenant, 'one-subject');
  const subjectRace = await Promise.allSettled(
    tokens.map((x) => consume(x.token, oneSubject)),
  );
  assert.equal(subjectRace.filter((x) => x.status === 'fulfilled').length, 1);
  cases.push('two Clients competing for one subject cannot silently rebind');
  await rejected(
    () => consume(wrongTenantToken.token, guestChannel),
    'another challenge cannot silently rebind existing subject',
  );

  // Historical dates are explicit local expiry fixtures, never production backfill.
  const rawData = async (remainingMs: number, clientId = a.id) => {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date((await clock()).getTime() + remainingMs);
    const issuedAt = new Date(expiresAt.getTime() - 600_000);
    const evidence = {
      contract: 'a18.client-link-challenge.issue.v1',
      resolver: issuer.resolverId,
      resolutionEvidenceRef: `fixture:${randomUUID()}`,
      resolutionEvidenceHash: hash(token),
      issuerAuthorityHash: hash(['issuer', token]),
      tenantId: tenant,
      clientId,
      issuedAt: issuedAt.toISOString(),
      policyVersion: 1,
    };
    const data = {
      tenantId: tenant,
      clientId,
      tokenHash: encryption.opaqueReference(
        'a18.client-link-challenge.token.v1',
        JSON.stringify([tenant, token]),
      ),
      issuedAt,
      expiresAt,
      issuanceEvidenceJson: evidence,
      issuanceEvidenceHash: hash(evidence),
    };
    return { token, data };
  };
  const expired = await rawData(-1);
  await db.clientLinkChallenge.create({ data: expired.data });
  await rejected(
    () => consume(expired.token, channel(tenant, 'expired')),
    'expired at 600-second boundary rejected',
  );
  const validRaw = await rawData(60_000);
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.clientLinkChallenge.create({ data: validRaw.data });
      throw new Error('valid fixture rollback');
    }),
    /valid fixture rollback/,
  );
  cases.push('raw negative fixture first proven otherwise valid in rollback');
  for (const delta of [-1000, 1000])
    await rejected(
      () =>
        db.clientLinkChallenge.create({
          data: {
            ...validRaw.data,
            expiresAt: new Date(validRaw.data.expiresAt.getTime() + delta),
          },
        }),
      `TTL ${600 + delta / 1000} seconds rejected by SQL`,
    );
  await rejected(
    () =>
      db.clientLinkChallenge.create({
        data: {
          ...validRaw.data,
          issuanceEvidenceJson: {
            ...validRaw.data.issuanceEvidenceJson,
            issuerAuthorityHash: null,
          },
        },
      }),
    'JSON null cannot bypass issuance evidence',
  );
  await rejected(
    () =>
      db.clientLinkChallenge.create({
        data: {
          ...validRaw.data,
          issuanceEvidenceJson: {
            ...validRaw.data.issuanceEvidenceJson,
            rawToken: validRaw.token,
          },
        },
      }),
    'raw bearer field rejected in evidence',
  );
  await rejected(
    () =>
      db.clientLinkChallenge.update({
        where: { id: first.challengeId },
        data: { clientId: b.id },
      }),
    'issued Client is immutable',
  );
  await rejected(
    () =>
      db.clientLinkChallenge.update({
        where: { id: first.challengeId },
        data: {
          consumedAt: null,
          consumedLinkId: null,
          consumedProvider: null,
          consumedSubjectHash: null,
        },
      }),
    'consumption cannot be reset',
  );
  await rejected(
    () => db.clientLinkChallenge.delete({ where: { id: first.challengeId } }),
    'unapproved challenge cleanup rejected',
  );

  const held = await db.client.create({
    data: {
      tenantId: tenant,
      crmLinks: { create: { provider: 'synthetic', externalId: 'held' } },
    },
  });
  await db.unresolvedClientIdentityHold.create({
    data: {
      tenantId: tenant,
      provider: 'synthetic',
      externalId: 'held',
      reasonCode: 'loyalty_identity_unresolved',
      sourceNamespace: 'synthetic',
      sourceEvidenceHash: hash('hold'),
      unresolvedPrincipalCount: 2,
    },
  });
  await rejected(
    () => issue(resolution(tenant, held.id)),
    'P02/P03 held Client issues no challenge',
  );

  const faultToken = await issue(resolution(tenant, a.id));
  const faultAuth = channel(tenant, 'rollback');
  const faultWriter = new ClientChannelLinkService(db, context, {
    verifyLink: () => Promise.reject(new Error('unused')),
    verifyRevocation: () => Promise.reject(new Error('unused')),
  });
  const original = faultWriter.bindChallengeInTransaction.bind(faultWriter);
  faultWriter.bindChallengeInTransaction = async (tx, proof) => {
    await original(tx, proof);
    throw new Error('injected after link before consume');
  };
  await rejected(
    () =>
      scope(tenant, () =>
        service(faultWriter).consume({
          token: faultToken.token,
          channelProof: faultAuth,
        }),
      ),
    'failure after link creation rolls back link and consumption',
  );
  assert.equal(
    await db.clientChannelLink.count({
      where: {
        providerSubjectHash: channels.get(faultAuth)!.providerSubjectHash,
      },
    }),
    0,
  );
  assert.equal(
    (
      await db.clientLinkChallenge.findUniqueOrThrow({
        where: { id: faultToken.challengeId },
      })
    ).consumedAt,
    null,
  );
  await consume(faultToken.token, faultAuth);
  cases.push('restart after rolled-back consume converges to one link');

  const wrong = await rawData(60_000);
  const wrongRow = await db.clientLinkChallenge.create({ data: wrong.data });
  await rejected(
    () =>
      scope(tenant, () =>
        db.$transaction(async (tx) => {
          const result = await links.bindChallengeInTransaction(tx, {
            tenantId: tenant,
            clientId: b.id,
            provider: 'telegram',
            providerSubjectHash: hash('client-substitution'),
            method: 'explicit_verified_challenge',
            verificationIdentityHash: wrong.data.tokenHash,
            verifier: 'synthetic-proof.v1',
            channelControlProofHash: hash('channel'),
            clientAuthorityProofHash: wrong.data.issuanceEvidenceHash,
            validUntil: wrong.data.expiresAt,
          });
          await tx.clientLinkChallenge.update({
            where: { id: wrongRow.id },
            data: {
              consumedAt: await clock(),
              consumedLinkId: result.link.id,
              consumedProvider: 'telegram',
              consumedSubjectHash: result.link.providerSubjectHash,
            },
          });
        }),
      ),
    'deferred guard rejects Client A challenge correlated to Client B link',
  );
  assert.equal(
    await db.clientChannelLink.count({
      where: { verificationIdentityHash: wrong.data.tokenHash },
    }),
    0,
  );
  assert.equal(
    (
      await db.clientLinkChallenge.findUniqueOrThrow({
        where: { id: wrongRow.id },
      })
    ).consumedAt,
    null,
  );
  cases.push('failed deferred consume guard rolls back both facts');

  const waiting = await rawData(350);
  await db.clientLinkChallenge.create({ data: waiting.data });
  const waitAuth = channel(tenant, 'expiry-wait');
  let unlockStarted!: () => void;
  const locked = new Promise<void>((resolve) => {
    unlockStarted = resolve;
  });
  const holder = db.$transaction(async (tx) => {
    await lockClientChannelIdentity(
      tx,
      tenant,
      'telegram',
      channels.get(waitAuth)!.providerSubjectHash,
    );
    unlockStarted();
    await sleep(450);
  });
  await locked;
  await rejected(
    () => consume(waiting.token, waitAuth),
    'expiry is rechecked after waiting for identity lock',
  );
  await holder;
  assert.equal(
    await db.clientChannelLink.count({
      where: { verificationIdentityHash: waiting.data.tokenHash },
    }),
    0,
  );

  const receipts = await db.clientLinkChallenge.findMany();
  const serialized = JSON.stringify(receipts);
  for (const token of [
    first.token,
    pwa.token,
    race.token,
    crossRace.token,
    faultToken.token,
  ])
    assert(!serialized.includes(token));
  const columns = await db.$queryRaw<Array<{ column_name: string }>>(
    Prisma.sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ClientLinkChallenge'`,
  );
  assert.equal(columns.length, 14);
  assert(!columns.some((x) => /^(token|rawToken|bearer)$/.test(x.column_name)));
  cases.push('exact 14-field model and no raw challenge bearer persisted');
  console.log(
    JSON.stringify(
      {
        verdict: 'PASS',
        checks: cases.length,
        cases,
        authorityFixture:
          'SYNTHETIC RESOLVER + CHANNEL AUTHENTICATOR; REAL CHALLENGE/HMAC/ATOMIC SQL IMPLEMENTATION',
        ttlSeconds: 600,
        concurrentConsumeWinners: 1,
        productionBusinessProviderMutations: 0,
        historicalProductionBackfill: 0,
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
