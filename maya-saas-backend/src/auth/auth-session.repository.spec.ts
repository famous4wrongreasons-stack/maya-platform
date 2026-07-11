import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthSessionRepository } from './auth-session.repository';

describe('AuthSessionRepository', () => {
  const principal = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: 'client',
  };

  const createRepository = () => {
    const sessionCreateMock = jest.fn().mockResolvedValue({
      id: 'session-1',
      deviceLabel: 'iPhone',
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      lastUsedAt: new Date('2026-07-11T12:00:00.000Z'),
      expiresAt: new Date('2026-08-10T12:00:00.000Z'),
      revokedAt: null,
      revokeReason: null,
    });
    const sessionFindManyMock = jest.fn().mockResolvedValue([]);
    const sessionUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const refreshUpdateManyMock: jest.MockedFunction<
      (args: {
        where: {
          id: string;
          sessionId: string;
          tokenHash: string;
          consumedAt: null;
          revokedAt: null;
          expiresAt: { gt: Date };
          session: {
            userId: string;
            tenantId: string | null;
            revokedAt: null;
            expiresAt: { gt: Date };
          };
        };
        data: { consumedAt: Date };
      }) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 1 });
    const refreshFindUniqueMock = jest.fn().mockResolvedValue(null);
    const refreshCreateMock = jest.fn().mockResolvedValue({ id: 'token-2' });
    const transactionClient = {
      authSession: {
        findMany: sessionFindManyMock,
        updateMany: sessionUpdateManyMock,
      },
      authRefreshToken: {
        updateMany: refreshUpdateManyMock,
        findUnique: refreshFindUniqueMock,
        create: refreshCreateMock,
      },
    };
    const transactionMock = jest.fn(
      (callback: (transaction: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    );
    const prisma = {
      authSession: {
        create: sessionCreateMock,
        findMany: sessionFindManyMock,
      },
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();

    return {
      repository: new AuthSessionRepository(prisma, tenantContext),
      tenantContext,
      mocks: {
        refreshCreateMock,
        refreshFindUniqueMock,
        refreshUpdateManyMock,
        sessionCreateMock,
        sessionFindManyMock,
        sessionUpdateManyMock,
        transactionMock,
      },
    };
  };

  it('injects the authenticated principal into a new session', async () => {
    const { repository, tenantContext, mocks } = createRepository();
    const expiresAt = new Date('2026-08-10T12:00:00.000Z');

    await tenantContext.runAsAuthPrincipal(principal, () =>
      repository.createSession(principal, {
        id: 'session-1',
        deviceLabel: 'iPhone',
        ipHash: 'ip-hash',
        expiresAt,
        refreshCredential: {
          id: 'token-1',
          tokenHash: 'token-hash',
          expiresAt,
        },
      }),
    );

    expect(mocks.sessionCreateMock).toHaveBeenCalledWith({
      data: {
        id: 'session-1',
        tenantId: 'tenant-a',
        userId: 'user-a',
        deviceLabel: 'iPhone',
        ipHash: 'ip-hash',
        expiresAt,
        refreshTokens: {
          create: {
            id: 'token-1',
            tokenHash: 'token-hash',
            expiresAt,
          },
        },
      },
    });
  });

  it('rotates one unconsumed token inside the principal scope', async () => {
    const { repository, tenantContext, mocks } = createRepository();
    const now = new Date('2026-07-11T12:00:00.000Z');
    const expiresAt = new Date('2026-08-10T12:00:00.000Z');

    const outcome = await tenantContext.runAsAuthPrincipal(principal, () =>
      repository.rotateRefreshToken(principal, {
        currentTokenId: 'token-1',
        currentTokenHash: 'current-hash',
        nextCredential: {
          id: 'token-2',
          tokenHash: 'next-hash',
          expiresAt,
        },
        now,
        sessionId: 'session-1',
      }),
    );

    expect(outcome).toBe('rotated');
    const consumeArgs = mocks.refreshUpdateManyMock.mock.calls[0]?.[0];
    expect(consumeArgs).toMatchObject({
      where: {
        id: 'token-1',
        sessionId: 'session-1',
        tokenHash: 'current-hash',
        session: {
          userId: 'user-a',
          tenantId: 'tenant-a',
        },
      },
      data: { consumedAt: now },
    });
    expect(mocks.refreshCreateMock).toHaveBeenCalledWith({
      data: {
        id: 'token-2',
        tokenHash: 'next-hash',
        expiresAt,
        sessionId: 'session-1',
      },
    });
  });

  it('revokes the whole session when a consumed token is reused', async () => {
    const { repository, tenantContext, mocks } = createRepository();
    const now = new Date('2026-07-11T12:00:00.000Z');
    mocks.refreshUpdateManyMock
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    mocks.refreshFindUniqueMock.mockResolvedValue({
      tokenHash: 'current-hash',
      consumedAt: new Date('2026-07-11T11:59:00.000Z'),
      session: {
        id: 'session-1',
        tenantId: 'tenant-a',
        userId: 'user-a',
      },
    });

    const outcome = await tenantContext.runAsAuthPrincipal(principal, () =>
      repository.rotateRefreshToken(principal, {
        currentTokenId: 'token-1',
        currentTokenHash: 'current-hash',
        nextCredential: {
          id: 'token-2',
          tokenHash: 'next-hash',
          expiresAt: new Date('2026-08-10T12:00:00.000Z'),
        },
        now,
        sessionId: 'session-1',
      }),
    );

    expect(outcome).toBe('reused');
    expect(mocks.sessionUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        userId: 'user-a',
        tenantId: 'tenant-a',
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: 'refresh_token_reuse',
      },
    });
    expect(mocks.refreshCreateMock).not.toHaveBeenCalled();
  });

  it('fails closed without an auth-session principal context', () => {
    const { repository, tenantContext, mocks } = createRepository();

    expect(() =>
      tenantContext.runAsPublicTenant('tenant-a', () =>
        repository.listSessions(principal),
      ),
    ).toThrow(ForbiddenException);
    expect(mocks.sessionFindManyMock).not.toHaveBeenCalled();
  });
});
