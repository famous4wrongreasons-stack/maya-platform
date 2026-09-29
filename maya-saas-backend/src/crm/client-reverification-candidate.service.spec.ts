import { createHmac } from 'node:crypto';
import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientReverificationCandidateService } from './client-reverification-candidate.service';

function fixture() {
  const actor = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    membershipId: 'member-a',
    role: UserRole.TENANT_OWNER,
    email: 'fixture@example.test',
    branchId: null,
    membershipStatus: 'active',
  };
  const encryption = {
    opaqueReference: (ns: string, s: string) =>
      createHmac('sha256', 'synthetic-only-test-key')
        .update(ns + s)
        .digest('hex'),
  };
  const context = new TenantContextService();
  const session = {
    id: actor.sessionId,
    userId: actor.userId,
    tenantId: actor.tenantId,
    revokedAt: null as Date | null,
    expiresAt: new Date('2099-01-01'),
    user: { id: actor.userId, status: 'active', phone: '+79990000009' },
    membership: {
      id: actor.membershipId,
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: actor.role,
      status: 'active',
    },
  };
  const client = {
    id: 'client-a',
    tenantId: actor.tenantId,
    userId: actor.userId,
    mergedIntoClientId: null as string | null,
    crmLinks: [{ id: 'crm-a', provider: 'yclients', externalId: 'external-a' }],
  };
  // Subject hash is calculated with the real canonical helper below.
  const prior = {
    id: 'latest-revoked',
    tenantId: actor.tenantId,
    clientId: client.id,
    provider: 'maya_user',
    providerSubjectHash: '',
    subjectHashVersion: 1,
    verificationVersion: 1,
    revokedAt: new Date('2026-09-28') as Date | null,
  };
  const writes = {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ now: new Date('2026-09-29') }]),
    authSession: { findUnique: jest.fn().mockResolvedValue(session) },
    client: { findMany: jest.fn().mockResolvedValue([client]), ...writes },
    clientChannelLink: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: { successors?: unknown } }) =>
          Promise.resolve(
            args.where.successors
              ? [prior]
              : [{ ...prior, id: 'older' }, prior],
          ),
        ),
      ...writes,
    },
    clientLinkChallenge: { ...writes },
    unresolvedClientIdentityHold: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
  };
  const registry = {
    provider: 'yclients',
    complete: true,
    generated_at: '2026-09-29T00:00:00Z',
    clients: [
      {
        external_id: 'external-a',
        phone: '+79990000001',
        name: null,
        visits_count: 0,
        sold_amount: 0,
        last_visit_date: null,
      },
      {
        external_id: 'different-client',
        phone: '+79990000009',
        name: null,
        visits_count: 0,
        sold_amount: 0,
        last_visit_date: null,
      },
    ],
  };
  const crm = { getClientRegistry: jest.fn().mockResolvedValue(registry) };
  const service = new ClientReverificationCandidateService(
    prisma as never,
    context,
    encryption as never,
    crm as never,
  );
  const run = () =>
    context.runAsAuthPrincipal(
      { tenantId: 'tenant-a', userId: 'user-a', role: UserRole.TENANT_OWNER },
      () => service.resolve(actor),
    );
  return {
    actor,
    session,
    client,
    prior,
    tx,
    crm,
    registry,
    run,
    encryption,
    writes,
  };
}
import { clientChannelSubjectHash } from './client-channel-subject';
function setup() {
  const h = fixture();
  h.prior.providerSubjectHash = clientChannelSubjectHash(
    h.encryption as never,
    'maya_user',
    h.actor.userId,
  );
  return h;
}
describe('SB-1 re-verification candidate (not authority)', () => {
  it('RV-CANDIDATE selects only exact canonical CRM lineage and latest revoked tip, with zero writes', async () => {
    const h = setup();
    const saved = structuredClone(h.prior);
    const result = await h.run();
    expect(result).toMatchObject({
      userId: 'user-a',
      tenantId: 'tenant-a',
      clientId: 'client-a',
      predecessorLinkId: 'latest-revoked',
      deliveryPhone: '+79990000001',
      verificationChannel: { kind: 'sms', crmLinkId: 'crm-a' },
    });
    expect(result.verificationChannel.addressHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.prior).toEqual(saved);
    for (const spy of Object.values(h.writes))
      expect(spy).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('verified');
    expect(result).not.toHaveProperty('verificationEvidenceHash');
    expect(h.actor.role).toBe(UserRole.TENANT_OWNER);
  });
  it.each([
    'wrong user',
    'wrong tenant',
    'revoked',
    'expired',
    'inactive membership',
    'wrong member',
  ])('RV-SESSION refuses %s before a provider read', async (kind) => {
    const h = setup();
    if (kind === 'wrong user') h.session.userId = 'other';
    if (kind === 'wrong tenant') h.session.tenantId = 'other';
    if (kind === 'revoked') h.session.revokedAt = new Date('2026-09-28');
    if (kind === 'expired') h.session.expiresAt = new Date('2026-09-28');
    if (kind === 'inactive membership')
      h.session.membership.status = 'suspended';
    if (kind === 'wrong member') h.session.membership.id = 'other';
    await expect(h.run()).rejects.toThrow();
    expect(h.crm.getClientRegistry).not.toHaveBeenCalled();
  });
  it.each(['none', 'multiple', 'merged', 'foreign'])(
    'RV-CANDIDATE refuses %s candidate',
    async (kind) => {
      const h = setup();
      if (kind === 'none') h.tx.client.findMany.mockResolvedValue([]);
      if (kind === 'multiple')
        h.tx.client.findMany.mockResolvedValue([
          h.client,
          { ...h.client, id: 'client-b' },
        ]);
      if (kind === 'merged') h.client.mergedIntoClientId = 'client-b';
      if (kind === 'foreign') h.client.tenantId = 'other';
      await expect(h.run()).rejects.toThrow();
      expect(h.crm.getClientRegistry).not.toHaveBeenCalled();
    },
  );
  it.each([
    'active',
    'other Client',
    'other subject',
    'other tenant',
    'old version',
    'ambiguous',
  ])('RV-PREDECESSOR refuses %s predecessor', async (kind) => {
    const h = setup();
    if (kind === 'active') h.prior.revokedAt = null;
    if (kind === 'other Client') h.prior.clientId = 'client-b';
    if (kind === 'other subject') h.prior.providerSubjectHash = 'b'.repeat(64);
    if (kind === 'other tenant') h.prior.tenantId = 'other';
    if (kind === 'old version') h.prior.verificationVersion = 0;
    if (kind === 'ambiguous')
      h.tx.clientChannelLink.findMany.mockResolvedValue([
        h.prior,
        { ...h.prior, id: 'second-tip' },
      ]);
    await expect(h.run()).rejects.toThrow();
    expect(h.crm.getClientRegistry).not.toHaveBeenCalled();
  });
  it('RV-HOLD refuses an unresolved identity hold', async () => {
    const h = setup();
    h.tx.unresolvedClientIdentityHold.findFirst.mockResolvedValue({
      id: 'hold',
    });
    await expect(h.run()).rejects.toThrow('client_identity_unresolved');
    expect(h.crm.getClientRegistry).not.toHaveBeenCalled();
  });
  it.each([
    'missing',
    'duplicate',
    'foreign provider',
    'incomplete',
    'no phone',
    'no source',
    'ambiguous source',
  ])(
    'RV-CHANNEL refuses %s canonical channel without User.phone fallback',
    async (kind) => {
      const h = setup();
      if (kind === 'missing') h.registry.clients.shift();
      if (kind === 'duplicate') h.registry.clients.push(h.registry.clients[0]);
      if (kind === 'foreign provider') h.registry.provider = 'other';
      if (kind === 'incomplete') h.registry.complete = false;
      if (kind === 'no phone') h.registry.clients[0].phone = '';
      if (kind === 'no source') h.client.crmLinks = [];
      if (kind === 'ambiguous source')
        h.client.crmLinks.push({ ...h.client.crmLinks[0], id: 'crm-b' });
      await expect(h.run()).rejects.toThrow();
      for (const spy of Object.values(h.writes))
        expect(spy).not.toHaveBeenCalled();
    },
  );
  it.each(['predecessor', 'CRM source', 'candidate'])(
    'RV-DRIFT refuses %s changed during provider read',
    async (kind) => {
      const h = setup();
      h.crm.getClientRegistry.mockImplementation(() => {
        if (kind === 'predecessor') h.prior.id = 'new-tip';
        if (kind === 'CRM source')
          h.client.crmLinks[0].id = 'replacement-source';
        if (kind === 'candidate') {
          h.client.id = 'client-b';
          h.prior.clientId = 'client-b';
        }
        return Promise.resolve(h.registry);
      });
      await expect(h.run()).rejects.toThrow(
        'client_reverification_lineage_changed',
      );
    },
  );
  it('RV-CHANNEL binds changed channel address in a different hash', async () => {
    const h = setup();
    const first = await h.run();
    h.registry.clients[0].phone = '+79990000002';
    const second = await h.run();
    expect(first.verificationChannel.addressHash).not.toEqual(
      second.verificationChannel.addressHash,
    );
  });
  it('RV-CHANNEL binds changed CRM source even when its phone is identical', async () => {
    const h = setup();
    const first = await h.run();
    h.client.crmLinks[0].externalId = 'replacement-external';
    h.registry.clients[0].external_id = 'replacement-external';
    const second = await h.run();
    expect(first.verificationChannel.addressHash).not.toEqual(
      second.verificationChannel.addressHash,
    );
  });
});
