import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { CrmCompanyProfile } from './crm-adapter.interface';
import { CrmService } from './crm.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Witness = NonNullable<Parameters<CrmService['getCompanyProfile']>[1]>;

/** Existing metadata owners and adapter cache; only Prisma/provider I/O is synthetic. */
function fixture() {
  const context = new TenantContextService();
  const integration = {
    id: 'integration-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    status: 'active',
    updatedAt: new Date('2026-10-09T00:00:00Z'),
    baseUrl: null as string | null,
    encryptedApiToken: 'synthetic-private-token',
    settingsJson: {
      companyId: 42,
      branchBinding: {
        contract: 'maya.crm-branch-binding/1',
        branchId: 'branch-a',
        companyId: 42,
      },
    },
  };
  const branch = {
    id: 'branch-a',
    tenantId: 'tenant-a',
    name: 'Набережная',
    timezone: 'Europe/Moscow',
  };
  const tenant = { calendarSource: 'external', defaultTimezone: 'UTC' };
  const db = {
    tenant: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          structuredClone({
            ...tenant,
            branches: [branch],
            crmIntegration: integration,
          }),
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
    branch: {
      findFirst: jest
        .fn<
          Promise<typeof branch | null>,
          [{ where: { id: string; tenantId: string } }]
        >()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.id === branch.id && where.tenantId === branch.tenantId
              ? structuredClone(branch)
              : null,
          ),
        ),
      findMany: jest
        .fn<
          Promise<(typeof branch)[]>,
          [{ where: { id?: string; tenantId: string } }]
        >()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.tenantId === branch.tenantId &&
              (!where.id || where.id === branch.id)
              ? [structuredClone(branch)]
              : [],
          ),
        ),
    },
  };
  const profile: CrmCompanyProfile = {
    id: '42',
    title: 'Компания из CRM',
    address: 'Публичный адрес',
    logo_url: null,
    timezone: 'Europe/Moscow',
    schedule: null,
  };
  const adapter = {
    getCompanyProfile: jest
      .fn<Promise<CrmCompanyProfile | null>, []>()
      .mockImplementation(() => Promise.resolve(profile)),
  };
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
    profile,
    run: <T>(fn: () => Promise<T>) => context.runAsSystemTenant('tenant-a', fn),
    source: async (): Promise<Witness> => {
      const source = await crm.resolveConfiguredBookingBranch('tenant-a');
      if (!source) throw new Error('Expected synthetic source');
      return { branchId: source.id, sourceRevision: source.sourceRevision };
    },
  };
}

const errorCode = (code: string) => ({ response: { error: { code } } });

