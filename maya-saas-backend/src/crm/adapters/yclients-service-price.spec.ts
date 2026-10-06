import { CrmProvider } from '../../common/domain.enums';
import { CrmOutcomeUnknownError } from '../crm-request.errors';
import {
  servicePriceSnapshot,
  ServicePricePreDispatchError,
} from '../yclients-service-price.contract';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

const source = () => ({
  id: 201,
  company_id: 123,
  title: 'Synthetic cut',
  booking_title: 'Synthetic cut',
  category_id: 1,
  price_min: 2000,
  price_max: 2000,
  duration: 1800,
  is_multi: false,
  tax_variant: 1,
  vat_id: 2,
  is_need_limit_date: false,
  seance_search_start: 0,
  seance_search_finish: 86400,
  step: 900,
  seance_search_step: 900,
  technical_break_duration: 300,
  staff: [{ id: 101, seance_length: 1800 }],
  active: 1,
  is_chain: false,
  is_price_managed_only_in_chain: false,
  comment: 'Preserved synthetic note',
  discount: 5,
  weight: 2,
  api_service_id: 712,
});
const snapshot = (raw: unknown) =>
  servicePriceSnapshot(raw, '123', '201', 'RUB');

describe('YCLIENTS fixed service price exact provider contract', () => {
  const originalFetch = global.fetch;
  const originalPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = originalPartner;
    jest.restoreAllMocks();
  });

  it.each([
    ['duration', undefined],
    ['technical_break_duration', undefined],
    ['is_chain', undefined],
    ['price_min', null],
    ['price_max', 2100],
    ['api_service_id', '9007199254740993'],
    ['discount', '0.123456789012345678'],
    ['is_price_managed_only_in_chain', true],
    ['is_multi', true],
    ['staff', [{ id: 101, seance_length: 1800, technological_card_id: 7 }]],
  ])('refuses unsafe source %s without constructing a write', (key, value) => {
    expect(() => snapshot({ ...source(), [key]: value })).toThrow(
      ServicePricePreDispatchError,
    );
  });
  it('requires exact date restrictions and keeps numeric strings without rounding', () => {
    expect(() => snapshot({ ...source(), is_need_limit_date: true })).toThrow();
    expect(
      snapshot({
        ...source(),
        price_min: '2000.00',
        price_max: '2000.0',
        api_service_id: '712',
      }).patchBody,
    ).toEqual(snapshot(source()).patchBody);
    const dates = {
      ...source(),
      is_need_limit_date: true,
      date_from: '2026-10-06',
      date_to: '2026-10-08',
      dates: ['2026-10-06'],
    };
    expect(snapshot(dates).patchBody).toMatchObject({
      dates: ['2026-10-06'],
      technical_break_duration: 300,
    });
  });

  function fixture(mode = 'success') {
    process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic-price-only';
    let row: Record<string, unknown> = source();
    const writes: Record<string, unknown>[] = [];
    const methods: string[] = [];
    global.fetch = jest.fn(async (url, init) => {
      await Promise.resolve();
      const path = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      ).pathname;
      methods.push(init?.method ?? 'GET');
      if (path.includes('/permissions/'))
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              settings: {
                settings_services_access: true,
                services_edit: mode !== 'permission-denied',
                settings_services_edit_price_access: true,
              },
            },
          }),
        );
      if (init?.method === 'PATCH') {
        if (typeof init.body !== 'string')
          throw new Error('Expected JSON body');
        const patch = JSON.parse(init.body) as Record<string, unknown>;
        writes.push(patch);
        row = { ...row, ...patch };
        if (mode === 'lost') throw new TypeError('fetch failed');
        if (mode === 'empty') return new Response('');
        if (mode === 'malformed')
          return new Response('<html>unavailable</html>');
        if (mode === 'server-error') return new Response('{}', { status: 502 });
        if (mode === 'readback-drift')
          row.comment = 'Different unrelated state';
        return new Response(
          JSON.stringify({
            success: mode !== 'false-success',
            data: {
              id: mode === 'wrong-id' ? 999 : 201,
              company_id: mode === 'wrong-company' ? 999 : 123,
              price_min: mode === 'wrong-price' ? 1999 : 2500,
              price_max: 2500,
            },
          }),
        );
      }
      return new Response(JSON.stringify({ success: true, data: [row] }));
    }) as typeof fetch;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic',
      baseUrl: 'http://synthetic.invalid/api/v1',
      settings: { companyId: 123, currency: 'RUB' },
    });
    return {
      adapter,
      writes,
      methods,
      update: (revision = snapshot(source()).revision, deadlineAt?: number) =>
        adapter.updateServiceFixedPrice({
          serviceId: '201',
          expectedRevision: revision,
          priceMinor: 250000,
          deadlineAt,
        }),
    };
  }
  it('writes exactly once and requires exact receipt plus uncached full preserved readback', async () => {
    const f = fixture();
    const result = await f.update();
    expect(result.priceMinor).toBe(250000);
    expect(result.nonPriceHash).toBe(snapshot(source()).nonPriceHash);
    expect(f.writes).toEqual([
      { ...snapshot(source()).patchBody, price_min: 2500, price_max: 2500 },
    ]);
    expect(f.methods).toEqual(['GET', 'GET', 'PATCH', 'GET', 'GET']);
  });
  it.each([
    'lost',
    'empty',
    'malformed',
    'server-error',
    'false-success',
    'wrong-id',
    'wrong-company',
    'wrong-price',
    'readback-drift',
  ])('keeps %s UNKNOWN with one PATCH and no POST/fallback', async (mode) => {
    const f = fixture(mode);
    await expect(f.update()).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
    expect(f.writes).toHaveLength(1);
    expect(f.methods.filter((method) => method !== 'GET')).toEqual(['PATCH']);
  });
  it.each(['permission-denied', 'stale', 'deadline'])(
    'proves %s before dispatch with zero writes',
    async (mode) => {
      const f = fixture(mode);
      await expect(
        f.update(
          mode === 'stale' ? 'a'.repeat(64) : undefined,
          mode === 'deadline' ? Date.now() - 1 : undefined,
        ),
      ).rejects.toBeInstanceOf(ServicePricePreDispatchError);
      expect(f.writes).toHaveLength(0);
    },
  );
  it('shares one budget across reads and refuses PATCH after the budget is consumed', async () => {
    const f = fixture();
    // Deterministic clock advancement models two slow reads without wall-clock waits.
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(5000)
      .mockReturnValue(22000);
    await expect(f.update(undefined, 21000)).rejects.toBeInstanceOf(
      ServicePricePreDispatchError,
    );
    expect(f.writes).toHaveLength(0);
  });
});
