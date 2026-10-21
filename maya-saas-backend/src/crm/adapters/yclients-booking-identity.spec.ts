import { YclientsCRMAdapter } from './yclients-crm.adapter';

describe('exact verified YCLIENTS booking contact read', () => {
  const original = globalThis.fetch;
  afterEach(() => { globalThis.fetch = original; });
  const adapter = () => new YclientsCRMAdapter({
    provider: 'yclients',
    apiToken: 'synthetic-user-token',
    settings: { companyId: 42 },
    baseUrl: 'https://api.yclients.invalid/api/v1',
  }, 'synthetic-partner-token');
  it('reads one linked id and returns contact only; never calls client registry', async () => {
    const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { id: 31, name: 'Synthetic guest', phone: '+79990001122', private_extra: 'not exposed' },
    }), { status: 200 }));
    globalThis.fetch = fetch;
    const result = await adapter().getClientBookingIdentity({ tenantId: 'tenant', clientId: '31' });
    expect(result).toEqual({ external_id: '31', name: 'Synthetic guest', phone: '+79990001122' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.yclients.invalid/api/v1/client/42/31');
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });
  it('refuses a mismatching response rather than acquiring another Client', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 32, name: 'Other', phone: '+79990003344' } }), { status: 200 }));
    await expect(adapter().getClientBookingIdentity({ tenantId: 'tenant', clientId: '31' })).rejects.toThrow('Verified CRM client identity unavailable');
  });
  it('refuses a path-shaped caller id before any request', async () => {
    const fetch = jest.fn(); globalThis.fetch = fetch;
    await expect(adapter().getClientBookingIdentity({ tenantId: 'tenant', clientId: '../clients' })).rejects.toThrow('Verified CRM client id required');
    expect(fetch).not.toHaveBeenCalled();
  });
});
