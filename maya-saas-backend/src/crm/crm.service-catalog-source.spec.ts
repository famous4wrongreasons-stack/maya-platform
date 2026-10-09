import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { CrmService } from './crm.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { observedServiceCatalog } from './service-catalog-read';

type Options = NonNullable<Parameters<CrmService['readServiceCatalog']>[1]>;

/** Real metadata owners/cache; only database and adapter I/O is synthetic. */
function fixture() {
  const context = new TenantContextService();
  const integration = {
    id: 'integration-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    status: 'active',
    updatedAt: new Date('2026-10-09T00:00:00Z'),
    baseUrl: null as string | null,
    encryptedApiToken: 'synthetic',
    settingsJson: {
      companyId: 42,
      branchBinding: {
        contract: 'maya.crm-branch-binding/1',
        branchId: 'branch-a',
        companyId: 42,
      },
    },
  };
  const branch = { id: 'branch-a', timezone: 'America/Los_Angeles' };
  const tenant = {
    calendarSource: 'external',
    defaultTimezone: 'Europe/Moscow',
    branches: [branch],
  };
  const link = {
    id: 'link-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    externalId: '7',
    staffId: 'staff-a',
    staff: {
      id: 'staff-a',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      active: true,
    },
  };
  const db = {
    tenant: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          structuredClone({ ...tenant, crmIntegration: integration }),
        ),
      ),
    },
    crmIntegration: {
      findUnique: jest
        .fn<Promise<typeof integration | null>, []>()
        .mockImplementation(() =>
          Promise.resolve(structuredClone(integration)),
        ),
    },
    staffProviderLink: {
      findMany: jest.fn(() => Promise.resolve([structuredClone(link)])),
    },
  };
  const catalog = observedServiceCatalog(
    [
      {
        id: '81',
        name: 'Услуга',
        price: 0,
        duration_minutes: 30.5,
        currency: 'RUB',
      },
    ],
    'synthetic',
  );
  const adapter = {
    readServiceCatalog: jest.fn(() => Promise.resolve(catalog)),
    getServices: jest.fn(),
  };
  const internal = { listServices: jest.fn(() => Promise.resolve([])) };
  const factory = { create: jest.fn(() => adapter) };
  const crm = new CrmService(
    db as never,
    { decrypt: () => 'synthetic' } as never,
    factory as never,
    context,
    internal as never,
    undefined as never,
    undefined as never,
  );
  return {
    crm,
    db,
    adapter,
    internal,
    factory,
    integration,
    tenant,
    branch,
    link,
    catalog,
    run: <T>(fn: () => Promise<T>) => context.runAsSystemTenant('tenant-a', fn),
    source: () => crm.resolveStaffScheduleSource('tenant-a', '7'),
  };
}

const sourceError = {
  response: { error: { code: 'staff_schedule_source_unavailable' } },
};

