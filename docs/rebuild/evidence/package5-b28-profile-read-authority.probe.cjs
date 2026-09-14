/** B28 inventory reproduction only. Real compiled readers and PostgreSQL;
 * synthetic fixtures, loopback-owned DB, no HTTP and no remediation. */
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const req = createRequire(resolve(process.argv[2], 'package.json'));
const { PrismaClient } = req('@prisma/client');
const { PrismaPg } = req('@prisma/adapter-pg');
const { ConfigService } = req('@nestjs/config');
const { CustomersService } = req('./dist/src/customers/customers.service.js');
const { CustomersController } = req('./dist/src/customers/customers.controller.js');
const { CustomerPortalService } = req('./dist/src/customer-portal/customer-portal.service.js');
const { CustomerPortalController } = req('./dist/src/customer-portal/customer-portal.controller.js');
const { UsersService } = req('./dist/src/users/users.service.js');
const { TenantContextService } = req('./dist/src/tenancy/tenant-context.service.js');
const { EncryptionService } = req('./dist/src/encryption/encryption.service.js');
const { clientChannelSubjectHash } = req('./dist/src/crm/client-channel-subject.js');
const connectionString = 'postgresql://postgres@127.0.0.1:55496/maya_c06_b27_owned';
const url = new URL(connectionString);
assert(url.hostname === '127.0.0.1' && url.port === '55496' && url.pathname === '/maya_c06_b27_owned');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
global.fetch = async () => { throw Error('Live HTTP forbidden in B28 inventory probe'); };
const context = new TenantContextService();
const encryption = new EncryptionService(new ConfigService({ CRM_ENCRYPTION_KEY: 'synthetic-b28-encryption'.repeat(3) }));
const unused = new Proxy({}, { get: () => () => { throw Error('Unexpected dependency call'); } });
const users = new UsersService(db, encryption, context, unused);
const customers = new CustomersService(db, context, users, encryption, unused, unused, unused);
const controller = new CustomersController(customers);
const portal = new CustomerPortalController(new CustomerPortalService(context, users, customers,
  { listClientAppointments: async () => { throw Error('Synthetic unavailable'); } },
  { getForUser: async () => { throw Error('Synthetic unavailable'); } }));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const own = (f, fn) => context.runAsAuthPrincipal(f.principal, fn);
const cases = [];
async function snapshot() {
  return hash(await Promise.all(['tenant', 'user', 'membership', 'client', 'customerProfile',
    'clientChannelLink', 'clientConsentFact', 'actionExecution', 'loyaltyAccount', 'loyaltyTransaction']
    .map(name => db[name].findMany({ orderBy: { id: 'asc' } }))));
}
async function fixture() {
  const id = randomUUID();
  await db.tenant.create({ data: { id, slug: id, name: 'Synthetic B28', status: 'active' } });
  const user = await db.user.create({ data: { tenantId: null, email: randomUUID() + '@invalid.test', passwordHash: 'synthetic', role: 'client', status: 'active' } });
  await db.membership.create({ data: { tenantId: id, userId: user.id, role: 'client', status: 'active' } });
  const client = await db.client.create({ data: { tenantId: id, userId: user.id } });
  const profile = await db.customerProfile.create({ data: { tenantId: id, userId: user.id, clientId: client.id,
    preferredLocale: 'ru', privacyConsentAt: new Date('2026-01-02T00:00:00Z'), marketingConsentAt: new Date('2026-02-03T00:00:00Z') } });
  return { tenantId: id, user, client, profile, principal: { tenantId: id, userId: user.id, role: 'client' } };
}
async function link(f, clientId = f.client.id) {
  const providerSubjectHash = clientChannelSubjectHash(encryption, 'maya_user', f.user.id);
  const verificationIdentityHash = hash(['b28', randomUUID()]);
  const evidence = { contract: 'a18.client-channel-verification.v1', verifier: 'synthetic-b28',
    tenantId: f.tenantId, clientId, provider: 'maya_user', providerSubjectHash, verificationIdentityHash,
    channelControlProofHash: hash(f.user.id), clientAuthorityProofHash: hash(clientId) };
  return db.clientChannelLink.create({ data: { tenantId: f.tenantId, clientId, provider: 'maya_user',
    providerSubjectHash, verificationMethod: 'explicit_verified_challenge', verificationIdentityHash,
    verificationEvidenceJson: evidence, verificationEvidenceHash: hash(evidence) } });
}
async function expose(name, f, read = () => controller.getOwnProfile(f.principal)) {
  const before = await snapshot();
  const result = await own(f, read);
  assert.equal(result.profile_id, f.profile.id);
  assert.equal(result.privacy_consent_at.getTime(), f.profile.privacyConsentAt.getTime());
  assert.equal(result.marketing_consent_at.getTime(), f.profile.marketingConsentAt.getTime());
  const active = await db.clientChannelLink.findMany({ where: { tenantId: f.tenantId, revokedAt: null } });
  assert.equal(await snapshot(), before);
  cases.push({ name, privateProfileReturned: true, consentTimestampsReturned: true,
    activeVerifiedLinks: active.length, exactClientMismatch: active.some(x => x.clientId !== f.profile.clientId),
    businessStateByteEquivalent: true });
}
async function main() {
  const missing = await fixture();
  await expose('authenticated active member without any verified Client link', missing);
  await expose('customer-portal preserves unverified profile despite other projections unavailable', missing,
    async () => (await portal.getOverview(missing.principal)).profile);
  const revoked = await fixture();
  const oldLink = await link(revoked);
  const revocationIdentityHash = hash(['revoke', oldLink.id]);
  const revocationEvidenceJson = { contract: 'a18.client-channel-revocation.v1', revocationIdentityHash,
    tenantId: revoked.tenantId, linkId: oldLink.id, actorProofHash: hash(revoked.user.id), reason: 'synthetic probe revocation' };
  await db.clientChannelLink.update({ where: { id: oldLink.id }, data: { revokedAt: new Date(),
    revocationIdentityHash, revocationEvidenceJson, revocationEvidenceHash: hash(revocationEvidenceJson) } });
  await expose('revoked verified Client link still returns private profile', revoked);
  const mismatch = await fixture();
  const exactClient = await db.client.create({ data: { tenantId: mismatch.tenantId } });
  await link(mismatch, exactClient.id);
  await expose('channel linked to Client A returns account-associated Client B profile', mismatch);
  const before = await snapshot();
  const results = await Promise.all(Array.from({ length: 20 }, () => own(missing, () => controller.getOwnProfile(missing.principal))));
  assert(results.every(result => result.profile_id === missing.profile.id));
  assert.equal(await snapshot(), before);
  cases.push({ name: '20 concurrent unlinked reads', requests: 20, privateProfileReturned: true, businessStateByteEquivalent: true });
  console.log(JSON.stringify({ blocker: 'B28', scope: 'A18 Client-owned profile/consent projection authority',
    realCompiledControllerServiceAndUsersReader: true, postgresMigrationsApplied: 79,
    accountAndActiveMembershipPrerequisitesSatisfied: true,
    httpGuardsBypassedClaim: false, productionClientPopulationExamined: false,
    finding: 'User association authorizes Client-owned profile projection without verified exact Client binding',
    cases, probeBusinessMutationsDuringReads: 0, providerCalls: 0, productionMutations: 0,
    runtimeRemediationStarted: false }, null, 2));
}
main().finally(() => db.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
