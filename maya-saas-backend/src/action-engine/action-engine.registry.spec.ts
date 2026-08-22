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
      .filter((item) => item.policyKey === 'chapter5.l2_5-shadow')) {
      expect(capability.policyDecision).toBe(ActionPolicyDecision.SHADOW_ONLY);
      expect(capability.executorKey).toBe('shadow.none');
    }
  });

  it('registers appointment mutations with strict trusted routing', () => {
    const create = registry.get('crm.appointment.create.v1');
    expect(create).toMatchObject({
      actionClass: 'create_appointment',
      policyDecision: ActionPolicyDecision.ALLOW,
      executorKey: 'crm.appointment.create',
      approvalRequirement: 'NONE',
    });
    expect(
      create.normalizeInput({
        clientId: 'client-1',
        clientName: ' Client ',
        staffId: 'staff-1',
        serviceIds: ['service-2', 'service-1', 'service-1'],
        start: '2026-08-22T10:00:00+03:00',
        tenantId: 'other-tenant',
        executor: 'bypass',
      }),
    ).toEqual({
      clientId: 'client-1',
      clientName: 'Client',
      staffId: 'staff-1',
      serviceIds: ['service-1', 'service-2'],
      start: '2026-08-22T07:00:00.000Z',
      allowBusy: false,
      creationMode: 'client',
    });
    expect(() =>
      create.normalizeInput({
        clientId: 'client-1',
        clientName: 'Client',
        staffId: 'staff-1',
        serviceIds: [],
        start: 'not-a-date',
      }),
    ).toThrow();
  });

  it('does not register attendance as a Phase B2 action', () => {
    expect(() => registry.get('crm.appointment.attendance.v1')).toThrow();
  });
});
