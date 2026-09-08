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
    clientConsentFact: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'verified-consent',
          decision: 'grant',
          effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
          invalidation: null,
        },
      ]),
    },
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
  };
  const creator = {
    forVerifiedChannel: jest.fn(
      async (
        _tenant: string,
        _link: string,
        _input: unknown,
        invocation: unknown,
      ) => {
        await (
          invocation as { authorizationCheck: () => Promise<void> }
        ).authorizationCheck();
        return { value: {}, execution: execution(options.state) };
      },
    ),
  };
  const service = new ClientChannelRuntimeService(
    prisma as never,
    { assertTenantId: jest.fn() } as never,
    channels as never,
    encryption as never,
    {} as never,
    crm as never,
    creator as never,
  );
  const payload = {
    idempotencyKey: 'chat-booking:stable-intent',
    staffId: 'staff-7',
    serviceIds: ['service-2', 'service-1'],
    start: '2099-04-05T09:00:00.000Z',
  };
  return { service, tx, prisma, channels, encryption, crm, creator, payload };
}

describe('B19 verified Client chat appointment creation', () => {
  it('uses the verified Client and existing canonical Action Engine executor', async () => {
    const { service, creator, payload } = setup();

    await expect(
      service.createClientAppointment('signed-proof', payload),
    ).resolves.toMatchObject({
      identity_authority: 'verified_client_channel_link',
      execution_owner: 'action_engine',
      provider_writes_outside_canonical_executor: 0,
      execution: { state: 'SUCCEEDED', executionId: 'execution-create-1' },
    });
    expect(creator.forVerifiedChannel).toHaveBeenCalledWith(
      'tenant-1',
      'link-1',
      {
        staffId: 'staff-7',
        serviceIds: ['service-2', 'service-1'],
        start: '2099-04-05T09:00:00.000Z',
      },
      expect.objectContaining({
        sourceType: 'authenticated_request',
        sourceRef: 'client-channel-link:link-1',
        callerIdempotency: {
          scope: 'appointments.client.create.v1',
          key: 'chat-booking:stable-intent',
        },
      }),
    );
  });

  it('passes a verified Client without a Maya User to the common contact/intent resolver', async () => {
    const { service, creator, payload } = setup({
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

    expect(creator.forVerifiedChannel).toHaveBeenCalledWith(
      'tenant-1',
      'link-1',
      expect.objectContaining({
        staffId: payload.staffId,
        serviceIds: payload.serviceIds,
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
    const { service, creator, payload } = setup({ links });

    await expect(
      service.createClientAppointment('signed-proof', payload),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(creator.forVerifiedChannel).not.toHaveBeenCalled();
  });

  it('rejects caller Client, phone, tenant, and legacy chat authority fields', async () => {
    for (const forged of [
      { clientId: 'client-2' },
      { clientPhone: '+79990009988' },
      { phone: '+79990009988' },
      { chat_id: '42' },
      { tenantId: 'tenant-2' },
    ]) {
      const { service, creator, payload } = setup();
      await expect(
        service.createClientAppointment('signed-proof', {
          ...payload,
          ...forged,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(creator.forVerifiedChannel).not.toHaveBeenCalled();
    }
  });

  it('preserves UNKNOWN and stable retry identity without a second owner', async () => {
    const { service, creator, payload } = setup({ state: 'UNKNOWN' });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.createClientAppointment('signed-proof', payload),
      ),
    );

    expect(
      results.every((result) => result.execution.state === 'UNKNOWN'),
    ).toBe(true);
    const calls = creator.forVerifiedChannel.mock.calls as Array<
      [
        string,
        string,
        unknown,
        { callerIdempotency: { scope: string; key: string } },
      ]
    >;
    const invocations = calls.map((call) => call[3].callerIdempotency);
    expect(new Set(invocations.map(JSON.stringify))).toEqual(
      new Set([
        JSON.stringify({
          scope: 'appointments.client.create.v1',
          key: 'chat-booking:stable-intent',
        }),
      ]),
    );
  });

  it('fails before the shared creator when canonical privacy consent is unavailable', async () => {
    for (const options of [{ privacy: false }]) {
      const { service, creator, payload } = setup(options);
      await expect(
        service.createClientAppointment('signed-proof', payload),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(creator.forVerifiedChannel).not.toHaveBeenCalled();
    }
  });
});
