import { PrismaService } from '../prisma/prisma.service';
import { AuthFlowSystemGateway } from './auth-flow-system.gateway';

describe('AuthFlowSystemGateway', () => {
  it('resolves an opaque OAuth state without accepting a tenant selector', async () => {
    const findUniqueMock = jest.fn().mockResolvedValue(null);
    const prisma = {
      authFlowState: {
        findUnique: findUniqueMock,
      },
    } as unknown as PrismaService;
    const gateway = new AuthFlowSystemGateway(prisma);

    await gateway.findByState('opaque-state');

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { state: 'opaque-state' },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            allowSelfRegistration: true,
            trialFullAccess: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            calendarSource: true,
          },
        },
      },
    });
  });
});
