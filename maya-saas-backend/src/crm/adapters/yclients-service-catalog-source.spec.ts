import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

type Options = NonNullable<
  Parameters<YclientsCRMAdapter['readServiceCatalog']>[1]
>;
const unavailable = {
  response: { error: { code: 'service_catalog_source_unavailable' } },
};

/** Finite synthetic native GETs only. No provider/model acceptance. */
describe('native staff-filtered factual service catalog', () => {
  const originalPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = originalPartner;
  });

  function fixture(currency: unknown = 'RUB') {
    const settings: Record<string, unknown> = { companyId: 123, currency };
    const requested: string[] = [];
    const source: {
      data: unknown;
      duringRead?: () => void;
      success?: boolean;
      envelope?: unknown;
    } = {
      data: {
        services: [
          {
            id: 81,
            title: ' Стрижка ',
            price_min: 1500,
            price_max: 1500,
            seance_length: 1800,
          },
        ],
      },
    };
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        if (
          url.origin !== 'http://127.0.0.1:9' ||
          init?.method !== 'GET' ||
          url.pathname !== '/book_services/123' ||
          !['', '?staff_id=7', '?staff_id=8'].includes(url.search)
        )
          throw new Error('unlisted_synthetic_read');
        requested.push(url.pathname + url.search);
        source.duringRead?.();
        return Promise.resolve(
          new Response(
            JSON.stringify(
              Object.hasOwn(source, 'envelope')
                ? source.envelope
                : { success: source.success ?? true, data: source.data },
            ),
            { status: 200 },
          ),
        );
      });
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic',
      baseUrl: 'http://127.0.0.1:9',
      settings,
    });
    return {
      adapter,
      settings,
      requested,
      source,
      fetchMock,
      read: () => adapter.readServiceCatalog('tenant-a', { staffId: '7' }),
    };
  }

  it('returns the actual staff-filtered public facts without claiming completeness', async () => {
    const f = fixture();
    const result = await f.read();
    expect(result).toEqual({
      contract: 'maya.service-catalog.read/1',
      source: 'external_crm',
      scope: 'public_booking_catalog',
      as_of: result.as_of,
      catalog_exhaustive: false,
      services: [
        {
          id: '81',
          name: 'Стрижка',
          price: 1500,
          price_min: 1500,
          price_max: 1500,
          duration_minutes: 30,
          currency: 'RUB',
          category: null,
          limitations: [],
        },
      ],
    });
    expect(Number.isFinite(Date.parse(result.as_of))).toBe(true);
    expect(f.requested).toEqual(['/book_services/123?staff_id=7']);
  });

  it('does not reuse the first staff catalog or a cached general catalog for another employee', async () => {
    const f = fixture();
    const first = await f.read();
    f.source.data = {
      services: [
        {
          id: 82,
          title: 'Борода',
          price_min: 800,
          price_max: 1000,
          seance_length: 1230,
        },
      ],
    };
    const second = await f.adapter.readServiceCatalog('tenant-a', {
      staffId: '8',
    });
    expect(first.services[0].id).toBe('81');
    expect(second.services).toEqual([
      {
        id: '82',
        name: 'Борода',
        price: null,
        price_min: 800,
        price_max: 1000,
        duration_minutes: 20.5,
        currency: 'RUB',
        category: null,
        limitations: ['price_is_range'],
      },
    ]);
    expect(f.requested).toEqual([
      '/book_services/123?staff_id=7',
      '/book_services/123?staff_id=8',
    ]);
  });

  it('preserves observed zero, ranges and unknown measures as different facts', async () => {
    const f = fixture();
    f.source.data = {
      services: [
        {
          id: 81,
          title: 'Ноль',
          price_min: 0,
          price_max: 0,
          seance_length: 1830,
        },
        {
          id: 82,
          title: 'Диапазон',
          price_min: 500,
          price_max: 1000,
          seance_length: 1800,
        },
        { id: 83, title: 'Не измерено' },
        {
          id: 84,
          title: 'Неверные границы',
          price_min: 1000,
          price_max: 500,
          seance_length: 0,
        },
      ],
    };
    const { services } = await f.read();
    expect(
      services.map(
        ({
          id,
          price,
          price_min,
          price_max,
          duration_minutes,
          limitations,
        }) => ({
          id,
          price,
          price_min,
          price_max,
          duration_minutes,
          limitations,
        }),
      ),
    ).toEqual([
      {
        id: '81',
        price: 0,
        price_min: 0,
        price_max: 0,
        duration_minutes: 30.5,
        limitations: [],
      },
      {
        id: '82',
        price: null,
        price_min: 500,
        price_max: 1000,
        duration_minutes: 30,
        limitations: ['price_is_range'],
      },
      {
        id: '83',
        price: null,
        price_min: null,
        price_max: null,
        duration_minutes: null,
        limitations: ['fixed_price_not_observed', 'duration_not_observed'],
      },
      {
        id: '84',
        price: null,
        price_min: null,
        price_max: null,
        duration_minutes: null,
        limitations: ['fixed_price_not_observed', 'duration_not_observed'],
      },
    ]);
  });

  it.each([null, '1500', true, [1500], {}, -1].map((value) => ({ value })))(
    'does not coerce malformed measures $value into price/duration',
    async ({ value }) => {
      const f = fixture();
      f.source.data = {
        services: [
          {
            id: 81,
            title: 'Услуга',
            price_min: value,
            price_max: value,
            seance_length: value,
          },
        ],
      };
      const result = await f.read();
      expect(result.services[0]).toMatchObject({
        price: null,
        price_min: null,
        price_max: null,
        duration_minutes: null,
        limitations: ['fixed_price_not_observed', 'duration_not_observed'],
      });
    },
  );

  it.each(
    [
      undefined,
      null,
      '',
      'rub',
      'RUB\n',
      'RUB ',
      ['RUB'],
      { currency: 'RUB' },
      643,
    ].map((currency) => ({ currency })),
  )(
    'keeps missing/malformed declared currency $currency unknown',
    async ({ currency }) => {
      const f = fixture();
      f.settings.currency = currency;
      expect((await f.read()).services[0]).toMatchObject({
        currency: null,
        limitations: ['currency_not_configured'],
      });
    },
  );

  it('accepts only actual empty arrays and never upgrades them to an exhaustive catalog', async () => {
    const f = fixture();
    f.source.data = { services: [] };
    await expect(f.read()).resolves.toMatchObject({
      services: [],
      catalog_exhaustive: false,
    });
    expect(f.requested).toHaveLength(1);
  });

  it.each(
    [undefined, null, [], {}, { services: null }, { services: {} }].map(
      (data) => ({ data }),
    ),
  )(
    'refuses malformed containers $data instead of fabricating an empty catalog',
    async ({ data }) => {
      const f = fixture();
      f.source.data = data;
      await expect(f.read()).rejects.toMatchObject(unavailable);
      expect(f.requested).toHaveLength(1);
    },
  );

  it.each(
    [
      undefined,
      null,
      [],
      {},
      { success: false },
      { success: 'true' },
      { success: ['true'] },
    ].map((envelope) => ({ envelope })),
  )(
    'rejects absent or malformed success envelopes $envelope with one GET',
    async ({ envelope }) => {
      const f = fixture();
      f.source.envelope =
        envelope && typeof envelope === 'object' && !Array.isArray(envelope)
          ? { ...envelope, data: f.source.data }
          : envelope;
      await expect(f.read()).rejects.toMatchObject(unavailable);
      expect(f.requested).toHaveLength(1);
    },
  );

  it.each(
    [
      null,
      true,
      [],
      { id: [81], title: 'Услуга' },
      { id: '81\n', title: 'Услуга' },
      { id: 0, title: 'Услуга' },
      { id: 1.5, title: 'Услуга' },
      { id: 1e15, title: 'Услуга' },
      { id: '081', title: 'Услуга' },
      { id: 81, title: [] },
      { id: 81, title: '  ' },
    ].map((row) => ({ row })),
  )(
    'rejects malformed row identity $row without silently filtering it away',
    async ({ row }) => {
      const f = fixture();
      f.source.data = { services: [row] };
      await expect(f.read()).rejects.toMatchObject(unavailable);
      expect(f.requested).toHaveLength(1);
    },
  );

  it('refuses duplicate identities even when numeric/string encodings differ', async () => {
    const f = fixture();
    f.source.data = {
      services: [
        { id: 81, title: 'Первая' },
        { id: '81', title: 'Вторая' },
      ],
    };
    await expect(f.read()).rejects.toMatchObject(unavailable);
  });

  it.each(
    [
      null,
      {},
      [],
      { staffId: undefined },
      { staffId: ['7'] },
      { staffId: '7\n' },
      { staffId: '07' },
      { staffId: '7', branchId: 'other' },
      { staffId: '../7' },
    ].map((options) => ({ options })),
  )(
    'refuses malformed scoped options $options before transport',
    async ({ options }) => {
      const f = fixture();
      await expect(
        f.adapter.readServiceCatalog('tenant-a', options as Options),
      ).rejects.toMatchObject(unavailable);
      expect(f.fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(
    [[123], true, null, '123\n', 1.5, '0123'].map((companyId) => ({
      companyId,
    })),
  )(
    'rejects malformed captured company $companyId before transport',
    async ({ companyId }) => {
      const f = fixture();
      f.settings.companyId = companyId;
      await expect(f.read()).rejects.toMatchObject(unavailable);
      expect(f.fetchMock).not.toHaveBeenCalled();
    },
  );

  it('captures filter/company/currency before provider await', async () => {
    const f = fixture();
    const options = { staffId: '7' };
    f.source.duringRead = () => {
      options.staffId = '8';
      f.settings.companyId = 999;
      f.settings.currency = 'USD';
    };
    const result = await f.adapter.readServiceCatalog('tenant-a', options);
    expect(result.services[0].currency).toBe('RUB');
    expect(f.requested).toEqual(['/book_services/123?staff_id=7']);
  });

  it('does not fall back or turn a provider refusal into empty success', async () => {
    const f = fixture();
    f.source.success = false;
    await expect(f.read()).rejects.toThrow();
    expect(f.requested).toEqual(['/book_services/123?staff_id=7']);
  });

  it('preserves the unscoped factual catalog and the separate legacy website getter', async () => {
    const f = fixture();
    delete f.settings.currency;
    const general = await f.adapter.readServiceCatalog('tenant-a');
    expect(general.services[0].currency).toBeNull();
    expect(f.requested).toEqual(['/book_services/123']);
    await expect(
      f.adapter.getPublicBookingServices('tenant-a', '7'),
    ).resolves.toEqual([
      {
        id: '81',
        name: ' Стрижка ',
        price: 1500,
        duration_minutes: 30,
        currency: 'RUB',
      },
    ]);
    expect(f.requested).toEqual([
      '/book_services/123',
      '/book_services/123?staff_id=7',
    ]);
  });
});
