import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import type { ConfigService } from '@nestjs/config';
import type { EncryptionService } from '../encryption/encryption.service';
import { ClientConsentReadService } from './client-consent-read.service';
import { ClientChannelRuntimeService } from './client-channel-runtime.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import {
  parseConsentRegisterRange,
  readConsentRegisterSource,
} from './consent-register-source';

// Synthetic, database-free authority and source proof. No real export or provider.
const now = new Date('2026-10-21T10:00:00.000Z');
const proof = JSON.stringify({ type: 'maya_jwt', credential: 'synthetic' });
type TestFact = {
  id: string;
  tenantId: string;
  clientId: string;
  kind: string;
  decision: string;
  occurredAt: Date;
  effectiveAt: Date;
  createdAt: Date;
  sourceType: string;
  sourceIdentityHash: string;
  actorUserId: string | null;
  actionExecutionId: string | null;
  invalidation: ({ id: string } & Record<string, unknown>) | null;
};
type Query = {
  where: {
    tenantId: string;
    clientId: string;
    kind?: string;
    occurredAt?: { gte: Date; lt: Date };
  };
  take?: number;
};
function fixture() {
  const link = {
    tenantId: 'tenant-a',
    clientId: 'client-a',
    linkId: 'link-a',
    validUntil: new Date(now.getTime() + 600_000),
  };
  const facts: TestFact[] = [];
  const tx = {
    $executeRaw: jest.fn((_template: TemplateStringsArray) => {
      void _template;
      return Promise.resolve(0);
    }),
    $queryRaw: jest.fn((_query: unknown) => {
      void _query;
      return Promise.resolve([{ now }]);
    }),
    client: {
      findUnique: jest.fn(
        (): Promise<{
          mergedIntoClientId: string | null;
          crmLinks: { provider: string; externalId: string }[];
        }> => Promise.resolve({ mergedIntoClientId: null, crmLinks: [] }),
      ),
    },
    unresolvedClientIdentityHold: {
      findFirst: jest.fn((): Promise<{ id: string } | null> =>
        Promise.resolve(null),
      ),
    },
    clientConsentFact: {
      findMany: jest.fn((q: Query) =>
        Promise.resolve(
          facts
            .filter(
              (f) =>
                f.tenantId === q.where.tenantId &&
                f.clientId === q.where.clientId &&
                (!q.where.kind || f.kind === q.where.kind),
            )
            .slice(0, q.take),
        ),
      ),
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { id_tenantId: { id: string; tenantId: string } };
        }) =>
          Promise.resolve(
            facts.find((f) => f.id === where.id_tenantId.id) ?? null,
          ),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (db: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const context = {
    assertTenantId: jest.fn((id: string) => {
      if (id !== 'tenant-a') throw new Error('tenant mismatch');
    }),
  };
  const channels = { resolve: jest.fn(() => Promise.resolve({ ...link })) };
  const owner = new ClientConsentReadService(
    prisma as unknown as PrismaService,
    context as unknown as TenantContextService,
    channels as unknown as ClientChannelRuntimeService,
  );
  const fact = (patch: Partial<TestFact> = {}): TestFact => ({
    id: 'fact-a',
    tenantId: 'tenant-a',
    clientId: 'client-a',
    kind: 'privacy',
    decision: 'grant',
    occurredAt: now,
    effectiveAt: now,
    createdAt: now,
    sourceType: 'verified_client',
    sourceIdentityHash: 'a'.repeat(64),
    actorUserId: null,
    actionExecutionId: 'execution-a',
    invalidation: null,
    ...patch,
  });
  return { owner, tx, prisma, context, channels, link, facts, fact };
}

test('own read resolves live source authority in a read-only transaction and expires within 300 seconds', async () => {
  const s = fixture();
  s.facts.push(s.fact());
  const value = await s.owner.readOwn(proof);
  expect(s.channels.resolve).toHaveBeenCalledWith(proof, s.tx);
  expect(s.tx.$executeRaw.mock.calls[0][0][0]).toBe(
    'SET TRANSACTION READ ONLY',
  );
  expect(value.contract).toBe('maya.privacy.own-consents/1');
  expect(value.expiresAt).toBe('2026-10-21T10:05:00.000Z');
  expect(value.consents).toEqual([
    {
      kind: 'privacy',
      state: 'GRANTED',
      invalidated: false,
      recordedAt: now.toISOString(),
      effectiveAt: now.toISOString(),
    },
    {
      kind: 'marketing',
      state: 'NEVER_ASKED',
      invalidated: false,
      recordedAt: null,
      effectiveAt: null,
    },
  ]);
  expect(JSON.stringify(value)).not.toMatch(
    /client-a|tenant-a|fact-a|execution-a|synthetic/,
  );
  expect(
    s.tx.clientConsentFact.findMany.mock.calls.every(
      ([q]) =>
        q.where.tenantId === 'tenant-a' && q.where.clientId === 'client-a',
    ),
  ).toBe(true);
});

test('invalidated current grant never resurrects an earlier grant; consent reads do not alter erasure/history', async () => {
  const s = fixture();
  s.facts.push(
    s.fact({ invalidation: { id: 'invalidated' } }),
    s.fact({ id: 'older', effectiveAt: new Date(now.getTime() - 1) }),
  );
  expect((await s.owner.readOwn(proof)).consents[0]).toMatchObject({
    state: 'NOT_GRANTED',
    invalidated: true,
    effectiveAt: null,
  });
  expect(Object.keys(s.tx)).not.toContain('widgetConversation');
});

test('conflicting heads fail closed and no fact is distinguished as a withdrawal without provenance', async () => {
  const s = fixture();
  s.facts.push(s.fact(), s.fact({ id: 'conflict', decision: 'revoke' }));
  expect((await s.owner.readOwn(proof)).consents[0].state).toBe('NOT_GRANTED');
});

test('every refresh re-resolves revoked/expired/foreign or unresolved identity; no role supplies Client authority', async () => {
  for (const fault of ['expired', 'foreign', 'merged', 'hold', 'revoked']) {
    const s = fixture();
    if (fault === 'expired') s.link.validUntil = now;
    if (fault === 'foreign') s.link.tenantId = 'tenant-b';
    if (fault === 'merged')
      s.tx.client.findUnique.mockResolvedValue({
        mergedIntoClientId: 'other',
        crmLinks: [],
      });
    if (fault === 'hold') {
      s.tx.client.findUnique.mockResolvedValue({
        mergedIntoClientId: null,
        crmLinks: [{ provider: 'test', externalId: '1' }],
      });
      s.tx.unresolvedClientIdentityHold.findFirst.mockResolvedValue({
        id: 'hold',
      });
    }
    if (fault === 'revoked')
      s.channels.resolve.mockRejectedValue(new Error('revoked'));
    await expect(s.owner.readOwn(proof)).rejects.toThrow();
    expect(s.tx.clientConsentFact.findMany).not.toHaveBeenCalled();
  }
  const s = fixture();
  await s.owner.readOwn(proof);
  s.channels.resolve.mockRejectedValue(new Error('revoked'));
  await expect(s.owner.readOwn(proof)).rejects.toThrow('revoked');
});

test('first-party session is required and link expiry bounds the read even below 300 seconds', async () => {
  const s = fixture();
  s.link.validUntil = new Date(now.getTime() + 10_000);
  expect((await s.owner.readOwn(proof)).expiresAt).toBe(
    '2026-10-21T10:00:10.000Z',
  );
  for (const bad of [
    '{}',
    JSON.stringify({ type: 'telegram_init_data', credential: 'x' }),
    JSON.stringify({ type: 'maya_jwt', credential: 'x', clientId: 'victim' }),
  ])
    await expect(s.owner.readOwn(bad)).rejects.toThrow();
});

test('real JWT authenticator and verified-link resolver refuse revoked, foreign, expired and ambiguous source authority before reading facts', async () => {
  for (const fault of [
    'none',
    'bad-signature',
    'foreign-token',
    'revoked-session',
    'expired-session',
    'inactive-membership',
    'missing-link',
    'ambiguous-link',
    'link-version',
  ]) {
    const s = fixture();
    const context = { ...s.context, requireTenantId: () => 'tenant-a' };
    const encryption = {
      opaqueReference: (namespace: string, value: string) =>
        createHash('sha256')
          .update(namespace + value)
          .digest('hex'),
    };
    const auth = new ClientChannelAuthenticatorService(
      {
        get: () => 'synthetic-test-signing-secret',
      } as unknown as ConfigService,
      context as unknown as TenantContextService,
      encryption as unknown as EncryptionService,
    );
    const session = {
      tenantId: 'tenant-a',
      userId: 'user-a',
      revokedAt: fault === 'revoked-session' ? now : null,
      expiresAt:
        fault === 'expired-session' ? now : new Date(Date.now() + 3_600_000),
      user: { status: 'active' },
      membership: {
        status: fault === 'inactive-membership' ? 'inactive' : 'active',
      },
    };
    const link = {
      id: 'link-a',
      tenantId: 'tenant-a',
      clientId: 'client-a',
      verificationVersion: fault === 'link-version' ? 2 : 1,
      subjectHashVersion: 1,
      verificationEvidenceHash: 'a'.repeat(64),
    };
    const tx = Object.assign(s.tx, {
      authSession: { findUnique: jest.fn(() => Promise.resolve(session)) },
      clientChannelLink: {
        findMany: jest.fn((_query: Query) => {
          void _query;
          return Promise.resolve(
            fault === 'missing-link'
              ? []
              : fault === 'ambiguous-link'
                ? [link, { ...link, id: 'other' }]
                : [link],
          );
        }),
      },
    });
    const runtime = Object.assign(
      Object.create(
        ClientChannelRuntimeService.prototype,
      ) as ClientChannelRuntimeService,
      { channels: auth, context },
    );
    const owner = new ClientConsentReadService(
      s.prisma as unknown as PrismaService,
      context as unknown as TenantContextService,
      runtime,
    );
    const token = new JwtService().sign(
      {
        user_id: 'user-a',
        tenant_id: fault === 'foreign-token' ? 'tenant-b' : 'tenant-a',
        session_id: 'session-a',
      },
      {
        secret:
          fault === 'bad-signature'
            ? 'other-test-secret'
            : 'synthetic-test-signing-secret',
        expiresIn: 3600,
      },
    );
    const signed = JSON.stringify({ type: 'maya_jwt', credential: token });
    if (fault === 'none') {
      expect((await owner.readOwn(signed)).consents).toHaveLength(2);
      expect(tx.authSession.findUnique).toHaveBeenCalledTimes(2);
      expect(tx.clientChannelLink.findMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: 'tenant-a', provider: 'maya_user', revokedAt: null },
        take: 2,
      });
    } else {
      await expect(owner.readOwn(signed)).rejects.toThrow();
      expect(tx.clientConsentFact.findMany).not.toHaveBeenCalled();
    }
  }
});

