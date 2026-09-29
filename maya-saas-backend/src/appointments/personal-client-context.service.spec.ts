import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PersonalClientContextService } from './personal-client-context.service';

function setup() {
  const actor = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    membershipId: 'member-a',
    role: UserRole.TENANT_OWNER,
    email: 'synthetic@example.test',
    branchId: null,
    membershipStatus: 'active',
  };
  const membership = {
    id: actor.membershipId,
    userId: actor.userId,
    tenantId: actor.tenantId,
    status: 'active',
    role: actor.role,
  };
  const session = {
    id: actor.sessionId,
    userId: actor.userId,
    tenantId: actor.tenantId,
    user: { id: actor.userId, status: 'active' },
    membership,
    expiresAt: new Date('2099-01-01'),
    revokedAt: null as Date | null,
  };
  const link = {
    id: 'new-episode',
    tenantId: actor.tenantId,
    clientId: 'client-a',
    provider: 'maya_user',
    providerSubjectHash: 'a'.repeat(64),
    verificationVersion: 1,
    subjectHashVersion: 1,
    verificationIdentityHash: 'b'.repeat(64),
    verificationEvidenceHash: 'c'.repeat(64),
    revokedAt: null as Date | null,
  };
  const client = {
    id: link.clientId,
    tenantId: actor.tenantId,
    mergedIntoClientId: null as string | null,
    crmLinks: [] as { provider: string; externalId: string }[],
  };
  const rows = {
    $queryRaw: jest.fn().mockResolvedValue([{ now: new Date('2026-09-29') }]),
    authSession: { findUnique: jest.fn().mockResolvedValue(session) },
    clientChannelLink: { findMany: jest.fn().mockResolvedValue([link]) },
    client: { findUnique: jest.fn().mockResolvedValue(client) },
    unresolvedClientIdentityHold: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const prisma = {
    ...rows,
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(rows)),
    ),
  };
  const context = new TenantContextService();
  const service = new PersonalClientContextService(prisma as never, context, {
    opaqueReference: () => 'a'.repeat(64),
  } as never);
  const run = <T>(fn: () => T) =>
    context.runAsAuthPrincipal(
      { tenantId: actor.tenantId, userId: actor.userId, role: actor.role },
      fn,
    );
  const select = (choice: unknown = 'personal_client') =>
    run(() => service.select(actor, choice));
  return {
    actor,
    membership,
    session,
    link,
    client,
    prisma,
    context,
    run,
    select,
  };
}

