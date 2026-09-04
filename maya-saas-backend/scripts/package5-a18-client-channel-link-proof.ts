import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  ClientChannelLinkService,
  ClientChannelLinkVerifier,
  VerifiedClientChannelProof,
  VerifiedClientChannelRevocation,
  lockClientChannelIdentity,
} from '../src/crm/client-channel-link.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55487' ||
  !url.pathname.startsWith('/maya_c06_a18_link_v1_')
)
  throw new Error(
    'A18 proof requires its owned disposable PostgreSQL database',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});
const context = new TenantContextService();
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const linkProofs = new Map<string, VerifiedClientChannelProof>();
const revokeProofs = new Map<string, VerifiedClientChannelRevocation>();
// Synthetic verifier fixture, not a production verifier or authentication shortcut.
const verifier: ClientChannelLinkVerifier = {
  verifyLink: (token) => {
    const proof = linkProofs.get(token);
    return proof
      ? Promise.resolve(proof)
      : Promise.reject(new Error('Unverified channel/Client challenge'));
  },
  verifyRevocation: (token) => {
    const proof = revokeProofs.get(token);
    return proof
      ? Promise.resolve(proof)
      : Promise.reject(new Error('Unverified revocation challenge'));
  },
};
const service = () => new ClientChannelLinkService(db, context, verifier);
const inTenant = <T>(tenantId: string, callback: () => T) =>
  context.runAsSystemTenant(tenantId, callback);