test('export qualification rechecks own authority but cannot promote a session, accept caller claims or read export facts', async () => {
  const s = fixture();
  const range = { from: '2000-01-01T00:00:00.000Z', to: now.toISOString() };
  expect(await s.owner.qualifyExport(proof, range)).toEqual({
    capability: 'consent.register.export',
    available: false,
    reason: 'STEP_UP_UNAVAILABLE',
    requiredVerification: 'STEP_UP_VERIFIED',
    range,
  });
  expect(s.tx.clientConsentFact.findMany).not.toHaveBeenCalled();
  for (const extra of [
    { tenantId: 'tenant-b' },
    { clientId: 'victim' },
    { stepUp: true },
    { verificationLevel: 'STEP_UP_VERIFIED' },
    { requestId: 'replay' },
  ])
    await expect(
      s.owner.qualifyExport(proof, { ...range, ...extra }),
    ).rejects.toThrow();
  s.channels.resolve.mockRejectedValue(new Error('revoked'));
  await expect(s.owner.qualifyExport(proof, range)).rejects.toThrow();
});

test('register source projection preserves all records, exact range, provenance and invalidation, including more than a UI page', async () => {
  const s = fixture();
  const rows = Array.from({ length: 501 }, (_, i) =>
    s.fact({
      id: `fact-${i}`,
      invalidation:
        i === 0
          ? {
              id: 'invalidate',
              invalidatedAt: now,
              reasonCode: 'identity_revoked',
              actionExecutionId: 'security-execution',
              invalidatedLinkId: 'link-a',
              authorizedByUserId: 'authorizer',
              policyVersion: 1,
              evidenceSetHash: 'b'.repeat(64),
              authorityEvidenceJson: { synthetic: true },
            }
          : null,
    }),
  );
  s.tx.clientConsentFact.findMany.mockResolvedValue(rows);
  const range = parseConsentRegisterRange({
    from: '2000-01-01T00:00:00.000Z',
    to: '2026-10-22T00:00:00.000Z',
  });
  const value = await readConsentRegisterSource(
    s.tx as unknown as Prisma.TransactionClient,
    { tenantId: 'tenant-a', clientId: 'client-a' },
    range,
  );
  expect(value.records).toHaveLength(501);
  expect(value.records[0]).toMatchObject({
    id: 'fact-0',
    sourceIdentityHash: 'a'.repeat(64),
    actionExecutionId: 'execution-a',
    invalidation: {
      id: 'invalidate',
      actionExecutionId: 'security-execution',
      evidenceSetHash: 'b'.repeat(64),
    },
  });
  const q = s.tx.clientConsentFact.findMany.mock.calls[0][0];
  expect(q.where).toEqual({
    tenantId: 'tenant-a',
    clientId: 'client-a',
    occurredAt: { gte: new Date(range.from), lt: new Date(range.to) },
  });
  expect(q).not.toHaveProperty('take');
  expect(q).not.toHaveProperty('skip');
});

test('register projection rejects forged scope, duplicate records or out-of-range results instead of claiming completeness', async () => {
  for (const rows of [
    [fixture().fact({ tenantId: 'tenant-b' })],
    [fixture().fact(), fixture().fact()],
    [fixture().fact({ occurredAt: new Date('2027-01-01') })],
  ]) {
    const s = fixture();
    s.tx.clientConsentFact.findMany.mockResolvedValue(rows);
    await expect(
      readConsentRegisterSource(
        s.tx as unknown as Prisma.TransactionClient,
        { tenantId: 'tenant-a', clientId: 'client-a' },
        { from: '2000-01-01T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' },
      ),
    ).rejects.toThrow();
  }
  for (const value of [
    { from: now.toISOString(), to: now.toISOString() },
    { from: '2000-01-01', to: now.toISOString() },
    { from: '2026-02-30T00:00:00.000Z', to: now.toISOString() },
  ])
    expect(() => parseConsentRegisterRange(value)).toThrow();
});
