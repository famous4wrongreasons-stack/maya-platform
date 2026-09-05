import { ForbiddenException } from '@nestjs/common';

import { ClientChannelRuntimeService } from './client-channel-runtime.service';

describe('B21 realtime canonical authority', () => {
  function fixture() {
    const tx = {
      clientChannelLink: { findMany: jest.fn() },
      client: { findUnique: jest.fn() },
      customerProfile: { findUnique: jest.fn() },
      authIdentity: { findMany: jest.fn() },
      membership: { findUnique: jest.fn() },
      crmStaffAccess: { findMany: jest.fn() },
    };
    const channels = { authenticate: jest.fn() };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = Object.assign(
      Object.create(ClientChannelRuntimeService.prototype) as object,
      { prisma, channels },
    ) as Pick<ClientChannelRuntimeService, 'realtimeAuthority'>;
    return { service, tx, channels };
  }

  it('permits an exact active Client link with canonical privacy consent', async () => {
    const { service, tx, channels } = fixture();
    channels.authenticate.mockResolvedValue({
      tenantId: 'tenant-a',
      provider: 'telegram',
      providerSubjectHash: 'subject-hash',
      userId: null,
    });
    tx.clientChannelLink.findMany.mockResolvedValue([{ clientId: 'client-a' }]);
    tx.client.findUnique.mockResolvedValue({ mergedIntoClientId: null });
    tx.customerProfile.findUnique.mockResolvedValue({
      privacyConsentAt: new Date(),
    });

    await expect(
      service.realtimeAuthority('signed-channel-proof', { mode: 'client' }),
    ).resolves.toEqual({
      ready: true,
      authority: 'client',
      role: 'client',
      client_link_verified: true,
      privacy_verified: true,
      durable_history: false,
      business_mutations: 0,
    });
  });

  it.each([
    ['missing', []],
    ['ambiguous', [{ clientId: 'a' }, { clientId: 'b' }]],
  ])('fails closed for a %s Client binding', async (_label, links) => {
    const { service, tx, channels } = fixture();
    channels.authenticate.mockResolvedValue({
      tenantId: 'tenant-a',
      provider: 'telegram',
      providerSubjectHash: 'subject-hash',
      userId: null,
    });
    tx.clientChannelLink.findMany.mockResolvedValue(links);
    await expect(
      service.realtimeAuthority('proof', { mode: 'client' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.client.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when the link is revoked, wrong-tenant, or lacks privacy consent', async () => {
    const { service, tx, channels } = fixture();
    channels.authenticate.mockResolvedValue({
      tenantId: 'tenant-a',
      provider: 'telegram',
      providerSubjectHash: 'subject-hash',
      userId: null,
    });
    tx.clientChannelLink.findMany.mockResolvedValue([{ clientId: 'client-a' }]);
    tx.client.findUnique.mockResolvedValue({ mergedIntoClientId: null });
    tx.customerProfile.findUnique.mockResolvedValue({ privacyConsentAt: null });
    await expect(
      service.realtimeAuthority('proof', { mode: 'client' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.clientChannelLink.findMany).toHaveBeenCalledTimes(1);
  });

  it('permits staff only through Maya identity, membership, and A16 access', async () => {
    const { service, tx, channels } = fixture();
    channels.authenticate.mockResolvedValue({
      tenantId: 'tenant-a',
      provider: 'maya_user',
      providerSubjectHash: 'subject-hash',
      userId: 'user-a',
    });
    tx.authIdentity.findMany.mockResolvedValue([{ id: 'identity-a' }]);
    tx.membership.findUnique.mockResolvedValue({
      id: 'membership-a',
      role: 'staff',
      status: 'active',
    });
    tx.crmStaffAccess.findMany.mockResolvedValue([{ role: 'staff' }]);

    await expect(
      service.realtimeAuthority('maya-proof', { mode: 'staff' }),
    ).resolves.toMatchObject({
      ready: true,
      authority: 'staff',
      role: 'staff',
      auth_identity_verified: true,
      membership_verified: true,
      crm_staff_access_verified: true,
      durable_history: false,
      business_mutations: 0,
    });
  });

  it('never turns a Telegram subject into staff authority', async () => {
    const { service, channels } = fixture();
    channels.authenticate.mockResolvedValue({
      tenantId: 'tenant-a',
      provider: 'telegram',
      providerSubjectHash: 'subject-hash',
      userId: null,
    });
    await expect(
      service.realtimeAuthority('telegram-proof', { mode: 'staff' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [
      'no AuthIdentity',
      [],
      { role: 'staff', status: 'active' },
      [{ role: 'staff' }],
    ],
    [
      'inactive membership',
      [{ id: 'identity-a' }],
      { role: 'staff', status: 'suspended' },
      [{ role: 'staff' }],
    ],
    [
      'revoked A16 access',
      [{ id: 'identity-a' }],
      { role: 'staff', status: 'active' },
      [],
    ],
    [
      'role mismatch',
      [{ id: 'identity-a' }],
      { role: 'administrator', status: 'active' },
      [{ role: 'staff' }],
    ],
  ])(
    'fails closed for staff with %s',
    async (_label, identities, membership, accesses) => {
      const { service, tx, channels } = fixture();
      channels.authenticate.mockResolvedValue({
        tenantId: 'tenant-a',
        provider: 'maya_user',
        providerSubjectHash: 'subject-hash',
        userId: 'user-a',
      });
      tx.authIdentity.findMany.mockResolvedValue(identities);
      tx.membership.findUnique.mockResolvedValue(membership);
      tx.crmStaffAccess.findMany.mockResolvedValue(accesses);
      await expect(
        service.realtimeAuthority('maya-proof', { mode: 'staff' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
