import {
  CanonicalBulkController,
  LegacyCanonicalBulkController,
} from './canonical-bulk.controller';
import { TenantContextService } from '../tenancy/tenant-context.service';

describe('B35 initiator authorization boundary', () => {
  const make = () => {
    const bulk = {
      preview: jest.fn().mockResolvedValue({ campaignId: 'frozen' }),
      confirm: jest.fn(),
      resume: jest.fn(),
      status: jest.fn(),
    };
    return { bulk, http: new CanonicalBulkController(bulk as never) };
  };
  it('passes canonical bearer proof and the reviewed identity unchanged', async () => {
    const { bulk, http } = make();
    const input = { campaignId: 'original', intentHash: 'reviewed' };
    await http.command('resume', 'Bearer synthetic-session', input);
    expect(bulk.resume).toHaveBeenCalledWith(
      JSON.stringify({ type: 'maya_jwt', credential: 'synthetic-session' }),
      input,
    );
    expect(bulk.preview).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'Telegram raw-chat', 'Basic caller'])(
    'rejects absent or noncanonical credentials (%s) before admission',
    (authorization) => {
      const { bulk, http } = make();
      expect(() => http.command('confirm', authorization, {})).toThrow(
        'B35_CANONICAL_OWNER_SESSION_REQUIRED',
      );
      expect(bulk.confirm).not.toHaveBeenCalled();
    },
  );
  it('does not expose a send/direct transport operation', () => {
    const { http } = make();
    expect(() => http.command('send', 'Bearer synthetic', {})).toThrow(
      'B35_OPERATION_UNSUPPORTED',
    );
  });
  it('legacy bridge authority never substitutes for the canonical owner session', async () => {
    const { bulk } = make(),
      context = new TenantContextService();
    const bridge = {
      assertBridgeSecret: jest.fn(),
      assertBridgeIntegrationBinding: jest
        .fn()
        .mockReturnValue({ provider: 'yclients', externalCompanyId: 'bound' }),
      resolveTenantByIntegration: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant' }),
    };
    const controller = new LegacyCanonicalBulkController(
      bulk as never,
      bridge as never,
      context,
    );
    bulk.preview.mockImplementation(() => {
      expect(context.requireTenantId()).toBe('tenant');
      return Promise.resolve({ campaignId: 'frozen' });
    });
    await controller.command('preview', 'bridge', {
      provider: 'yclients',
      externalCompanyId: 'bound',
      channelProof: 'canonical-owner-proof',
      payload: { bulkIdentity: 'original', text: 'approved' },
    });
    expect(bulk.preview).toHaveBeenCalledWith('canonical-owner-proof', {
      bulkIdentity: 'original',
      text: 'approved',
    });
    await expect(
      controller.command('preview', 'bridge', {
        provider: 'yclients',
        externalCompanyId: 'bound',
        channelProof: 'proof',
        payload: {},
        tenantId: 'forged',
      }),
    ).rejects.toThrow();
    expect(bulk.preview).toHaveBeenCalledTimes(1);
    bridge.assertBridgeSecret.mockImplementation(() => {
      throw new Error('unauthorized');
    });
    await expect(controller.command('preview', 'wrong', {})).rejects.toThrow(
      'unauthorized',
    );
    expect(bulk.preview).toHaveBeenCalledTimes(1);
  });
});
