import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

describe('YclientsCRMAdapter', () => {
  const originalFetch = global.fetch;
  const originalPartnerToken = process.env.YCLIENTS_PARTNER_TOKEN;

  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'partner-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.YCLIENTS_PARTNER_TOKEN = originalPartnerToken;
    jest.restoreAllMocks();
  });

  it('maps staff response and filters by activeMasterIds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 1,
              name: 'Anton',
              specialization: 'Senior Barber',
              avatar: 'https://example.com/anton.png',
              rating: 4.8,
            },
            {
              id: 2,
              name: 'Nikita',
              specialization: 'Top Master',
              photo: 'https://example.com/nikita.png',
              rating: 4.9,
            },
          ],
        }),
    }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {
        companyId: 123,
        activeMasterIds: [2],
      },
    });

    const staff = await adapter.getStaff('tenant-1');

    expect(staff).toEqual([
      {
        id: '2',
        name: 'Nikita',
        title: 'Top Master',
        specialization: 'Top Master',
        avatar_url: 'https://example.com/nikita.png',
        rating: 4.9,
      },
    ]);
    const fetchMock = global.fetch as jest.Mock;
    const calls = fetchMock.mock.calls as Array<[URL | string]>;
    const requestedUrl = String(calls[0]?.[0] ?? '');
    expect(requestedUrl).toContain('/company/123/staff');
  });

  it('falls back to alternate staff endpoints when the management route is unavailable', async () => {
    const requestedUrls: string[] = [];
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/company/123/staff')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ meta: { message: 'Route not available' } }),
            { status: 404 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ id: 7, name: 'Alex', specialization: 'Barber' }],
          }),
          { status: 200 },
        ),
      );
    });

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(adapter.getStaff('tenant-1')).resolves.toEqual([
      expect.objectContaining({ id: '7', name: 'Alex' }),
    ]);
    expect(requestedUrls[0]).toContain('/company/123/staff');
    expect(requestedUrls[1]).toContain('/staff/123');
  });

  it('excludes fired and hidden historical staff from the active team', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: 1, name: 'Active barber', fired: 0, hidden: 0 },
            { id: 2, name: 'Former barber', fired: 1, hidden: 1 },
            { id: 3, name: 'Hidden barber', fired: 0, hidden: 1 },
            { id: 4, name: 'Boolean active', fired: false, hidden: false },
          ],
        }),
    }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(adapter.getStaff('tenant-1')).resolves.toEqual([
      expect.objectContaining({ id: '1', name: 'Active barber' }),
      expect.objectContaining({ id: '4', name: 'Boolean active' }),
    ]);
  });

  it('discovers only active companies without exposing provider payload fields', async () => {
    let requestedUrl = '';
    const fetchMock = jest.fn<typeof fetch>((input) => {
      requestedUrl = String(input);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 17,
                title: 'Internal title',
                public_title: 'Central branch',
                address: 'Main street',
                active: true,
                phone: '+7 999 000-00-00',
              },
              {
                id: 18,
                title: 'Closed branch',
                active: false,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    global.fetch = fetchMock;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {},
    });

    await expect(adapter.discoverCompanies()).resolves.toEqual([
      {
        id: '17',
        title: 'Internal title',
        address: 'Main street',
      },
    ]);
    expect(requestedUrl).toContain('my=1');
  });

  it('keeps the provider status in rejected request errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve(
          JSON.stringify({ meta: { message: 'Недостаточно прав' } }),
        ),
    }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {},
    });

    await expect(adapter.discoverCompanies()).rejects.toThrow(
      'YClients request failed with status 403: Недостаточно прав',
    );
  });

  it('maps service category into normalized services', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              services: [
                {
                  id: 7,
                  title: 'Haircut',
                  price_min: 2500,
                  seance_length: 3600,
                  category_id: 12,
                },
              ],
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 12,
                title: 'Haircuts',
              },
            ],
          }),
      }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {
        companyId: 123,
      },
    });

    const services = await adapter.getServices('tenant-1');

    expect(services).toEqual([
      {
        id: '7',
        name: 'Haircut',
        price: 2500,
        duration_minutes: 60,
        currency: 'RUB',
        category: 'Haircuts',
      },
    ]);
  });

  it('falls back to the management service catalog', async () => {
    const requestedUrls: string[] = [];
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/book_services/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ meta: { message: 'Route not available' } }),
            { status: 404 },
          ),
        );
      }
      if (url.includes('/services/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: 9, title: 'Haircut', price_min: 1900 }],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    });

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(adapter.getServices('tenant-1')).resolves.toEqual([
      expect.objectContaining({
        id: '9',
        name: 'Haircut',
        price: 1900,
        duration_minutes: 60,
      }),
    ]);
    expect(requestedUrls.some((url) => url.includes('/services/123'))).toBe(
      true,
    );
  });

  it('uses the discovered company when the optional profile route is unavailable', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes('/company/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ meta: { message: 'Route not available' } }),
            { status: 404 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 123,
                title: 'Main branch',
                address: 'Central street',
                active: true,
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(adapter.getCompanyProfile()).resolves.toEqual({
      id: '123',
      title: 'Main branch',
      address: 'Central street',
      logo_url: null,
      timezone: null,
      schedule: null,
    });
  });

  it('normalizes ISO datetime query and maps slots', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              time: '09:00',
              datetime: '2026-07-05T09:00:00',
              seance_length: 3600,
            },
          ],
        }),
    }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.ALTEGIO,
      apiToken: 'user-token',
      settings: {
        companyId: 123,
      },
    });

    const slots = await adapter.getAvailableSlots({
      tenantId: 'tenant-1',
      staffId: '15',
      date: '2026-07-05T00:00:00.000Z',
      serviceIds: ['7'],
    });

    expect(slots).toEqual([
      {
        start: '2026-07-05T09:00:00.000Z',
        end: '2026-07-05T10:00:00.000Z',
        staff_id: '15',
        branch_id: null,
      },
    ]);

    const fetchMock = global.fetch as jest.Mock;
    const calls = fetchMock.mock.calls as Array<[URL | string]>;
    const requestUrl = String(calls[0]?.[0] ?? '');
    expect(requestUrl).toContain('/book_times/123/15/2026-07-05');
    expect(requestUrl).toContain('service_ids%5B%5D=7');
  });

  it('cancels an appointment when YClients returns 204 without JSON body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {
        companyId: 123,
      },
    });

    const result = await adapter.cancelAppointment({
      tenantId: 'tenant-1',
      externalId: '456',
    });

    expect(result).toEqual({
      external_id: '456',
      status: 'canceled',
      raw: {
        provider: CrmProvider.YCLIENTS,
        response: null,
        success: true,
      },
    });

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('returns the exact client cashback balance instead of a local approximation', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 77, name: 'Other', phone: '+7 999 111-22-33' },
              { id: 88, name: 'Exact', phone: '+7 918 417-20-35' },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 1,
                balance: 9000,
                type: { title: 'Скидочная карта' },
              },
              {
                id: 2,
                balance: 2133,
                sold_amount: 62150,
                type: { title: 'Кэшбек карта' },
              },
            ],
          }),
      }) as typeof fetch;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(
      adapter.getClientLoyalty({
        tenantId: 'tenant-1',
        phone: '8 (918) 417-20-35',
      }),
    ).resolves.toEqual({
      provider: CrmProvider.YCLIENTS,
      external_client_id: '88',
      external_card_id: '2',
      balance: 2133,
      sold_amount: 62150,
      currency: 'RUB',
    });

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const calls = fetchMock.mock.calls;
    const requestBody = calls[0]?.[1]?.body;
    const searchBody = JSON.parse(
      typeof requestBody === 'string' ? requestBody : '{}',
    ) as Record<string, unknown>;
    expect(searchBody).toMatchObject({ page: 1, page_size: 8 });
    const loyaltyRequest = calls[1]?.[0];
    const loyaltyUrl =
      typeof loyaltyRequest === 'string'
        ? loyaltyRequest
        : loyaltyRequest instanceof URL
          ? loyaltyRequest.href
          : loyaltyRequest?.url || '';
    expect(loyaltyUrl).toContain('/loyalty/client_cards/88');
  });
});