const cases: string[] = [];
async function reject(work: () => Promise<unknown>, label: string) {
  await assert.rejects(work);
  cases.push(label);
}
function linkProof(
  tenantId: string,
  clientId: string,
  subject: string,
  extra: Partial<VerifiedClientChannelProof> = {},
) {
  const token = `synthetic-link-${randomUUID()}`;
  linkProofs.set(token, {
    tenantId,
    clientId,
    provider: 'telegram',
    providerSubjectHash: hash(subject),
    method: 'explicit_verified_challenge',
    verificationIdentityHash: hash(token),
    verifier: 'synthetic-isolated-challenge-verifier.v1',
    channelControlProofHash: hash(`channel:${token}`),
    clientAuthorityProofHash: hash(`client:${token}`),
    validUntil: new Date(Date.now() + 600_000),
    ...extra,
  });
  return { proof: token };
}
function revokeProof(
  tenantId: string,
  link: { id: string; provider: string; providerSubjectHash: string },
) {
  const token = `synthetic-revocation-${randomUUID()}`;
  revokeProofs.set(token, {
    tenantId,
    provider: link.provider as 'telegram' | 'maya_user',
    providerSubjectHash: link.providerSubjectHash,
    linkId: link.id,
    revocationIdentityHash: hash(token),
    actorProofHash: hash(`actor:${token}`),
    reason: 'explicit_verified_operation',
    validUntil: new Date(Date.now() + 600_000),
  });
  return { proof: token };
}
async function run() {
  assert.equal(await db.clientChannelLink.count(), 0);
  if (process.argv.includes('--replay-only')) {
    console.log(JSON.stringify({ cleanReplay: 'PASS', clientChannelLinks: 0 }));
    return;
  }
  const tenantId = `a18_${randomUUID()}`;
  const otherTenantId = `a18_${randomUUID()}`;
  for (const id of [tenantId, otherTenantId])
    await db.tenant.create({
      data: { id, name: 'Synthetic A18 proof', slug: id },
    });
  const a = await db.client.create({ data: { tenantId } });
  const b = await db.client.create({ data: { tenantId } });
  const foreign = await db.client.create({ data: { tenantId: otherTenantId } });
  const issue = (request: unknown, scope = tenantId) =>
    inTenant(scope, () => service().link(request));
  const resolve = (subject: string, scope = tenantId) =>
    inTenant(scope, () =>
      service().resolveActive(scope, 'telegram', hash(subject)),
    );
  const guestRequest = linkProof(tenantId, a.id, 'guest');
  const guest = await issue(guestRequest);
  assert.equal(a.userId, null);
  assert.equal((await resolve('guest')).clientId, a.id);
  cases.push('verified guest Client without User');
  const again = await issue(guestRequest);
  assert.equal(again.link.id, guest.link.id);
  assert(again.resumed);
  cases.push('retry and new-service restart return original receipt');

  await reject(
    () => issue({ ...guestRequest, clientId: b.id }),
    'initiator clientId rejected',
  );
  await reject(
    () => issue({ ...guestRequest, providerSubjectId: 'forged' }),
    'initiator providerSubject rejected',
  );
  await reject(
    () => issue({ phone: 'synthetic-phone' }),
    'phone-only payload rejected',
  );
  await reject(
    () => issue({ proof: 'unverified-phone-match-only' }),
    'unverified proof rejected',
  );
  await reject(
    () => issue(guestRequest, otherTenantId),
    'cross-tenant verified context rejected',
  );
  await reject(
    () => issue(linkProof(tenantId, foreign.id, 'foreign')),
    'foreign Client rejected',
  );
  await reject(
    () => resolve('missing'),
    'unlinked/ambiguous identity fails closed',
  );
  await reject(
    () => issue(linkProof(tenantId, b.id, 'guest')),
    'second Client for active subject rejected',
  );
  const changed = { ...linkProofs.get(guestRequest.proof)!, clientId: b.id };
  linkProofs.set('synthetic-reused-proof-material', changed);
  await reject(
    () => issue({ proof: 'synthetic-reused-proof-material' }),
    'receipt material substitution rejected',
  );

  const concurrent = linkProof(tenantId, a.id, 'concurrent');
  const results = await Promise.all(
    Array.from({ length: 6 }, () => issue(concurrent)),
  );
  assert.equal(new Set(results.map((r) => r.link.id)).size, 1);
  assert.equal(results.filter((r) => !r.resumed).length, 1);
  cases.push('concurrent duplicate creates exactly one receipt');
  const race = await Promise.allSettled([
    issue(linkProof(tenantId, a.id, 'race')),
    issue(linkProof(tenantId, b.id, 'race')),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  cases.push('competing Clients have one allowed creation outcome');

  await issue(linkProof(otherTenantId, foreign.id, 'guest'), otherTenantId);
  assert.equal((await resolve('guest', otherTenantId)).clientId, foreign.id);
  await issue(
    linkProof(tenantId, a.id, 'guest', {
      provider: 'maya_user',
      method: 'proven_user_client_link',
    }),
  );
  cases.push('tenant and provider namespaces are isolated');

  const raw = (data: Prisma.ClientChannelLinkUncheckedCreateInput) =>
    db.clientChannelLink.create({ data });
  const template = {
    ...guest.link,
    id: randomUUID(),
    verificationIdentityHash: hash('raw'),
  };
  const newEvidence = {
    ...(guest.link.verificationEvidenceJson as Prisma.JsonObject),
    verificationIdentityHash: template.verificationIdentityHash,
    providerSubjectHash: hash('raw'),
  };
  const data = {
    ...template,
    verificationEvidenceJson: newEvidence,
    revocationEvidenceJson: Prisma.DbNull,
    providerSubjectHash: hash('raw'),
  };
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.clientChannelLink.create({ data });
      throw new Error('synthetic-raw-valid-fixture-rollback');
    }),
    (error) =>
      error instanceof Error &&
      error.message === 'synthetic-raw-valid-fixture-rollback',
  );
  cases.push('raw negative fixture is otherwise valid and rolled back');
  await reject(
    () => raw({ ...data, subjectHashVersion: 2 }),
    'hash version cannot introduce another identity',
  );
  await reject(
    () => raw({ ...data, provider: 'telegram:another-bot' }),
    'installation cannot create a provider namespace',
  );
  await reject(
    () =>
      raw({
        ...data,
        verificationEvidenceJson: {
          ...newEvidence,
          clientAuthorityProofHash: null,
        },
      }),
    'JSON null cannot bypass proof checks',
  );
  await reject(
    () =>
      raw({
        ...data,
        verificationEvidenceJson: { ...newEvidence, phone: 'synthetic' },
      }),
    'raw attributes not allowed in verification evidence',
  );
  await reject(
    () =>
      db.clientChannelLink.update({
        where: { id: guest.link.id },
        data: { clientId: b.id },
      }),
    'silent reassignment rejected',
  );
  await reject(
    () =>
      db.clientChannelLink.update({
        where: { id: guest.link.id },
        data: { verificationEvidenceHash: hash('tampered') },
      }),
    'historical evidence immutable',
  );
  await reject(
    () => db.clientChannelLink.delete({ where: { id: guest.link.id } }),
    'historical receipt deletion rejected',
  );
  await reject(
    () => db.client.delete({ where: { id: a.id } }),
    'Client cascade cannot delete binding history',
  );

  const revoke = revokeProof(tenantId, guest.link);
  const revoked = await inTenant(tenantId, () => service().revoke(revoke));
  assert(revoked.link.revokedAt);
  assert.equal(
    revoked.link.verificationEvidenceHash,
    guest.link.verificationEvidenceHash,
  );
  assert((await inTenant(tenantId, () => service().revoke(revoke))).resumed);
  await reject(() => resolve('guest'), 'revoked identity fails closed');
  await reject(
    () =>
      db.clientChannelLink.update({
        where: { id: guest.link.id },
        data: { revokedAt: null },
      }),
    'revocation cannot be erased',
  );
  await reject(
    () => issue(linkProof(tenantId, b.id, 'guest')),
    'revoked history cannot be silently bypassed',
  );
  const relinkRequest = linkProof(tenantId, b.id, 'guest', {
    supersedesLinkId: guest.link.id,
  });
  const relink = await issue(relinkRequest);
  assert.equal(relink.link.supersedesLinkId, guest.link.id);
  assert.equal((await resolve('guest')).clientId, b.id);
  cases.push('explicit verified relink preserves predecessor evidence');

  const atomicRequest = linkProof(tenantId, a.id, 'atomic');
  const atomic = await issue(atomicRequest);
  const atomicRevoke = revokeProof(tenantId, atomic.link);
  const invalidReplacement = linkProof(tenantId, foreign.id, 'atomic', {
    supersedesLinkId: atomic.link.id,
  });
  await reject(
    () =>
      inTenant(tenantId, () =>
        service().rebind({
          ...invalidReplacement,
          revocationProof: atomicRevoke.proof,
        }),
      ),
    'failed rebind rolls back revocation',
  );
  assert.equal((await resolve('atomic')).id, atomic.link.id);
  const replacement = linkProof(tenantId, b.id, 'atomic', {
    supersedesLinkId: atomic.link.id,
  });
  const rebound = await inTenant(tenantId, () =>
    service().rebind({ ...replacement, revocationProof: atomicRevoke.proof }),
  );
  assert.equal((await resolve('atomic')).id, rebound.link.id);
  assert(
    (
      await db.clientChannelLink.findUniqueOrThrow({
        where: { id: atomic.link.id },
      })
    ).revokedAt,
  );
  assert(
    (
      await inTenant(tenantId, () =>
        service().rebind({
          ...replacement,
          revocationProof: atomicRevoke.proof,
        }),
      )
    ).resumed,
  );
  await reject(
    () =>
      issue(
        linkProof(tenantId, a.id, 'atomic', {
          supersedesLinkId: atomic.link.id,
        }),
      ),
    'stale predecessor cannot fork history',
  );
  cases.push('atomic explicit rebind and restart convergence');

  // The consent executor uses this same lock and revalidation protocol.
  const lockSubject = hash('atomic');
  const lockOrder: string[] = [];
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((r) => {
    entered = r;
  });
  const releasePromise = new Promise<void>((r) => {
    release = r;
  });
  const reader = db.$transaction(async (tx) => {
    await lockClientChannelIdentity(tx, tenantId, 'telegram', lockSubject);
    const found = await tx.clientChannelLink.findFirst({
      where: { tenantId, providerSubjectHash: lockSubject, revokedAt: null },
    });
    assert.equal(found?.id, rebound.link.id);
    lockOrder.push('consent-boundary-read');
    entered();
    await releasePromise;
  });
  await enteredPromise;
  const revoker = inTenant(tenantId, async () => {
    const result = await service().revoke(revokeProof(tenantId, rebound.link));
    lockOrder.push('revocation-commit');
    return result;
  });
  release();
  await Promise.all([reader, revoker]);
  assert.deepEqual(lockOrder, ['consent-boundary-read', 'revocation-commit']);
  await reject(
    () => resolve('atomic'),
    'post-revocation revalidation rejects stale consent authority',
  );
  cases.push('consent/revocation identity lock serializes authority boundary');

  assert.equal(await db.clientConsentFact.count(), 0);
  console.log(
    JSON.stringify(
      {
        verdict: 'PASS',
        checks: cases.length,
        cases,
        foundationVerifier:
          'SYNTHETIC ISOLATED FIXTURE; NO PRODUCTION CHALLENGE CLAIM',
        newModels: 1,
        temporaryLinkReceipts: await db.clientChannelLink.count(),
        realProductionMutations: 0,
        providerWrites: 0,
        historicalBackfill: 0,
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
