import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { ClientChannelLinkService } from '../src/crm/client-channel-link.service';
import { clientChannelSubjectHash } from '../src/crm/client-channel-subject';
import { EncryptionService } from '../src/encryption/encryption.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

/** Synthetic prerequisites only, never a production onboarding/billing writer.
 * HTTP assertions still cross the unmodified canonical guards and executors.
 */
export function requireHttpProofDatabase(): string {
  const connection = process.env.DATABASE_URL ?? '';
  const url = new URL(connection);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(process.env.NODE_ENV, 'test');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert(
    (database === 'maya_ci' &&
      process.env.CI === 'true' &&
      process.env.GITHUB_ACTIONS === 'true') ||
      database.startsWith('maya_gates_smoke_'),
    'HTTP smoke fixture refuses non-disposable databases',
  );
  assert.notEqual(process.env.HTTP_SMOKE_EXTERNAL_SERVER, 'true');
  const api = new URL(
    process.env.HTTP_SMOKE_BASE_URL ??
      `http://127.0.0.1:${process.env.HTTP_SMOKE_PORT ?? '3101'}/api`,
  );
  assert.equal(api.protocol, 'http:');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname));
  assert.equal(api.port, process.env.HTTP_SMOKE_PORT ?? '3101');
  assert.equal(api.pathname, '/api');
  assert.equal(api.username + api.password + api.search + api.hash, '');
  return connection;
}

async function withProofDb<T>(work: (db: PrismaClient) => Promise<T>) {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireHttpProofDatabase() }),
  });
  try {
    return await work(db);
  } finally {
    await db.$disconnect();
  }
}

/** A paid-plan pre-state for quota tests, not proof of a payment transition. */
export function seedHttpQuotaPrerequisite(tenantId: string) {
  return withProofDb(async (db) => {
    const plan = await db.subscriptionPlan.findFirstOrThrow({
      where: { name: 'business_plus' },
    });
    await db.tenant.update({
      where: { id: tenantId },
      data: { planId: plan.id },
    });
  });
}

/** Synthetic verified identity attestation at A18's verifier port. No owner,
 * policy, admission, link writer or booking executor is mocked by the HTTP app.
 * The account alone is deliberately insufficient until this prerequisite exists.
 */
export function seedHttpVerifiedClient(tenantId: string, userId: string) {
  return withProofDb(async (db) => {
    const membership = await db.membership.findUniqueOrThrow({
      where: { userId_tenantId: { tenantId, userId } },
    });
    assert.equal(membership.status, 'active');
    const client = await db.client.create({ data: { tenantId, userId } });
    await db.customerProfile.upsert({
      where: { userId_tenantId: { tenantId, userId } },
      create: { tenantId, userId, clientId: client.id },
      update: { clientId: client.id },
    });
    const context = new TenantContextService();
    const encryption = new EncryptionService(
      new ConfigService({ CRM_ENCRYPTION_KEY: process.env.CRM_ENCRYPTION_KEY }),
    );
    const proof = `http-smoke:${tenantId}:${userId}:${client.id}`;
    const digest = (tag: string) =>
      createHash('sha256').update(`${proof}:${tag}`).digest('hex');
    const links = new ClientChannelLinkService(db, context, {
      verifyLink: (supplied) => {
        assert.equal(supplied, proof);
        return Promise.resolve({
          tenantId,
          clientId: client.id,
          provider: 'maya_user',
          providerSubjectHash: clientChannelSubjectHash(
            encryption,
            'maya_user',
            userId,
          ),
          method: 'explicit_verified_challenge',
          verificationIdentityHash: digest('identity'),
          verifier: 'isolated-http-proof-verifier',
          channelControlProofHash: digest('channel'),
          clientAuthorityProofHash: digest('client'),
          validUntil: new Date(Date.now() + 600_000),
        });
      },
      verifyRevocation: () =>
        Promise.reject(new Error('No revocation fixture admitted')),
    });
    await context.runAsSystemTenant(tenantId, () => links.link({ proof }));
    return client.id;
  });
}

/** C7 measurements require an active tenant. This is isolated source pre-state,
 * not a billing operation; restore the trial before its lifecycle assertions. */
export function withHttpActiveTenant<T>(
  tenantId: string,
  work: () => Promise<T>,
) {
  return withProofDb(async (db) => {
    const before = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { status: true },
    });
    await db.tenant.update({
      where: { id: tenantId },
      data: { status: 'active' },
    });
    try {
      return await work();
    } finally {
      await db.tenant.update({ where: { id: tenantId }, data: before });
    }
  });
}

/** Synthetic completed CRM preview pre-state for the claim-gate refusal ONLY.
 * No CRM credentials/transport exist; use only for a missing-activation request.
 * The real HTTP coordinator/receipt is used; this is not a CRM import proof. */
export function seedHttpCrmPreview(draftId: string) {
  return withProofDb(async (db) => {
    const source = await db.aiOnboardingDraft.findUniqueOrThrow({
      where: { id: draftId },
    });
    assert.equal(source.status, 'draft');
    const token = randomBytes(32).toString('base64url');
    const draft = await db.aiOnboardingDraft.create({
      data: {
        draftTokenHash: createHash('sha256').update(token).digest('hex'),
        templateId: source.templateId,
        expiresAt: source.expiresAt,
        missingFieldsJson: [],
        blueprintJson: {
          ...(source.blueprintJson as Record<string, unknown>),
          calendarSource: 'external',
          calendarSourceConfirmed: true,
          crmImported: true,
          crmProvider: 'yclients',
          crmCompanyId: 'http-proof-company',
        },
      },
    });
    return { id: draft.id, token, revision: draft.revision };
  });
}

/** Explicit empty account prerequisite. B27 GET must never establish it. */
export function seedHttpLoyaltyAccount(
  tenantId: string,
  clientId: string,
  userId: string,
) {
  return withProofDb(async (db) => {
    assert.equal(
      await db.loyaltyAccount.count({ where: { tenantId, clientId } }),
      0,
    );
    await db.loyaltyAccount.create({
      data: { tenantId, clientId, userId, balance: 0, source: 'internal' },
    });
  });
}

/** Separate unactivated/setup trial state for the registration denial branch. */
export function withHttpSetupTrial<T>(
  tenantId: string,
  work: () => Promise<T>,
) {
  return withProofDb(async (db) => {
    const before = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { trialFullAccess: true },
    });
    await db.tenant.update({
      where: { id: tenantId },
      data: { trialFullAccess: false },
    });
    try {
      return await work();
    } finally {
      await db.tenant.update({ where: { id: tenantId }, data: before });
    }
  });
}

export function readHttpAdmissionCounts() {
  return withProofDb(async (db) => ({
    tenants: await db.tenant.count(),
    users: await db.user.count(),
    clients: await db.client.count(),
    executions: await db.actionExecution.count(),
    links: await db.clientChannelLink.count(),
    receipts: await db.aiOnboardingDraft.count({
      where: { confirmationReceiptJson: { not: Prisma.DbNull } },
    }),
  }));
}
