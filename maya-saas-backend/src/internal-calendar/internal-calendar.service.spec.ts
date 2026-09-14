import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quotas/quota.service';
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
    const updateProviderMock: jest.MockedFunction<
      (args: {
        where: { id: string; tenantId: string };
        data: Record<string, unknown>;
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
        updateMany: updateProviderMock,
      },
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const tenantContext = new TenantContextService();
    const assertCanCreateMock = jest.fn().mockResolvedValue(undefined);
    const service = new InternalCalendarService(
      prisma as unknown as PrismaService,
      tenantContext,
      {} as UsersService,
      {
        assertCanCreate: assertCanCreateMock,
      } as unknown as QuotaService,
    );

    return {
      service,
      prisma,
      tenantContext,
      tx,
      assertCanCreateMock,
      updateProviderMock,
    };
  }

  it('creates a login-free provider and scopes every write to the active tenant', async () => {
    const { service, prisma, tenantContext, tx, assertCanCreateMock } =
      createService();

    const result = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.bootstrapCreateProvider('tenant-a', {
        displayName: 'Специалист 2',
      }),
    );

    expect(result).toMatchObject({
      id: 'provider-2',
      user_id: null,
      name: 'Специалист 2',
    });
    expect(assertCanCreateMock).toHaveBeenCalledWith('tenant-a', 'staff');
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
        service.bootstrapCreateProvider('tenant-b', {
          displayName: 'Чужой мастер',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('does not start provider writes after a staff quota rejection', async () => {
    const { service, tenantContext, tx, assertCanCreateMock } = createService();
    assertCanCreateMock.mockRejectedValue(
      new ConflictException({ error: { code: 'quota_exceeded' } }),
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.bootstrapCreateProvider('tenant-a', {
          displayName: 'Blocked',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.internalProvider.create).not.toHaveBeenCalled();
  });

  it('checks staff quota before reactivating an independent provider', async () => {
    const {
      service,
      prisma,
      tenantContext,
      assertCanCreateMock,
      updateProviderMock,
    } = createService();
    prisma.internalProvider.findFirst.mockResolvedValueOnce({
      active: false,
      userId: null,
    });

    await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.bootstrapUpdateProvider('tenant-a', 'provider-2', {
        active: true,
      }),
    );

    expect(assertCanCreateMock).toHaveBeenCalledWith('tenant-a', 'staff');
    expect(updateProviderMock.mock.calls[0]?.[0]?.where).toEqual({
      id: 'provider-2',
      tenantId: 'tenant-a',
    });
    expect(updateProviderMock.mock.calls[0]?.[0]?.data.active).toBe(true);
  });
});

describe('InternalCalendarService journal', () => {
  function createJournalService() {
    const tenantFindUnique = jest
      .fn()
      .mockImplementation(({ select }: { select: Record<string, boolean> }) =>
        Promise.resolve(
          select.calendarSource
            ? { calendarSource: 'internal' }
            : { defaultTimezone: 'Europe/Moscow' },
        ),
      );
    const appointmentFindMany = jest.fn().mockResolvedValue([
      {
        id: 'appointment-a',
        tenantId: 'tenant-a',
        clientId: 'client-a',
        branchId: 'branch-a',
        crmExternalId: null,
        source: 'internal',
        staffExternalId: 'provider-a',
        serviceIds: ['service-a'],
        startAt: new Date('2026-07-15T09:00:00.000Z'),
        endAt: new Date('2026-07-15T10:00:00.000Z'),
        blockedStartAt: new Date('2026-07-15T09:00:00.000Z'),
        blockedEndAt: new Date('2026-07-15T10:00:00.000Z'),
        status: 'confirmed',
        notes: 'Первый визит',
        providerPayload: {},
        createdAt: new Date('2026-07-14T09:00:00.000Z'),
        updatedAt: new Date('2026-07-14T09:00:00.000Z'),
        client: { id: 'client-a', encryptedName: 'encrypted-client' },
        branch: {
          id: 'branch-a',
          name: 'Main',
          address: null,
          phone: null,
          timezone: 'Europe/Moscow',
        },
      },
    ]);
    const internalServiceFindMany = jest.fn().mockResolvedValue([
      {
        id: 'service-a',
        tenantId: 'tenant-a',
        name: 'Стрижка',
        description: null,
        price: 2000,
        currency: 'RUB',
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        active: true,
        sortOrder: 0,
        createdAt: new Date('2026-07-14T09:00:00.000Z'),
        updatedAt: new Date('2026-07-14T09:00:00.000Z'),
      },
    ]);
    const internalProviderFindMany = jest.fn().mockResolvedValue([
      {
        id: 'provider-a',
        tenantId: 'tenant-a',
        userId: 'owner-a',
        branchId: 'branch-a',
        displayName: 'Артём',
        title: 'Парикмахер',
        specialization: null,
        avatarUrl: null,
        active: true,
        slotIntervalMinutes: 30,
        createdAt: new Date('2026-07-14T09:00:00.000Z'),
        updatedAt: new Date('2026-07-14T09:00:00.000Z'),
        branch: {
          id: 'branch-a',
          name: 'Main',
          address: null,
          phone: null,
          timezone: 'Europe/Moscow',
        },
      },
    ]);
    const prisma = {
      tenant: { findUnique: tenantFindUnique },
      appointment: { findMany: appointmentFindMany },
      internalService: { findMany: internalServiceFindMany },
      internalProvider: { findMany: internalProviderFindMany },
    };
    const usersService = {
      getUserName: jest.fn().mockReturnValue('Клиент Тестовый'),
    };
    const tenantContext = new TenantContextService();
    const service = new InternalCalendarService(
      prisma as unknown as PrismaService,
      tenantContext,
      usersService as unknown as UsersService,
      {} as QuotaService,
    );

    return {
      appointmentFindMany,
      prisma,
      service,
      tenantContext,
    };
  }

  it('returns only the active tenant range with safe client identity', async () => {
    const { appointmentFindMany, service, tenantContext } =
      createJournalService();
    const from = '2026-07-14T00:00:00.000Z';
    const to = '2026-07-21T00:00:00.000Z';

    const result = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.getJournal('tenant-a', {
        from,
        to,
        providerId: 'provider-a',
      }),
    );

    expect(appointmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          source: 'internal',
          staffExternalId: 'provider-a',
          startAt: { lt: new Date(to) },
          endAt: { gt: new Date(from) },
        },
      }),
    );
    expect(result).toMatchObject({
      calendar_source: 'internal',
      timezone: 'Europe/Moscow',
      provider_id: 'provider-a',
      count: 1,
      appointments: [
        {
          id: 'appointment-a',
          client: { id: 'client-a', name: 'Клиент Тестовый' },
          provider: { id: 'provider-a', name: 'Артём' },
          services: [{ id: 'service-a', name: 'Стрижка' }],
          total_price: 2000,
          currency: 'RUB',
        },
      ],
    });
    expect(Object.keys(result.appointments[0].client)).toEqual(['id', 'name']);
  });

  it('rejects a journal read when the active tenant differs', async () => {
    const { appointmentFindMany, prisma, service, tenantContext } =
      createJournalService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.getJournal('tenant-b', {
          from: '2026-07-14T00:00:00.000Z',
          to: '2026-07-15T00:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(appointmentFindMany).not.toHaveBeenCalled();
  });

  it('rejects ranges longer than 31 days before reading tenant data', async () => {
    const { appointmentFindMany, prisma, service, tenantContext } =
      createJournalService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.getJournal('tenant-a', {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-08-02T00:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    expect(appointmentFindMany).not.toHaveBeenCalled();
  });
});
