import type { ActionExecution } from '@prisma/client';

import {
  ActionEngineRuntimeService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ReferralRewardSchedulerEnvelopeService } from './referral-reward-scheduler-envelope.service';

describe('ReferralRewardSchedulerEnvelopeService', () => {
  it('persists one deterministic Shadow envelope before bounded child planning', async () => {
    const planShadow = jest.fn((request: TrustedActionExecutionRequestV1) => {
      void request;
      return Promise.resolve({
        id: 'batch-execution-1',
      } as ActionExecution);
    });
    const service = new ReferralRewardSchedulerEnvelopeService({
      planShadow,
    } as unknown as ActionEngineRuntimeService);
    const input = {
      tenantId: 'tenant-a',
      candidates: [
        {
          referralId: 'referral-1',
          recipientClientIds: ['client-1', 'client-2'],
          maximumLiabilityKopecks: 50_000,
          currency: 'RUB',
        },
      ],
      now: new Date('2026-09-01T12:07:00.000Z'),
    };

    const first = await service.planEnvelope(input);
    const restarted = await service.planEnvelope({ ...input });

    expect(first).toEqual(restarted);
    expect(first).toMatchObject({
      actionExecutionId: 'batch-execution-1',
      valueMutations: 0,
    });
    expect(planShadow.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'tenant-a',
      capability: 'referrals.referral-reward-scheduler-envelope.shadow.v1',
      source: { type: 'scheduler' },
      callerIdempotency: {
        scope: 'p4-04.referral-reward-scheduler-envelope.shadow',
        key: first.batchIdentityHash,
      },
    });
    expect(planShadow.mock.calls[1]?.[0]).toEqual(
      planShadow.mock.calls[0]?.[0],
    );
  });
});
