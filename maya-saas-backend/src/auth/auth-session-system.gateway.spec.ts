import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionSystemGateway } from './auth-session-system.gateway';

describe('AuthSessionSystemGateway', () => {
  it('resolves only opaque refresh-token and signed session identifiers', async () => {
    const refreshFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(null);
    const sessionFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<unknown>
    > = jest.fn().mockResolvedValue(null);
    const gateway = new AuthSessionSystemGateway({
      authRefreshToken: { findUnique: refreshFindUniqueMock },
      authSession: { findUnique: sessionFindUniqueMock },
    } as unknown as PrismaService);

    await gateway.findRefreshCredentialById('token-public-id');
    await gateway.findAccessSessionById('signed-session-id');

    expect(refreshFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'token-public-id' } }),
    );
    expect(sessionFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'signed-session-id' } }),
    );
    const refreshArgs = refreshFindUniqueMock.mock.calls[0]?.[0];
    expect(refreshArgs).not.toHaveProperty('where.tenantId');
  });
});
