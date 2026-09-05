import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { ClientChannelRuntimeService } from './client-channel-runtime.service';

const execution = (state = 'SUCCEEDED') => ({
  contract: 'maya.action-execution-result/1',
  executionId: 'execution-create-1',
  state,
  safeResult: state === 'SUCCEEDED' ? { externalId: 'record-77' } : undefined,
});

type Options = {
  links?: Array<Record<string, unknown>>;
  client?: Record<string, unknown> | null;
  privacy?: boolean;
  registry?: Record<string, unknown>;
  state?: string;
};

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
  const client =
    options.client === undefined
      ? {
          id: 'client-1',
          mergedIntoClientId: null,
          user: {
            tenantId: 'tenant-1',
            status: 'active',
            phone: '+79990001122',
            encryptedName: 'cipher-name',
          },
          crmLinks: [],
        }
      : options.client;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    clientChannelLink: { findMany: jest.fn().mockResolvedValue(links) },
    client: { findUnique: jest.fn().mockResolvedValue(client) },
    customerProfile: {
      findUnique: jest.fn().mockResolvedValue({
        privacyConsentAt: options.privacy === false ? null : new Date(),
      }),
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
  const encryption = { decrypt: jest.fn().mockReturnValue('Verified user') };
  const crm = {
    getClientRegistry: jest
      .fn()
      .mockResolvedValue(
        options.registry ?? { provider: 'yclients', clients: [] },
      ),
    executeCreateAppointmentWithReceipt: jest.fn(
      async (_tenant: string, _input: unknown, invocation: unknown) => {
        await (
          invocation as { authorizationCheck: () => Promise<void> }
        ).authorizationCheck();
        return { value: {}, execution: execution(options.state) };
      },
    ),
  };
  const service = new ClientChannelRuntimeService(
    prisma as never,
    {} as never,
    channels as never,
    encryption as never,
    {} as never,
    crm as never,
  );
  const payload = {
    idempotencyKey: 'chat-booking:stable-intent',
    staffId: 'staff-7',
    serviceIds: ['service-2', 'service-1'],
    start: '2099-04-05T09:00:00.000Z',
  };
  return { service, tx, prisma, channels, encryption, crm, payload };
}

describe('B19 verified Client chat appointment creation', () => {
  it('uses the verified Client and existing canonical Action Engine executor', async () => {
    const { service, crm, payload } = setup();

    await expect(
      service.createClientAppointment('signed-proof', payload),
    ).resolves.toMatchObject({
      identity_authority: 'verified_client_channel_link',
      execution_owner: 'action_engine',
      provider_writes_outside_canonical_executor: 0,
      execution: { state: 'SUCCEEDED', executionId: 'execution-create-1' },
    });
    expect(crm.executeCreateAppointmentWithReceipt).toHaveBeenCalledWith(
      'tenant-1',
      {
        clientId: 'client-1',
        clientName: 'Verified user',
        clientPhone: '+79990001122',
        staffId: 'staff-7',
        serviceIds: ['service-2', 'service-1'],
        start: '2099-04-05T09:00:00.000Z',
        creationMode: 'client',
        allowBusy: false,
        notifyBySmsHours: 0,
      },
      expect.objectContaining({
        sourceType: 'authenticated_request',
        sourceRef: 'client-channel-link:link-1',
        callerIdempotency: {
          scope: 'client-channel.appointment.create.v1',
          key: 'chat-booking:stable-intent',
        },
      }),
    );
  });

  it('supports a verified Client without a Maya User through one exact CRM link', async () => {
    const { service, crm, payload } = setup({
      client: {
        id: 'client-1',
        mergedIntoClientId: null,
        user: null,
        crmLinks: [{ provider: 'yclients', externalId: 'crm-client-7' }],
      },
      registry: {
        provider: 'yclients',
        clients: [
          {
            external_id: 'crm-client-7',
            name: 'Verified guest',
            phone: '+79990003344',
          },
        ],
      },
    });

    await service.createClientAppointment('signed-proof', payload);

    expect(crm.executeCreateAppointmentWithReceipt).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        clientId: 'client-1',
        clientName: 'Verified guest',
        clientPhone: '+79990003344',
      }),
      expect.any(Object),
    );
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
          verificationEvidenceHash: 'a',
        },
        {
          id: 'link-2',
          tenantId: 'tenant-1',
          clientId: 'client-2',
          provider: 'telegram',
          providerSubjectHash: 'subject-hmac',
          verificationVersion: 1,
          subjectHashVersion: 1,
          verificationEvidenceHash: 'b',
        },
      ],
    ],
  ])('fails closed for %s', async (_label, links) => {
    const { service, crm, payload } = setup({ links });

    await expect(
      service.createClientAppointment('signed-proof', payload),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crm.executeCreateAppointmentWithReceipt).not.toHaveBeenCalled();
  });

  it('rejects caller Client, phone, tenant, and legacy chat authority fields', async () => {
    for (const forged of [
      { clientId: 'client-2' },
      { clientPhone: '+79990009988' },
      { phone: '+79990009988' },
      { chat_id: '42' },
      { tenantId: 'tenant-2' },
    ]) {
      const { service, crm, payload } = setup();
      await expect(
        service.createClientAppointment('signed-proof', {
          ...payload,
          ...forged,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(crm.executeCreateAppointmentWithReceipt).not.toHaveBeenCalled();
    }
  });

  it('preserves UNKNOWN and stable retry identity without a second owner', async () => {
    const { service, crm, payload } = setup({ state: 'UNKNOWN' });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.createClientAppointment('signed-proof', payload),
      ),
    );

    expect(
      results.every((result) => result.execution.state === 'UNKNOWN'),
    ).toBe(true);
    const calls = crm.executeCreateAppointmentWithReceipt.mock.calls as Array<
      [string, unknown, { callerIdempotency: { scope: string; key: string } }]
    >;
    const invocations = calls.map((call) => call[2].callerIdempotency);
    expect(new Set(invocations.map(JSON.stringify))).toEqual(
      new Set([
        JSON.stringify({
          scope: 'client-channel.appointment.create.v1',
          key: 'chat-booking:stable-intent',
        }),
      ]),
    );
  });

  it('fails before dispatch when privacy or exact server-derived booking PII is unavailable', async () => {
    for (const options of [
      { privacy: false },
      {
        client: {
          id: 'client-1',
          mergedIntoClientId: null,
          user: null,
          crmLinks: [],
        },
      },
    ]) {
      const { service, crm, payload } = setup(options);
      await expect(
        service.createClientAppointment('signed-proof', payload),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(crm.executeCreateAppointmentWithReceipt).not.toHaveBeenCalled();
    }
  });
});
