import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';
import { ActionContractError } from './action-engine.errors';
import {
  P4_04_EXECUTABLE_CAPABILITIES,
  P4_04_EXECUTABLE_REGISTRATIONS,
  P4_04_SCHEDULER_ENVELOPE_CAPABILITY,
} from './p4-04-referral-reward-executable.contract';

describe('P4-04 executable capability contract', () => {
  it('has exactly four value-chain action classes and one non-value envelope', () => {
    expect(
      P4_04_EXECUTABLE_REGISTRATIONS.map((item) => item.actionClass),
    ).toEqual([
      'create_customer_referral',
      'resolve_customer_referral',
      'issue_referral_rewards',
      'fulfill_referral_reward',
    ]);
    const registry = new ActionCapabilityRegistry();
    for (const capability of Object.values(P4_04_EXECUTABLE_CAPABILITIES)) {
      expect(registry.get(capability).policyDecision).toBe(
        ActionPolicyDecision.ALLOW,
      );
      expect(registry.get(capability).executorKey).not.toBe('shadow.none');
    }
    expect(
      registry.get(P4_04_SCHEDULER_ENVELOPE_CAPABILITY).riskFacets,
    ).toContain('non_value_envelope');
  });

  it('reuses the strict server-derived issue contract and rejects forged value', () => {
    const issue = P4_04_EXECUTABLE_REGISTRATIONS.find(
      (item) => item.actionClass === 'issue_referral_rewards',
    )!;
    expect(() =>
      issue.normalizeInput({
        rewardPolicyProfile: 'initiator-selected-policy',
        rewards: [],
      }),
    ).toThrow(ActionContractError);
  });
});
