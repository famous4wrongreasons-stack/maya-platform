import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CrmProvider } from '../../common/domain.enums';
import { YclientsCRMAdapter } from './yclients-crm.adapter';

const source = (): Record<string, unknown> => ({
  id: 201,
  company_id: 123,
  title: 'Synthetic cut',
  booking_title: 'Online label',
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
  discount: 5,
});

/** Actual native adapter; all fetch results are finite synthetic responses. */
describe('YCLIENTS service rename snapshot GET boundary', () => {
  const originalFetch = global.fetch;
  const originalPartner = process.env.YCLIENTS_PARTNER_TOKEN;
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = originalPartner;
    jest.restoreAllMocks();
  });
  function fixture() {
    process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic-rename-only';
    const state = {
      row: source(),
      data: undefined as unknown,
      responseText: undefined as string | undefined,
      success: true,
      status: 200,
      permissionReads: 0,
      permissions: {
        settings_services_access: true,
        services_edit: true,
        settings_services_edit_title_access: true,
        settings_services_edit_price_access: false,
      },
      revokeAfterRead: false,
      afterService: () => {},
    };
    const requests: {
      path: string;
      method: string;
      redirect: RequestRedirect | undefined;
      body: unknown;
    }[] = [];
    global.fetch = jest.fn(async (url, init) => {
      await Promise.resolve();
      const path = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      ).pathname;
      requests.push({
        path,
        method: init?.method ?? 'GET',
        redirect: init?.redirect,
        body: init?.body,
      });
      if (path === '/api/v1/user/permissions/123') {
        state.permissionReads++;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              settings: {
                ...state.permissions,
                ...(state.revokeAfterRead && state.permissionReads > 1
                  ? { settings_services_edit_title_access: false }
                  : {}),
              },
            },
          }),
        );
      }
      if (path !== '/api/v1/company/123/services/201')
        throw new Error('Unexpected endpoint');
      state.afterService();
      return new Response(
        state.responseText ??
          JSON.stringify({
            success: state.success,
            data: state.data ?? [state.row],
          }),
        { status: state.status },
      );
    }) as typeof fetch;
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic',
      baseUrl: 'https://yclients.invalid/api/v1',
      settings: { companyId: 123, currency: 'RUB' },
    });
    return {
      adapter,
      state,
      requests,
      read: (deadline?: number) =>
        adapter.readServiceRenameSnapshot('201', deadline),
    };
  }
  it('performs only three exact fresh GETs with redirect refused and no price permission requirement', async () => {
    const f = fixture();
    const result = await f.read();
    expect(result).toMatchObject({
      contract: 'maya.yclients-service-rename.snapshot/1',
      companyId: '123',
      serviceId: '201',
      title: 'Synthetic cut',
      bookingTitle: 'Online label',
    });
    expect(f.requests).toEqual(
      [
        '/api/v1/user/permissions/123',
        '/api/v1/company/123/services/201',
        '/api/v1/user/permissions/123',
      ].map((path) => ({
        path,
        method: 'GET',
        redirect: 'error',
        body: undefined,
      })),
    );
    f.state.row.title = 'Fresh title';
    const fresh = await f.read();
    expect(fresh.title).toBe('Fresh title');
    expect(fresh.revision).not.toBe(result.revision);
    expect(f.requests).toHaveLength(6);
  });
  it.each([
    'settings_services_access',
    'services_edit',
    'settings_services_edit_title_access',
  ] as const)(
    'refuses missing %s before service read, without falling back to price permissions',
    async (key) => {
      const f = fixture();
      f.state.permissions[key] = false;
      f.state.permissions.settings_services_edit_price_access = true;
      await expect(f.read()).rejects.toThrow(ServiceUnavailableException);
      expect(f.requests).toHaveLength(1);
    },
  );
  it('rechecks title permissions after service await and returns no snapshot after revocation', async () => {
    const f = fixture();
    f.state.revokeAfterRead = true;
    await expect(f.read()).rejects.toThrow(ServiceUnavailableException);
    expect(f.requests.map((r) => r.method)).toEqual(['GET', 'GET', 'GET']);
  });
  it.each([
    'multiple',
    'wrong-id',
    'wrong-company',
    'empty',
    'malformed',
    'false-success',
    'provider403',
    'inexact-number',
  ])(
    'fails closed on %s with no retry, write or search fallback',
    async (mode) => {
      const f = fixture();
      if (mode === 'multiple') f.state.data = [source(), source()];
      if (mode === 'wrong-id') f.state.row.id = 999;
      if (mode === 'wrong-company') f.state.row.company_id = 999;
      if (mode === 'empty') f.state.data = [];
      if (mode === 'malformed')
        f.state.responseText = '<html>unavailable</html>';
      if (mode === 'false-success') f.state.success = false;
      if (mode === 'provider403') f.state.status = 403;
      if (mode === 'inexact-number')
        f.state.responseText = JSON.stringify({
          success: true,
          data: [source()],
        }).replace('"discount":5', '"discount":0.123456789012345678');
      await expect(f.read()).rejects.toThrow(ServiceUnavailableException);
      expect(f.requests.map((r) => r.method)).toEqual(['GET', 'GET']);
    },
  );
  it('rejects invalid selection and an elapsed deadline before any GET', async () => {
    const f = fixture();
    await expect(
      f.adapter.readServiceRenameSnapshot('201?scope=other'),
    ).rejects.toThrow(BadRequestException);
    await expect(f.read(Date.now() - 1)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(f.requests).toHaveLength(0);
  });
  it('uses one overall deadline across all reads', async () => {
    const f = fixture();
    const now = 1_800_000_000_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    f.state.afterService = () => {
      clock.mockReturnValue(now + 21_000);
    };
    await expect(f.read(now + 20_000)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(f.requests).toHaveLength(2);
  });
});
