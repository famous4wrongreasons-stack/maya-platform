import { C9Authority } from './c9.authority';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
import type { Prisma } from '@prisma/client';

describe('C9 current principal retains ordinary full-trial lifecycle', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());
  function fixture() {
    const tenant = {
      status: 'trial',
      trialFullAccess: true,
      trialEndsAt: new Date(now.getTime() + 1),
    };
    const membership = {
      id: 'membership-a',
      userId: 'owner-a',
      branchId: null,
      role: 'tenant_owner',
    };
    const ctx = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      membershipId: 'membership-a',
      source: 'auth_session',
    };
    const tx = {
      tenant: { findUnique: jest.fn(() => Promise.resolve(tenant)) },
      $queryRaw: jest.fn(() => Promise.resolve([membership])),
      staff: { findMany: jest.fn(() => Promise.resolve([])) },
    };
    const channels = { resolve: jest.fn() };
    const authority = new C9Authority(
      {
        get: () => ctx,
        requireTenantId: () => ctx.tenantId,
      } as TenantContextService,
      channels as unknown as ClientChannelRuntimeService,
    );
    return {
      tenant,
      tx,
      ctx,
      channels,
      resolve: () =>
        authority.current(tx as unknown as Prisma.TransactionClient),
    };
  }
  it('resolves real current membership without inventing Client or feature authority', async () => {
    const f = fixture();
    expect(await f.resolve()).toMatchObject({
      kind: 'USER',
      tenantId: 'tenant-a',
      userId: 'owner-a',
      membershipId: 'membership-a',
      clientId: null,
      channelLinkId: null,
    });
    expect(f.channels.resolve).not.toHaveBeenCalled();
  });
  it.each(['suspended', 'disabled', 'past_due', 'cancelled', 'unknown'])(
    'refuses %s even with a future full-trial date',
    async (status) => {
      const f = fixture();
      f.tenant.status = status;
      await expect(f.resolve()).rejects.toThrow(
        'c9_current_principal_required',
      );
      expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    },
  );
  it.each([null, new Date('invalid'), new Date(now.getTime() - 1), now])(
    'refuses missing, invalid or expired trial end %s',
    async (expires) => {
      const f = fixture();
      f.tenant.trialEndsAt = expires as Date;
      await expect(f.resolve()).rejects.toThrow(
        'c9_current_principal_required',
      );
    },
  );
  it('refuses setup-only trial and rereads revocation on the next call', async () => {
    const f = fixture();
    await f.resolve();
    f.tenant.trialFullAccess = false;
    await expect(f.resolve()).rejects.toThrow('c9_current_principal_required');
  });
  it('does not substitute another membership or accept an untrusted context source', async () => {
    const f = fixture();
    f.ctx.membershipId = 'foreign';
    await expect(f.resolve()).rejects.toThrow('c9_current_principal_required');
    f.ctx.membershipId = 'membership-a';
    f.ctx.source = 'caller';
    await expect(f.resolve()).rejects.toThrow('c9_current_principal_required');
  });
  it('retains the existing active tenant path', async () => {
    const f = fixture();
    f.tenant.status = 'active';
    f.tenant.trialFullAccess = false;
    f.tenant.trialEndsAt = null as unknown as Date;
    expect((await f.resolve()).kind).toBe('USER');
  });
});
