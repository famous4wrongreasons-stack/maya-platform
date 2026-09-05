import { ClientChannelRuntimeService } from './client-channel-runtime.service';

type SetupOptions = {
  links?: Array<Record<string, unknown>>;
  client?: Record<string, unknown> | null;
  privacy?: boolean;
  registry?: Record<string, unknown>;
  registryError?: boolean;
};

type BookingPrefillResult = {
  linked: boolean;
  known: boolean;
  has_phone: boolean;
  name: string;
  phone: string;
  client_link_required: boolean;
  needs_consent?: boolean;
};

type BookingPrefillReader = {
  bookingPrefill(proof: string): Promise<BookingPrefillResult>;
};

function setup(options: SetupOptions = {}) {
  const links =
    options.links === undefined
      ? [
          {
            id: 'channel-link-1',
            clientId: 'client-1',
            tenantId: 'tenant-1',
          },
        ]
      : options.links;
  const client =
    options.client === undefined
      ? {
          id: 'client-1',
          tenantId: 'tenant-1',
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
    clientChannelLink: {
      findMany: jest.fn().mockResolvedValue(links),
    },
    client: {
      findUnique: jest.fn().mockResolvedValue(client),
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
    }),
  };
  const encryption = {
    decrypt: jest.fn().mockReturnValue('Verified user'),
  };
  const crm = {
    getClientRegistry: options.registryError
      ? jest.fn().mockRejectedValue(new Error('provider unavailable'))
      : jest
          .fn()
          .mockResolvedValue(
            options.registry ?? { provider: 'yclients', clients: [] },
          ),
  };
  const service = Object.create(
    ClientChannelRuntimeService.prototype,
  ) as BookingPrefillReader;
  Object.assign(service, { prisma, channels, encryption, crm });
  return { service, tx, prisma, channels, encryption, crm };
}

describe('B16 verified Client booking prefill projection', () => {
  it('returns the exact verified Maya Client profile', async () => {
    const { service, tx, channels } = setup();

    await expect(service.bookingPrefill('signed-proof')).resolves.toEqual({
      linked: true,
      known: true,
      has_phone: true,
      name: 'Verified user',
      phone: '+79990001122',
      client_link_required: false,
    });
    expect(channels.authenticate).toHaveBeenCalledWith('signed-proof', tx);
    expect(tx.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_tenantId: { id: 'client-1', tenantId: 'tenant-1' },
        },
      }),
    );
  });

  it('supports a verified Client without a Maya User through its exact CRM link', async () => {
    const { service } = setup({
      client: {
        id: 'client-1',
        tenantId: 'tenant-1',
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

    await expect(service.bookingPrefill('signed-proof')).resolves.toMatchObject(
      {
        linked: true,
        name: 'Verified guest',
        phone: '+79990003344',
      },
    );
  });

  it.each([
    ['missing link', []],
    [
      'ambiguous link',
      [
        { clientId: 'client-1', tenantId: 'tenant-1' },
        { clientId: 'client-2', tenantId: 'tenant-1' },
      ],
    ],
  ])('fails closed for %s', async (_label, links) => {
    const { service, tx } = setup({ links });

    await expect(service.bookingPrefill('signed-proof')).resolves.toEqual({
      linked: false,
      known: false,
      has_phone: false,
      name: '',
      phone: '',
      client_link_required: true,
    });
    expect(tx.client.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed for a wrong-tenant or merged Client target', async () => {
    for (const client of [
      null,
      {
        id: 'client-1',
        tenantId: 'tenant-1',
        mergedIntoClientId: 'client-2',
        user: null,
        crmLinks: [],
      },
    ]) {
      const { service } = setup({ client });
      await expect(
        service.bookingPrefill('signed-proof'),
      ).resolves.toMatchObject({
        linked: false,
        phone: '',
        client_link_required: true,
      });
    }
  });

  it('does not disclose identity fields before canonical privacy consent', async () => {
    const { service, crm, encryption } = setup({ privacy: false });

    await expect(service.bookingPrefill('signed-proof')).resolves.toEqual({
      linked: true,
      known: true,
      needs_consent: true,
      has_phone: false,
      name: '',
      phone: '',
      client_link_required: false,
    });
    expect(crm.getClientRegistry).not.toHaveBeenCalled();
    expect(encryption.decrypt).not.toHaveBeenCalled();
  });

  it('does not use a mismatched provider record or provider failure as fallback', async () => {
    const guest = {
      id: 'client-1',
      tenantId: 'tenant-1',
      mergedIntoClientId: null,
      user: null,
      crmLinks: [{ provider: 'yclients', externalId: 'crm-client-7' }],
    };
    for (const options of [
      {
        client: guest,
        registry: {
          provider: 'yclients',
          clients: [
            {
              external_id: 'another-client',
              name: 'Other person',
              phone: '+79991112233',
            },
          ],
        },
      },
      { client: guest, registryError: true },
    ]) {
      const { service } = setup(options);
      await expect(
        service.bookingPrefill('signed-proof'),
      ).resolves.toMatchObject({
        linked: true,
        name: '',
        phone: '',
        has_phone: false,
      });
    }
  });

  it('keeps repeated and concurrent reads free of durable writes', async () => {
    const { service, tx } = setup();

    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.bookingPrefill('signed-proof')),
    );

    expect(results.every((value) => value.name === 'Verified user')).toBe(true);
    expect(Object.keys(tx)).toEqual([
      'clientChannelLink',
      'client',
      'customerProfile',
    ]);
  });
});
