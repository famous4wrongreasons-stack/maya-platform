import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

describe('YclientsCRMAdapter', () => {
  const originalFetch = global.fetch;
  const originalPartnerToken = process.env.YCLIENTS_PARTNER_TOKEN;
  const requestUrl = (input: Parameters<typeof fetch>[0]): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
  };

  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'partner-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.YCLIENTS_PARTNER_TOKEN = originalPartnerToken;
    jest.useRealTimers();
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
    await expect(adapter.getTeamMembers('tenant-1')).resolves.toEqual([
      expect.objectContaining({
        id: '1',
        name: 'Active barber',
        bookable: true,
        suggested_role: 'staff',
      }),
      expect.objectContaining({
        id: '3',
        name: 'Hidden barber',
        bookable: false,
        suggested_role: 'administrator',
      }),
      expect.objectContaining({
        id: '4',
        name: 'Boolean active',
        bookable: true,
        suggested_role: 'staff',
      }),
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

    await expect(adapter.getServices('tenant-1')).resolves.toEqual(services);
    expect(global.fetch).toHaveBeenCalledTimes(2);
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

  it('treats YClients 422 date-unavailable as empty slots', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: false,
            meta: { message: 'Дата недоступна.' },
          }),
        ),
    }) as typeof fetch;

    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: {
        companyId: 123,
      },
    });

    await expect(
      adapter.getAvailableSlots({
        tenantId: 'tenant-1',
        staffId: '15',
        date: '2026-07-05',
        serviceIds: ['7'],
      }),
    ).resolves.toEqual([]);
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

  it('loads a client appointment history by exact phone and client id', async () => {
    const requestedUrls: string[] = [];
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/clients/search')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: 88, name: 'Exact', phone: '+7 918 417-20-35' }],
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 901,
                datetime: '2026-07-31T10:00:00',
                seance_length: 4500,
                attendance: 0,
                staff: { id: 15, name: 'Stanislav' },
                client: { id: 88, name: 'Exact' },
                services: [
                  { id: 7, title: 'Haircut', cost: 2000 },
                  { id: 9, title: 'Patches', cost: 0 },
                ],
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

    await expect(
      adapter.getClientAppointments({
        tenantId: 'tenant-1',
        phone: '8 (918) 417-20-35',
        timezone: 'Europe/Moscow',
        from: '2026-01-01',
        to: '2026-12-31',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        external_id: '901',
        start: '2026-07-31T07:00:00.000Z',
        end: '2026-07-31T08:15:00.000Z',
        staff_id: '15',
        service_ids: ['7', '9'],
        total_price: 2000,
      }),
    ]);
    expect(
      requestedUrls.some(
        (url) =>
          url.includes('/records/123') &&
          url.includes('client_id=88') &&
          url.includes('start_date=2026-01-01'),
      ),
    ).toBe(true);
  });

  it('returns full-card metrics for a server-side client dossier search', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 88,
              name: 'Иван Петров',
              phone: '+7 918 417-20-35',
              visits_count: 39,
              sold_amount: 62150,
              last_visit_date: '2026-07-14T20:00:00+03:00',
            },
          ],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(
      adapter.searchClients({ tenantId: 'tenant-1', query: 'Иван' }),
    ).resolves.toEqual([
      {
        id: '88',
        name: 'Иван Петров',
        phone: '+79184172035',
        visits_count: 39,
        sold_amount: 62150,
        last_visit_date: '2026-07-14',
      },
    ]);

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(
      typeof requestBody === 'string' ? requestBody : '{}',
    ) as { fields?: string[] };
    expect(body.fields).toEqual([
      'id',
      'name',
      'phone',
      'visits_count',
      'sold_amount',
      'last_visit_date',
    ]);
  });

  // 🔴 Контракт изменён осознанно, по решению владельца: список спящих гостей
  // должен называть ИМЕНА, иначе возвращать некого. Персональные поля теперь
  // запрашиваются, но граница осталась на месте и проверяется ниже: наружу, к
  // внешней модели, они по-прежнему не уходят — статистика отдаёт псевдонимы,
  // поимённый список собирает сервер.
  it('paginates the complete client registry and keeps personal fields inside', async () => {
    const requestBodies: Array<{ fields: string[]; page: number }> = [];
    global.fetch = jest.fn(
      (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
          throw new Error('Expected JSON request body');
        }
        const body = JSON.parse(rawBody) as {
          fields: string[];
          page: number;
        };
        requestBodies.push(body);
        const data =
          body.page === 1
            ? Array.from({ length: 200 }, (_, index) => ({
                id: index + 1,
                visits_count: index % 5,
                sold_amount: index * 100,
                last_visit_date: '2026-07-01',
                name: `Must not leave adapter ${index}`,
                phone: `+7000000${index}`,
              }))
            : [
                {
                  id: 200,
                  visits_count: 9,
                  sold_amount: 999,
                  last_visit_date: '2026-06-01',
                },
                {
                  id: 201,
                  visits_count: 3,
                  sold_amount: 4500,
                  last_visit_date: '2026-05-02T10:00:00+03:00',
                },
              ];
        return Promise.resolve(
          new Response(JSON.stringify({ data }), { status: 200 }),
        );
      },
    ) as typeof fetch;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    const result = await adapter.getClientRegistry({ tenantId: 'tenant-1' });

    expect(result.complete).toBe(true);
    expect(result.clients).toHaveLength(201);
    expect(result.clients.at(-1)).toEqual({
      external_id: '201',
      visits_count: 3,
      sold_amount: 4500,
      last_visit_date: '2026-05-02',
      name: null,
      phone: null,
    });
    // Имя и телефон доезжают до сервера — именно они и нужны для возврата гостя.
    expect(result.clients[0]).toMatchObject({
      external_id: '1',
      name: 'Must not leave adapter 0',
      phone: '+70000000',
    });
    expect(requestBodies.map((body) => body.page)).toEqual([1, 2]);
    for (const body of requestBodies) {
      expect(body.fields).toEqual([
        'id',
        'name',
        'phone',
        'visits_count',
        'sold_amount',
        'last_visit_date',
      ]);
    }
  });

  it('fails closed instead of returning a partial client registry', async () => {
    const page = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      visits_count: 1,
      sold_amount: 100,
      last_visit_date: '2026-07-01',
    }));
    global.fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: page }), { status: 200 }),
        ),
      ) as typeof fetch;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(
      adapter.getClientRegistry({ tenantId: 'tenant-1' }),
    ).rejects.toThrow('pagination made no progress');
  });

  it('maps the external CRM journal without exposing client phones', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);

      if (url.includes('/records/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 902,
                  datetime: '2026-07-31T10:00:00',
                  seance_length: 3600,
                  attendance: 0,
                  staff: { id: 15, name: 'Stanislav' },
                  client: {
                    id: 88,
                    name: 'Client',
                    phone: '+7 918 000-00-00',
                  },
                  services: [{ id: 7, title: 'Haircut', cost: 2000 }],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/company/123/staff')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: 15, name: 'Stanislav', specialization: 'Barber' }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/book_services/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                services: [
                  {
                    id: 7,
                    title: 'Haircut',
                    price_min: 2000,
                    seance_length: 3600,
                  },
                ],
              },
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

    const journal = await adapter.getJournal({
      tenantId: 'tenant-1',
      from: '2026-07-30T21:00:00.000Z',
      to: '2026-08-06T21:00:00.000Z',
      timezone: 'Europe/Moscow',
    });

    expect(journal).toMatchObject({
      calendar_source: 'external',
      count: 1,
      appointments: [
        {
          id: 'crm-902',
          client: { id: '88', name: 'Client' },
          provider: {
            id: '15',
            name: 'Stanislav',
            title: 'Barber',
          },
          service_ids: ['7'],
          start_at: '2026-07-31T07:00:00.000Z',
          end_at: '2026-07-31T08:00:00.000Z',
          total_price: 2000,
        },
      ],
    });
    expect(JSON.stringify(journal)).not.toContain('+7 918 000-00-00');
  });

  /**
   * Один набор записей на все проверки статусов: обычная (ждём клиента),
   * отменённая, неявка и подтверждённая клиентом. Именно эти четыре состояния
   * владелец и различает в вопросе «сколько у нас отмен».
   */
  const journalStatusRecords = [
    {
      id: 902,
      datetime: '2026-07-31T10:00:00',
      seance_length: 3600,
      attendance: 0,
      staff: { id: 15, name: 'Stanislav' },
      client: { id: 88, name: 'Waiting client' },
      services: [{ id: 7, title: 'Haircut', cost: 2000 }],
    },
    {
      id: 903,
      datetime: '2026-07-31T12:00:00',
      seance_length: 3600,
      attendance: 0,
      deleted: true,
      staff: { id: 15, name: 'Stanislav' },
      client: { id: 89, name: 'Cancelled client' },
      services: [{ id: 7, title: 'Haircut', cost: 2000 }],
    },
    {
      id: 904,
      datetime: '2026-07-31T14:00:00',
      seance_length: 3600,
      attendance: -1,
      staff: { id: 15, name: 'Stanislav' },
      client: { id: 90, name: 'Absent client' },
      services: [{ id: 7, title: 'Haircut', cost: 2000 }],
    },
    {
      id: 905,
      datetime: '2026-07-31T16:00:00',
      seance_length: 3600,
      attendance: 2,
      visit_attendance: 2,
      staff: { id: 15, name: 'Stanislav' },
      client: { id: 91, name: 'Confirmed client' },
      services: [{ id: 7, title: 'Haircut', cost: 2000 }],
    },
  ];

  function mockJournalFetch(records: unknown[]) {
    const requestedUrls: string[] = [];
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/records/123')) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: records }), { status: 200 }),
        );
      }
      if (url.includes('/company/123/staff')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: 15, name: 'Stanislav', specialization: 'Barber' }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/book_services/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                services: [
                  {
                    id: 7,
                    title: 'Haircut',
                    price_min: 2000,
                    seance_length: 3600,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    });

    return requestedUrls;
  }

  function journalAdapter() {
    return new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });
  }

  it('keeps canceled visits out of the schedule grid by default', async () => {
    const requestedUrls = mockJournalFetch(journalStatusRecords);

    const journal = await journalAdapter().getJournal({
      tenantId: 'tenant-1',
      from: '2026-07-30T21:00:00.000Z',
      to: '2026-08-06T21:00:00.000Z',
      timezone: 'Europe/Moscow',
    });

    // Сетка расписания и карточка визита ходят сюда же — без явной просьбы
    // отменённый визит наружу не выходит и в count не попадает.
    expect(journal.count).toBe(3);
    expect(journal.appointments.map((item) => item.id)).toEqual([
      'crm-902',
      'crm-904',
      'crm-905',
    ]);
    expect(
      journal.appointments.some((item) => item.status === 'canceled'),
    ).toBe(false);
    // Неявка — не отмена: окно потеряно, и из журнала оно не исчезает.
    expect(
      journal.appointments.find((item) => item.id === 'crm-904')?.status,
    ).toBe('no_show');
    expect(
      requestedUrls.some(
        (url) => url.includes('/records/123') && url.includes('with_deleted'),
      ),
    ).toBe(false);
  });

  it('returns canceled visits apart from no-shows when analytics asks for them', async () => {
    const requestedUrls = mockJournalFetch(journalStatusRecords);

    const journal = await journalAdapter().getJournal({
      tenantId: 'tenant-1',
      from: '2026-07-30T21:00:00.000Z',
      to: '2026-08-06T21:00:00.000Z',
      timezone: 'Europe/Moscow',
      includeCanceled: true,
    });

    expect(journal.count).toBe(4);
    expect(journal.appointments.map((item) => [item.id, item.status])).toEqual([
      ['crm-902', 'confirmed'],
      ['crm-903', 'canceled'],
      ['crm-904', 'no_show'],
      ['crm-905', 'confirmed'],
    ]);
    // Отмены едут той же постраничной выборкой: отдельного обращения к CRM
    // за ними нет, иначе журнал за месяц стоил бы вдвое дороже.
    const recordRequests = requestedUrls.filter((url) =>
      url.includes('/records/123'),
    );
    expect(recordRequests).toHaveLength(1);
    expect(recordRequests[0]).toContain('with_deleted=1');
  });

  it('marks a paid visit completed and keeps deletion above absence', async () => {
    mockJournalFetch([
      {
        id: 906,
        datetime: '2026-07-31T10:00:00',
        seance_length: 3600,
        attendance: 0,
        paid_full: 1,
        staff: { id: 15, name: 'Stanislav' },
        client: { id: 92, name: 'Paid client' },
        services: [{ id: 7, title: 'Haircut', cost: 2000 }],
      },
      {
        // Клиент не пришёл, и запись потом удалили. Последнее, что с ней
        // сделали, — отменили: считать это неявкой значит записать салону
        // потерю, которой не было.
        id: 907,
        datetime: '2026-07-31T12:00:00',
        seance_length: 3600,
        attendance: -1,
        deleted: true,
        staff: { id: 15, name: 'Stanislav' },
        client: { id: 93, name: 'Absent then removed' },
        services: [{ id: 7, title: 'Haircut', cost: 2000 }],
      },
      {
        // Присутствие проставлено только по визиту — на части филиалов
        // приходит именно так, и статус обязан это увидеть.
        id: 908,
        datetime: '2026-07-31T14:00:00',
        seance_length: 3600,
        visit_attendance: 1,
        staff: { id: 15, name: 'Stanislav' },
        client: { id: 94, name: 'Visit-level attendance' },
        services: [{ id: 7, title: 'Haircut', cost: 2000 }],
      },
    ]);

    const journal = await journalAdapter().getJournal({
      tenantId: 'tenant-1',
      from: '2026-07-30T21:00:00.000Z',
      to: '2026-08-06T21:00:00.000Z',
      timezone: 'Europe/Moscow',
      includeCanceled: true,
    });

    expect(journal.appointments.map((item) => [item.id, item.status])).toEqual([
      ['crm-906', 'completed'],
      ['crm-907', 'canceled'],
      ['crm-908', 'completed'],
    ]);
  });

  it('does not open a grid column for a master whose whole day was canceled', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);

      if (url.includes('/records/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 910,
                  datetime: '2026-08-06T10:00:00',
                  seance_length: 3600,
                  attendance: 0,
                  deleted: true,
                  staff: { id: 16, name: 'Ilya' },
                  client: { id: 95, name: 'Cancelled client' },
                  services: [{ id: 7, title: 'Haircut', cost: 2000 }],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/schedule/123/15/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  date: '2026-08-06',
                  is_working: true,
                  slots: [{ from: '10:00', to: '20:00' }],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/schedule/123/16/')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ date: '2026-08-06', is_working: false, slots: [] }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/company/123/staff')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: 15, name: 'Stanislav', specialization: 'Barber' },
                { id: 16, name: 'Ilya', specialization: 'Barber' },
              ],
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      );
    });

    const journal = await journalAdapter().getJournal({
      tenantId: 'tenant-1',
      from: '2026-08-05T21:00:00.000Z',
      to: '2026-08-06T21:00:00.000Z',
      timezone: 'Europe/Moscow',
      includeCanceled: true,
    });

    expect(journal.appointments.map((item) => item.status)).toEqual([
      'canceled',
    ]);
    // Мастер вне смены, у которого весь день состоял из отмен, колонку в сетке
    // не получает — иначе владелец видел бы пустой столбец «работающего».
    expect((journal.masters ?? []).map((master) => master.id)).toEqual(['15']);
    expect((journal.all_masters ?? []).map((master) => master.id)).toEqual([
      '15',
      '16',
    ]);
  });

  it('returns exact YClients sales and official payroll without raw client data', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes('/transactions/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 1,
                  amount: '2000',
                  sold_item_type: 'service',
                  record_id: 901,
                  account: { title: 'Основная касса', is_cash: true },
                  client: { name: 'Must not leave adapter', phone: '+7999' },
                },
                {
                  id: 2,
                  amount: 500,
                  sold_item_type: 'goods_transaction',
                  account: { title: 'Расчетный счет', is_cash: false },
                },
                {
                  id: 3,
                  amount: -100,
                  sold_item_type: 'loyalty_certificate',
                  account: { title: 'Основная касса', is_cash: true },
                },
                { id: 4, amount: 999, sold_item_type: null },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/company/123/staff')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: 11, name: 'Alex', fired: 0, hidden: 0 },
                { id: 12, name: 'Ilya', fired: false, hidden: false },
                {
                  id: 14,
                  name: 'Back office',
                  fired: false,
                  hidden: true,
                },
                { id: 13, name: 'Former', fired: true, hidden: false },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/records/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 901,
                  staff_id: 11,
                  services: [{ id: 501, title: 'Мужская стрижка' }],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/salary/calculation/staff/11')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                total_sum: { income: '1000', expense: '700', balance: '300' },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/salary/calculation/staff/12')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                total_sum: { income: '500', expense: '100', balance: '400' },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/salary/calculation/staff/14')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                total_sum: { income: '250', expense: '50', balance: '200' },
              },
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

    const result = await adapter.getFinancialSummary({
      tenantId: 'tenant-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T20:59:59.000Z',
      timezone: 'Europe/Moscow',
    });

    expect(result).toMatchObject({
      source: 'external_crm',
      provider: CrmProvider.YCLIENTS,
      verified: true,
      period: { from: '2026-07-01', to: '2026-07-31' },
      revenue: {
        status: 'available',
        verified: true,
        transaction_count: 2,
        total: { currency: 'RUB', amount_kopecks: 250_000 },
        by_type: [
          {
            key: 'service',
            label: 'Услуги',
            amount_kopecks: 200_000,
          },
          {
            key: 'goods_transaction',
            label: 'Товары',
            amount_kopecks: 50_000,
          },
        ],
        by_staff: [
          {
            staff_id: '11',
            transaction_count: 1,
            currency: 'RUB',
            amount_kopecks: 200_000,
          },
        ],
        by_service: [
          {
            service_id: '501',
            name: 'Мужская стрижка',
            transaction_count: 1,
            currency: 'RUB',
            amount_kopecks: 200_000,
          },
        ],
        staff_attribution_status: 'available',
        staff_attribution_coverage_percent: 100,
        unattributed_service_total: {
          currency: 'RUB',
          amount_kopecks: 0,
        },
        unattributed_service_transaction_count: 0,
        service_attribution_status: 'available',
        service_attribution_coverage_percent: 100,
        unattributed_service_breakdown_total: {
          currency: 'RUB',
          amount_kopecks: 0,
        },
        unattributed_service_breakdown_transaction_count: 0,
      },
      payroll: {
        status: 'available',
        verified: true,
        accrued_total: { currency: 'RUB', amount_kopecks: 175_000 },
        paid_total: { currency: 'RUB', amount_kopecks: 85_000 },
        balance_total: { currency: 'RUB', amount_kopecks: 90_000 },
        staff: [
          {
            staff_id: '11',
            name: 'Alex',
            status: 'available',
            accrued: { amount_kopecks: 100_000 },
          },
          {
            staff_id: '12',
            name: 'Ilya',
            status: 'available',
            accrued: { amount_kopecks: 50_000 },
          },
          {
            staff_id: '14',
            name: 'Back office',
            status: 'available',
            accrued: { amount_kopecks: 25_000 },
          },
        ],
      },
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain('Must not leave adapter');
    expect(JSON.stringify(result)).not.toContain('+7999');
  });

  it('reads a long revenue period without loading payroll', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes('/transactions/123')) {
        expect(url).toContain('start_date=2026-01-01');
        expect(url).toContain('end_date=2026-08-06');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 1,
                  amount: '2500',
                  sold_item_type: 'service',
                  account: { title: 'Основная касса', is_cash: true },
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      throw new Error(`Unexpected payroll request: ${url}`);
    });
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    const result = await adapter.getRevenueSummary({
      tenantId: 'tenant-1',
      from: '2025-12-31T21:00:00.000Z',
      to: '2026-08-06T12:00:00.000Z',
      timezone: 'Europe/Moscow',
    });

    expect(result).toMatchObject({
      verified: true,
      period: { from: '2026-01-01', to: '2026-08-06' },
      revenue: {
        status: 'available',
        transaction_count: 1,
        total: { currency: 'RUB', amount_kopecks: 250_000 },
      },
    });
  });

  it('hides payroll totals when YClients returns only a partial result', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes('/transactions/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: 1, amount: 2000, sold_item_type: 'service' }],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/company/123/staff')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { id: 11, name: 'Alex' },
                { id: 12, name: 'Ilya' },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/salary/calculation/staff/11')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                total_sum: { income: '1000', expense: '700', balance: '300' },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/salary/calculation/staff/12')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ meta: { message: 'Недостаточно прав' } }),
            { status: 403 },
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

    const result = await adapter.getFinancialSummary({
      tenantId: 'tenant-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T20:59:59.000Z',
      timezone: 'Europe/Moscow',
    });

    expect(result.verified).toBe(false);
    expect(result.payroll).toMatchObject({
      status: 'partial',
      verified: false,
      accrued_total: null,
      paid_total: null,
      balance_total: null,
      staff: [
        { staff_id: '11', status: 'available', verified: true },
        {
          staff_id: '12',
          status: 'unavailable',
          verified: false,
          accrued: null,
        },
      ],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'crm_payroll_partially_unavailable',
        }),
      ]),
    );
  });

  it('closes a staff day through the YClients schedule endpoint and verifies it', async () => {
    // Дата в запросах и ответах прибита к 2026-08-06, а адаптер запрещает
    // менять график задним числом. Без фиксации часов тест «протухал» ровно
    // на следующий день и падал на защите, а не на проверяемом поведении.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T09:00:00.000Z'));
    let scheduleSlots = [{ from: '10:00', to: '20:00' }];
    let writtenPayload: unknown = null;
    global.fetch = jest.fn<typeof fetch>(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = requestUrl(input);
        if (url.includes('/schedule/123/7/2026-08-06/2026-08-06')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: [
                  {
                    date: '2026-08-06',
                    is_working: scheduleSlots.length > 0,
                    slots: scheduleSlots,
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/records/123')) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: [] }), { status: 200 }),
          );
        }
        if (
          url.includes('/company/123/staff/schedule') &&
          init?.method === 'PUT'
        ) {
          if (typeof init.body !== 'string') {
            throw new Error('Expected a JSON request body');
          }
          writtenPayload = JSON.parse(init.body) as unknown;
          scheduleSlots = [];
          return Promise.resolve(
            new Response(JSON.stringify({ success: true, data: {} }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), { status: 200 }),
        );
      },
    );
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });
    const current = await adapter.getStaffScheduleDay({
      tenantId: 'tenant-1',
      staffId: '7',
      date: '2026-08-06',
    });

    await expect(
      adapter.applyStaffScheduleDayChange({
        tenantId: 'tenant-1',
        staffId: '7',
        date: '2026-08-06',
        slots: [],
        expectedRevision: current.revision,
        timezone: 'Europe/Moscow',
      }),
    ).resolves.toEqual({
      staff_id: '7',
      date: '2026-08-06',
      is_working: false,
      slots: [],
      verified: true,
    });
    expect(writtenPayload).toEqual({
      schedules_to_set: [],
      schedules_to_delete: [{ staff_id: 7, dates: ['2026-08-06'] }],
    });
  });

  it('refuses schedule changes that would cut through an existing appointment', async () => {
    // См. соседний тест: дата прибита к 2026-08-06, часы фиксируем.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-06T09:00:00.000Z'));
    let attemptedScheduleWrite = false;
    const fetchMock = jest.fn<typeof fetch>(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url = requestUrl(input);
        if (
          url.includes('/company/123/staff/schedule') &&
          init?.method === 'PUT'
        ) {
          attemptedScheduleWrite = true;
        }
        if (url.includes('/schedule/123/7/2026-08-06/2026-08-06')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: [
                  {
                    date: '2026-08-06',
                    is_working: true,
                    slots: [{ from: '10:00', to: '20:00' }],
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/records/123')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: [
                  {
                    id: 901,
                    datetime: '2026-08-06T18:30:00',
                    seance_length: 3600,
                    attendance: 0,
                    staff: { id: 7, name: 'Anton' },
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        void init;
        return Promise.resolve(
          new Response(JSON.stringify({ data: [] }), { status: 200 }),
        );
      },
    );
    global.fetch = fetchMock;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'user-token',
      settings: { companyId: 123 },
    });

    await expect(
      adapter.previewStaffScheduleDayChange({
        tenantId: 'tenant-1',
        staffId: '7',
        date: '2026-08-06',
        slots: [{ from: '10:00', to: '18:00' }],
        timezone: 'Europe/Moscow',
      }),
    ).resolves.toMatchObject({ conflict_times: ['18:30'] });
    expect(attemptedScheduleWrite).toBe(false);
  });

  it('confirms recovered revenue only from positive service transactions with matching record ids', async () => {
    global.fetch = jest.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.includes('/transactions/123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 1,
                  amount: '2000',
                  sold_item_type: 'service',
                  record_id: 901,
                },
                {
                  id: 2,
                  amount: '500',
                  sold_item_type: 'service',
                  record_id: 901,
                },
                {
                  id: 3,
                  amount: '-300',
                  sold_item_type: 'service',
                  record_id: 901,
                },
                {
                  id: 4,
                  amount: '900',
                  sold_item_type: 'goods_transaction',
                  record_id: 901,
                },
                {
                  id: 5,
                  amount: '1500',
                  sold_item_type: 'service',
                  record_id: 999,
                },
              ],
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

    await expect(
      adapter.getAppointmentRevenue({
        tenantId: 'tenant-1',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.000Z',
        timezone: 'Europe/Moscow',
        externalIds: ['901', '902'],
      }),
    ).resolves.toEqual({
      provider: CrmProvider.YCLIENTS,
      currency: 'RUB',
      verified: true,
      requested_record_count: 2,
      matched_record_count: 1,
      records: [
        {
          external_id: '901',
          amount_kopecks: 250_000,
          transaction_count: 2,
        },
      ],
    });
  });
});
