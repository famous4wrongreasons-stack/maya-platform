import { ClientChannelRuntimeService } from './client-channel-runtime.service';

const CHANNEL = {
  tenantId: 'tenant-1',
  provider: 'maya_user' as const,
  providerSubjectHash: 'a'.repeat(64),
};

function fixture(links: Array<{ id: string }>) {
  const tx = {
    clientChannelLink: {
      findMany: jest.fn().mockResolvedValue(links),
    },
  };
  const regularIssue = jest.fn().mockResolvedValue({ path: 'regular' });
  const initialIssue = jest.fn().mockResolvedValue({ path: 'initial' });
  const state = {
    prisma: {
      $transaction: jest.fn((work: (transaction: typeof tx) => unknown) =>
        work(tx),
      ),
    },
    channels: { authenticate: jest.fn().mockResolvedValue(CHANNEL) },
    challenges: { issue: regularIssue },
    initialMayaChallenges: { issue: initialIssue },
  };
  const service = Object.assign(
    Object.create(ClientChannelRuntimeService.prototype) as object,
    state,
  ) as ClientChannelRuntimeService;
  return { service, tx, regularIssue, initialIssue };
}

describe('A18 Client linking challenge routing', () => {
  it('uses the approved Maya account association issuer for a first link', async () => {
    const { service, regularIssue, initialIssue } = fixture([]);

    await expect(service.issue('maya-session-proof')).resolves.toEqual({
      path: 'initial',
    });
    expect(initialIssue).toHaveBeenCalledWith({
      resolutionProof: 'maya-session-proof',
    });
    expect(regularIssue).not.toHaveBeenCalled();
  });

  it('keeps an existing verified link on the original challenge issuer', async () => {
    const { service, regularIssue, initialIssue } = fixture([{ id: 'link-1' }]);

    await expect(service.issue('maya-session-proof')).resolves.toEqual({
      path: 'regular',
    });
    expect(regularIssue).toHaveBeenCalledWith({
      resolutionProof: 'maya-session-proof',
    });
    expect(initialIssue).not.toHaveBeenCalled();
  });
});
