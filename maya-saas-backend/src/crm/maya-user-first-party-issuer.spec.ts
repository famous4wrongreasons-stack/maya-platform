import { ForbiddenException } from '@nestjs/common';

import { MayaUserFirstPartyIssuer } from './maya-user-first-party-issuer';

const channel = {
  tenantId: 'tenant-1',
  provider: 'maya_user' as const,
  providerSubjectHash: 'a'.repeat(64),
  channelControlProofHash: 'b'.repeat(64),
  validUntil: new Date('2099-01-01'),
  userId: 'user-1',
};

describe('MayaUserFirstPartyIssuer', () => {
  const setup = () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      clientChannelLink: { findMany: jest.fn().mockResolvedValue([]) },
      client: {
        findMany: jest.fn().mockResolvedValue([{ id: 'owned-client' }]),
      },
    };
    const authenticate = jest.fn().mockResolvedValue(channel);
    const issuer = new MayaUserFirstPartyIssuer(
      {
        assertTenantId: jest.fn((id: string) => {
          if (id !== channel.tenantId) throw new ForbiddenException();
        }),
      } as never,
      { authenticate } as never,
      {
        opaqueReference: jest.fn().mockReturnValue('c'.repeat(64)),
      } as never,
    );
    return { issuer, tx, authenticate };
  };

  it('resolves the exact owned Maya Client when no channel link exists', async () => {
    const { issuer, tx } = setup();
    await expect(issuer.resolve('proof', tx as never)).resolves.toMatchObject({
      clientId: 'owned-client',
      tenantId: channel.tenantId,
      resolver: 'a18.first-party-maya-user.v1',
      resolutionEvidenceRef: 'first-party-maya-user:user-1',
    });
  });

  it.each([
    ['telegram', { ...channel, provider: 'telegram', userId: null }],
    ['missing Client', { clients: [] }],
    ['ambiguous Client', { clients: [{ id: 'a' }, { id: 'b' }] }],
    ['existing link', { links: [{ id: 'link-1' }] }],
  ])('denies %s', async (_name, override) => {
    const { issuer, tx, authenticate } = setup();
    if ('provider' in override) authenticate.mockResolvedValue(override);
    if ('clients' in override)
      tx.client.findMany.mockResolvedValue(override.clients);
    if ('links' in override)
      tx.clientChannelLink.findMany.mockResolvedValue(override.links);
    await expect(issuer.resolve('proof', tx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
