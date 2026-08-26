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

  it('does not register attendance as an executable Phase B2 action', () => {
    expect(() => registry.get('crm.appointment.attendance.v1')).toThrow();
  });

  it('registers the four residual appointment classes as strict shadow capabilities', () => {
    const cases = [
      [
        'crm.appointment.attendance.shadow.v1',
        { attendanceCode: 1 },
        { attendanceCode: 1 },
      ],
      [
        'crm.appointment.duration.shadow.v1',
        { durationSeconds: 3600 },
        { durationSeconds: 3600 },
      ],
      [
        'crm.appointment.services.shadow.v1',
        { serviceIds: ['service-2', 'service-1', 'service-1'] },
        { serviceIds: ['service-1', 'service-2'] },
      ],
      [
        'crm.appointment.fields.shadow.v1',
        { fieldKind: 'comment', valueRef: 'hmac:comment-ref' },
        { fieldKind: 'comment', valueRef: 'hmac:comment-ref' },
      ],
    ] as const;

    for (const [capabilityName, input, normalized] of cases) {
      const capability = registry.get(capabilityName);
      expect(capability).toMatchObject({
        policyKey: 'chapter6.residual-appointment-shadow',
        policyDecision: ActionPolicyDecision.SHADOW_ONLY,
        executorKey: 'shadow.none',
        approvalRequirement: 'NONE',
      });
      expect(capability.normalizeInput(input)).toEqual(normalized);
      expect(() =>
        capability.normalizeInput({ ...input, executor: 'legacy.direct' }),
      ).toThrow(/Unexpected action input/);
    }
  });

  it('registers visit payment as a strict no-blind-retry business action', () => {
    const capability = registry.get('crm.visit.payment.v1');

    expect(capability).toMatchObject({
      actionClass: 'pay_visit',
      policyDecision: ActionPolicyDecision.ALLOW,
      executorKey: 'crm.visit.payment',
      targetKind: 'appointment',
    });
    expect(capability.retry.maxExecutionAttempts).toBe(1);
    expect(capability.retry.retryablePreDispatchErrors.size).toBe(0);
    expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(false);
    expect(
      capability.normalizeInput({
        externalId: 'visit-record-1',
        amountKopecks: 200000,
        paymentMethod: 'card',
      }),
    ).toEqual({
      externalId: 'visit-record-1',
      amountKopecks: 200000,
      paymentMethod: 'card',
    });
    expect(() =>
      capability.normalizeInput({
        externalId: 'visit-record-1',
        amountKopecks: 200000,
        paymentMethod: 'card',
        executor: 'legacy.direct',
      }),
    ).toThrow(/Unexpected action input/);
    expect(() =>
      registry.get('crm.appointment.payment-close.shadow.v1'),
    ).toThrow();
  });

  it('registers only the proven B3.3 communication classes for execution', () => {
    const transactional = registry.get(
      'communication.transactional-single.new-appointment.execute.v1',
    );
    const operational = registry.get(
      'communication.operational-single.privacy.execute.v1',
    );

    expect(transactional).toMatchObject({
      actionClass: 'deliver_new_appointment_inbox',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.ALLOW,
      executorKey: 'communication.inbox.new-appointment',
      approvalRequirement: 'NONE',
    });
    expect(transactional.retry.maxExecutionAttempts).toBe(1);
    expect(transactional.reconciliation.retryAfterProvenNonExecution).toBe(
      false,
    );

    expect(operational).toMatchObject({
      actionClass: 'deliver_privacy_telegram',
      allowedSourceTypes: ['legacy_bridge'],
      policyDecision: ActionPolicyDecision.ALLOW,
      executorKey: 'communication.telegram.privacy',
      approvalRequirement: 'NONE',
    });
    expect(operational.retry.maxExecutionAttempts).toBe(1);
    expect(operational.reconciliation.retryAfterProvenNonExecution).toBe(false);

    const executableBulk = registry
      .list()
      .filter(
        (capability) =>
          capability.actionClass === 'send_bulk_campaign' &&
          capability.policyDecision === ActionPolicyDecision.ALLOW,
      );
    expect(executableBulk).toEqual([]);
  });

  it('rejects routing and permission injection in proven communication payloads', () => {
    const transactional = registry.get(
      'communication.transactional-single.new-appointment.execute.v1',
    );
    const operational = registry.get(
      'communication.operational-single.privacy.execute.v1',
    );

    expect(() =>
      transactional.normalizeInput({
        userId: 'user-1',
        sourceEventId: 'new_appointment:event-1',
        title: 'New appointment',
        bodyText: 'Safe body',
        executor: 'legacy.direct-send',
      }),
    ).toThrow(/Unexpected action input/);
    expect(() =>
      operational.normalizeInput({
        telegramChatId: '10001',
        sourceEventId: 'privacy:update-1',
        approval: 'bypass',
      }),
    ).toThrow(/Unexpected action input/);
  });
});
