import { MeasurementReadService } from './measurement.read.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MeasurementService } from './measurement.service';
import { MeasurementSources } from './measurement.sources';

function fixture() {
  const context = new TenantContextService();
  const state = {
    id: 'membership-a',
    role: 'tenant_owner',
    status: 'active',
    branchId: null as string | null,
    user: { status: 'active' },
    tenant: {
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'Pacific/Honolulu',
    },
    branchTimezone: 'Pacific/Kiritimati',
    branchExists: true,
    branchTenantId: 'tenant-a',
  };
  const db = {
    membership: {
      findUnique: jest.fn(
        (query: {
          select: {
            tenant: { select: { branches?: { where: { id: string } } } };
          };
        }) => {
          const requested = query.select.tenant.select.branches?.where.id;
          return Promise.resolve({
            id: state.id,
            role: state.role,
            status: state.status,
            branchId: state.branchId,
            branch:
              state.branchId === 'branch-a' && state.branchExists
                ? {
                    id: 'branch-a',
                    tenantId: state.branchTenantId,
                    timezone: state.branchTimezone,
                  }
                : null,
            user: { ...state.user },
            tenant: {
              ...state.tenant,
              branches:
                requested === 'branch-a' && state.branchExists
                  ? [{ id: 'branch-a', timezone: state.branchTimezone }]
                  : [],
            },
          });
        },
      ),
    },
  };
  const entitlements = {
    resolveFeatureRequirements: jest.fn(() =>
      Promise.resolve({ allowed: true }),
    ),
  };
  const reader = new MeasurementReadService(
    db as unknown as PrismaService,
    context,
    entitlements as unknown as EntitlementsService,
    {} as MeasurementService,
    {} as MeasurementSources,
  );
  const run = <T>(action: () => T) =>
    context.run('test-review-calendar', () => {
      context.setResolvedTenant({
        tenantId: 'tenant-a',
        userId: 'actor-a',
        membershipId: 'membership-a',
        role: 'tenant_owner',
        source: 'membership',
      });
      return action();
    });
  return { reader, state, db, entitlements, run };
}

describe('review calendar terminal authority and timezone observation', () => {
  it('observes explicit branch only through current tenant relation after feature await', async () => {
    const f = fixture();
    expect(
      await f.run(() =>
        f.reader.reviewScope('tenant-a', 'actor-a', 'branch-a', true),
      ),
    ).toEqual({
      branchId: 'branch-a',
      registryAllowed: true,
      timezone: 'Pacific/Kiritimati',
    });
    expect(f.db.membership.findUnique).toHaveBeenCalledTimes(2);
    expect(
      f.db.membership.findUnique.mock.calls[1][0].select.tenant.select.branches,
    ).toEqual({
      where: { id: 'branch-a' },
      select: { id: true, timezone: true },
      take: 1,
    });
  });

  it('keeps legacy scope shape unchanged', async () => {
    const f = fixture();
    expect(
      await f.run(() => f.reader.reviewScope('tenant-a', 'actor-a')),
    ).toEqual({ branchId: undefined, registryAllowed: true });
  });

  it('uses tenant timezone only for actual tenant scope', async () => {
    const f = fixture();
    expect(
      await f.run(() =>
        f.reader.reviewScope('tenant-a', 'actor-a', undefined, true),
      ),
    ).toMatchObject({ branchId: undefined, timezone: 'Pacific/Honolulu' });
    f.state.branchId = 'branch-a';
    expect(
      await f.run(() =>
        f.reader.reviewScope('tenant-a', 'actor-a', undefined, true),
      ),
    ).toMatchObject({ branchId: 'branch-a', timezone: 'Pacific/Kiritimati' });
  });

  it('returns the current timezone changed during feature resolution, not the old snapshot', async () => {
    const f = fixture();
    f.entitlements.resolveFeatureRequirements.mockImplementationOnce(() => {
      f.state.branchTimezone = 'Europe/Berlin';
      return Promise.resolve({ allowed: true });
    });
    expect(
      await f.run(() =>
        f.reader.reviewScope('tenant-a', 'actor-a', 'branch-a', true),
      ),
    ).toMatchObject({ timezone: 'Europe/Berlin' });
  });

  it.each(['membership', 'user', 'tenant'])(
    'refuses %s revocation while features are awaited',
    async (kind) => {
      const f = fixture();
      f.entitlements.resolveFeatureRequirements.mockImplementationOnce(() => {
        if (kind === 'membership') f.state.status = 'inactive';
        else if (kind === 'user') f.state.user.status = 'inactive';
        else f.state.tenant.status = 'inactive';
        return Promise.resolve({ allowed: true });
      });
      await expect(
        f.run(() =>
          f.reader.reviewScope('tenant-a', 'actor-a', 'branch-a', true),
        ),
      ).rejects.toThrow('measurement_membership_revoked');
    },
  );

  it('refuses branch reassignment during feature resolution', async () => {
    const f = fixture();
    f.entitlements.resolveFeatureRequirements.mockImplementationOnce(() => {
      f.state.branchId = 'branch-a';
      return Promise.resolve({ allowed: true });
    });
    await expect(
      f.run(() => f.reader.reviewScope('tenant-a', 'actor-a', undefined, true)),
    ).rejects.toThrow('measurement_branch_scope_denied');
  });

  it('refuses inherited branch moved to another tenant during feature resolution', async () => {
    const f = fixture();
    f.state.branchId = 'branch-a';
    f.entitlements.resolveFeatureRequirements.mockImplementationOnce(() => {
      f.state.branchTenantId = 'foreign';
      return Promise.resolve({ allowed: true });
    });
    await expect(
      f.run(() => f.reader.reviewScope('tenant-a', 'actor-a', undefined, true)),
    ).rejects.toThrow('review_calendar_source_unavailable');
  });

  it.each(['foreign', 'missing'])(
    'refuses %s selected branch without a tenant timezone fallback',
    async (branchId) => {
      const f = fixture();
      await expect(
        f.run(() =>
          f.reader.reviewScope('tenant-a', 'actor-a', branchId, true),
        ),
      ).rejects.toThrow('review_calendar_source_unavailable');
    },
  );

  it.each(['', 'Invalid/Zone', ' UTC '])(
    'refuses invalid current branch timezone %j',
    async (timezone) => {
      const f = fixture();
      f.state.branchTimezone = timezone;
      await expect(
        f.run(() =>
          f.reader.reviewScope('tenant-a', 'actor-a', 'branch-a', true),
        ),
      ).rejects.toThrow('review_calendar_source_unavailable');
    },
  );

  it('refuses a foreign principal before feature or source work', async () => {
    const f = fixture();
    await expect(
      f.run(() =>
        f.reader.reviewScope('tenant-b', 'actor-a', 'branch-a', true),
      ),
    ).rejects.toThrow('measurement_authenticated_principal_required');
    expect(f.entitlements.resolveFeatureRequirements).not.toHaveBeenCalled();
  });
});
