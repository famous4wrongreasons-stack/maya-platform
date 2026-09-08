import { ForbiddenException } from '@nestjs/common';

import { ClientChannelRuntimeService } from './client-channel-runtime.service';

const execution = (state = 'SUCCEEDED') => ({
  contract: 'maya.action-execution-result/1',
  executionId: 'execution-1',
  state,
});

type Options = {
  links?: Array<Record<string, unknown>>;
  client?: Record<string, unknown> | null;
  appointment?: Record<string, unknown> | null;
  integration?: Record<string, unknown> | null;
};

type AppointmentInvocation = {
  sourceType: string;
  sourceRef: string;
  callerIdempotency: { scope: string; key: string };
  authorizationCheck: () => Promise<void>;
};

type ResidualAppointmentExecutor = (
  tenant: string,
  action: string,
  record: string,
  input: { serviceIds: string[] },
  invocation: AppointmentInvocation,
) => Promise<{ value: object; execution: ReturnType<typeof execution> }>;

function setup(options: Options = {}) {
  const links =
    options.links === undefined
      ? [
          {
            id: 'link-1',
            tenantId: 'tenant-1',
            clientId: 'client-1',
            provider: 'telegram',
            providerSubjectHash: 'subject-hmac',
            verificationVersion: 1,
            subjectHashVersion: 1,
            verificationEvidenceHash: 'evidence-hash',
          },
        ]
      : options.links;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    clientChannelLink: { findMany: jest.fn().mockResolvedValue(links) },
    client: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.client === undefined
            ? { id: 'client-1', mergedIntoClientId: null }
            : options.client,
        ),
    },
    crmIntegration: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.integration === undefined
            ? { provider: 'yclients', status: 'active' }
            : options.integration,
        ),
    },
    appointment: {
      findUnique: jest.fn().mockResolvedValue(
        options.appointment === undefined
          ? {
              mayaClientId: 'client-1',
              startAt: new Date('2099-04-05T09:00:00.000Z'),
            }
          : options.appointment,
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const channels = {
    authenticate: jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      provider: 'telegram',
      providerSubjectHash: 'subject-hmac',
      channelControlProofHash: 'control-hash',
      validUntil: new Date('2099-01-01T00:00:00.000Z'),
    }),
  };
  const executeResidualAppointmentWithReceipt =
    jest.fn<ResidualAppointmentExecutor>(
      async (
        _tenant: string,
        _action: string,
        _record: string,
        _input: { serviceIds: string[] },
        invocation: AppointmentInvocation,
      ) => {
        await invocation.authorizationCheck();
        return { value: {}, execution: execution() };
      },
    );
  const crm = {
    executeCancelAppointmentWithReceipt: jest.fn<
      (
        tenant: string,
        record: string,
        invocation: AppointmentInvocation,
      ) => Promise<{ value: object; execution: ReturnType<typeof execution> }>
    >(
      async (
        _tenant: string,
        _record: string,
        invocation: AppointmentInvocation,
      ) => {
        await invocation.authorizationCheck();
        return { value: {}, execution: execution() };
      },
    ),
    executeRescheduleAppointmentWithReceipt: jest.fn<
      (
        tenant: string,
        input: { externalId: string; start: string },
        invocation: AppointmentInvocation,
      ) => Promise<{ value: object; execution: ReturnType<typeof execution> }>
    >(
      async (
        _tenant: string,
        _input: { externalId: string; start: string },
        invocation: AppointmentInvocation,
      ) => {
        await invocation.authorizationCheck();
        return { value: {}, execution: execution() };
      },
    ),
    executeResidualAppointmentWithReceipt,
  };
  const service = new ClientChannelRuntimeService(
    prisma as never,
    { assertTenantId: jest.fn() } as never,
    channels as never,
    {} as never,
    {} as never,
    crm as never,
  );
  return {
    service,
    tx,
    prisma,
    channels,
    crm,
    executeResidualAppointmentWithReceipt,
  };
}

