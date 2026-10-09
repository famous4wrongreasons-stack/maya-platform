import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

/** Native decoder with a finite synthetic GET transport; no provider acceptance. */
describe('native journal completeness before normalization [synthetic transport]', () => {
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
  function fixture(records: unknown) {
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
      let data: unknown;
      if (url.pathname === '/records/123') data = records;
      else if (url.pathname === '/company/123/staff')
        data = [{ id: 15, name: 'Synthetic staff' }];
      else if (url.pathname === '/book_services/123') data = { services: [] };
      else if (url.pathname.startsWith('/schedule/123/15/')) data = [];
      else throw new Error('unlisted_provider_read');
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data }), { status: 200 }),
      );
    });
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic',
      baseUrl: 'http://127.0.0.1:9',
      settings: { companyId: 123 },
    });
    return () =>
      adapter.getJournal({
        tenantId: 'tenant',
        from: '2026-07-30T21:00:00.000Z',
        to: '2026-08-06T21:00:00.000Z',
        timezone: 'Europe/Moscow',
        providerId: '15',
        includeCanceled: true,
      });
  }
  it.each([
    null,
    undefined,
    {},
    [{ id: 99 }],
    [{ staff_id: 15 }],
    [{ id: null, staff_id: 15 }],
  ])(
    'does not certify malformed records as a complete empty journal: %j',
    async (records) => {
      await expect(fixture(records)()).rejects.toThrow();
    },
  );
  it('keeps an explicitly empty array complete', async () => {
    await expect(fixture([])()).resolves.toMatchObject({
      completeness: 'complete',
      count: 0,
      appointments: [],
    });
  });
  it('shows why completed must be described as a CRM status, not observed arrival', async () => {
    const journal = await fixture([
      {
        id: 99,
        staff_id: 15,
        datetime: '2026-07-31T10:00:00',
        seance_length: 1800,
        paid_full: true,
        attendance: 0,
      },
    ])();
    expect(journal.appointments[0].status).toBe('completed');
  });
});
