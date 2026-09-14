import { ForbiddenException } from '@nestjs/common';
import { MayaUserClientAssociationIssuer } from './maya-user-client-association-issuer';

describe('retired Maya User/Profile association issuer', () => {
  it.each([
    ['Client.userId only', [{ id: 'client', userId: 'user' }], []],
    ['CustomerProfile.userId only', [], [{ userId: 'user', clientId: null }]],
    [
      'matching userIds with null clientId',
      [{ id: 'client', userId: 'user' }],
      [{ userId: 'user', clientId: null }],
    ],
    [
      'matching userIds with legacy profile reference',
      [{ id: 'client', userId: 'user' }],
      [{ userId: 'user', clientId: 'client' }],
    ],
    [
      'conflicting Client reference',
      [{ id: 'client', userId: 'user' }],
      [{ userId: 'user', clientId: 'other' }],
    ],
  ])(
    'denies %s without consulting legacy associations or writing effects',
    async (_name, clients, profiles) => {
      const tx = {
        client: {
          findMany: jest.fn().mockResolvedValue(clients),
          create: jest.fn(),
        },
        customerProfile: {
          findMany: jest.fn().mockResolvedValue(profiles),
          update: jest.fn(),
        },
        clientLinkChallenge: { create: jest.fn() },
        clientConsentFact: { create: jest.fn() },
        actionExecution: { create: jest.fn() },
      };
      await expect(
        new MayaUserClientAssociationIssuer().resolve('session', tx as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      for (const model of Object.values(tx))
        for (const operation of Object.values(model))
          expect(operation).not.toHaveBeenCalled();
    },
  );
});
