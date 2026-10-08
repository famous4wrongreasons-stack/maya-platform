import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '../common/domain.enums';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmService } from './crm.service';
import { serviceRenameSnapshot } from './yclients-service-rename.contract';

const snapshot = () =>
  serviceRenameSnapshot(
    {
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
    },
    '123',
    '201',
    'RUB',
  );

/** Actual CRM owner, synthetic current persistence and adapter boundaries. */
describe('service rename current actor and source fences', () => {
  function fixture() {
    const principal = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: UserRole.TENANT_OWNER,
    };
    const membership = {
      id: 'membership-a',
      status: 'active',
      role: UserRole.TENANT_OWNER,
      branchId: null as string | null,
      user: { status: 'active' },
    };
    const binding = {
      contract: 'maya.crm-branch-binding/1',
      branchId: 'branch-a',
      companyId: '123',
    };
    const integration = {
      id: 'integration-a',
      tenantId: 'tenant-a',
      provider: 'yclients',
      status: 'active',
      settingsJson: {
        companyId: '123',
        currency: 'RUB',
        branchBinding: binding as typeof binding | undefined,
      },
      baseUrl: null as string | null,
      encryptedApiToken: 'synthetic',
      updatedAt: new Date('2026-10-08T12:00:00Z'),
    };
    const tenant = {
      id: 'tenant-a',
      status: 'active',
      calendarSource: 'external',
    };
    const branch = { id: 'branch-a', timezone: 'Europe/Moscow' };
    const readServiceRenameSnapshot = jest
      .fn<Promise<ReturnType<typeof snapshot>>, [string]>()
      .mockImplementation(() => Promise.resolve(snapshot()));
    const create = jest.fn().mockReturnValue({ readServiceRenameSnapshot });
    const membershipRead = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ...membership, user: { ...membership.user } }),
      );
    const integrationRead = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ...integration,
        settingsJson: { ...integration.settingsJson },
      }),
    );
    const branchRead = jest.fn().mockResolvedValue(branch);
    const tenantRead = jest.fn().mockResolvedValue(tenant);
    const assertFeature = jest.fn().mockResolvedValue(undefined);
    const context = new TenantContextService();
    const service = new CrmService(
      {
        membership: { findUnique: membershipRead },
        crmIntegration: { findUnique: integrationRead },
        tenant: { findUnique: tenantRead },
        branch: { findFirst: branchRead },
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
      run(() => service.serviceRenameReadIdentity('tenant-a', 'owner-a'));
    const read = (revision: string) =>
      run(() =>
        service.previewServiceRenameForActor(
          'tenant-a',
          'owner-a',
          '201',
          '  New cut  ',
          revision,
        ),
      );
    return {
      service,
      run,
      identity,
      read,
      principal,
      membership,
      integration,
      tenant,
      branch,
      create,
      membershipRead,
      integrationRead,
      branchRead,
      tenantRead,
      assertFeature,
      readServiceRenameSnapshot,
    };
  }
  it('uses current tenant-wide owner, exact bound branch and read-only adapter without a writer port', async () => {
    const f = fixture(),
      revision = await f.identity();
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
    const result = await f.read(revision);
    expect(result).toMatchObject({
      company_id: '123',
      service_id: '201',
      old_title: 'Synthetic cut',
      new_title: 'New cut',
      source_revision: revision,
      preview_only: true,
      noSideEffects: true,
    });
    expect(f.readServiceRenameSnapshot).toHaveBeenCalledTimes(1);
    expect(f.readServiceRenameSnapshot).toHaveBeenCalledWith('201');
    expect(f.branchRead).toHaveBeenCalledWith({
      where: { id: 'branch-a', tenantId: 'tenant-a' },
      select: { id: true, timezone: true },
    });
    expect(f.assertFeature).toHaveBeenCalledWith('tenant-a', 'ai.owner');
    expect(f.assertFeature).toHaveBeenCalledWith('tenant-a', 'crm.integration');
    expect(JSON.stringify(result)).not.toMatch(
      /synthetic|membership-a|integration-a|staff|price_min/,
    );
  });
  it('keeps configured-company scope when no explicit branch binding exists', async () => {
    const f = fixture();
    f.integration.settingsJson.branchBinding = undefined;
    await expect(f.read(await f.identity())).resolves.toMatchObject({
      company_id: '123',
    });
    expect(f.branchRead).not.toHaveBeenCalled();
  });
  it('rejects foreign tenant, actor and invalid selection before provider access', async () => {
    const f = fixture(),
      revision = await f.identity();
    await expect(
      f.run(() =>
        f.service.previewServiceRenameForActor(
          'tenant-b',
          'owner-a',
          '201',
          'New',
          revision,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      f.run(() =>
        f.service.previewServiceRenameForActor(
          'tenant-a',
          'owner-b',
          '201',
          'New',
          revision,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      f.run(() =>
        f.service.previewServiceRenameForActor(
          'tenant-a',
          'owner-a',
          '201',
          '\n',
          revision,
        ),
      ),
    ).rejects.toThrow();
    await expect(f.read('not-a-revision')).rejects.toThrow();
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
  });
  it.each([
    'suspended',
    'staff',
    'scoped',
    'user',
    'tenant',
    'feature',
    'source',
    'integration',
    'credential',
    'company',
    'branch',
    'timezone',
  ])(
    'withholds the result when %s changes during provider await',
    async (change) => {
      const f = fixture(),
        revision = await f.identity();
      f.readServiceRenameSnapshot.mockImplementation(() => {
        if (change === 'suspended') f.membership.status = 'suspended';
        if (change === 'staff') f.membership.role = UserRole.STAFF;
        if (change === 'scoped') f.membership.branchId = 'branch-a';
        if (change === 'user') f.membership.user.status = 'suspended';
        if (change === 'tenant') f.tenant.status = 'suspended';
        if (change === 'feature')
          f.assertFeature.mockRejectedValue(
            new ForbiddenException('feature revoked'),
          );
        if (change === 'source') f.tenant.calendarSource = 'internal';
        if (change === 'integration') f.integration.status = 'inactive';
        if (change === 'credential')
          f.integration.encryptedApiToken = 'rotated';
        if (change === 'company') {
          f.integration.settingsJson.companyId = '124';
          f.integration.settingsJson.branchBinding = undefined;
        }
        if (change === 'branch') f.branchRead.mockResolvedValue(null);
        if (change === 'timezone') f.branch.timezone = 'Asia/Yekaterinburg';
        return Promise.resolve(snapshot());
      });
      await expect(f.read(revision)).rejects.toThrow();
      expect(f.readServiceRenameSnapshot).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects stale source before GET and permits only a fresh explicit identity afterward', async () => {
    const f = fixture(),
      revision = await f.identity();
    f.integration.baseUrl = 'https://changed.invalid/api/v1';
    await expect(f.read(revision)).rejects.toThrow(ConflictException);
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
    const fresh = await f.identity();
    expect(fresh).not.toBe(revision);
    await expect(f.read(fresh)).resolves.toMatchObject({
      source_revision: fresh,
    });
  });
  it('refuses a missing same-tenant bound branch before adapter read', async () => {
    const f = fixture();
    f.branchRead.mockResolvedValue(null);
    await expect(f.identity()).rejects.toThrow(ServiceUnavailableException);
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
  });
  it('does not infer a title-preview port from an existing price writer', async () => {
    const f = fixture();
    f.create.mockReturnValue({ updateServiceFixedPrice: jest.fn() });
    await expect(f.identity()).rejects.toThrow(ServiceUnavailableException);
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
  });
  it('catches revocation inside awaited adapter selection before any provider read', async () => {
    const f = fixture();
    f.create.mockImplementation(() => {
      f.membership.role = UserRole.STAFF;
      return { readServiceRenameSnapshot: f.readServiceRenameSnapshot };
    });
    await expect(f.identity()).rejects.toThrow(ForbiddenException);
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
  });
  it('catches source replacement inside adapter selection instead of returning a mismatched witness', async () => {
    const f = fixture();
    f.create.mockImplementation(() => {
      f.integration.baseUrl = 'https://replacement.invalid/api/v1';
      return { readServiceRenameSnapshot: f.readServiceRenameSnapshot };
    });
    await expect(f.identity()).rejects.toThrow(ConflictException);
    expect(f.readServiceRenameSnapshot).not.toHaveBeenCalled();
  });
  it('rechecks membership after the final awaited source lookup', async () => {
    const f = fixture(),
      revision = await f.identity();
    f.readServiceRenameSnapshot.mockImplementation(() => {
      f.branchRead.mockImplementation(() => {
        f.membership.user.status = 'suspended';
        return Promise.resolve(f.branch);
      });
      return Promise.resolve(snapshot());
    });
    await expect(f.read(revision)).rejects.toThrow(ForbiddenException);
  });
  it.each([
    { companyId: '999' },
    { serviceId: '999' },
    { contract: 'foreign.snapshot' },
  ])('rejects mismatched native snapshot %j', async (patch) => {
    const f = fixture(),
      revision = await f.identity();
    f.readServiceRenameSnapshot.mockResolvedValue({
      ...snapshot(),
      ...patch,
    } as ReturnType<typeof snapshot>);
    await expect(f.read(revision)).rejects.toThrow(ConflictException);
  });
  it('preserves unavailable provider errors and never returns a completed/empty rename', async () => {
    const f = fixture(),
      revision = await f.identity();
    const error = new ServiceUnavailableException(
      'synthetic source unavailable',
    );
    f.readServiceRenameSnapshot.mockRejectedValue(error);
    await expect(f.read(revision)).rejects.toBe(error);
  });
});
