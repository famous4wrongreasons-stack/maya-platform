import { ActionPolicyDecision } from '@prisma/client';

import { UserRole } from '../common/domain.enums';
import { canonicalProductionPolicyDefinitions } from './action-engine.policy-registry';
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

  it('registers the first Package 4 family as a non-executable server-policy shadow', () => {
    const capability = registry.get('loyalty.internal-adjust.shadow.v1');
    expect(capability).toMatchObject({
      actionClass: 'adjust_internal_loyalty',
      targetKind: 'loyalty_account',
      allowedSourceTypes: ['authenticated_request'],
      policyDecision: ActionPolicyDecision.SHADOW_ONLY,
      autonomyLevel: 'L2_5_SHADOW',
      approvalRequirement: 'NONE',
      executorKey: 'shadow.none',
    });
    expect(capability.retry.maxExecutionAttempts).toBe(1);
    expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(false);
    expect(
      capability.normalizeInput({
        delta: 125,
        reason: '  Service recovery  ',
      }),
    ).toEqual({ delta: 125, reason: 'Service recovery' });
    expect(() =>
      capability.normalizeInput({
        delta: 125,
        reason: 'Service recovery',
        approved: true,
      }),
    ).toThrow('Unexpected action input');

    const policy = canonicalProductionPolicyDefinitions(registry).find(
      (definition) => definition.capability === capability.capability,
    );
    expect(policy).toMatchObject({
      actorPolicy: 'REQUIRED',
      allowedActorRoles: [
        UserRole.TENANT_OWNER,
        UserRole.BUSINESS_OWNER,
        UserRole.TENANT_ADMIN,
        UserRole.ADMINISTRATOR,
      ],
      requiredFeatures: ['loyalty'],
      approverPolicyKey: 'none',
    });
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

  it('registers the four residual appointment classes as strict executable capabilities', () => {
    const cases = [
      [
        'crm.appointment.attendance.v1',
        'set_appointment_attendance',
        'crm.appointment.attendance',
        { attendanceCode: 1 },
        { attendanceCode: 1 },
      ],
      [
        'crm.appointment.duration.v1',
        'set_appointment_duration',
        'crm.appointment.duration',
        { durationSeconds: 3600 },
        { durationSeconds: 3600 },
      ],
      [
        'crm.appointment.services.v1',
        'set_appointment_services',
        'crm.appointment.services',
        { serviceIds: ['service-2', 'service-1', 'service-1'] },
        { serviceIds: ['service-1', 'service-2'] },
      ],
      [
        'crm.appointment.fields.v1',
        'set_appointment_fields',
        'crm.appointment.fields',
        { fieldKind: 'comment', value: 'Комментарий' },
        { fieldKind: 'comment', value: 'Комментарий' },
      ],
    ] as const;

    for (const [
      capabilityName,
      actionClass,
      executorKey,
      input,
      normalized,
    ] of cases) {
      const capability = registry.get(capabilityName);
      expect(capability).toMatchObject({
        actionClass,
        policyDecision: ActionPolicyDecision.ALLOW,
        executorKey,
        approvalRequirement: 'NONE',
      });
      expect(capability.retry.maxExecutionAttempts).toBe(2);
      expect(capability.retry.retryablePreDispatchErrors).toEqual(
        new Set([
          'crm_rate_limited_before_dispatch',
          'crm_transient_before_dispatch',
        ]),
      );
      expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(true);
      expect(capability.normalizeInput(input)).toEqual(normalized);
      expect(() =>
        capability.normalizeInput({ ...input, executor: 'legacy.direct' }),
      ).toThrow(/Unexpected action input/);
    }
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

  it('registers visit payment as provider-deferred and non-executable', () => {
    const capability = registry.get('crm.visit.payment.v1');

    expect(capability).toMatchObject({
      actionClass: 'pay_visit',
      policyKey: 'provider.yclients.pay_visit.deferred-unsafe',
      policyDecision: ActionPolicyDecision.DENY,
      autonomyLevel: 'L0_PROVIDER_DEFERRED',
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

  it('registers Package 2 communication classes with one executable owner', () => {
    const cases = [
      [
        'communication.appointment-reminders.execute.v1',
        'deliver_appointment_reminder',
        'communication.package2.single',
      ],
      [
        'communication.reports-briefings.execute.v1',
        'deliver_report_briefing',
        'communication.package2.single',
      ],
      [
        'communication.business-alerts.execute.v1',
        'deliver_business_alert',
        'communication.package2.single',
      ],
      [
        'communication.bulk-campaign.execute.v1',
        'deliver_bulk_campaign',
        'communication.package2.bulk',
      ],
    ] as const;

    for (const [capabilityName, actionClass, executorKey] of cases) {
      const capability = registry.get(capabilityName);
      expect(capability).toMatchObject({
        actionClass,
        policyDecision: ActionPolicyDecision.ALLOW,
        executorKey,
      });
      expect(capability.retry.maxExecutionAttempts).toBe(1);
      expect(capability.retry.retryablePreDispatchErrors.size).toBe(0);
      expect(capability.reconciliation.retryAfterProvenNonExecution).toBe(
        false,
      );
    }
  });

  it('rejects direct routing and invalid channel data in Package 2 inputs', () => {
    const reminder = registry.get(
      'communication.appointment-reminders.execute.v1',
    );
    const bulk = registry.get('communication.bulk-campaign.execute.v1');

    expect(
      reminder.normalizeInput({
        channel: 'telegram',
        messageType: 'appointment_reminder',
        telegramChatId: '10001',
        sourceEventId: 'reminder:event-1',
        title: 'Напоминание',
        bodyText: 'Запись сегодня в 10:00',
        parseMode: 'Markdown',
        buttons: [{ text: 'Открыть', url: 'https://example.test/app' }],
      }),
    ).toEqual({
      channel: 'telegram',
      messageType: 'appointment_reminder',
      telegramChatId: '10001',
      sourceEventId: 'reminder:event-1',
      title: 'Напоминание',
      bodyText: 'Запись сегодня в 10:00',
      parseMode: 'Markdown',
      buttons: [{ text: 'Открыть', url: 'https://example.test/app' }],
    });
    expect(() =>
      reminder.normalizeInput({
        channel: 'telegram',
        messageType: 'appointment_reminder',
        telegramChatId: '10001',
        sourceEventId: 'reminder:event-1',
        title: 'Напоминание',
        bodyText: 'Запись сегодня в 10:00',
        executor: 'legacy.direct-send',
      }),
    ).toThrow(/Unexpected action input/);
    expect(() =>
      reminder.normalizeInput({
        channel: 'inbox',
        messageType: 'appointment_reminder',
        sourceEventId: 'reminder:event-1',
        title: 'Напоминание',
        bodyText: 'Запись сегодня в 10:00',
      }),
    ).toThrow(/userId is required/);
    expect(() =>
      bulk.normalizeInput({
        campaignId: 'campaign-1',
        audienceId: 'audience-1',
        audienceSnapshotHash: 'audience-hash',
        messageSnapshotHash: 'message-hash',
        title: 'MAYA',
        bodyText: 'Вернитесь к нам',
        approval: 'bypass',
      }),
    ).toThrow(/Unexpected action input/);
  });
});
