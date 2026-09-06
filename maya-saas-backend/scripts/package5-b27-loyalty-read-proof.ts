import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { ClientLoyaltyReadService } from '../src/crm/client-loyalty-read.service';
import { ClientChannelAuthenticatorService } from '../src/crm/client-channel-authenticator.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { EncryptionService } from '../src/encryption/encryption.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { LoyaltyService } from '../src/loyalty/loyalty.service';
import { LoyaltyController } from '../src/loyalty/loyalty.controller';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55496' ||
  url.pathname !== '/maya_c06_b27_owned'
)
  throw new Error('Owned isolated B27 database required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const config = new ConfigService({
  CRM_ENCRYPTION_KEY: 'synthetic-b27-encryption'.repeat(3),
  MAYA_CLIENT_CHANNEL_TELEGRAM_BOT_TOKEN: 'synthetic-b27-telegram',
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
let subjectCounter = 8400000000;
const cases: string[] = [];
const providerState = {
  cards: [
    { id: '101', balance: 640 },
    { id: '202', balance: 123 },
  ],
  writes: 0,
  privateReads: 0,
};
let catalogFailure = false;
const crm = {
  getServices: () =>
    catalogFailure
      ? Promise.reject(new Error('synthetic CRM unavailable'))
      : Promise.resolve([]),
  getClientLoyaltyEvidenceReadOnly: () => {
    providerState.privateReads++;
    throw new Error('Forbidden phone CRM lookup');
  },
};
const reader = new ClientLoyaltyReadService(
  db as never,
  context,
  channels,
  encryption,
);
const loyalty = new LoyaltyService(
  db as never,
  context,
  {} as never,
  crm as never,
  encryption,
  {} as never,
  {} as never,
  reader,
);
const controller = new LoyaltyController(loyalty);
const scope = <T>(tenantId: string, fn: () => T) =>
  context.runAsPublicTenant(tenantId, fn);
async function state() {
  return hash(
    await Promise.all([
      db.loyaltyAccount.findMany({ orderBy: { id: 'asc' } }),
      db.loyaltyTransaction.findMany({ orderBy: { id: 'asc' } }),
      db.client.findMany({ orderBy: { id: 'asc' } }),
      db.crmClientLink.findMany({ orderBy: { id: 'asc' } }),
      db.clientChannelLink.findMany({ orderBy: { id: 'asc' } }),
      db.clientConsentFact.findMany({ orderBy: { id: 'asc' } }),
      db.user.findMany({ orderBy: { id: 'asc' } }),
      db.membership.findMany({ orderBy: { id: 'asc' } }),
      db.actionExecution.findMany({ orderBy: { id: 'asc' } }),
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
      createHash('sha256').update('synthetic-b27-telegram').digest(),
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
        name: 'Synthetic B27',
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
    verifier: 'synthetic-b27-proof',
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
      verifier: 'synthetic-b27',
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

const get = (tenantId: string, userId: string) =>
  context.runAsAuthPrincipal({ tenantId, userId, role: 'client' }, () =>
    controller.getMine({ tenantId, userId, role: 'client' } as never),
  );
const history = (tenantId: string, userId: string) =>
  context.runAsAuthPrincipal({ tenantId, userId, role: 'client' }, () =>
    controller.listMine({ tenantId, userId, role: 'client' } as never),
  );
async function loyaltyAccount(
  f: Awaited<ReturnType<typeof fixture>>,
  balance: number,
) {
  return db.loyaltyAccount.create({
    data: {
      tenantId: f.tenantId,
      clientId: f.client.id,
      userId: null,
      source: 'internal',
      balance,
    },
  });
}
async function main() {
  const a = await fixture(),
    b = await fixture(a.tenantId),
    missing = await fixture(a.tenantId),
    other = await fixture();
  const aa = await loyaltyAccount(a, 640),
    ba = await loyaltyAccount(b, 123);
  await loyaltyAccount(other, 999);
  const ledgerA = await db.loyaltyTransaction.create({
    data: {
      tenantId: a.tenantId,
      accountId: aa.id,
      kind: 'credit',
      delta: 640,
      balanceAfter: 640,
      encryptedReason: encryption.encrypt('synthetic A fact'),
      idempotencyKey: randomUUID(),
    },
  });
  await db.loyaltyTransaction.create({
    data: {
      tenantId: b.tenantId,
      accountId: ba.id,
      kind: 'credit',
      delta: 123,
      balanceAfter: 123,
      encryptedReason: encryption.encrypt('synthetic B fact'),
      idempotencyKey: randomUUID(),
    },
  });
  const ua = await account(a),
    ub = await account(b),
    um = await account(missing),
    unlinked = await account(a, false);
  await db.client.updateMany({
    where: { id: { in: [a.client.id, b.client.id] } },
    data: { phoneHash: hash('same-phone') },
  });
  await unchanged(
    'verified internal Client existing state, real GET controller',
    async () => {
      assert.equal((await get(a.tenantId, ua.id)).balance, 640);
    },
  );
  await unchanged(
    'internal no-account has explicit read-only not-established outcome',
    () =>
      assert.rejects(get(missing.tenantId, um.id), (e: unknown) =>
        JSON.stringify(
          (e as { getResponse(): unknown }).getResponse(),
        ).includes('loyalty_account_not_established'),
      ),
  );
  await unchanged(
    'Client without Maya User via signed channel proof',
    async () => {
      assert.equal(a.client.userId, null);
      assert.equal(
        (await scope(a.tenantId, () => reader.forChannel(a.proof))).balance,
        640,
      );
    },
  );
  await db.crmIntegration.create({
    data: {
      tenantId: a.tenantId,
      provider: 'yclients',
      status: 'active',
      encryptedApiToken: 'synthetic-never-used',
    },
  });
  await db.crmClientLink.createMany({
    data: [
      {
        tenantId: a.tenantId,
        clientId: a.client.id,
        provider: 'yclients',
        externalId: '101',
      },
      {
        tenantId: a.tenantId,
        clientId: b.client.id,
        provider: 'yclients',
        externalId: '202',
      },
    ],
  });
  await unchanged(
    'duplicate phones and different exact CRM Clients disclose own canonical balance only',
    async () => {
      assert.equal(ua.phone, ub.phone);
      assert.equal((await get(a.tenantId, ua.id)).account_id, aa.id);
      assert.equal((await get(a.tenantId, ua.id)).balance, 640);
      assert.equal((await get(b.tenantId, ub.id)).account_id, ba.id);
      assert.equal((await get(b.tenantId, ub.id)).balance, 123);
    },
  );
  await db.crmClientLink.create({
    data: {
      tenantId: a.tenantId,
      clientId: a.client.id,
      provider: 'yclients',
      externalId: '103',
    },
  });
  await unchanged(
    'multiple CRM links do not select a provider card or replace Client account',
    async () => {
      assert.equal((await get(a.tenantId, ua.id)).balance, 640);
      assert.equal(providerState.privateReads, 0);
    },
  );
  await unchanged(
    'CRM read failure cannot fall back to a phone/card/legacy account',
    async () => {
      catalogFailure = true;
      assert.equal((await get(a.tenantId, ua.id)).balance, 640);
      catalogFailure = false;
    },
  );
  await unchanged('missing link and phone-only account rejected', () =>
    assert.rejects(get(a.tenantId, unlinked.id)),
  );
  await unchanged('missing channel link rejected', () =>
    assert.rejects(
      scope(a.tenantId, () => reader.forChannel(proofFor('8499999999'))),
    ),
  );
  for (const [key, value] of [
    ['phone', '+79990000000'],
    ['chat_id', '8400000001'],
    ['clientId', b.client.id],
  ]) {
    await unchanged('forged ' + key + ' rejected', () =>
      assert.rejects(
        scope(a.tenantId, () =>
          reader.forChannel(
            JSON.stringify({ ...JSON.parse(a.proof), [key]: value }),
          ),
        ),
      ),
    );
  }
  await unchanged('forged signed Telegram subject rejected', async () => {
    const proof = JSON.parse(a.proof) as { type: string; credential: string };
    const credential = JSON.parse(proof.credential) as Record<string, string>;
    credential.id = '8400000002';
    proof.credential = JSON.stringify(credential);
    await assert.rejects(
      scope(a.tenantId, () => reader.forChannel(JSON.stringify(proof))),
    );
  });
  await unchanged(
    'wrong tenant channel rejected without existence/value disclosure',
    () =>
      assert.rejects(scope(other.tenantId, () => reader.forChannel(a.proof))),
  );
  await unchanged('forged account target rejected', () =>
    assert.rejects(
      context.runAsAuthPrincipal(
        { tenantId: a.tenantId, userId: ua.id, role: 'client' },
        () => loyalty.getForUser(a.tenantId, ub.id),
      ),
    ),
  );
  await unchanged(
    'forged canonical Client target rejected before value query',
    () =>
      assert.rejects(
        context.runAsAuthPrincipal(
          { tenantId: a.tenantId, userId: ua.id, role: 'client' },
          () => loyalty.getStateForClient(a.tenantId, b.client.id),
        ),
      ),
  );
  await unchanged(
    'repeated reads and ledger query mutate nothing',
    async () => {
      for (let i = 0; i < 3; i++)
        assert.equal((await get(a.tenantId, ua.id)).balance, 640);
      assert.deepEqual(
        (await history(a.tenantId, ua.id)).map((row) => row.id),
        [ledgerA.id],
      );
    },
  );
  await unchanged(
    '20 concurrent real GETs do not materialize or mutate value',
    async () => {
      const rows = await Promise.all(
        Array.from({ length: 20 }, () => get(a.tenantId, ua.id)),
      );
      assert.ok(rows.every((row) => row.balance === 640));
    },
  );
  const ambiguous = new ClientLoyaltyReadService(
    {
      $transaction: (fn: (tx: unknown) => Promise<unknown>, options: unknown) =>
        db.$transaction(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(target, key) {
                  if (key === 'clientChannelLink')
                    return {
                      findMany: () => Promise.resolve([a.link, a.link]),
                    };
                  return Reflect.get(target, key) as unknown;
                },
              }),
            ),
          options as never,
        ),
    } as never,
    context,
    channels,
    encryption,
  );
  await unchanged(
    'ambiguous identity fails closed even if storage returns competing bindings',
    () =>
      assert.rejects(scope(a.tenantId, () => ambiguous.forChannel(a.proof))),
  );
  const failed = new ClientLoyaltyReadService(
    {
      $transaction: (fn: (tx: unknown) => Promise<unknown>, options: unknown) =>
        db.$transaction(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(target, key) {
                  if (key === 'loyaltyAccount')
                    return {
                      findUnique: () => {
                        throw new Error('synthetic read failure');
                      },
                    };
                  return Reflect.get(target, key) as unknown;
                },
              }),
            ),
          options as never,
        ),
    } as never,
    context,
    channels,
    encryption,
  );
  await unchanged(
    'failure after resolution leaves business state byte-equivalent',
    () => assert.rejects(scope(a.tenantId, () => failed.forChannel(a.proof))),
  );
  const owner = await account(a, false);
  await db.membership.updateMany({
    where: { tenantId: a.tenantId, userId: owner.id },
    data: { role: 'tenant_owner' },
  });
  await unchanged(
    'authorized staff uses exact CRM link and same canonical Client account; no phone selection',
    async () => {
      const run = <T>(fn: () => T) =>
        context.runAsAuthPrincipal(
          { tenantId: a.tenantId, userId: owner.id, role: 'tenant_owner' },
          fn,
        );
      assert.equal(
        (await run(() => reader.forStaffCrmClient(a.tenantId, '101'))).balance,
        640,
      );
      assert.equal(
        (await run(() => reader.forStaffCrmClient(a.tenantId, '202'))).balance,
        123,
      );
      assert.equal(
        (await run(() => reader.forStaffAccount(a.tenantId, ua.id))).balance,
        640,
      );
    },
  );
  await unchanged('Client cannot use staff CRM value query', () =>
    assert.rejects(
      context.runAsAuthPrincipal(
        { tenantId: a.tenantId, userId: ua.id, role: 'client' },
        () => reader.forStaffCrmClient(a.tenantId, '202'),
      ),
    ),
  );
  await db.unresolvedClientIdentityHold.create({
    data: {
      tenantId: a.tenantId,
      provider: 'yclients',
      externalId: '103',
      reasonCode: 'loyalty_identity_unresolved',
      sourceNamespace: 'synthetic-b27',
      sourceEvidenceHash: hash('hold'),
      unresolvedPrincipalCount: 2,
    },
  });
  await unchanged(
    'P02/P03 unresolved linked identity hold rejects value disclosure',
    () => assert.rejects(get(a.tenantId, ua.id)),
  );
  await revoke(b.link);
  await unchanged('revoked channel link rejects projection', () =>
    assert.rejects(scope(b.tenantId, () => reader.forChannel(b.proof))),
  );
  const result = {
    verdict: 'PASS',
    caseCount: cases.length,
    cases,
    realProductionMutations: 0,
    providerPrivateReads: providerState.privateReads,
    providerWrites: providerState.writes,
    allCaseBusinessStateByteEquivalent: true,
    ownedDatabase: 'maya_c06_b27_owned',
  };
  writeFileSync(
    process.env.B27_PROOF_OUTPUT ?? '/tmp/maya-b27-implementation/proof.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
}
void main().finally(() => db.$disconnect());
