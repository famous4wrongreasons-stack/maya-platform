import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantAuthRepository } from './tenant-auth.repository';

type PhoneUpsertCall = {
  where: { tenantId_phone: { tenantId: string; phone: string } };
  create: { tenantId: string };
};

type IdentityCreateCall = {
  data: { tenantId: string; userId: string };
};

describe('TenantAuthRepository', () => {
  const createRepository = () => {
    const phoneUpsertMock: jest.MockedFunction<
      (args: PhoneUpsertCall) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'challenge-1' });
    const phoneFindUniqueMock = jest.fn().mockResolvedValue(null);
    const phoneUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const flowCreateMock = jest.fn().mockResolvedValue({ id: 'flow-1' });
    const flowUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const identityFindUniqueMock = jest.fn().mockResolvedValue(null);
    const identityCreateMock: jest.MockedFunction<
      (args: IdentityCreateCall) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'identity-1' });
    const identityUpdateMock = jest
      .fn()
      .mockResolvedValue({ id: 'identity-1' });
    const transactionClient = {
      phoneAuthCode: {
        upsert: phoneUpsertMock,
        findUnique: phoneFindUniqueMock,
        updateMany: phoneUpdateManyMock,
      },
      authFlowState: {
        create: flowCreateMock,
        updateMany: flowUpdateManyMock,
      },
      authIdentity: {
        findUnique: identityFindUniqueMock,
        create: identityCreateMock,
        update: identityUpdateMock,
      },
    };
    const transactionMock = jest.fn(
      (callback: (transaction: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    );
    const prisma = {
      ...transactionClient,
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();

    return {
      repository: new TenantAuthRepository(prisma, tenantContext),
      tenantContext,
      mocks: {
        flowCreateMock,
        flowUpdateManyMock,
        identityCreateMock,
        identityFindUniqueMock,
        identityUpdateMock,
        phoneFindUniqueMock,
        phoneUpdateManyMock,
        phoneUpsertMock,
        transactionMock,
      },
    };
  };

  it('injects context tenant into phone challenge reads and writes', async () => {
    const { repository, tenantContext, mocks } = createRepository();
    const expiresAt = new Date('2026-07-11T12:05:00.000Z');

    await tenantContext.runAsPublicTenant('tenant-a', async () => {
      await repository.upsertPhoneChallenge({
        phone: '+79990000000',
        codeHash: 'hash',
        expiresAt,
      });
      await repository.findPhoneChallenge('+79990000000');
      await repository.claimPhoneChallenge(
        'challenge-1',
        'hash',
        new Date('2026-07-11T12:00:00.000Z'),
      );
    });

    const phoneUpsertArgs = mocks.phoneUpsertMock.mock.calls[0]?.[0];

    expect(phoneUpsertArgs.where).toEqual({
      tenantId_phone: {
        tenantId: 'tenant-a',
        phone: '+79990000000',
      },
    });
    expect(phoneUpsertArgs.create.tenantId).toBe('tenant-a');
    expect(mocks.phoneFindUniqueMock).toHaveBeenCalledWith({
      where: {
        tenantId_phone: {
          tenantId: 'tenant-a',
          phone: '+79990000000',
        },
      },
    });
    expect(mocks.phoneUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'challenge-1',
        tenantId: 'tenant-a',
        codeHash: 'hash',
        consumedAt: null,
        expiresAt: { gt: new Date('2026-07-11T12:00:00.000Z') },
      },
      data: { consumedAt: new Date('2026-07-11T12:00:00.000Z') },
    });
  });

  it('increments invalid phone attempts inside one tenant transaction', async () => {
    const { repository, tenantContext, mocks } = createRepository();
    const attemptedAt = new Date('2026-07-11T12:00:00.000Z');
    mocks.phoneFindUniqueMock.mockResolvedValue({ attempts: 2 });

    const attempts = await tenantContext.runAsPublicTenant('tenant-a', () =>
      repository.recordInvalidPhoneAttempt(
        'challenge-1',
        'expected-hash',
        attemptedAt,
        5,
      ),
    );

    expect(attempts).toBe(2);
    expect(mocks.transactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.phoneUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'challenge-1',
        tenantId: 'tenant-a',
        codeHash: 'expected-hash',
        consumedAt: null,
        expiresAt: { gt: attemptedAt },
        attempts: { lt: 5 },
      },
      data: {
        attempts: { increment: 1 },
      },
    });
    expect(mocks.phoneFindUniqueMock).toHaveBeenCalledWith({
      where: {
        id_tenantId: {
          id: 'challenge-1',
          tenantId: 'tenant-a',
        },
      },
      select: { attempts: true },
    });
  });

  it('atomically claims one unconsumed, unexpired OAuth flow', async () => {
    const { repository, tenantContext, mocks } = createRepository();
    const consumedAt = new Date('2026-07-11T12:00:00.000Z');
    const expiresAt = new Date('2026-07-11T12:10:00.000Z');

    const claimed = await tenantContext.runAsPublicTenant(
      'tenant-a',
      async () => {
        await repository.createFlowState({
          provider: 'yandex',
          state: 'opaque-state',
          redirectUri: 'https://example.test/callback',
          codeVerifier: 'verifier',
          expiresAt,
        });

        return repository.claimFlowState('flow-1', 'yandex', consumedAt);
      },
    );

    expect(claimed).toBe(true);
    expect(mocks.flowCreateMock).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        provider: 'yandex',
        state: 'opaque-state',
        redirectUri: 'https://example.test/callback',
        codeVerifier: 'verifier',
        expiresAt,
      },
    });
    expect(mocks.flowUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'flow-1',
        tenantId: 'tenant-a',
        provider: 'yandex',
        consumedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { consumedAt },
    });
  });

  it('uses tenant-qualified identity keys for lookup and mutation', async () => {
    const { repository, tenantContext, mocks } = createRepository();

    await tenantContext.runAsPublicTenant('tenant-a', async () => {
      await repository.findIdentity('telegram', 'provider-user-1');
      await repository.createIdentity({
        userId: 'user-1',
        provider: 'telegram',
        providerUserId: 'provider-user-1',
        email: null,
        phone: '+79990000000',
        profileJson: {},
      });
      await repository.updateIdentity('identity-1', {
        email: null,
        phone: '+79990000000',
        profileJson: {},
      });
    });

    expect(mocks.identityFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_provider_providerUserId: {
            tenantId: 'tenant-a',
            provider: 'telegram',
            providerUserId: 'provider-user-1',
          },
        },
      }),
    );
    const identityCreateArgs = mocks.identityCreateMock.mock.calls[0]?.[0];

    expect(identityCreateArgs.data).toMatchObject({
      tenantId: 'tenant-a',
      userId: 'user-1',
    });
    expect(mocks.identityUpdateMock).toHaveBeenCalledWith({
      where: {
        id_tenantId: {
          id: 'identity-1',
          tenantId: 'tenant-a',
        },
      },
      data: {
        email: null,
        phone: '+79990000000',
        profileJson: {},
      },
    });
  });

  it('fails closed before auth persistence without tenant context', () => {
    const { repository, mocks } = createRepository();

    expect(() => repository.findPhoneChallenge('+79990000000')).toThrow(
      ForbiddenException,
    );
    expect(mocks.phoneFindUniqueMock).not.toHaveBeenCalled();
  });
});
