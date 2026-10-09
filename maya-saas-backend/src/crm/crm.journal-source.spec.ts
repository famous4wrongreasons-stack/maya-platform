import { CrmService, type StaffScheduleSource } from './crm.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Journal = Awaited<ReturnType<CrmService['getJournal']>>;

function fixture() {
  const context = new TenantContextService();
  const integration = {
    id: 'integration-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    status: 'active',
    updatedAt: new Date('2026-10-09T00:00:00Z'),
    baseUrl: null,
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
      findUnique: jest.fn(() => Promise.resolve(structuredClone(integration))),
    },
    staffProviderLink: {
      findMany: jest.fn(() => Promise.resolve([structuredClone(link)])),
    },
  };
  const query = {
    from: '2026-10-09T07:00:00.000Z',
    to: '2026-10-10T06:59:59.999Z',
    providerId: '7',
  };
  const journal: Journal = {
    calendar_source: 'external',
    timezone: branch.timezone,
    completeness: 'complete',
    range: { from: query.from, to: query.to },
    provider_id: '7',
    count: 0,
    appointments: [],
  };
  const adapter = { getJournal: jest.fn(() => Promise.resolve(journal)) };
  const factory = { create: jest.fn(() => adapter) };
  const crm = new CrmService(
    db as never,
    { decrypt: () => 'synthetic-no-credential' } as never,
    factory as never,
    context,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  return {
    crm,
    db,
    adapter,
    factory,
    integration,
    tenant,
    branch,
    link,
    query,
    journal,
    run: <T>(fn: () => Promise<T>) => context.runAsSystemTenant('tenant-a', fn),
    source: () => crm.resolveStaffScheduleSource('tenant-a', '7'),
  };
}

