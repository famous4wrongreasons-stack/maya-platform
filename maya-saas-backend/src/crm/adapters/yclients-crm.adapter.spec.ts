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
});
