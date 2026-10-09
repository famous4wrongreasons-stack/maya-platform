import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

type Titles = { title?: string; public_title?: string };
type ProfileRoute = 'detail' | 'discovery fallback';

/** Finite synthetic native GET transport; no live CRM or model qualification. */
describe('native public company title provenance [synthetic transport]', () => {
  const originalPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  beforeEach(() => {
    process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic-no-credential';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = originalPartner;
  });

  function fixture(route: ProfileRoute, titles: Titles, onRead?: () => void) {
    const requested: string[] = [];
    const company = {
      id: 123,
      active: true,
      address: ' Публичный адрес ',
      logo: 'https://example.invalid/logo.png',
      timezone_name: 'Europe/Moscow',
      schedule: ' Ежедневно 10:00–20:00 ',
      ...titles,
    };
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (init?.method !== 'GET' || url.origin !== 'http://127.0.0.1:9')
        throw new Error('unexpected_transport');
      requested.push(url.pathname + url.search);
      onRead?.();
      if (url.pathname === '/company/123' && !url.search) {
        if (route === 'discovery fallback')
          return Promise.resolve(new Response('{}', { status: 404 }));
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: company }), {
            status: 200,
          }),
        );
      }
      if (url.pathname === '/companies' && url.search === '?my=1')
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: [company] }), {
            status: 200,
          }),
        );
      throw new Error('unlisted_provider_read');
    });
    return {
      requested,
      adapter: new YclientsCRMAdapter({
        provider: CrmProvider.YCLIENTS,
        apiToken: 'synthetic',
        baseUrl: 'http://127.0.0.1:9',
        settings: { companyId: 123 },
      }),
    };
  }

  const titleCases: Array<{ label: string; fields: Titles; expected: string }> =
    [
      { label: 'absent source fields', fields: {}, expected: '' },
      {
        label: 'empty and whitespace source fields',
        fields: { title: '  ', public_title: '' },
        expected: '',
      },
      {
        label: 'public title without title',
        fields: { public_title: ' Публичное название ' },
        expected: 'Публичное название',
      },
      {
        label: 'public title after blank title',
        fields: { title: '', public_title: ' Публичное название ' },
        expected: 'Публичное название',
      },
      {
        label: 'genuine provider name that resembles a legacy label',
        fields: { title: ' Филиал 123 ' },
        expected: 'Филиал 123',
      },
      {
        label: 'provider title precedence',
        fields: { title: ' Название ', public_title: 'Публичное название' },
        expected: 'Название',
      },
    ];

  describe.each<ProfileRoute>(['detail', 'discovery fallback'])(
    '%s',
    (route) => {
      it.each(titleCases)(
        'preserves $label without invented facts',
        async ({ fields, expected }) => {
          const f = fixture(route, fields);
          await expect(
            f.adapter.getCompanyProfile({ preserveMissingTitle: true }),
          ).resolves.toEqual({
            id: '123',
            title: expected,
            address: 'Публичный адрес',
            logo_url:
              route === 'detail' ? 'https://example.invalid/logo.png' : null,
            timezone: route === 'detail' ? 'Europe/Moscow' : null,
            schedule: route === 'detail' ? 'Ежедневно 10:00–20:00' : null,
          });
          expect(f.requested).toEqual(
            route === 'detail'
              ? ['/company/123']
              : ['/company/123', '/companies?my=1'],
          );
        },
      );

      it('preserves the legacy default generated label', async () => {
        const f = fixture(route, {});
        await expect(f.adapter.getCompanyProfile()).resolves.toMatchObject({
          id: '123',
          title: 'Филиал 123',
        });
        expect(f.requested).toHaveLength(route === 'detail' ? 1 : 2);
      });

      it('captures the scoped option before awaiting provider data', async () => {
        const options = { preserveMissingTitle: true };
        const f = fixture(route, {}, () => {
          options.preserveMissingTitle = false;
        });
        await expect(
          f.adapter.getCompanyProfile(options),
        ).resolves.toMatchObject({
          id: '123',
          title: '',
        });
        expect(options.preserveMissingTitle).toBe(false);
      });
    },
  );

  it('keeps discovery UI labels and its single existing request', async () => {
    const f = fixture('detail', {});
    await expect(f.adapter.discoverCompanies()).resolves.toEqual([
      { id: '123', title: 'Филиал 123', address: 'Публичный адрес' },
    ]);
    expect(f.requested).toEqual(['/companies?my=1']);
  });
});