describe('CRM journal exact source witness', () => {
  it('uses the re-resolved branch timezone and keeps the raw journal contract', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      await expect(
        f.crm.getJournal('tenant-a', f.query, {
          source,
          includeCanceled: true,
        }),
      ).resolves.toBe(f.journal);
      expect(f.adapter.getJournal.mock.calls).toEqual([
        [
          {
            tenantId: 'tenant-a',
            ...f.query,
            timezone: 'America/Los_Angeles',
            includeCanceled: true,
          },
        ],
      ]);
    });
  });

  it('preserves unscoped tenant timezone and does not require a staff link', async () => {
    const f = fixture();
    f.db.staffProviderLink.findMany.mockResolvedValue([]);
    await f.run(() => f.crm.getJournal('tenant-a', f.query));
    expect(f.adapter.getJournal.mock.calls).toEqual([
      [
        {
          tenantId: 'tenant-a',
          ...f.query,
          timezone: 'Europe/Moscow',
          includeCanceled: false,
        },
      ],
    ]);
    expect(f.db.staffProviderLink.findMany).not.toHaveBeenCalled();
  });

  it.each([
    'missing-hash',
    'extra-key',
    'array',
    'null',
    'invalid-zone',
    'hash-newline',
    'object-provider',
  ])('rejects malformed %s witness before provider I/O', async (kind) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      const malformed: unknown =
        kind === 'missing-hash'
          ? { ...source, sourceHash: undefined }
          : kind === 'extra-key'
            ? { ...source, tenantId: 'foreign' }
            : kind === 'array'
              ? [source]
              : kind === 'null'
                ? null
                : kind === 'invalid-zone'
                  ? { ...source, timezone: 'Unknown/Zone' }
                  : kind === 'hash-newline'
                    ? { ...source, sourceHash: source.sourceHash + '\n' }
                    : { ...source, provider: ['yclients'] };
      await expect(
        f.crm.getJournal('tenant-a', f.query, {
          source: malformed as StaffScheduleSource,
        }),
      ).rejects.toThrow();
      expect(f.adapter.getJournal).not.toHaveBeenCalled();
    });
  });

  it.each(['missing', 'different'])(
    'rejects %s provider ID without widening the read',
    async (kind) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        await expect(
          f.crm.getJournal(
            'tenant-a',
            {
              ...f.query,
              providerId: kind === 'missing' ? undefined : '8',
            },
            { source },
          ),
        ).rejects.toThrow();
        expect(f.adapter.getJournal).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    'company',
    'provider',
    'link',
    'branch',
    'timezone',
    'inactive',
    'foreign',
    'internal',
  ])('refuses %s drift before the provider read', async (kind) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      if (kind === 'company') {
        f.integration.settingsJson.companyId = 43;
        f.integration.settingsJson.branchBinding.companyId = 43;
      }
      if (kind === 'provider') f.integration.provider = 'altegio';
      if (kind === 'link') f.link.id = 'replacement';
      if (kind === 'branch') f.link.staff.branchId = 'branch-b';
      if (kind === 'timezone') f.branch.timezone = 'Europe/Moscow';
      if (kind === 'inactive') f.link.staff.active = false;
      if (kind === 'foreign') f.link.staff.tenantId = 'tenant-b';
      if (kind === 'internal') f.tenant.calendarSource = 'internal';
      await expect(
        f.crm.getJournal('tenant-a', f.query, { source }),
      ).rejects.toThrow();
      expect(f.adapter.getJournal).not.toHaveBeenCalled();
    });
  });

  it('rechecks metadata after the awaited adapter acquisition', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.factory.create.mockImplementationOnce(() => {
        f.link.id = 'replaced-during-adapter-read';
        return f.adapter;
      });
      await expect(
        f.crm.getJournal('tenant-a', f.query, { source }),
      ).rejects.toThrow();
      expect(f.adapter.getJournal).not.toHaveBeenCalled();
    });
  });

  it.each(['link', 'timezone', 'company'])(
    'rejects %s drift after provider await',
    async (kind) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        f.adapter.getJournal.mockImplementationOnce(() => {
          if (kind === 'link') f.link.id = 'replacement';
          if (kind === 'timezone') f.branch.timezone = 'UTC';
          if (kind === 'company') {
            f.integration.settingsJson.companyId = 43;
            f.integration.settingsJson.branchBinding.companyId = 43;
          }
          return Promise.resolve(f.journal);
        });
        await expect(
          f.crm.getJournal('tenant-a', f.query, { source }),
        ).rejects.toThrow();
        expect(f.adapter.getJournal).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('pins caller objects before await and rejects foreign tenant context', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.adapter.getJournal.mockImplementationOnce(() => {
        source.staffId = 'caller-replacement';
        source.sourceHash = '0'.repeat(64);
        f.query.providerId = '8';
        return Promise.resolve(f.journal);
      });
      await expect(
        f.crm.getJournal('tenant-a', f.query, { source }),
      ).resolves.toBe(f.journal);
      expect(f.adapter.getJournal).toHaveBeenCalledTimes(1);
      await expect(
        f.crm.getJournal('tenant-b', f.query, { source }),
      ).rejects.toThrow();
      expect(f.adapter.getJournal).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects a replacement adapter after the provider await even with unchanged metadata', async () => {
    const f = fixture();
    const clock = jest.spyOn(Date, 'now');
    const now = Date.now();
    try {
      await f.run(async () => {
        const source = await f.source();
        const replacement = {
          getJournal: jest.fn(() => Promise.resolve(f.journal)),
        };
        f.factory.create
          .mockReturnValueOnce(f.adapter)
          .mockReturnValue(replacement);
        f.adapter.getJournal.mockImplementationOnce(() => {
          clock.mockReturnValue(now + 6 * 60_000);
          return Promise.resolve(f.journal);
        });
        await expect(
          f.crm.getJournal('tenant-a', f.query, { source }),
        ).rejects.toThrow();
        expect(f.adapter.getJournal).toHaveBeenCalledTimes(1);
        expect(replacement.getJournal).not.toHaveBeenCalled();
      });
    } finally {
      clock.mockRestore();
    }
  });
});
