import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

const item = (id = 123) => ({
  parent_id: 0,
  item_id: id,
  category_id: 0,
  title: 'Тестовый шампунь',
  is_chain: false,
  is_category: false,
  is_item: true,
});
const category = {
  parent_id: 0,
  item_id: 0,
  category_id: 456,
  title: 'Уход',
  is_chain: true,
  is_category: true,
  is_item: false,
};

function adapter(companyId: unknown = 5) {
  return new YclientsCRMAdapter({
    provider: CrmProvider.YCLIENTS,
    apiToken: 'SYNTHETIC_ONLY',
    baseUrl: 'https://yclients.invalid/api/v1',
    settings: { companyId },
  });
}
function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function url(input: Parameters<typeof fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

describe('Native YCLIENTS goods search: synthetic HTTP boundary only', () => {
  const oldPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  let fetchMock: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;

  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_ONLY';
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected synthetic fetch'));
  });
  afterEach(() => {
    if (oldPartner === undefined) delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = oldPartner;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('makes exactly one GET using the documented URL template and encoded term/count, with no item-card read', async () => {
    fetchMock.mockResolvedValue(
      response({ success: true, data: [category, item()], meta: { count: 1 } }),
    );
    const query = 'Шампунь & count=100 /?+#';
    const read = await adapter().searchGoods('tenant-1', `  ${query}  `);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const requested = url(input);
    expect(requested.origin).toBe('https://yclients.invalid');
    expect(requested.pathname).toBe('/api/v1/goods/search/5');
    expect([...requested.searchParams.entries()]).toEqual([
      ['term', query],
      ['count', '21'],
    ]);
    expect(requested.hash).toBe('');
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(init?.body).toBeUndefined();
    expect(read.query).toBe(query);
    expect(read.rows).toEqual([
      { kind: 'category', id: '456', title: 'Уход' },
      { kind: 'item', id: '123', title: 'Тестовый шампунь' },
    ]);
    expect(read.limitations).toContain(
      'query_parameter_metadata_conflicts_with_url_template',
    );
  });

  it('performs a fresh bounded read on every explicit request without using meta.count as a hit total', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    const source = adapter();
    fetchMock.mockResolvedValueOnce(
      response({ success: true, data: [item()], meta: { count: 0 } }),
    );
    const first = await source.searchGoods('tenant-1', 'шампунь');
    jest.setSystemTime(new Date('2026-10-08T12:01:00.000Z'));
    fetchMock.mockResolvedValueOnce(
      response({ success: true, data: [], meta: { count: 999 } }),
    );
    const next = await source.searchGoods('tenant-1', 'шампунь');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.rows).toHaveLength(1);
    expect(next).toMatchObject({
      rows: [],
      exhaustive: false,
      may_have_more: false,
    });
    expect(first.as_of).toBe('2026-10-08T12:00:00.000Z');
    expect(next.as_of).toBe('2026-10-08T12:01:00.000Z');
  });

  it('uses one combined item/category bound and does not interpret categories as item cards', async () => {
    fetchMock.mockResolvedValue(
      response({
        success: true,
        data: [category, ...Array.from({ length: 20 }, (_, n) => item(n + 1))],
        meta: { count: 1 },
      }),
    );
    const read = await adapter().searchGoods('tenant-1', 'уход');
    expect(read).toMatchObject({
      limit: 20,
      may_have_more: true,
      exhaustive: false,
    });
    expect(read.rows).toHaveLength(20);
    expect(read.rows[0].kind).toBe('category');
    expect(read.rows[19].id).toBe('19');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'missing success', payload: { data: [] } },
    { label: 'provider refusal', payload: { success: false, data: [] } },
    { label: 'string success', payload: { success: 'true', data: [] } },
    { label: 'missing rows', payload: { success: true } },
    { label: 'non-array rows', payload: { success: true, data: {} } },
    {
      label: 'mixed malformed rows',
      payload: { success: true, data: [item(), null] },
    },
    {
      label: 'duplicate identity',
      payload: { success: true, data: [item(), item()] },
    },
    {
      label: 'contradictory identity',
      payload: { success: true, data: [{ ...item(), category_id: 99 }] },
    },
    {
      label: 'unbounded response',
      payload: {
        success: true,
        data: Array.from({ length: 22 }, (_, n) => item(n + 1)),
      },
    },
    { label: 'null envelope', payload: null },
  ])(
    'returns 503 for $label with no retry or alternate search',
    async ({ payload }) => {
      fetchMock.mockResolvedValue(response(payload));
      await expect(
        adapter().searchGoods('tenant-1', 'шампунь'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([302, 403, 404, 429, 503])(
    'returns 503 for provider HTTP %s without retry',
    async (status) => {
      fetchMock.mockResolvedValue(
        response(
          { success: false, meta: { message: 'SYNTHETIC_REFUSAL' } },
          status,
        ),
      );
      await expect(
        adapter().searchGoods('tenant-1', 'шампунь'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { label: 'malformed JSON', raw: '<html>not JSON</html>' },
    { label: 'empty successful body', raw: '' },
    {
      label: 'unqualified exponent identity',
      raw: JSON.stringify({ success: true, data: [item()] }).replace(
        '"item_id":123',
        '"item_id":1e3',
      ),
    },
  ])(
    'rejects $label instead of accepting rounded/unqualified source facts',
    async ({ raw }) => {
      fetchMock.mockResolvedValue(new Response(raw));
      await expect(
        adapter().searchGoods('tenant-1', 'шампунь'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a pre-parsed source without raw number tokens', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: [item()] }),
    } as Response);
    await expect(
      adapter().searchGoods('tenant-1', 'шампунь'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('converts a failed source read into 503 without returning a remembered or empty result', async () => {
    fetchMock.mockRejectedValue(new Error('Synthetic network unavailable'));
    await expect(
      adapter().searchGoods('tenant-1', 'шампунь'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid explicit query and company routing before any GET', async () => {
    await expect(adapter().searchGoods('tenant-1', ' ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      adapter('5?company_id=9').searchGoods('tenant-1', 'шампунь'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
