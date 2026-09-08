import { ForbiddenException } from '@nestjs/common';
import { ClientChannelRuntimeService } from './client-channel-runtime.service';

const channel = {
  tenantId: 'tenant-1',
  provider: 'telegram',
  providerSubjectHash: 'a'.repeat(64),
  channelControlProofHash: 'b'.repeat(64),
  validUntil: new Date('2099-01-01'),
  userId: null,
};
const link = {
  id: 'verified-link',
  clientId: 'client-without-user',
  tenantId: channel.tenantId,
  verificationVersion: 1,
  subjectHashVersion: 1,
  verificationEvidenceHash: 'c'.repeat(64),
};
function fixture() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    clientChannelLink: { findMany: jest.fn().mockResolvedValue([link]) },
    clientLinkChallenge: { create: jest.fn() },
    clientConsentFact: { create: jest.fn() },
    client: { create: jest.fn() },
    actionExecution: { create: jest.fn() },
  };
  const authenticate = jest.fn().mockResolvedValue(channel);
  const issue = jest.fn().mockResolvedValue({ path: 'canonical' });
  const context = {
    assertTenantId: jest.fn((id: string) => {
      if (id !== channel.tenantId) throw new ForbiddenException();
    }),
  };
  const service = Object.assign(
    Object.create(ClientChannelRuntimeService.prototype) as object,
    {
      resolverId: 'a18.active-verified-client-channel.v1',
      channels: { authenticate },
      context,
      challenges: { issue },
    },
  ) as ClientChannelRuntimeService;
  return { service, tx, authenticate, issue };
}
describe('A18 existing canonical Client provenance', () => {
  it('routes issuance exclusively through the canonical verified resolver', async () => {
    const { service, issue } = fixture();
    await expect(service.issue('proof')).resolves.toEqual({
      path: 'canonical',
    });
    expect(issue).toHaveBeenCalledWith({ resolutionProof: 'proof' });
  });
  it('supports a verified Client without Maya User and exact tenant/channel binding', async () => {
    const { service, tx } = fixture();
    await expect(service.resolve('proof', tx as never)).resolves.toMatchObject({
      clientId: link.clientId,
      tenantId: channel.tenantId,
      linkId: link.id,
      resolver: 'a18.active-verified-client-channel.v1',
    });
    expect(tx.clientChannelLink.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: channel.tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
  });
  it.each(['missing link', 'revoked link', 'wrong Client channel'])(
    'denies %s before any effects',
    async () => {
      const { service, tx } = fixture();
      tx.clientChannelLink.findMany.mockResolvedValue([]);
      await expect(
        service.resolve('proof', tx as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      for (const model of [
        tx.clientLinkChallenge,
        tx.clientConsentFact,
        tx.client,
        tx.actionExecution,
      ])
        expect(model.create).not.toHaveBeenCalled();
    },
  );
  it('rejects wrong tenant before Client resolution', async () => {
    const { service, tx, authenticate } = fixture();
    authenticate.mockResolvedValue({ ...channel, tenantId: 'other' });
    await expect(service.resolve('proof', tx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.clientChannelLink.findMany).not.toHaveBeenCalled();
  });
  it('rejects a channel changed while acquiring its identity lock', async () => {
    const { service, tx, authenticate } = fixture();
    authenticate.mockResolvedValueOnce(channel).mockResolvedValueOnce({
      ...channel,
      providerSubjectHash: 'd'.repeat(64),
    });
    await expect(service.resolve('proof', tx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it.each(['verificationVersion', 'subjectHashVersion'])(
    'rejects unapproved %s',
    async (field) => {
      const { service, tx } = fixture();
      tx.clientChannelLink.findMany.mockResolvedValue([
        { ...link, [field]: 2 },
      ]);
      await expect(
        service.resolve('proof', tx as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
