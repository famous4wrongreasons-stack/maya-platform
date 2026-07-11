import { PrismaService } from '../prisma/prisma.service';
import {
  AuthRateLimitRepository,
  AuthRateLimitRuleInput,
} from './auth-rate-limit.repository';

describe('AuthRateLimitRepository', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  const rule = (
    policyKey: string,
    maxAttempts: number,
    scope: AuthRateLimitRuleInput['scope'] = 'identity',
  ): AuthRateLimitRuleInput => ({
    action: 'password_login',
    maxAttempts,
    policyKey,
    scope,
    subjectHash: policyKey.padEnd(64, 'a').slice(0, 64),
    tenantId: 'tenant-a',
    windowSeconds: 900,
  });

  it('stops at a blocked low-cardinality scope before creating identity rows', async () => {
    const queryRawMock = jest.fn().mockResolvedValueOnce([
      {
        attempts: 51,
        windowEndsAt: new Date('2026-07-11T12:12:00.000Z'),
      },
    ]);
    const transactionMock = jest.fn(
      (
        callback: (transaction: { $queryRaw: typeof queryRawMock }) => unknown,
      ) => callback({ $queryRaw: queryRawMock }),
    );
    const repository = new AuthRateLimitRepository({
      $transaction: transactionMock,
    } as unknown as PrismaService);

    const result = await repository.consume(
      [rule('policy-identity', 10), rule('policy-ip', 50, 'ip')],
      now,
    );

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      allowed: false,
      retryAfterSeconds: 720,
      violatedPolicyKeys: ['policy-ip'],
    });
  });

  it('allows counters at their configured maximum', async () => {
    const queryRawMock = jest
      .fn()
      .mockResolvedValueOnce([
        {
          attempts: 20,
          windowEndsAt: new Date('2026-07-11T12:15:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          attempts: 5,
          windowEndsAt: new Date('2026-07-11T12:15:00.000Z'),
        },
      ]);
    const repository = new AuthRateLimitRepository({
      $transaction: jest.fn(
        (
          callback: (transaction: {
            $queryRaw: typeof queryRawMock;
          }) => unknown,
        ) => callback({ $queryRaw: queryRawMock }),
      ),
    } as unknown as PrismaService);

    await expect(
      repository.consume(
        [rule('policy-identity', 5), rule('policy-ip', 20, 'ip')],
        now,
      ),
    ).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      violatedPolicyKeys: [],
    });
    expect(queryRawMock).toHaveBeenCalledTimes(2);
  });
});
