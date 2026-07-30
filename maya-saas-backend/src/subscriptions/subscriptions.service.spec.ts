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
});
