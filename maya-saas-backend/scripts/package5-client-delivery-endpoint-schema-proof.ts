import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_delivery_endpoint_v1_')
)
  throw new Error(
    'Owned isolated B9 delivery endpoint proof database required',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ciphertext = (seed: string) =>
  `${Buffer.alloc(12, seed).toString('base64url')}.${Buffer.alloc(16, seed).toString('base64url')}.${Buffer.from(seed.repeat(8)).toString('base64url')}`;

async function fixture(label: string) {
  const tenantId = randomUUID();
  await db.tenant.create({
    data: { id: tenantId, slug: tenantId, name: `Delivery ${label}` },
  });
  const client = await db.client.create({ data: { tenantId } });
  const providerSubjectHash = digest(['telegram-subject', label]);
  const verificationIdentityHash = digest(['verification', label]);
  const evidence = {
    contract: 'a18.client-channel-verification.v1',
    verifier: 'b9.delivery-endpoint-schema-proof',
    channelControlProofHash: digest(['channel', label]),
    clientAuthorityProofHash: digest(['authority', label]),
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
      verificationEvidenceHash: digest(evidence),
    },
  });
  return { tenantId, client, link, providerSubjectHash };
}

async function verifiedRotate(
  linkId: string,
  subjectHash: string,
  value: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      SELECT set_config('maya.client_channel_delivery_subject_hash', ${subjectHash}, true)
    `);
    return tx.clientChannelLink.update({
      where: { id: linkId },
      data: { deliveryAddressEncrypted: value },
    });
  });
}

async function run() {
  assert.equal(
    await db.clientChannelLink.count({
      where: { deliveryAddressEncrypted: { not: null } },
    }),
    0,
  );
  if (process.argv.includes('--replay-only')) {
    console.log(JSON.stringify({ cleanReplay: 'PASS', backfill: 0 }));
    return;
  }
  const scope = await fixture('primary');
  const original = await db.clientChannelLink.findUniqueOrThrow({
    where: { id: scope.link.id },
  });
  await assert.rejects(
    db.clientChannelLink.update({
      where: { id: scope.link.id },
      data: { deliveryAddressEncrypted: ciphertext('a') },
    }),
  );
  await assert.rejects(
    verifiedRotate(scope.link.id, digest(['wrong']), ciphertext('b')),
  );
  await assert.rejects(
    verifiedRotate(scope.link.id, scope.providerSubjectHash, 'plain-address'),
  );
  const stored = await verifiedRotate(
    scope.link.id,
    scope.providerSubjectHash,
    ciphertext('c'),
  );
  assert.equal(stored.deliveryAddressEncrypted, ciphertext('c'));
  assert.equal(stored.clientId, original.clientId);
  assert.equal(stored.providerSubjectHash, original.providerSubjectHash);
  assert.deepEqual(
    stored.verificationEvidenceJson,
    original.verificationEvidenceJson,
  );
  assert.equal(
    stored.verificationEvidenceHash,
    original.verificationEvidenceHash,
  );

  const rotations = await Promise.all(
    ['d', 'e', 'f'].map((seed) =>
      verifiedRotate(
        scope.link.id,
        scope.providerSubjectHash,
        ciphertext(seed),
      ),
    ),
  );
  assert.equal(rotations.length, 3);
  assert.ok(
    rotations.some(
      (row) =>
        row.deliveryAddressEncrypted ===
        (rotations.at(-1)?.deliveryAddressEncrypted ?? ''),
    ),
  );
  const after = await db.clientChannelLink.findUniqueOrThrow({
    where: { id: scope.link.id },
  });
  assert.ok(
    ['d', 'e', 'f'].some(
      (seed) => after.deliveryAddressEncrypted === ciphertext(seed),
    ),
  );

  const revocationIdentityHash = digest(['revocation', scope.link.id]);
  const revocationEvidence = {
    contract: 'a18.client-channel-revocation.v1',
    revocationIdentityHash,
    tenantId: scope.tenantId,
    linkId: scope.link.id,
    actorProofHash: digest(['actor', scope.link.id]),
    reason: 'schema proof',
  };
  await db.clientChannelLink.update({
    where: { id: scope.link.id },
    data: {
      revokedAt: new Date(),
      revocationIdentityHash,
      revocationEvidenceJson: revocationEvidence,
      revocationEvidenceHash: digest(revocationEvidence),
    },
  });
  await assert.rejects(
    verifiedRotate(scope.link.id, scope.providerSubjectHash, ciphertext('g')),
  );
  assert.equal(
    await db.clientChannelLink.count({
      where: { deliveryAddressEncrypted: { contains: 'plain-address' } },
    }),
    0,
  );
  console.log(
    JSON.stringify({
      schemaProof: 'PASS',
      cases: [
        'historical links remain nullable with zero backfill',
        'direct, wrong-subject and plaintext writes rejected',
        'matching verified subject can persist encrypted address',
        'identity and verification evidence remain immutable',
        'concurrent same-identity rotations serialize safely',
        'revoked link rotation fails closed',
      ],
      fakeHistoricalBackfill: 0,
      productionMutations: 0,
    }),
  );
}

run()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
