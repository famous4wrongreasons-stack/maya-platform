import { ClientChannelRuntimeService } from './client-channel-runtime.service';

type SetupOptions = {
  links?: Array<Record<string, unknown>>;
  client?: Record<string, unknown> | null;
  privacy?: boolean;
  providerClients?: Array<Record<string, unknown>>;
};

function setup(options: SetupOptions = {}) {
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
          },
        ]
      : options.links;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    unresolvedClientIdentityHold: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    clientChannelLink: { findMany: jest.fn().mockResolvedValue(links) },
    client: {
      findUnique: jest.fn().mockResolvedValue(
        options.client === undefined
          ? {
              id: 'client-1',
              tenantId: 'tenant-1',
              mergedIntoClientId: null,
              user: {
                tenantId: 'tenant-1',
                status: 'active',
                phone: '+79990001122',
                encryptedName: 'encrypted-name',
              },
              crmLinks: [],
            }
          : options.client,
      ),
    },
    customerProfile: {
      findUnique: jest.fn().mockResolvedValue({
        privacyConsentAt:
          options.privacy === false ? null : new Date('2026-01-01T00:00:00Z'),
      }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'appointment-future',
          crmProvider: 'yclients',
          crmExternalId: 'record-9',
          staffExternalId: 'staff-7',
          serviceIds: ['service-2'],
          startAt: new Date('2099-04-05T09:00:00Z'),
          endAt: new Date('2099-04-05T10:00:00Z'),
          status: 'confirmed',
          attendance: null,
          totalPriceKopecks: 250000,
        },
        {
          id: 'appointment-past',
          crmProvider: 'yclients',
          crmExternalId: 'record-8',
          staffExternalId: 'staff-8',
          serviceIds: ['service-1'],
          startAt: new Date('2025-04-05T09:00:00Z'),
          endAt: new Date('2025-04-05T10:00:00Z'),
          status: 'completed',
          attendance: 'arrived',
          totalPriceKopecks: 180000,
        },
      ]),
    },
    loyaltyAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ balance: 1200, source: 'maya' }),
    },
    customerSubscription: {
      findFirst: jest.fn().mockResolvedValue({
        planCode: 'standard',
        visitsIncluded: 6,
        termEndsAt: new Date('2099-05-01T00:00:00Z'),
        usages: [{ units: 1 }, { units: 2 }],
      }),
    },
    customerReferral: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ status: 'resolved' }, { status: 'pending' }]),
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
    }),
  };
  const encryption = {
    decrypt: jest.fn().mockReturnValue('Verified Client'),
  };
  const crm = {
    getClientRegistry: jest.fn().mockResolvedValue({
      provider: 'yclients',
      clients: options.providerClients ?? [],
    }),
  };
  const service = new ClientChannelRuntimeService(
    prisma as never,
    {} as never,
    channels as never,
    encryption as never,
    {} as never,
    crm as never,
  );
  return { service, tx, prisma, channels, encryption, crm };
}

describe('B20 verified Client cabinet projection', () => {
  it('returns only the exact linked Client canonical projection without writes', async () => {
    const { service, tx, crm } = setup();

    await expect(
      service.cabinetProjection('signed-proof'),
    ).resolves.toMatchObject({
      linked: true,
      known: true,
      name: 'Verified',
      full_name: 'Verified Client',
      booking_phone: '+79990001122',
      loyalty: { balance: 1200, source: 'maya' },
      upcoming: [{ record_id: 'record-9', master_id: 'staff-7' }],
      history: [{ record_id: 'record-8', master_id: 'staff-8' }],
      subscription: { used: 3, total: 6 },
      referral: { invited: 1, pending: 1, link: null },
      client_link_required: false,
      business_mutations: 0,
    });

    expect(tx.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_tenantId: { id: 'client-1', tenantId: 'tenant-1' } },
      }),
    );
    expect(tx.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', mayaClientId: 'client-1' },
      }),
    );
    expect(crm.getClientRegistry).not.toHaveBeenCalled();
  });

  it('supports a Client without Maya User through its exact CRM link', async () => {
    const { service } = setup({
      client: {
        id: 'client-1',
        tenantId: 'tenant-1',
        mergedIntoClientId: null,
        user: null,
        crmLinks: [{ provider: 'yclients', externalId: 'crm-client-7' }],
      },
      providerClients: [
        {
          external_id: 'crm-client-7',
          name: 'CRM Verified',
          phone: '+79995551122',
        },
      ],
    });

    await expect(
      service.cabinetProjection('signed-proof'),
    ).resolves.toMatchObject({
      linked: true,
      known: true,
      full_name: 'CRM Verified',
      booking_phone: '+79995551122',
    });
  });

  it.each([
    ['missing link', []],
    [
      'ambiguous link',
      [
        { clientId: 'client-1', providerSubjectHash: 'subject-hmac' },
        { clientId: 'client-2', providerSubjectHash: 'subject-hmac' },
      ],
    ],
  ])('fails closed for %s', async (_label, links) => {
    const { service, tx } = setup({ links });

    await expect(
      service.cabinetProjection('signed-proof'),
    ).resolves.toMatchObject({
      linked: false,
      known: false,
      full_name: '',
      booking_phone: '',
      client_link_required: true,
      business_mutations: 0,
    });
    expect(tx.appointment.findMany).not.toHaveBeenCalled();
  });

  it('returns no Client PII or private facts before canonical privacy consent', async () => {
    const { service, tx } = setup({ privacy: false });

    await expect(
      service.cabinetProjection('signed-proof'),
    ).resolves.toMatchObject({
      linked: true,
      known: false,
      needs_consent: true,
      full_name: '',
      booking_phone: '',
      business_mutations: 0,
    });
    expect(tx.appointment.findMany).not.toHaveBeenCalled();
  });

  it('repeated and concurrent reads resolve the same link and never invoke a writer', async () => {
    const { service, tx } = setup();

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.cabinetProjection('signed-proof'),
      ),
    );

    expect(results.every((result) => result.business_mutations === 0)).toBe(
      true,
    );
    expect(tx.clientChannelLink.findMany).toHaveBeenCalledTimes(12);
    for (const repository of Object.values(tx)) {
      for (const name of Object.keys(repository)) {
        expect(name).not.toMatch(/create|update|upsert|delete/);
      }
    }
  });
});
