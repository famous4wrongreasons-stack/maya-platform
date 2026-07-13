import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { InternalCalendarService } from './internal-calendar.service';

describe('InternalCalendarService provider creation', () => {
  function createService() {
    const provider = {
      id: 'provider-2',
      tenantId: 'tenant-a',
      userId: null,
      branchId: 'branch-a',
      displayName: 'Специалист 2',
      title: 'Специалист',
      specialization: null,
      avatarUrl: null,
      active: true,
      slotIntervalMinutes: 30,
      branch: { id: 'branch-a', name: 'Main', timezone: 'Europe/Moscow' },
    };
    const createProviderMock: jest.MockedFunction<
      (args: { data: Record<string, unknown> }) => Promise<typeof provider>
    > = jest.fn().mockResolvedValue(provider);
    const createRulesMock: jest.MockedFunction<
      (args: {
        data: Array<Record<string, unknown>>;
      }) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 5 });
    const createLinksMock: jest.MockedFunction<
      (args: {
        data: Array<Record<string, unknown>>;
      }) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      internalProvider: {
        create: createProviderMock,
      },
      internalAvailabilityRule: {
        createMany: createRulesMock,
      },
      internalProviderService: {
        createMany: createLinksMock,
      },
    };
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ calendarSource: 'internal' }),
      },
      branch: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { id?: string } }) =>
            Promise.resolve(
              where.id
                ? { id: 'branch-a' }
                : { id: 'branch-a', createdAt: new Date() },
            ),
          ),
      },
      internalService: {
        findMany: jest.fn().mockResolvedValue([{ id: 'service-a' }]),
      },
      internalProvider: {
        findFirst: jest.fn().mockResolvedValue(provider),
      },
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const tenantContext = new TenantContextService();
    const service = new InternalCalendarService(
      prisma as unknown as PrismaService,
      tenantContext,
      {} as UsersService,
    );

    return { service, prisma, tenantContext, tx };
  }

  it('creates a login-free provider and scopes every write to the active tenant', async () => {
    const { service, prisma, tenantContext, tx } = createService();

    const result = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.createProvider('tenant-a', { displayName: 'Специалист 2' }),
    );

    expect(result).toMatchObject({
      id: 'provider-2',
      user_id: null,
      name: 'Специалист 2',
    });
    expect(tx.internalProvider.create.mock.calls[0]?.[0].data).toMatchObject({
      tenantId: 'tenant-a',
      userId: null,
      branchId: 'branch-a',
    });
    expect(
      tx.internalAvailabilityRule.createMany.mock.calls[0]?.[0].data,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: 'tenant-a' }),
      ]),
    );
    expect(
      tx.internalProviderService.createMany.mock.calls[0]?.[0].data,
    ).toEqual([
      {
        tenantId: 'tenant-a',
        providerId: 'provider-2',
        serviceId: 'service-a',
      },
    ]);
    expect(prisma.internalProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'provider-2', tenantId: 'tenant-a' },
      }),
    );
  });

  it('rejects a provider write when the active tenant differs', async () => {
    const { service, prisma, tenantContext } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.createProvider('tenant-b', { displayName: 'Чужой мастер' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
