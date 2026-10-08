import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { CrmService } from './crm.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { observedGoodsSearch } from './yclients-goods-search';

/** Synthetic persistence/source edges, actual actor/revision owner. No provider calls. */
describe('goods search current actor and source fence', () => {
  function fixture() {
    const principal = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: UserRole.TENANT_OWNER,
    };
    const membership = {
      status: 'active',
      role: UserRole.TENANT_OWNER,
      branchId: null as string | null,
      user: { status: 'active' },
    };
    const integration = {
      id: 'integration-a',
      tenantId: 'tenant-a',
      provider: 'yclients',
      status: 'active',
      settingsJson: { companyId: '5' },
      baseUrl: null,
      encryptedApiToken: 'synthetic',
      updatedAt: new Date('2026-10-08T12:00:00Z'),
    };
    const tenant = { calendarSource: 'external' };
    const searchGoods = jest
      .fn()
      .mockImplementation((_tenant: string, query: string) =>
        Promise.resolve(observedGoodsSearch([], query, '5')),
      );
    const create = jest.fn().mockReturnValue({ searchGoods });
    const membershipRead = jest.fn().mockResolvedValue(membership);
    const integrationRead = jest.fn().mockResolvedValue(integration);
    const assertFeature = jest.fn().mockResolvedValue(undefined);
    const context = new TenantContextService();
    const service = new CrmService(
      {
        membership: { findUnique: membershipRead },
        crmIntegration: { findUnique: integrationRead },
        tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      } as never,
      {
        decrypt: () => 'synthetic',
        opaqueReference: (_scope: string, value: string) => value,
      } as never,
      { create },
      context,
      {} as never,
      {} as never,
      {} as never,
      { assertFeature } as never,
    );
    const run = <T>(fn: () => T) => context.runAsAuthPrincipal(principal, fn);
    const identity = () =>
      run(() => service.goodsReadIdentity('tenant-a', 'owner-a'));
    const read = (revision: string, query = 'шампунь') =>
      run(() =>
        service.searchGoodsForActor('tenant-a', 'owner-a', query, revision),
      );
    return {
      service,
      run,
      identity,
      read,
      searchGoods,
      membership,
      integration,
      tenant,
      create,
      assertFeature,
      membershipRead,
      integrationRead,
    };
  }
  it('reads once under tenant/actor scope, checks current membership and features again before return', async () => {
    const f = fixture(),
      revision = await f.identity();
    f.membershipRead.mockClear();
    f.assertFeature.mockClear();
    expect(await f.read(revision, '  шампунь  ')).toMatchObject({
      query: 'шампунь',
      company_id: '5',
      rows: [],
    });
    expect(f.searchGoods).toHaveBeenCalledTimes(1);
    expect(f.searchGoods).toHaveBeenCalledWith('tenant-a', 'шампунь');
    expect(f.membershipRead).toHaveBeenCalledTimes(2);
    expect(f.assertFeature.mock.calls).toEqual(
      Array.from({ length: 2 }, () =>
        ['ai.owner', 'commerce.store', 'crm.integration'].map((feature) => [
          'tenant-a',
          feature,
        ]),
      ).flat(),
    );
  });
  it('rejects foreign tenant, different actor and malformed query before adapter search', async () => {
    const f = fixture(),
      revision = await f.identity();
    await expect(
      f.run(() =>
        f.service.searchGoodsForActor(
          'tenant-b',
          'owner-a',
          'шампунь',
          revision,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      f.run(() =>
        f.service.searchGoodsForActor(
          'tenant-a',
          'owner-b',
          'шампунь',
          revision,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(f.read(revision, ' ')).rejects.toThrow('Укажите название');
    expect(f.searchGoods).not.toHaveBeenCalled();
  });
  it.each([
    'suspended',
    'staff',
    'branch',
    'user',
    'feature',
    'source',
    'integration',
    'credential',
    'company',
  ])('blocks %s changed during the awaited source read', async (change) => {
    const f = fixture(),
      revision = await f.identity();
    f.searchGoods.mockImplementation((_tenant: string, query: string) => {
      if (change === 'suspended') f.membership.status = 'suspended';
      if (change === 'staff') f.membership.role = UserRole.STAFF;
      if (change === 'branch') f.membership.branchId = 'branch-a';
      if (change === 'user') f.membership.user.status = 'suspended';
      if (change === 'feature')
        f.assertFeature.mockRejectedValue(
          new ForbiddenException('feature revoked'),
        );
      if (change === 'source') f.tenant.calendarSource = 'internal';
      if (change === 'integration') f.integration.status = 'inactive';
      if (change === 'credential') f.integration.encryptedApiToken = 'rotated';
      if (change === 'company') f.integration.settingsJson.companyId = '6';
      return Promise.resolve(observedGoodsSearch([], query, '5'));
    });
    await expect(f.read(revision)).rejects.toThrow();
    expect(f.searchGoods).toHaveBeenCalledTimes(1);
  });
  it('rejects a pre-read changed source without a GET', async () => {
    const f = fixture(),
      revision = await f.identity();
    f.integration.settingsJson.companyId = '6';
    await expect(f.read(revision)).rejects.toThrow('goods_source_changed');
    expect(f.searchGoods).not.toHaveBeenCalled();
  });
  it.each([{ company_id: '6' }, { query: 'другой запрос' }])(
    'rejects a source result from a different selection %j',
    async (patch) => {
      const f = fixture(),
        revision = await f.identity();
      f.searchGoods.mockResolvedValue({
        ...observedGoodsSearch([], 'шампунь', '5'),
        ...patch,
      });
      await expect(f.read(revision)).rejects.toThrow('goods_source_changed');
    },
  );
  it('preserves source-unavailable as an error, never empty verified data', async () => {
    const f = fixture(),
      revision = await f.identity();
    const error = new Error('source unavailable');
    f.searchGoods.mockRejectedValue(error);
    await expect(f.read(revision)).rejects.toBe(error);
  });
});
