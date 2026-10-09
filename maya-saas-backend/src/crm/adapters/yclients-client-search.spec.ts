import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

/** Actual native request/parser; finite synthetic transport, no live provider. */
describe('YCLIENTS client search source outcomes', () => {
  const previousPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = previousPartner;
  });
  function fixture(body: unknown = { success: true, data: [] }, status = 200) {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic',
      baseUrl: 'http://127.0.0.1:9',
      settings: { companyId: 123 },
    });
    return {
      fetchMock,
      read: (query = 'Иван') =>
        adapter.searchClients({ tenantId: 'tenant-a', query }),
    };
  }

  it('preserves an observed empty list and the bounded exact company search request', async () => {
    const f = fixture();
    expect(await f.read('  Иван  ')).toEqual([]);
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:9/company/123/clients/search');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      fields: [
        'id',
        'name',
        'phone',
        'visits_count',
        'sold_amount',
        'last_visit_date',
      ],
      filters: [{ type: 'quick_search', state: { value: 'Иван' } }],
      page: 1,
      page_size: 10,
    });
  });

  it.each(['', 'Ив', '12'])(
    'keeps short query %s out of the provider',
    async (query) => {
      const f = fixture();
      expect(await f.read(query)).toEqual([]);
      expect(f.fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([403, 404, 429, 500])(
    'propagates HTTP %s once without an empty fallback or retry',
    async (status) => {
      const f = fixture(
        { success: false, meta: { message: 'SYNTHETIC_PRIVATE_ERROR' } },
        status,
      );
      await expect(f.read()).rejects.toThrow();
      expect(f.fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('propagates transport interruption without claiming no client exists', async () => {
    const f = fixture();
    f.fetchMock.mockRejectedValue(new TypeError('synthetic offline'));
    await expect(f.read()).rejects.toMatchObject({
      name: 'CrmOutcomeUnknownError',
    });
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { success: false, data: [] },
    { success: 'false', data: [] },
    { success: null, data: [] },
    { success: 1, data: [] },
    {},
    { data: null },
    { data: {} },
    { data: '' },
    { data: [null] },
    { data: [true] },
    { data: [{}] },
    { data: [{ id: null }] },
    { data: [{ id: '' }] },
    { data: [{ id: ' 88' }] },
    { data: [{ id: '88\n' }] },
    { data: [{ id: true }] },
    { data: [{ id: {} }] },
    { data: [{ id: 0 }] },
    { data: [{ id: -1 }] },
    { data: [{ id: 1.5 }] },
    { data: [{ id: '9007199254740993' }] },
    { data: [{ id: '88' }, {}] },
  ])('refuses unobserved or malformed search %# as a whole', async (body) => {
    const f = fixture(body);
    await expect(f.read()).rejects.toThrow();
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['<html>unavailable</html>', '', 'null'])(
    'refuses invalid successful response %#',
    async (raw) => {
      const f = fixture();
      f.fetchMock.mockResolvedValue(new Response(raw));
      await expect(f.read()).rejects.toThrow();
      expect(f.fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves all valid identities and nullable metrics without choosing a client', async () => {
    const f = fixture({
      data: [
        { id: 88, name: 'Первый' },
        { id: '89', name: 'Второй' },
      ],
    });
    expect(await f.read()).toEqual([
      {
        id: '88',
        name: 'Первый',
        phone: null,
        visits_count: null,
        sold_amount: null,
        last_visit_date: null,
      },
      {
        id: '89',
        name: 'Второй',
        phone: null,
        visits_count: null,
        sold_amount: null,
        last_visit_date: null,
      },
    ]);
  });
});
