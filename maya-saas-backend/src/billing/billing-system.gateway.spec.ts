import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSystemGateway } from './billing-system.gateway';

describe('BillingSystemGateway', () => {
  it('limits the webhook lookup to the provider payment unique key', async () => {
    const findUniqueMock = jest.fn().mockResolvedValue(null);
    const prisma = {
      billingPayment: {
        findUnique: findUniqueMock,
      },
    } as unknown as PrismaService;
    const gateway = new BillingSystemGateway(prisma);

    await gateway.findPaymentByProviderPaymentId('provider-payment-1');

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { providerPaymentId: 'provider-payment-1' },
    });
  });

  it('selects only billable tenant statuses for system partitioning', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = {
      tenant: {
        findMany: findManyMock,
      },
    } as unknown as PrismaService;
    const gateway = new BillingSystemGateway(prisma);

    const now = new Date('2026-09-02T12:00:00.000Z');
    await gateway.listBillingCandidates(now, 25);

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            status: { in: [TenantStatus.ACTIVE, TenantStatus.TRIAL] },
            OR: [
              { currentPeriodEnd: { lte: now } },
              { currentPeriodEnd: null, trialEndsAt: { lte: now } },
            ],
          },
          {
            status: TenantStatus.PAST_DUE,
            billingMethodId: { not: null },
            planId: { not: null },
            OR: [
              { currentPeriodEnd: { lte: now } },
              { currentPeriodEnd: null, trialEndsAt: { lte: now } },
            ],
          },
        ],
        billingPayments: { none: { status: 'pending' } },
      },
      include: { plan: true },
      orderBy: { id: 'asc' },
      take: 25,
    });
  });
});
