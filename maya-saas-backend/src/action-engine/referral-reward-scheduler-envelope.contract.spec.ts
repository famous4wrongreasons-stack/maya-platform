import { ActionContractError } from './action-engine.errors';
import {
  buildReferralRewardSchedulerEnvelope,
  remainingReferralRewardSchedulerChildren,
} from './referral-reward-scheduler-envelope.contract';

const candidates = () => [
  {
    referralId: 'referral-2',
    recipientClientIds: ['client-2b', 'client-2a'],
    maximumLiabilityKopecks: 90_000,
    currency: 'RUB',
  },
  {
    referralId: 'referral-1',
    recipientClientIds: ['client-1'],
    maximumLiabilityKopecks: 40_000,
    currency: 'RUB',
  },
];

describe('P4-04 scheduler envelope contract', () => {
  it('derives a deterministic exact batch and bounded child fan-out', () => {
    const first = buildReferralRewardSchedulerEnvelope({
      tenantId: 'tenant-a',
      candidates: candidates(),
      now: new Date('2026-09-01T12:07:00.000Z'),
    });
    const restarted = buildReferralRewardSchedulerEnvelope({
      tenantId: 'tenant-a',
      candidates: [...candidates()].reverse(),
      now: new Date('2026-09-01T12:14:59.999Z'),
    });

    expect(restarted).toEqual(first);
    expect(first).toMatchObject({
      referralCount: 2,
      recipientCount: 3,
      aggregateLiabilityKopecks: 130_000,
      approvalRequirement: 'OWNER_APPROVAL_REQUIRED',
      fanOutMode: 'BOUNDED_PER_REFERRAL_EXECUTIONS',
    });
    expect(first.childExecutionIdentities).toHaveLength(2);
  });

  it('resumes only unfinished children without changing batch capacity', () => {
    const envelope = buildReferralRewardSchedulerEnvelope({
      tenantId: 'tenant-a',
      candidates: candidates(),
      now: new Date('2026-09-01T12:07:00.000Z'),
    });
    expect(
      remainingReferralRewardSchedulerChildren({
        envelope,
        completedChildExecutionIdentities: new Set([
          envelope.childExecutionIdentities[0],
        ]),
      }),
    ).toEqual([envelope.childExecutionIdentities[1]]);
    expect(envelope.aggregateLiabilityKopecks).toBe(130_000);
  });

  it('fails closed at referral, recipient, aggregate, currency, and policy-window boundaries', () => {
    const invalidSets = [
      Array.from({ length: 26 }, (_, index) => ({
        referralId: `referral-${index}`,
        recipientClientIds: [`client-${index}`],
        maximumLiabilityKopecks: 1,
        currency: 'RUB',
      })),
      [{ ...candidates()[0], recipientClientIds: ['a', 'b', 'c'] }],
      [{ ...candidates()[0], maximumLiabilityKopecks: 100_001 }],
      [candidates()[0], { ...candidates()[1], currency: 'USD' }],
    ];
    for (const invalid of invalidSets) {
      expect(() =>
        buildReferralRewardSchedulerEnvelope({
          tenantId: 'tenant-a',
          candidates: invalid,
          now: new Date('2026-09-01T12:07:00.000Z'),
        }),
      ).toThrow(ActionContractError);
    }
  });
});
