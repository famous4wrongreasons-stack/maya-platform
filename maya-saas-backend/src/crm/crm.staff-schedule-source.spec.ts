import type { ApplyStaffScheduleDayChangeParams } from './crm-adapter.interface';
import { CrmService } from './crm.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  staffScheduleRevision,
  staffScheduleSourceRevision,
} from './staff-schedule.utils';
import { Package5Wave3ProductionGatewayService } from '../package5-wave3/package5-wave3-production-gateway.service';

function fixture() {
  const context = new TenantContextService();
  const integration = {
    id: 'integration-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    status: 'active',
    updatedAt: new Date('2026-10-08T00:00:00Z'),
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
    defaultTimezone: 'UTC',
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
      findUnique: jest.fn().mockImplementation(() =>
        structuredClone({
          ...tenant,
          crmIntegration: {
            id: integration.id,
            provider: integration.provider,
            status: integration.status,
            updatedAt: integration.updatedAt,
            baseUrl: integration.baseUrl,
            settingsJson: integration.settingsJson,
          },
        }),
      ),
    },
    crmIntegration: {
      findUnique: jest
        .fn()
        .mockImplementation(() => structuredClone(integration)),
    },
    staffProviderLink: {
      findMany: jest.fn().mockImplementation(() => [structuredClone(link)]),
    },
  };
  const slots = [{ from: '09:00', to: '18:00' }];
  const day = {
    staff_id: '7',
    date: '2026-10-09',
    slots,
    is_working: true,
    revision: staffScheduleRevision('7', '2026-10-09', slots),
  };
  const adapter = {
    getStaffScheduleDay: jest.fn().mockResolvedValue(day),
    previewStaffScheduleDayChange: jest
      .fn()
      .mockResolvedValue({ current: day, conflicts: [] }),
    applyStaffScheduleDayChange: jest
      .fn<Promise<typeof day>, [ApplyStaffScheduleDayChangeParams]>()
      .mockResolvedValue(day),
  };
  const factory = { create: jest.fn().mockReturnValue(adapter) };
  const crm = new CrmService(
    db as never,
    { decrypt: () => 'synthetic-no-credential' } as never,
    factory as never,
    context,
  );
  const run = <T>(fn: () => Promise<T>) =>
    context.runAsSystemTenant('tenant-a', fn);
  const source = () => crm.resolveStaffScheduleSource('tenant-a', '7');
  const gateway = new Package5Wave3ProductionGatewayService(crm, {} as never);
  const input = {
    tenantId: 'tenant-a',
    provider: 'yclients',
    staffId: 'staff-a',
    branchId: 'branch-a',
    externalStaffId: '7',
    localDate: day.date,
  };
  return {
    db,
    crm,
    integration,
    branch,
    tenant,
    link,
    adapter,
    factory,
    day,
    run,
    source,
    gateway,
    input,
  };
}