describe('B17 verified Client appointment authority', () => {
  it('routes an owned cancel through the existing canonical executor', async () => {
    const { service, tx, crm } = setup();

    await expect(
      service.cancelClientAppointment('signed-proof', { recordId: 'record-7' }),
    ).resolves.toMatchObject({
      identity_authority: 'verified_client_channel_link',
      execution_owner: 'action_engine',
      provider_writes_outside_canonical_executor: 0,
      execution: { state: 'SUCCEEDED' },
    });

    expect(tx.appointment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_crmProvider_crmExternalId: {
            tenantId: 'tenant-1',
            crmProvider: 'yclients',
            crmExternalId: 'record-7',
          },
        },
      }),
    );
    const cancelCalls = crm.executeCancelAppointmentWithReceipt.mock
      .calls as Array<[string, string, AppointmentInvocation]>;
    const cancelCall = cancelCalls[0];
    expect(cancelCall[0]).toBe('tenant-1');
    expect(cancelCall[1]).toBe('record-7');
    expect(cancelCall[2].sourceType).toBe('authenticated_request');
    expect(cancelCall[2].sourceRef).toBe('client-channel-link:link-1');
    expect(cancelCall[2].callerIdempotency.scope).toBe(
      'client-channel.appointment.cancel.v1',
    );
    expect(tx.appointment.findUnique).toHaveBeenCalledTimes(2);
  });

  it('routes reschedule with only the server-authorized record and new instant', async () => {
    const { service, crm } = setup();

    await service.rescheduleClientAppointment('signed-proof', {
      recordId: 'record-7',
      start: '2099-04-06T12:30:00+03:00',
    });

    const rescheduleCalls = crm.executeRescheduleAppointmentWithReceipt.mock
      .calls as Array<
      [string, { externalId: string; start: string }, AppointmentInvocation]
    >;
    const rescheduleCall = rescheduleCalls[0];
    expect(rescheduleCall[0]).toBe('tenant-1');
    expect(rescheduleCall[1]).toEqual({
      externalId: 'record-7',
      start: '2099-04-06T12:30:00+03:00',
    });
    expect(rescheduleCall[2].sourceType).toBe('authenticated_request');
    expect(rescheduleCall[2].callerIdempotency.scope).toBe(
      'client-channel.appointment.reschedule.v1',
    );
  });

  it('routes an AI service change through the existing residual canonical executor', async () => {
    const { service, executeResidualAppointmentWithReceipt, tx } = setup();

    await expect(
      service.setClientAppointmentServices('signed-proof', {
        recordId: 'record-7',
        serviceIds: ['service-2', 'service-1', 'service-2'],
      }),
    ).resolves.toMatchObject({
      identity_authority: 'verified_client_channel_link',
      execution_owner: 'action_engine',
      provider_writes_outside_canonical_executor: 0,
      execution: { state: 'SUCCEEDED' },
    });

    expect(executeResidualAppointmentWithReceipt).toHaveBeenCalledTimes(1);
    const residualCalls = executeResidualAppointmentWithReceipt.mock
      .calls as Array<Parameters<ResidualAppointmentExecutor>>;
    const [tenant, action, record, input, invocation] = residualCalls[0];
    expect({ tenant, action, record, input }).toEqual({
      tenant: 'tenant-1',
      action: 'set_appointment_services',
      record: 'record-7',
      input: { serviceIds: ['service-2', 'service-1'] },
    });
    expect(invocation).toMatchObject({
      sourceType: 'authenticated_request',
      sourceRef: 'client-channel-link:link-1',
      callerIdempotency: {
        scope: 'client-channel.appointment.services.v1',
      },
    });
    expect(tx.appointment.findUnique).toHaveBeenCalledTimes(2);
  });

  it('rejects forged identity and malformed service replacement fields', async () => {
    for (const forged of [
      {
        recordId: 'record-7',
        serviceIds: ['service-1'],
        phone: '+79990001122',
      },
      { recordId: 'record-7', serviceIds: ['service-1'], clientId: 'client-2' },
      { recordId: 'record-7', serviceIds: [] },
      { recordId: 'record-7', serviceIds: ['service-1', '../escape'] },
    ]) {
      const { service, executeResidualAppointmentWithReceipt } = setup();
      await expect(
        service.setClientAppointmentServices('signed-proof', forged),
      ).rejects.toThrow();
      expect(executeResidualAppointmentWithReceipt).not.toHaveBeenCalled();
    }
  });

  it('uses one durable identity for concurrent duplicate service changes', async () => {
    const { service, executeResidualAppointmentWithReceipt } = setup();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        service.setClientAppointmentServices('signed-proof', {
          recordId: 'record-7',
          serviceIds: ['service-1'],
        }),
      ),
    );
    const residualCalls = executeResidualAppointmentWithReceipt.mock
      .calls as Array<Parameters<ResidualAppointmentExecutor>>;
    const keys = residualCalls.map((call) => call[4].callerIdempotency.key);
    expect(new Set(keys)).toEqual(new Set([keys[0]]));
  });

  it('preserves UNKNOWN for a service change without authorizing blind retry', async () => {
    const { service, executeResidualAppointmentWithReceipt } = setup();
    const error = Object.assign(new Error('uncertain'), {
      actionExecutionResult: execution('UNKNOWN'),
    });
    executeResidualAppointmentWithReceipt.mockRejectedValue(error);

    const result = await service.setClientAppointmentServices('signed-proof', {
      recordId: 'record-7',
      serviceIds: ['service-1'],
    });
    expect(result.execution.state).toBe('UNKNOWN');
    expect(result.safe_explanation).toContain('Не повторяйте');
  });

  it.each([
    ['missing link', []],
    [
      'ambiguous link',
      [
        {
          id: 'link-1',
          tenantId: 'tenant-1',
          clientId: 'client-1',
          provider: 'telegram',
          providerSubjectHash: 'subject-hmac',
          verificationVersion: 1,
          subjectHashVersion: 1,
        },
        {
          id: 'link-2',
          tenantId: 'tenant-1',
          clientId: 'client-2',
          provider: 'telegram',
          providerSubjectHash: 'subject-hmac',
          verificationVersion: 1,
          subjectHashVersion: 1,
        },
      ],
    ],
  ])('fails closed for a %s without invoking CRM', async (_label, links) => {
    const { service, crm } = setup({ links });

    await expect(
      service.cancelClientAppointment('signed-proof', { recordId: 'record-7' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crm.executeCancelAppointmentWithReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ['missing Client', { client: null }],
    [
      'merged Client',
      { client: { id: 'client-1', mergedIntoClientId: 'client-2' } },
    ],
    [
      'foreign Client appointment',
      {
        appointment: {
          mayaClientId: 'client-2',
          startAt: new Date('2099-04-05T09:00:00.000Z'),
        },
      },
    ],
    ['missing appointment', { appointment: null }],
    [
      'inactive integration',
      { integration: { provider: 'yclients', status: 'error' } },
    ],
  ])('fails closed for %s', async (_label, options) => {
    const { service, crm } = setup(options);

    await expect(
      service.cancelClientAppointment('signed-proof', { recordId: 'record-7' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crm.executeCancelAppointmentWithReceipt).not.toHaveBeenCalled();
  });

  it('rejects caller identity, staff, service and tenant authority fields', async () => {
    for (const forged of [
      { recordId: 'record-7', clientId: 'client-2' },
      { recordId: 'record-7', phone: '+79990001122' },
      { recordId: 'record-7', chat_id: '42' },
      { recordId: 'record-7', tenantId: 'tenant-2' },
      { recordId: 'record-7', staffId: 'staff-2' },
    ]) {
      const { service, crm } = setup();
      await expect(
        service.cancelClientAppointment('signed-proof', forged),
      ).rejects.toThrow('Only the exact appointment command fields');
      expect(crm.executeCancelAppointmentWithReceipt).not.toHaveBeenCalled();
    }
  });

  it('uses one durable identity for retry and concurrent duplicate commands', async () => {
    const { service, crm } = setup();

    await Promise.all(
      Array.from({ length: 8 }, () =>
        service.cancelClientAppointment('signed-proof', {
          recordId: 'record-7',
        }),
      ),
    );

    const calls = crm.executeCancelAppointmentWithReceipt.mock.calls as Array<
      [string, string, AppointmentInvocation]
    >;
    const keys = calls.map((call) => call[2].callerIdempotency.key);
    expect(new Set(keys)).toEqual(new Set([keys[0]]));
  });

  it('preserves canonical UNKNOWN without authorizing blind retry', async () => {
    const { service, crm } = setup();
    const error = Object.assign(new Error('uncertain'), {
      actionExecutionResult: execution('UNKNOWN'),
    });
    crm.executeCancelAppointmentWithReceipt.mockRejectedValue(error);

    const result = await service.cancelClientAppointment('signed-proof', {
      recordId: 'record-7',
    });
    expect(result.execution.state).toBe('UNKNOWN');
    expect(result.safe_explanation).toContain('Не повторяйте');
  });
});
