import { PrismaClient } from '@prisma/client';

import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  ClientChannelLinkService,
  ClientChannelLinkVerifier,
  VerifiedClientChannelProof,
} from './client-channel-link.service';

const accepted: VerifiedClientChannelProof = {
  tenantId: 'tenant-a',
  clientId: 'client-a',
  provider: 'telegram',
  providerSubjectHash: 'a'.repeat(64),
  method: 'explicit_verified_challenge',
  verificationIdentityHash: 'b'.repeat(64),
  verifier: 'synthetic-verifier.v1',
  channelControlProofHash: 'c'.repeat(64),
  clientAuthorityProofHash: 'd'.repeat(64),
  validUntil: new Date('2100-01-01T00:00:00Z'),
};

describe('A18 ClientChannelLink command boundary', () => {
  const context = new TenantContextService();
  const transaction = jest.fn();
  const verifyLink = jest.fn();
  const verifyRevocation = jest.fn();
  const verifier: ClientChannelLinkVerifier = { verifyLink, verifyRevocation };
  const service = new ClientChannelLinkService(
    { $transaction: transaction } as unknown as PrismaClient,
    context,
    verifier,
  );
  const run = (request: unknown) =>
    context.runAsSystemTenant('tenant-a', () => service.link(request));
  beforeEach(() => {
    jest.clearAllMocks();
    verifyLink.mockResolvedValue({ ...accepted });
  });

  it.each([
    'clientId',
    'tenantId',
    'provider',
    'providerSubjectId',
    'providerSubjectHash',
    'phone',
    'userId',
    'verifiedAt',
  ])(
    'rejects initiator authority field %s before verification',
    async (key) => {
      await expect(
        run({ proof: 'synthetic-proof-token', [key]: 'forged' }),
      ).rejects.toThrow('Only an opaque');
      expect(verifyLink).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects unverified/phone-only evidence rather than accepting an opaque token as authority', async () => {
    verifyLink.mockRejectedValue(
      new Error('Phone match is not Client authority'),
    );
    await expect(run({ proof: 'synthetic-phone-only' })).rejects.toThrow(
      'Phone match',
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([
    { tenantId: 'tenant-b' },
    { provider: 'telegram:other-bot' },
    { providerSubjectHash: 'raw-subject' },
    { clientAuthorityProofHash: '' },
    { method: 'proven_user_client_link' },
    { validUntil: new Date(0) },
  ])(
    'rejects malformed, foreign or expired verifier output %j',
    async (override) => {
      verifyLink.mockResolvedValue({ ...accepted, ...override });
      await expect(run({ proof: 'synthetic-proof-token' })).rejects.toThrow();
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects a forged rebind predecessor before any transaction', async () => {
    verifyLink.mockResolvedValue({ ...accepted, supersedesLinkId: 'link-a' });
    verifyRevocation.mockResolvedValue({ ...accepted, linkId: 'link-b' });
    await expect(
      context.runAsSystemTenant('tenant-a', () =>
        service.rebind({
          proof: 'synthetic-link-token',
          revocationProof: 'synthetic-revoke-token',
        }),
      ),
    ).rejects.toThrow('same prior identity');
    expect(transaction).not.toHaveBeenCalled();
  });
});
