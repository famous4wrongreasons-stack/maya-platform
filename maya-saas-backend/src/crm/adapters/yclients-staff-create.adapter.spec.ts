import { YclientsCRMAdapter } from './yclients-crm.adapter';
import { CrmProvider } from '../../common/domain.enums';
import { CrmOutcomeUnknownError } from '../crm-request.errors';
import { staffCreatePermissions } from '../yclients-staff-create.contract';

const proposal = {
  name: 'Synthetic staff',
  specialization: 'Synthetic specialist',
};
const permissions = {
  settings: { settings_master_access: true, master_create: true },
};
describe('YC-ST1 native adapter boundary (synthetic fetch only)', () => {
  const original = globalThis.fetch,
    partner = process.env.YCLIENTS_PARTNER_TOKEN;
  afterEach(() => {
    globalThis.fetch = original;
    if (partner === undefined) delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = partner;
  });
  function fixture() {
    process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic-staff-partner';
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let permission: unknown = permissions,
      receipt: unknown = { id: 7, company_id: 5, ...proposal, position: null };
    let lost = false;
    globalThis.fetch = jest.fn(async (input, init) => {
      const url = String(input),
        method = init?.method ?? 'GET';
      calls.push({
        url,
        method,
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      if (method === 'POST' && lost)
        throw new TypeError('synthetic connection lost');
      return new Response(
        JSON.stringify({
          success: true,
          data: method === 'GET' ? permission : receipt,
        }),
        { status: method === 'GET' ? 200 : 201 },
      );
    });
    const adapter = new YclientsCRMAdapter({
      provider: CrmProvider.YCLIENTS,
      apiToken: 'synthetic-user',
      settings: { companyId: 5 },
    });
    const beforeDispatch = jest.fn().mockResolvedValue(undefined);
    const run = (extra: Record<string, unknown> = {}) =>
      adapter.createStaffQuick({
        companyId: '5',
        proposal,
        expectedPermissionRevision: staffCreatePermissions(permissions),
        deadlineAt: Date.now() + 5000,
        beforeDispatch,
        ...extra,
      });
    return {
      calls,
      adapter,
      run,
      beforeDispatch,
      permission: (v: unknown) => {
        permission = v;
      },
      receipt: (v: unknown) => {
        receipt = v;
      },
      lost: () => {
        lost = true;
      },
    };
  }
  it('uses only exact current permission and quick endpoint, with null phone/position and no account', async () => {
    const f = fixture();
    expect(await f.run()).toEqual({
      staff_id: '7',
      company_id: '5',
      ...proposal,
      source: 'yclients',
      verified: true,
    });
    expect(f.calls).toEqual([
      {
        url: 'https://api.yclients.com/api/v1/user/permissions/5',
        method: 'GET',
      },
      {
        url: 'https://api.yclients.com/api/v1/company/5/staff/quick',
        method: 'POST',
        body: { ...proposal, position_id: null, phone_number: null },
      },
    ]);
    expect(f.beforeDispatch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { companyId: '6' },
    { expectedPermissionRevision: 'b'.repeat(64) },
    { deadlineAt: 0 },
    { proposal: { ...proposal, user_id: 9 } },
  ])('refuses predispatch substitution %p', async (extra) => {
    const f = fixture();
    await expect(f.run(extra)).rejects.toThrow();
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
  it('rereads create permission; price/edit permissions are insufficient', async () => {
    const f = fixture();
    f.permission({
      settings: {
        settings_master_access: true,
        master_create: false,
        master_edit: true,
        services_edit: true,
      },
    });
    await expect(f.run()).rejects.toThrow();
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
  it('last current-authority callback can refuse before dispatch', async () => {
    const f = fixture();
    f.beforeDispatch.mockRejectedValue(new Error('revoked'));
    await expect(f.run()).rejects.toThrow('revoked');
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });
  it.each([
    { id: 7, company_id: 6, ...proposal, position: null },
    { id: 7, company_id: 5, ...proposal, name: 'Other', position: null },
    { id: 7, company_id: 5, ...proposal, position: { id: 1 } },
    { id: 7, company_id: 5, ...proposal, position: null, user_id: 9 },
  ])('postdispatch mismatching receipt stays UNKNOWN %p', async (receipt) => {
    const f = fixture();
    f.receipt(receipt);
    await expect(f.run()).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
  it('lost response is native UNKNOWN with no adapter redispatch or same-name readback', async () => {
    const f = fixture();
    f.lost();
    await expect(f.run()).rejects.toBeInstanceOf(CrmOutcomeUnknownError);
    expect(f.calls).toHaveLength(2);
    expect(f.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});
