import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService plan aliases', () => {
  it('resolves a legacy plan name through the canonical catalog', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'plan-solo',
      name: 'solo',
    });
    const service = new SubscriptionsService({
      subscriptionPlan: { findUnique },
    } as unknown as PrismaService);

    await expect(service.getPlanByNameOrThrow('start')).resolves.toMatchObject({
      name: 'solo',
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { name: 'solo' } });
  });

  it('limits the customer-facing catalog to canonical plans', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new SubscriptionsService({
      subscriptionPlan: { findMany },
    } as unknown as PrismaService);

    await service.listPublicPlans();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: { in: ['solo', 'business', 'business_plus'] },
        },
      }),
    );
  });

  it('keeps internal and historical plans in the administrative catalog', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new SubscriptionsService({
      subscriptionPlan: { findMany },
    } as unknown as PrismaService);

    await service.listPlans();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ priceMonthly: 'asc' }, { createdAt: 'asc' }],
      include: {
        entitlements: {
          where: { enabled: true },
          orderBy: { featureKey: 'asc' },
        },
      },
    });
  });
});
