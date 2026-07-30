import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAccessStateService } from './tenant-access-state.service';

describe('TenantAccessStateService', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');
  const expiredTrial = () => ({
    id: 'tenant-1',
    status: TenantStatus.TRIAL,
    trialEndsAt: new Date('2026-07-13T11:00:00.000Z'),
    trialFullAccess: true,
    currentPeriodEnd: null,
    pastDueAt: null,
    graceEndsAt: null,
    updatedAt: new Date('2026-07-13T11:30:00.000Z'),
  });

  it('persists the grace window with an optimistic lifecycle update', async () => {
    const tenant = expiredTrial();
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenant),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new TenantAccessStateService(prisma);

    const state = await service.getAndSync(tenant.id, now);

    expect(state).toMatchObject({
      accessState: 'past_due_grace',
      pastDueAt: tenant.trialEndsAt,
      graceEndsAt: new Date('2026-07-16T11:00:00.000Z'),
      subscriptionRequired: false,
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: tenant.id,
        status: TenantStatus.TRIAL,
        updatedAt: tenant.updatedAt,
      },
      data: {
        status: TenantStatus.PAST_DUE,
        trialFullAccess: false,
        pastDueAt: tenant.trialEndsAt,
        graceEndsAt: new Date('2026-07-16T11:00:00.000Z'),
      },
    });
  });

  it('re-reads a concurrently persisted grace window instead of replacing it', async () => {
    const tenant = expiredTrial();
    const persisted = {
      ...tenant,
      status: TenantStatus.PAST_DUE,
      trialFullAccess: false,
      pastDueAt: tenant.trialEndsAt,
      graceEndsAt: new Date('2026-07-16T11:00:00.000Z'),
      updatedAt: new Date('2026-07-13T12:00:00.000Z'),
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(tenant)
      .mockResolvedValueOnce(persisted);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      tenant: { findUnique, updateMany },
    } as unknown as PrismaService;
    const service = new TenantAccessStateService(prisma);

    const state = await service.getAndSync(tenant.id, now);

    expect(state.pastDueAt).toEqual(persisted.pastDueAt);
    expect(state.graceEndsAt).toEqual(persisted.graceEndsAt);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('fails closed after repeated synchronization conflicts', async () => {
    const tenant = expiredTrial();
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(tenant),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    const service = new TenantAccessStateService(prisma);

    await expect(service.getAndSync(tenant.id, now)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects an unknown tenant', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const service = new TenantAccessStateService(prisma);

    await expect(service.getAndSync('missing', now)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
