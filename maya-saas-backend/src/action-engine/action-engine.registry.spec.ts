import { ActionPolicyDecision } from '@prisma/client';

import { ActionCapabilityRegistry } from './action-engine.registry';

describe('ActionCapabilityRegistry', () => {
  const registry = new ActionCapabilityRegistry();

  it('owns action class, policy, executor and retry semantics', () => {
    const capability = registry.get('kernel.test.safe-retry');
    expect(capability.actionClass).toBe('kernel_safe_retry');
    expect(capability.policyDecision).toBe(ActionPolicyDecision.ALLOW);
    expect(capability.executorKey).toBe('synthetic.kernel_safe_retry');
    expect(capability.retry.maxExecutionAttempts).toBe(2);
  });

  it('drops untrusted routing and permission-like fields from payload data', () => {
    const capability = registry.get('kernel.test.safe-retry');
    expect(
      capability.normalizeInput({
        valueRef: 'trusted/value',
        actionClass: 'send_campaign',
        executor: 'production.crm.write',
        tenantId: 'other-tenant',
        approval: 'bypass',
      }),
    ).toEqual({ valueRef: 'trusted/value' });
  });

  it('keeps Chapter 5 capabilities shadow-only', () => {
    for (const capability of registry
      .list()
      .filter((item) => item.allowedSourceTypes.includes('agent_task'))) {
      expect(capability.policyDecision).toBe(ActionPolicyDecision.SHADOW_ONLY);
      expect(capability.executorKey).toBe('shadow.none');
    }
  });
});