describe('SB-1 explicit personal Client authority', () => {
  it('SB1-SELECT preserves the owner actor and emits distinct personal evidence without changing roles', async () => {
    const h = setup();
    await h.run(async () => {
      const selected = await h.select();
      expect(selected.kind).toBe('personal_client');
      expect(selected.linkId).toBe('new-episode');
      expect(selected.userId).toBe('user-a');
      expect(selected.membershipRole).toBe('tenant_owner');
      expect(selected.evidenceRefs).toEqual([
        'personal-context:v1:personal_client',
        'personal-actor-user:v1:user-a',
        'personal-actor-session:v1:session-a',
        'personal-actor-membership:v1:member-a',
        'personal-actor-role:v1:tenant_owner',
      ]);
      expect(Object.isFrozen(selected)).toBe(true);
      expect(Object.isFrozen(selected.evidenceRefs)).toBe(true);
      await selected.revalidate();
      expect(h.context.get()?.role).toBe('tenant_owner');
    });
    expect(h.actor.role).toBe(UserRole.TENANT_OWNER);
  });
  it.each([undefined, 'business_owner', 'client', { clientId: 'client-a' }])(
    'SB1-SELECTION refuses an implicit/caller-shaped choice %p',
    async (choice) => {
      const h = setup();
      await expect(
        h.run(() =>
          new PersonalClientContextService(
            h.prisma as never,
            h.context,
            {} as never,
          ).select(h.actor, choice),
        ),
      ).rejects.toThrow('explicit_personal_client_context_required');
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('SB1-TENANT refuses a foreign account before resolving identity', async () => {
    const h = setup();
    const service = new PersonalClientContextService(
      h.prisma as never,
      h.context,
      {} as never,
    );
    await expect(
      h.context.runAsAuthPrincipal(
        { tenantId: 'other', userId: h.actor.userId, role: h.actor.role },
        () => service.select(h.actor, 'personal_client'),
      ),
    ).rejects.toThrow('Cross-tenant');
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('SB1-ACTOR refuses a different authenticated actor', async () => {
    const h = setup();
    const service = new PersonalClientContextService(
      h.prisma as never,
      h.context,
      {} as never,
    );
    await expect(
      h.context.runAsAuthPrincipal(
        { tenantId: h.actor.tenantId, userId: 'other', role: h.actor.role },
        () => service.select(h.actor, 'personal_client'),
      ),
    ).rejects.toThrow('authenticated_account_required');
  });
  it.each([
    'revoked',
    'expired',
    'user',
    'membership',
    'tenant',
    'role',
    'membership-user',
  ])(
    'SB1-SESSION refuses stale session or membership: %s',
    async (condition) => {
      const h = setup();
      if (condition === 'revoked') h.session.revokedAt = new Date();
      if (condition === 'expired') h.session.expiresAt = new Date('2020-01-01');
      if (condition === 'user') h.session.user.status = 'disabled';
      if (condition === 'membership') h.membership.status = 'disabled';
      if (condition === 'tenant') h.session.tenantId = 'other';
      if (condition === 'role') h.membership.role = UserRole.CLIENT;
      if (condition === 'membership-user') h.membership.userId = 'other';
      await expect(h.select()).rejects.toThrow(
        'personal_client_session_inactive',
      );
      expect(h.prisma.clientChannelLink.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    'absent',
    'ambiguous',
    'revoked',
    'provider',
    'subject',
    'tenant',
    'version',
    'hash-version',
    'evidence',
  ])(
    'SB1-LINK refuses missing or noncurrent binding: %s',
    async (condition) => {
      const h = setup();
      if (condition === 'absent')
        h.prisma.clientChannelLink.findMany.mockResolvedValue([]);
      if (condition === 'ambiguous')
        h.prisma.clientChannelLink.findMany.mockResolvedValue([h.link, h.link]);
      if (condition === 'revoked') h.link.revokedAt = new Date();
      if (condition === 'provider') h.link.provider = 'telegram';
      if (condition === 'subject') h.link.providerSubjectHash = 'd'.repeat(64);
      if (condition === 'tenant') h.link.tenantId = 'other';
      if (condition === 'version') h.link.verificationVersion = 2;
      if (condition === 'hash-version') h.link.subjectHashVersion = 2;
      if (condition === 'evidence') h.link.verificationEvidenceHash = 'bad';
      await expect(h.select()).rejects.toThrow(
        'new_verified_maya_user_binding_required',
      );
      expect(h.prisma.client.findUnique).not.toHaveBeenCalled();
    },
  );
  it.each(['merged', 'foreign', 'hold'])(
    'SB1-CLIENT refuses unresolved Client identity: %s',
    async (condition) => {
      const h = setup();
      if (condition === 'merged') h.client.mergedIntoClientId = 'other';
      if (condition === 'foreign') h.client.tenantId = 'other';
      if (condition === 'hold') {
        h.client.crmLinks.push({ provider: 'yclients', externalId: 'exact' });
        h.prisma.unresolvedClientIdentityHold.findFirst.mockResolvedValue({
          id: 'hold',
        });
      }
      await expect(h.select()).rejects.toThrow('client_identity_unresolved');
    },
  );
  it.each(['link', 'client', 'evidence', 'revoked', 'session'])(
    'SB1-RECHECK refuses changes after selection: %s',
    async (condition) => {
      const h = setup();
      const selected = await h.select();
      if (condition === 'link') h.link.id = 'successor';
      if (condition === 'client') h.link.clientId = 'other';
      if (condition === 'evidence')
        h.link.verificationEvidenceHash = 'd'.repeat(64);
      if (condition === 'revoked') h.link.revokedAt = new Date();
      if (condition === 'session') h.session.revokedAt = new Date();
      await expect(h.run(() => selected.revalidate())).rejects.toThrow();
    },
  );
});