describe('CRM current branch public company profile', () => {
  it.each(['yclients', 'altegio'])(
    'reads one exact %s company and preserves only its public profile contract',
    async (provider) => {
      const f = fixture();
      f.integration.provider = provider;
      await f.run(async () => {
        const source = await f.source();
        const result = await f.crm.getCompanyProfile('tenant-a', source);
        expect(result).toEqual(f.profile);
        expect(result).not.toBe(f.profile);
        expect(f.adapter.getCompanyProfile).toHaveBeenCalledTimes(1);
        expect(f.adapter.getCompanyProfile).toHaveBeenCalledWith({
          preserveMissingTitle: true,
        });
        expect(f.factory.create).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toMatch(
          /synthetic|integration-a|branch-a|sourceRevision/,
        );
      });
    },
  );

  it('preserves null address, schedule and timezone without tenant branding fallback', async () => {
    const f = fixture();
    f.profile.address = null;
    f.profile.schedule = null;
    f.profile.timezone = null;
    await f.run(async () => {
      await expect(
        f.crm.getCompanyProfile('tenant-a', await f.source()),
      ).resolves.toEqual(f.profile);
    });
  });

  it('leaves the unscoped reader independent of branch binding and returns its original profile object', async () => {
    const f = fixture();
    f.db.branch.findFirst.mockResolvedValue(null);
    await expect(
      f.run(() => f.crm.getCompanyProfile('tenant-a')),
    ).resolves.toBe(f.profile);
    expect(f.db.branch.findFirst).not.toHaveBeenCalled();
    expect(f.db.branch.findMany).not.toHaveBeenCalled();
    expect(f.db.tenant.findUnique).not.toHaveBeenCalled();
    expect(f.adapter.getCompanyProfile).toHaveBeenCalledTimes(1);
    expect(f.adapter.getCompanyProfile).toHaveBeenCalledWith();
  });

  it('preserves an explicitly absent scoped company title for the public presenter', async () => {
    const f = fixture();
    f.profile.title = '';
    await f.run(async () => {
      await expect(
        f.crm.getCompanyProfile('tenant-a', await f.source()),
      ).resolves.toEqual(f.profile);
      expect(f.adapter.getCompanyProfile).toHaveBeenCalledWith({
        preserveMissingTitle: true,
      });
    });
  });

  it.each([
    null,
    [],
    {},
    { branchId: '', sourceRevision: 'a'.repeat(64) },
    { branchId: 'branch-a\n', sourceRevision: 'a'.repeat(64) },
    { branchId: ['branch-a'], sourceRevision: 'a'.repeat(64) },
    { branchId: 'a'.repeat(129), sourceRevision: 'a'.repeat(64) },
    { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) + '\n' },
    { branchId: 'branch-a', sourceRevision: 'A'.repeat(64) },
    { branchId: 'branch-a', sourceRevision: ['a'.repeat(64)] },
    {
      branchId: 'branch-a',
      sourceRevision: 'a'.repeat(64),
      tenantId: 'foreign',
    },
  ])(
    'rejects a malformed closed witness before metadata/provider access: %j',
    async (options) => {
      const f = fixture();
      await expect(
        f.run(() => f.crm.getCompanyProfile('tenant-a', options as Witness)),
      ).rejects.toMatchObject(errorCode('crm_company_profile_scope_invalid'));
      expect(f.db.crmIntegration.findUnique).not.toHaveBeenCalled();
      expect(f.factory.create).not.toHaveBeenCalled();
      expect(f.adapter.getCompanyProfile).not.toHaveBeenCalled();
    },
  );

  it.each([
    'missing-integration',
    'foreign-integration',
    'wrong-provider',
    'inactive',
    'missing-branch',
    'foreign-branch',
    'wrong-company',
    'wrong-branch',
    'timezone',
    'internal',
    'missing-binding',
    'malformed-company',
    'stale-revision',
  ])(
    'rejects unavailable/current source drift before provider I/O: %s',
    async (kind) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        if (kind === 'missing-integration')
          f.db.crmIntegration.findUnique.mockResolvedValue(null);
        if (kind === 'foreign-integration')
          f.integration.tenantId = 'tenant-foreign';
        if (kind === 'wrong-provider') f.integration.provider = 'mock';
        if (kind === 'inactive') f.integration.status = 'paused';
        if (kind === 'missing-branch')
          f.db.branch.findFirst.mockResolvedValue(null);
        if (kind === 'foreign-branch') f.branch.tenantId = 'tenant-foreign';
        if (kind === 'wrong-company') {
          f.integration.settingsJson.companyId = 43;
          f.integration.settingsJson.branchBinding.companyId = 43;
        }
        if (kind === 'wrong-branch')
          f.integration.settingsJson.branchBinding.branchId = 'branch-other';
        if (kind === 'timezone') f.branch.timezone = 'Asia/Novosibirsk';
        if (kind === 'internal') f.tenant.calendarSource = 'internal';
        if (kind === 'missing-binding')
          Reflect.deleteProperty(f.integration.settingsJson, 'branchBinding');
        if (kind === 'malformed-company')
          Reflect.set(f.integration.settingsJson, 'companyId', [42]);
        await expect(
          f.crm.getCompanyProfile(
            'tenant-a',
            kind === 'stale-revision'
              ? { ...source, sourceRevision: 'a'.repeat(64) }
              : source,
          ),
        ).rejects.toMatchObject(
          errorCode('crm_company_profile_source_unavailable'),
        );
        expect(f.adapter.getCompanyProfile).not.toHaveBeenCalled();
      });
    },
  );

  it('rejects a foreign tenant before reading either tenant source', async () => {
    const f = fixture();
    await expect(
      f.run(() =>
        f.crm.getCompanyProfile('tenant-foreign', {
          branchId: 'branch-a',
          sourceRevision: 'a'.repeat(64),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.crmIntegration.findUnique).not.toHaveBeenCalled();
    expect(f.adapter.getCompanyProfile).not.toHaveBeenCalled();
  });

  it.each([ForbiddenException, UnauthorizedException])(
    'preserves an authority rejection while metadata awaits: %p',
    async (ErrorType) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        f.db.crmIntegration.findUnique.mockRejectedValue(
          new ErrorType('revoked'),
        );
        await expect(
          f.crm.getCompanyProfile('tenant-a', source),
        ).rejects.toBeInstanceOf(ErrorType);
        expect(f.adapter.getCompanyProfile).not.toHaveBeenCalled();
      });
    },
  );

  it('copies the caller witness before the first awaited metadata read', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = { ...(await f.source()) };
      f.db.crmIntegration.findUnique.mockImplementationOnce(() => {
        source.branchId = 'foreign';
        source.sourceRevision = 'b'.repeat(64);
        return Promise.resolve(structuredClone(f.integration));
      });
      await expect(
        f.crm.getCompanyProfile('tenant-a', source),
      ).resolves.toEqual(f.profile);
      expect(f.adapter.getCompanyProfile).toHaveBeenCalledTimes(1);
    });
  });

  it('refuses config replacement during captured adapter construction before provider dispatch', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.factory.create.mockImplementationOnce(() => {
        f.integration.settingsJson.companyId = 43;
        f.integration.settingsJson.branchBinding.companyId = 43;
        return f.adapter;
      });
      await expect(
        f.crm.getCompanyProfile('tenant-a', source),
      ).rejects.toMatchObject(
        errorCode('crm_company_profile_source_unavailable'),
      );
      expect(f.adapter.getCompanyProfile).not.toHaveBeenCalled();
    });
  });

  it.each([
    'company',
    'provider',
    'timezone',
    'integration-version',
    'base-url',
    'adapter',
    'caller-rebind',
  ])(
    'withholds a captured provider response after %s changes during its await',
    async (kind) => {
      const f = fixture();
      await f.run(async () => {
        const source = { ...(await f.source()) };
        const otherAdapter = {
          getCompanyProfile: jest
            .fn<Promise<CrmCompanyProfile | null>, []>()
            .mockResolvedValue({ ...f.profile, id: '43' }),
        };
        f.adapter.getCompanyProfile.mockImplementationOnce(async () => {
          if (kind === 'company' || kind === 'caller-rebind') {
            f.integration.settingsJson.companyId = 43;
            f.integration.settingsJson.branchBinding.companyId = 43;
          }
          if (kind === 'provider') f.integration.provider = 'altegio';
          if (kind === 'timezone') f.branch.timezone = 'Asia/Novosibirsk';
          if (kind === 'integration-version')
            f.integration.updatedAt = new Date('2026-10-09T01:00:00Z');
          if (kind === 'base-url')
            f.integration.baseUrl = 'https://synthetic.invalid';
          if (kind === 'adapter') {
            const cache = Reflect.get(f.crm, 'adapterCache') as Map<
              string,
              unknown
            >;
            cache.clear();
            f.factory.create.mockReturnValue(otherAdapter);
          }
          if (kind === 'caller-rebind') Object.assign(source, await f.source());
          return { ...f.profile };
        });
        await expect(
          f.crm.getCompanyProfile('tenant-a', source),
        ).rejects.toMatchObject(
          errorCode('crm_company_profile_source_unavailable'),
        );
        expect(f.adapter.getCompanyProfile).toHaveBeenCalledTimes(1);
        expect(otherAdapter.getCompanyProfile).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    'missing',
    'foreign-id',
    'numeric-id',
    'object-title',
    'invalid-timezone',
  ])(
    'refuses a malformed or foreign provider profile without fallback: %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'missing')
        f.adapter.getCompanyProfile.mockResolvedValue(null);
      if (kind === 'foreign-id') f.profile.id = '43';
      if (kind === 'numeric-id') Reflect.set(f.profile, 'id', 42);
      if (kind === 'object-title')
        Reflect.set(f.profile, 'title', ['Компания']);
      if (kind === 'invalid-timezone') f.profile.timezone = 'Unknown/Timezone';
      await f.run(async () => {
        await expect(
          f.crm.getCompanyProfile('tenant-a', await f.source()),
        ).rejects.toMatchObject(errorCode('crm_company_profile_unavailable'));
        expect(f.adapter.getCompanyProfile).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('snapshots returned public fields before final metadata waits', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      const original = { ...f.profile };
      f.adapter.getCompanyProfile.mockImplementationOnce(() => {
        f.db.crmIntegration.findUnique.mockImplementationOnce(() => {
          f.profile.id = '43';
          f.profile.address = 'Unrelated later object';
          return Promise.resolve(structuredClone(f.integration));
        });
        return Promise.resolve(f.profile);
      });
      await expect(
        f.crm.getCompanyProfile('tenant-a', source),
      ).resolves.toEqual(original);
    });
  });
});