describe('staff schedule exact source fence', () => {
  it('binds the branch timezone and qualifies a raw provider revision without exposing credentials', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      expect(source).toMatchObject({
        staffId: 'staff-a',
        branchId: 'branch-a',
        provider: 'yclients',
        timezone: 'America/Los_Angeles',
      });
      await f.crm.previewStaffScheduleDayChange('tenant-a', {
        staffId: '7',
        date: f.day.date,
        slots: [],
        source,
      });
      expect(f.adapter.previewStaffScheduleDayChange).toHaveBeenCalledWith(
        expect.objectContaining({ timezone: 'America/Los_Angeles' }),
      );
      const read = await f.gateway.readStaffDay(f.input);
      expect(read.revision).toBe(
        staffScheduleSourceRevision(f.day.revision, source.sourceHash),
      );
      expect(read.revision).not.toBe(f.day.revision);
      expect(JSON.stringify(source)).not.toMatch(
        /credential|synthetic|companyId/,
      );
    });
  });

  it.each([
    'company',
    'provider',
    'link',
    'branch',
    'timezone',
    'internal',
    'inactive',
    'missing',
    'ambiguous',
    'foreign',
  ])('rejects %s drift before any provider read or write', async (kind) => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      if (kind === 'company') {
        f.integration.settingsJson.companyId = 43;
        f.integration.settingsJson.branchBinding.companyId = 43;
      }
      if (kind === 'provider') f.integration.provider = 'altegio';
      if (kind === 'link') f.link.id = 'replacement-link';
      if (kind === 'branch') f.link.staff.branchId = 'branch-b';
      if (kind === 'timezone') f.branch.timezone = 'Europe/Moscow';
      if (kind === 'internal') f.tenant.calendarSource = 'internal';
      if (kind === 'inactive') f.link.staff.active = false;
      if (kind === 'missing')
        f.db.staffProviderLink.findMany.mockReturnValue([]);
      if (kind === 'ambiguous')
        f.db.staffProviderLink.findMany.mockReturnValue([f.link, f.link]);
      if (kind === 'foreign') f.link.staff.tenantId = 'tenant-b';
      await expect(
        f.crm.applyStaffScheduleDayChange('tenant-a', {
          staffId: '7',
          date: f.day.date,
          slots: [],
          expectedRevision: staffScheduleSourceRevision(
            f.day.revision,
            source.sourceHash,
          ),
          source,
        }),
      ).rejects.toThrow();
      expect(f.adapter.getStaffScheduleDay).not.toHaveBeenCalled();
      expect(f.adapter.applyStaffScheduleDayChange).not.toHaveBeenCalled();
    });
  });

  it('rejects an incoherent link/capacity snapshot', async () => {
    const f = fixture();
    f.db.staffProviderLink.findMany
      .mockImplementationOnce(() => [structuredClone(f.link)])
      .mockImplementation(() => [{ ...f.link, id: 'replacement' }]);
    await expect(f.run(f.source)).rejects.toThrow();
    expect(f.adapter.getStaffScheduleDay).not.toHaveBeenCalled();
  });

  it('refuses a prior approval source before reading the replacement company', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.integration.settingsJson.companyId = 43;
      f.integration.settingsJson.branchBinding.companyId = 43;
      await expect(
        f.gateway.readStaffDay({
          ...f.input,
          sourceIdentityHash: source.sourceHash,
        }),
      ).rejects.toThrow();
      expect(f.adapter.getStaffScheduleDay).not.toHaveBeenCalled();
    });
  });

  it('refuses source drift during provider observation', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      f.adapter.getStaffScheduleDay.mockImplementation(() => {
        f.branch.timezone = 'Europe/Moscow';
        return Promise.resolve(f.day);
      });
      await expect(
        f.crm.getStaffScheduleDay('tenant-a', {
          staffId: '7',
          date: f.day.date,
          source,
        }),
      ).rejects.toThrow();
    });
  });

  it('passes raw expected revision and branch timezone only to the captured adapter', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      await f.crm.applyStaffScheduleDayChange('tenant-a', {
        staffId: '7',
        date: f.day.date,
        slots: [],
        source,
        expectedRevision: staffScheduleSourceRevision(
          f.day.revision,
          source.sourceHash,
        ),
      });
      const supplied = f.adapter.applyStaffScheduleDayChange.mock.calls[0][0];
      expect(supplied).toMatchObject({
        expectedRevision: f.day.revision,
        timezone: 'America/Los_Angeles',
      });
      await supplied.assertSourceCurrent!();
      // Same metadata must not qualify a different adapter instance after cache replacement.
      f.factory.create.mockReturnValue({ ...f.adapter });
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_000);
      try {
        await expect(supplied.assertSourceCurrent!()).rejects.toThrow();
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  it('refuses unqualified approval revisions before apply', async () => {
    const f = fixture();
    await f.run(async () => {
      const source = await f.source();
      await expect(
        f.crm.applyStaffScheduleDayChange('tenant-a', {
          staffId: '7',
          date: f.day.date,
          slots: [],
          source,
          expectedRevision: f.day.revision,
        }),
      ).rejects.toThrow();
      expect(f.adapter.applyStaffScheduleDayChange).not.toHaveBeenCalled();
    });
  });

  it.each([null, 'old-company'])(
    'never reconciles UNKNOWN against a missing or changed source (%s)',
    async (kind) => {
      const f = fixture();
      await f.run(async () => {
        const source = await f.source();
        if (kind) {
          f.integration.settingsJson.companyId = 43;
          f.integration.settingsJson.branchBinding.companyId = 43;
        }
        await expect(
          f.gateway.reconcileStaffDay({
            ...f.input,
            sourceIdentityHash: kind ? source.sourceHash : null,
            expectedProviderRevision: staffScheduleSourceRevision(
              f.day.revision,
              source.sourceHash,
            ),
            desiredStateHash: 'b'.repeat(64),
            requestIdentityHash: 'c'.repeat(64),
          }),
        ).resolves.toBe('STILL_UNKNOWN');
        expect(f.adapter.getStaffScheduleDay).not.toHaveBeenCalled();
        expect(f.adapter.applyStaffScheduleDayChange).not.toHaveBeenCalled();
      });
    },
  );

  it('reconciles the original source only, without a second write', async () => {
    const f = fixture();
    await f.run(async () => {
      const read = await f.gateway.readStaffDay(f.input);
      await expect(
        f.gateway.reconcileStaffDay({
          ...f.input,
          sourceIdentityHash: read.sourceIdentityHash,
          expectedProviderRevision: 'a'.repeat(64),
          desiredStateHash: read.stateHash,
          requestIdentityHash: 'c'.repeat(64),
        }),
      ).resolves.toBe('PROVEN_SUCCEEDED');
      await expect(
        f.gateway.reconcileStaffDay({
          ...f.input,
          sourceIdentityHash: read.sourceIdentityHash,
          expectedProviderRevision: read.revision,
          desiredStateHash: 'b'.repeat(64),
          requestIdentityHash: 'c'.repeat(64),
        }),
      ).resolves.toBe('PROVEN_NOT_EXECUTED');
      expect(f.adapter.applyStaffScheduleDayChange).not.toHaveBeenCalled();
    });
  });

  it('rejects foreign tenant context before metadata or provider reads', async () => {
    const f = fixture();
    await expect(
      f.run(() => f.crm.resolveStaffScheduleSource('tenant-b', '7')),
    ).rejects.toThrow();
    expect(f.db.tenant.findUnique).not.toHaveBeenCalled();
  });
});
