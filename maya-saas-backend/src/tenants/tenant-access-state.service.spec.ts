import { NotFoundException } from '@nestjs/common';

import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAccessStateService } from './tenant-access-state.service';

describe('TenantAccessStateService P4-08 ownership fence', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');
  const expiredTrial = {
    id: 'tenant-1',
    status: TenantStatus.TRIAL,
    trialEndsAt: new Date('2026-07-13T11:00:00.000Z'),
    trialFullAccess: true,
    currentPeriodEnd: null,
    pastDueAt: null,
    graceEndsAt: null,
  };

  it('evaluates an expired window without becoming an entitlement writer', async () => {
    const updateMany = jest.fn();
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(expiredTrial),
        updateMany,
      },
    } as unknown as PrismaService;

    const state = await new TenantAccessStateService(prisma).getAndSync(
      expiredTrial.id,
      now,
    );

    expect(state).toMatchObject({
      tenantStatus: TenantStatus.PAST_DUE,
      accessState: 'past_due_grace',
      shouldMarkPastDue: true,
      pastDueAt: expiredTrial.trialEndsAt,
      graceEndsAt: new Date('2026-07-16T11:00:00.000Z'),
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('projects an already durable access state without rewriting it', async () => {
    const updateMany = jest.fn();
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          ...expiredTrial,
          status: TenantStatus.PAST_DUE,
          trialFullAccess: false,
          pastDueAt: expiredTrial.trialEndsAt,
          graceEndsAt: new Date('2026-07-16T11:00:00.000Z'),
        }),
        updateMany,
      },
    } as unknown as PrismaService;

    const state = await new TenantAccessStateService(prisma).getAndSync(
      expiredTrial.id,
      now,
    );
    expect(state.tenantStatus).toBe(TenantStatus.PAST_DUE);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown tenant', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      new TenantAccessStateService(prisma).getAndSync('missing', now),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
