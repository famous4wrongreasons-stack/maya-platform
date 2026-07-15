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
