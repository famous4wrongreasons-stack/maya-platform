import { PrismaService } from '../prisma/prisma.service';
import {
  AuthRetentionRepository,
  AuthRetentionRunParams,
} from './auth-retention.repository';

describe('AuthRetentionRepository', () => {
  const params: AuthRetentionRunParams = {
    batchSize: 1,
    dryRun: true,
    now: new Date('2026-07-11T12:00:00.000Z'),
    cutoffs: {
      sessionInactiveBefore: new Date('2026-06-11T12:00:00.000Z'),
      authChallengeBefore: new Date('2026-07-10T12:00:00.000Z'),
      rateLimitBefore: new Date('2026-07-10T12:00:00.000Z'),
    },
  };

  const createRepository = (lockAcquired = true) => {
    const queryRawMock = jest
      .fn()
      .mockResolvedValueOnce([{ acquired: lockAcquired }]);
    const authSessionCountMock = jest.fn().mockResolvedValue(2);
    const refreshTokenCountMock = jest.fn().mockResolvedValue(3);
    const phoneCountMock = jest.fn().mockResolvedValue(2);
    const flowCountMock = jest.fn().mockResolvedValue(1);
    const bucketCountMock = jest.fn().mockResolvedValue(1);
    const authSessionDeleteMock = jest.fn().mockResolvedValue({ count: 1 });
    const phoneDeleteMock = jest.fn().mockResolvedValue({ count: 1 });
    const flowDeleteMock = jest.fn().mockResolvedValue({ count: 1 });
    const bucketDeleteMock = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      $queryRaw: queryRawMock,
      authSession: {
        count: authSessionCountMock,
        deleteMany: authSessionDeleteMock,
      },
      authRefreshToken: {
        count: refreshTokenCountMock,
      },
      phoneAuthCode: {
        count: phoneCountMock,
        deleteMany: phoneDeleteMock,
      },
      authFlowState: {
        count: flowCountMock,
        deleteMany: flowDeleteMock,
      },
      authRateLimitBucket: {
        count: bucketCountMock,
        deleteMany: bucketDeleteMock,
      },
    };
    const transactionMock = jest.fn(
      (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
    );
    const repository = new AuthRetentionRepository({
      $transaction: transactionMock,
    } as unknown as PrismaService);

    return {
      repository,
      mocks: {
        authSessionCountMock,
        authSessionDeleteMock,
        bucketCountMock,
        bucketDeleteMock,
        flowCountMock,
        flowDeleteMock,
        phoneCountMock,
        phoneDeleteMock,
        queryRawMock,
        refreshTokenCountMock,
        transactionMock,
      },
    };
  };

  it('counts eligible rows in dry-run without deleting anything', async () => {
    const { repository, mocks } = createRepository();

    const result = await repository.run(params);

    expect(result).toMatchObject({
      status: 'dry_run',
      dryRun: true,
      eligible: {
        sessions: 2,
        refreshTokens: 3,
        phoneChallenges: 2,
        oauthStates: 1,
        rateLimitBuckets: 1,
      },
      deleted: {
        sessions: 0,
        refreshTokens: 0,
        phoneChallenges: 0,
        oauthStates: 0,
        rateLimitBuckets: 0,
      },
      hasMore: true,
    });
    expect(mocks.authSessionCountMock).toHaveBeenCalledWith({
      where: {
        OR: [
          { revokedAt: { lt: params.cutoffs.sessionInactiveBefore } },
          { expiresAt: { lt: params.cutoffs.sessionInactiveBefore } },
        ],
      },
    });
    expect(mocks.refreshTokenCountMock).toHaveBeenCalledWith({
      where: {
        session: {
          OR: [
            { revokedAt: { lt: params.cutoffs.sessionInactiveBefore } },
            { expiresAt: { lt: params.cutoffs.sessionInactiveBefore } },
          ],
        },
      },
    });
    expect(mocks.authSessionDeleteMock).not.toHaveBeenCalled();
    expect(mocks.phoneDeleteMock).not.toHaveBeenCalled();
    expect(mocks.flowDeleteMock).not.toHaveBeenCalled();
    expect(mocks.bucketDeleteMock).not.toHaveBeenCalled();
  });

  it('skips immediately when another cleanup holds the advisory lock', async () => {
    const { repository, mocks } = createRepository(false);

    await expect(repository.run(params)).resolves.toMatchObject({
      status: 'skipped_locked',
      eligible: {
        sessions: 0,
        refreshTokens: 0,
      },
    });
    expect(mocks.authSessionCountMock).not.toHaveBeenCalled();
    expect(mocks.queryRawMock).toHaveBeenCalledTimes(1);
  });

  it('deletes one bounded batch and only counts refresh tokens for cascade', async () => {
    const { repository, mocks } = createRepository();
    mocks.queryRawMock
      .mockResolvedValueOnce([{ id: 'old-session' }])
      .mockResolvedValueOnce([{ id: 'old-phone' }])
      .mockResolvedValueOnce([{ id: 'old-flow' }])
      .mockResolvedValueOnce([{ id: 'old-bucket' }]);
    mocks.refreshTokenCountMock
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    const result = await repository.run({
      ...params,
      dryRun: false,
    });

    expect(result).toMatchObject({
      status: 'completed',
      deleted: {
        sessions: 1,
        refreshTokens: 2,
        phoneChallenges: 1,
        oauthStates: 1,
        rateLimitBuckets: 1,
      },
      hasMore: true,
    });
    expect(mocks.authSessionDeleteMock).toHaveBeenCalledWith({
      where: { id: { in: ['old-session'] } },
    });
    expect(mocks.refreshTokenCountMock).toHaveBeenLastCalledWith({
      where: { sessionId: { in: ['old-session'] } },
    });
    expect(mocks.queryRawMock).toHaveBeenCalledTimes(5);
  });
});
