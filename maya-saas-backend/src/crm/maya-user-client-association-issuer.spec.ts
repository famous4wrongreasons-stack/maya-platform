import { ForbiddenException } from '@nestjs/common';

import { MayaUserClientAssociationIssuer } from './maya-user-client-association-issuer';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const CLIENT_ID = 'client-1';
const PROFILE_ID = 'profile-1';
const SUBJECT_HASH = 'a'.repeat(64);
const CONTROL_HASH = 'b'.repeat(64);
const VALID_UNTIL = new Date('2026-09-08T12:00:00.000Z');

function fixture() {
  const channel = {
    tenantId: TENANT_ID,
    provider: 'maya_user' as const,
    providerSubjectHash: SUBJECT_HASH,
    deliveryAddress: USER_ID,
    userId: USER_ID,
    channelControlProofHash: CONTROL_HASH,
    validUntil: VALID_UNTIL,
  };
  const authenticate = jest.fn().mockResolvedValue(channel);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    clientChannelLink: { findMany: jest.fn().mockResolvedValue([]) },
    client: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: CLIENT_ID, userId: USER_ID }]),
    },
    customerProfile: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: PROFILE_ID, userId: USER_ID, clientId: null },
        ]),
    },
  };
  const context = { assertTenantId: jest.fn((value: string) => value) };
  const issuer = new MayaUserClientAssociationIssuer(
    context as never,
    { authenticate } as never,
  );
  return { issuer, tx, authenticate, channel };
}

describe('A18 Maya account first-link challenge authority', () => {
  it('resolves one dual-bound Client without phone or caller Client input', async () => {
    const { issuer, tx } = fixture();

    await expect(
      issuer.resolve('maya-session-proof', tx as never),
    ).resolves.toEqual(
      expect.objectContaining({
        tenantId: TENANT_ID,
        clientId: CLIENT_ID,
        resolver: 'a18.maya-user-client-association.v1',
        issuerAuthorityHash: CONTROL_HASH,
        validUntil: VALID_UNTIL,
      }),
    );
    expect(tx.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_ID,
          userId: USER_ID,
          mergedIntoClientId: null,
        },
      }),
    );
    expect(tx.customerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_ID,
          OR: [{ userId: USER_ID }, { clientId: CLIENT_ID }],
        },
      }),
    );
  });

  it('fails closed when the independent profile binding is absent', async () => {
    const { issuer, tx } = fixture();
    tx.customerProfile.findMany.mockResolvedValue([]);

    await expect(
      issuer.resolve('maya-session-proof', tx as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed for a conflicting or ambiguous Client association', async () => {
    const { issuer, tx } = fixture();
    tx.customerProfile.findMany.mockResolvedValue([
      { id: PROFILE_ID, userId: USER_ID, clientId: 'client-other' },
    ]);

    await expect(
      issuer.resolve('maya-session-proof', tx as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    tx.customerProfile.findMany.mockResolvedValue([
      { id: PROFILE_ID, userId: USER_ID, clientId: null },
    ]);
    tx.client.findMany.mockResolvedValue([
      { id: CLIENT_ID, userId: USER_ID },
      { id: 'client-2', userId: USER_ID },
    ]);
    await expect(
      issuer.resolve('maya-session-proof', tx as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not bootstrap Telegram or overwrite an existing active link', async () => {
    const { issuer, tx, authenticate, channel } = fixture();
    authenticate.mockResolvedValue({
      ...channel,
      provider: 'telegram',
      userId: null,
    });
    await expect(
      issuer.resolve('telegram-proof', tx as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    authenticate.mockResolvedValue(channel);
    tx.clientChannelLink.findMany.mockResolvedValue([{ id: 'link-1' }]);
    await expect(
      issuer.resolve('maya-session-proof', tx as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a channel identity change during resolution', async () => {
    const { issuer, tx, authenticate, channel } = fixture();
    authenticate.mockResolvedValueOnce(channel).mockResolvedValueOnce({
      ...channel,
      providerSubjectHash: 'c'.repeat(64),
    });

    await expect(
      issuer.resolve('maya-session-proof', tx as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
