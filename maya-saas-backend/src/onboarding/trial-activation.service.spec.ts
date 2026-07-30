import { GoneException } from '@nestjs/common';

import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrialActivationService } from './trial-activation.service';

describe('TrialActivationService', () => {
  type ActivationRecord = {
    id: string;
    status: string;
    source: string;
    expiresAt: Date;
    draft?: { id: string } | null;
  };

  function createService() {
    const create: jest.MockedFunction<
      (args: {
        data: {
          activationTokenHash: string;
          source: string;
          expiresAt: Date;
        };
      }) => Promise<ActivationRecord>
    > = jest.fn(({ data }) =>
      Promise.resolve({
        id: 'activation-1',
        status: 'pending',
        source: data.source,
        expiresAt: data.expiresAt,
      }),
    );
    const findUnique: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<ActivationRecord | null>
    > = jest.fn();
    const updateMany: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 1 });
    const update: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<ActivationRecord>
    > = jest.fn();
    const count: jest.MockedFunction<
      (args?: Record<string, unknown>) => Promise<number>
    > = jest.fn();
    const rateLimit = { assertPreflight: jest.fn() };
    const service = new TrialActivationService(
      {
        trialActivation: {
          create,
          findUnique,
          updateMany,
          update,
          count,
        },
      } as unknown as PrismaService,
      rateLimit as unknown as AuthRateLimitService,
    );

    return {
      service,
      mocks: { count, create, findUnique, rateLimit, update, updateMany },
    };
  }

  it('creates a non-counted activation intent without storing the raw token', async () => {
    const { service, mocks } = createService();

    const result = await service.createActivation('maya_os', {
      clientIp: '127.0.0.1',
    });

    expect(result).toMatchObject({
      activation_id: 'activation-1',
      status: 'pending',
      trial_days: 10,
      trial_starts_when: 'registration_completed',
      counted_as_connected_business: false,
    });
    expect(mocks.rateLimit.assertPreflight).toHaveBeenCalledWith(
      'trial_activation',
      { clientIp: '127.0.0.1' },
    );
    const persisted = mocks.create.mock.calls[0]?.[0].data;
    expect(persisted.activationTokenHash).not.toBe(result.activation_token);
    expect(result.activation_token).toHaveLength(43);
  });

  it('claims once and counts the business only after completion', async () => {
    const { service, mocks } = createService();
    mocks.findUnique.mockResolvedValue({
      id: 'activation-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      draft: { id: 'draft-1' },
    });

    await service.claim('a'.repeat(43), 'activation-1');
    await service.complete('activation-1', 'tenant-1');

    expect(mocks.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: 'pending' },
      data: { status: 'completing' },
    });
    expect(mocks.updateMany.mock.calls[1]?.[0]).toMatchObject({
      where: { status: 'completing' },
      data: {
        status: 'completed',
        tenantId: 'tenant-1',
      },
    });
  });

  it('rejects an expired activation before tenant creation', async () => {
    const { service, mocks } = createService();
    mocks.findUnique.mockResolvedValue({
      id: 'activation-1',
      status: 'pending',
      expiresAt: new Date(Date.now() - 1),
      draft: null,
    });

    await expect(
      service.authorizePendingToken('a'.repeat(43)),
    ).rejects.toBeInstanceOf(GoneException);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('reports God Mode connected businesses from completed activations only', async () => {
    const { service, mocks } = createService();
    mocks.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const result = await service.getGodModeAnalytics(
      new Date('2026-07-13T12:00:00.000Z'),
    );

    expect(result.totals).toEqual({
      trial_swipes: 12,
      connected_businesses: 7,
      pending_registrations: 2,
      abandoned_registrations: 3,
      active_trials: 4,
      expired_trials: 2,
      paid_conversions: 1,
    });
    expect(result.rates.registration_completion).toBeCloseTo(7 / 12);
    expect(result.rates.trial_to_paid).toBeCloseTo(1 / 7);
  });
});