describe('CRM scoped employee service catalog', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['yclients', 'altegio'])(
    'keeps %s facts and passes exactly the current external staff ID',
    async (provider) => {
      const f = fixture();
      f.integration.provider = provider;
      f.link.provider = provider;
      await f.run(async () => {
        const source = await f.source();
        await expect(
          f.crm.readServiceCatalog('tenant-a', { source }),
        ).resolves.toEqual(f.catalog);
        expect(f.adapter.readServiceCatalog.mock.calls).toEqual([
          ['tenant-a', { staffId: '7' }],
        ]);
        expect(f.factory.create).toHaveBeenCalledTimes(1);
        expect(f.adapter.getServices).not.toHaveBeenCalled();
        expect(f.internal.listServices).not.toHaveBeenCalled();
      });
    },
  );

  it('leaves the unscoped external reader independent of staff linkage', async () => {
    const f = fixture();
    f.db.staffProviderLink.findMany.mockResolvedValue([]);
    await expect(
      f.run(() => f.crm.readServiceCatalog('tenant-a')),
    ).resolves.toBe(f.catalog);
    expect(f.adapter.readServiceCatalog.mock.calls).toEqual([['tenant-a']]);
    expect(f.db.staffProviderLink.findMany).not.toHaveBeenCalled();
  });

  it('preserves the unscoped internal reader', async () => {
    const f = fixture();
    f.tenant.calendarSource = 'internal';
    await expect(
      f.run(() => f.crm.readServiceCatalog('tenant-a')),
    ).resolves.toMatchObject({
      source: 'internal_calendar',
      services: [],
      catalog_exhaustive: false,
    });
    expect(f.internal.listServices).toHaveBeenCalledWith('tenant-a');
    expect(f.factory.create).not.toHaveBeenCalled();
  });

  it.each(
    [null, [], {}, { source: undefined }, { source: null }, { source: {} }].map(
      (options) => ({ options }),
    ),
  )(
    'rejects missing or malformed scoped options without widening: $options',
    async ({ options }) => {
      const f = fixture();
      await expect(
        f.run(() => f.crm.readServiceCatalog('tenant-a', options as Options)),
      ).rejects.toMatchObject(sourceError);
      expect(f.db.crmIntegration.findUnique).not.toHaveBeenCalled();
      expect(f.factory.create).not.toHaveBeenCalled();
      expect(f.internal.listServices).not.toHaveBeenCalled();
    },
  );

  it.each([
    'extra-option',
    'extra-source',
    'array',
    'bad-provider',
    'bad-zone',
    'bad-hash',
    'hash-newline',
    'bad-id',
    'id-control',
  ])('rejects %s before source lookup/provider I/O', async (kind) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      const options: unknown =
        kind === 'extra-option'
          ? { source, staffId: '8' }
          : {
              source:
                kind === 'extra-source'
                  ? { ...source, tenantId: 'foreign' }
                  : kind === 'array'
                    ? [source]
                    : {
                        ...source,
                        ...(kind === 'bad-provider'
                          ? { provider: ['yclients'] }
                          : kind === 'bad-zone'
                            ? { timezone: 'Invalid/Zone' }
                            : kind === 'bad-hash'
                              ? { sourceHash: 'A'.repeat(64) }
                              : kind === 'hash-newline'
                                ? { sourceHash: source.sourceHash + '\n' }
                                : kind === 'bad-id'
                                  ? { externalStaffId: ['7'] }
                                  : { staffId: 'staff\na' }),
                      },
            };
      f.db.crmIntegration.findUnique.mockClear();
      await expect(
        f.crm.readServiceCatalog('tenant-a', options as Options),
      ).rejects.toMatchObject(sourceError);
      expect(f.db.crmIntegration.findUnique).not.toHaveBeenCalled();
      expect(f.adapter.readServiceCatalog).not.toHaveBeenCalled();
    });
  });

  it.each([
    'missing-link',
    'duplicate-link',
    'inactive-staff',
    'foreign-staff',
    'foreign-link',
    'branch',
    'company',
    'timezone',
    'provider',
    'internal',
    'inactive-integration',
    'missing-integration',
    'stale-hash',
  ])('refuses %s before provider dispatch', async (kind) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      if (kind === 'missing-link')
        f.db.staffProviderLink.findMany.mockResolvedValue([]);
      if (kind === 'duplicate-link')
        f.db.staffProviderLink.findMany.mockResolvedValue([
          f.link,
          { ...f.link, id: 'second' },
        ]);
      if (kind === 'inactive-staff') f.link.staff.active = false;
      if (kind === 'foreign-staff') f.link.staff.tenantId = 'foreign';
      if (kind === 'foreign-link') f.link.tenantId = 'foreign';
      if (kind === 'branch') f.link.staff.branchId = 'other';
      if (kind === 'company') {
        f.integration.settingsJson.companyId = 43;
        f.integration.settingsJson.branchBinding.companyId = 43;
      }
      if (kind === 'timezone') f.branch.timezone = 'UTC';
      if (kind === 'provider') f.integration.provider = 'altegio';
      if (kind === 'internal') f.tenant.calendarSource = 'internal';
      if (kind === 'inactive-integration') f.integration.status = 'disabled';
      if (kind === 'missing-integration')
        f.db.crmIntegration.findUnique.mockResolvedValue(null);
      if (kind === 'stale-hash') source.sourceHash = '0'.repeat(64);
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toMatchObject(sourceError);
      expect(f.adapter.readServiceCatalog).not.toHaveBeenCalled();
      expect(f.adapter.getServices).not.toHaveBeenCalled();
      expect(f.internal.listServices).not.toHaveBeenCalled();
    });
  });

  it('rejects foreign tenant context before metadata access', async () => {
    const f = fixture();
    await expect(
      f.run(() => f.crm.readServiceCatalog('foreign', {} as Options)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.tenant.findUnique).not.toHaveBeenCalled();
    expect(f.db.crmIntegration.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    new ForbiddenException('current-refusal'),
    new UnauthorizedException('current-refusal'),
  ])('does not mask current authority errors', async (error) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.db.crmIntegration.findUnique.mockRejectedValueOnce(error);
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toBe(error);
      expect(f.adapter.readServiceCatalog).not.toHaveBeenCalled();
    });
  });

  it('rechecks source after awaited adapter acquisition', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.factory.create.mockImplementationOnce(() => {
        f.link.id = 'replaced';
        return f.adapter;
      });
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toMatchObject(sourceError);
      expect(f.adapter.readServiceCatalog).not.toHaveBeenCalled();
    });
  });

  it.each(['link', 'company', 'timezone', 'inactive', 'provider'])(
    'refuses %s drift across provider await without another GET',
    async (kind) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        f.adapter.readServiceCatalog.mockImplementationOnce(() => {
          if (kind === 'link') f.link.id = 'replacement';
          if (kind === 'company') {
            f.integration.settingsJson.companyId = 43;
            f.integration.settingsJson.branchBinding.companyId = 43;
          }
          if (kind === 'timezone') f.branch.timezone = 'UTC';
          if (kind === 'inactive') f.link.staff.active = false;
          if (kind === 'provider') f.integration.provider = 'altegio';
          return Promise.resolve(f.catalog);
        });
        await expect(
          f.crm.readServiceCatalog('tenant-a', { source }),
        ).rejects.toMatchObject(sourceError);
        expect(f.adapter.readServiceCatalog).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('captures caller witness before the first await', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      const options = { source };
      f.db.tenant.findUnique.mockImplementationOnce(() => {
        source.externalStaffId = '8';
        source.sourceHash = '0'.repeat(64);
        options.source = { ...source, branchId: 'other' };
        return Promise.resolve(
          structuredClone({ ...f.tenant, crmIntegration: f.integration }),
        );
      });
      await expect(
        f.crm.readServiceCatalog('tenant-a', options),
      ).resolves.toEqual(f.catalog);
      expect(f.adapter.readServiceCatalog.mock.calls).toEqual([
        ['tenant-a', { staffId: '7' }],
      ]);
    });
  });

  it('snapshots public facts before the final metadata awaits', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      const expected = structuredClone(f.catalog);
      f.adapter.readServiceCatalog.mockImplementationOnce(() => {
        f.db.crmIntegration.findUnique.mockImplementationOnce(() => {
          f.catalog.services[0].price = 999;
          f.catalog.services[0].limitations.push('holder-modification');
          f.catalog.services.push({ ...f.catalog.services[0], id: '82' });
          return Promise.resolve(structuredClone(f.integration));
        });
        return Promise.resolve(f.catalog);
      });
      const result = await f.crm.readServiceCatalog('tenant-a', { source });
      expect(result).toEqual(expected);
      expect(result).not.toBe(f.catalog);
      expect(f.catalog.services).toHaveLength(2);
      expect(f.catalog.services[0].price).toBe(999);
    });
  });

  it.each([null, {}, { services: [] }, { contract: 'other' }])(
    'refuses malformed adapter envelope %j with the finite result code',
    async (value) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        f.adapter.readServiceCatalog.mockResolvedValueOnce(
          value as unknown as typeof f.catalog,
        );
        await expect(
          f.crm.readServiceCatalog('tenant-a', { source }),
        ).rejects.toMatchObject({
          response: { error: { code: 'service_catalog_source_unavailable' } },
        });
        expect(f.adapter.readServiceCatalog).toHaveBeenCalledTimes(1);
        expect(f.adapter.getServices).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    new ForbiddenException('current-refusal'),
    new UnauthorizedException('current-refusal'),
  ])('preserves authority refusal from the adapter', async (error) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.adapter.readServiceCatalog.mockRejectedValueOnce(error);
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toBe(error);
    });
  });

  it('returns the finite result code for provider failure without private payload or fallback', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.adapter.readServiceCatalog.mockRejectedValueOnce(
        new Error('synthetic-private-provider-payload'),
      );
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toMatchObject({
        response: { error: { code: 'service_catalog_source_unavailable' } },
      });
      expect(f.adapter.readServiceCatalog).toHaveBeenCalledTimes(1);
      expect(f.adapter.getServices).not.toHaveBeenCalled();
    });
  });

  it('rejects a replaced captured adapter after GET even with unchanged metadata', async () => {
    const f = fixture();
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now');
    await f.run(async () => {
      const source = await f.source();
      const replacement = {
        ...f.adapter,
        readServiceCatalog: jest.fn(() => Promise.resolve(f.catalog)),
      };
      f.factory.create
        .mockReturnValueOnce(f.adapter)
        .mockReturnValue(replacement);
      f.adapter.readServiceCatalog.mockImplementationOnce(() => {
        clock.mockReturnValue(now + 6 * 60_000);
        return Promise.resolve(f.catalog);
      });
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toMatchObject(sourceError);
      expect(f.adapter.readServiceCatalog).toHaveBeenCalledTimes(1);
      expect(replacement.readServiceCatalog).not.toHaveBeenCalled();
    });
  });

  it('does not substitute the general getter when the scoped adapter port is absent', async () => {
    const f = fixture();
    Reflect.deleteProperty(f.adapter, 'readServiceCatalog');
    await f.run(async () => {
      const source = await f.source();
      await expect(
        f.crm.readServiceCatalog('tenant-a', { source }),
      ).rejects.toMatchObject({
        response: { error: { code: 'service_catalog_source_unavailable' } },
      });
      expect(f.adapter.getServices).not.toHaveBeenCalled();
    });
  });
});
