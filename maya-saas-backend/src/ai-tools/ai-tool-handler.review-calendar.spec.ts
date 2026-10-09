import { ForbiddenException } from '@nestjs/common';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { BusinessContentService } from '../business-content/business-content.service';
import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MeasurementReadService } from '../measurement/measurement.read.service';

const principal = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: UserRole.TENANT_OWNER,
  surface: 'web' as const,
};
const exact = {
  period: 'named_month',
  month: '2026-09',
  rating: 2,
  branch_id: 'branch-a',
  limit: 2,
};

function fixture() {
  const state = {
    timezone: 'Pacific/Kiritimati',
    memberBranch: undefined as string | undefined,
    registryAllowed: true,
  };
  const db = {
    branch: {
      findFirst: jest.fn(() =>
        Promise.resolve<{ timezone: string } | null>({
          timezone: state.timezone,
        }),
      ),
    },
    tenant: {
      findUnique: jest.fn(() =>
        Promise.resolve({ defaultTimezone: 'Pacific/Honolulu' }),
      ),
    },
    businessReview: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            id: 'review-a',
            tenantId: 'tenant-a',
            branchId: 'branch-a',
            rating: 2,
            occurredAt: new Date('2026-09-15T00:00:00.000Z'),
            topicTagsJson: ['staff'],
          },
        ]),
      ),
    },
  };
  const business = new BusinessContentService(
    db as unknown as PrismaService,
    { assertTenantId: (id: string) => id } as TenantContextService,
    {} as ConstructorParameters<typeof BusinessContentService>[2],
    {} as ConstructorParameters<typeof BusinessContentService>[3],
    {} as ConstructorParameters<typeof BusinessContentService>[4],
    {} as ConstructorParameters<typeof BusinessContentService>[5],
  );
  const measurement = {
    reviewScope: jest.fn((_tenant: string, _user: string, branch?: string) =>
      Promise.resolve({
        branchId: state.memberBranch ?? branch,
        registryAllowed: state.registryAllowed,
        timezone:
          (state.memberBranch ?? branch) ? state.timezone : 'Pacific/Honolulu',
      }),
    ),
  };
  const handler = new AiToolHandlerService(
    {} as ConstructorParameters<typeof AiToolHandlerService>[0],
    {} as ConstructorParameters<typeof AiToolHandlerService>[1],
    {} as ConstructorParameters<typeof AiToolHandlerService>[2],
    {} as ConstructorParameters<typeof AiToolHandlerService>[3],
    {} as ConstructorParameters<typeof AiToolHandlerService>[4],
    db as unknown as PrismaService,
    {} as ConstructorParameters<typeof AiToolHandlerService>[6],
    {} as ConstructorParameters<typeof AiToolHandlerService>[7],
    {} as ConstructorParameters<typeof AiToolHandlerService>[8],
    {} as ConstructorParameters<typeof AiToolHandlerService>[9],
    {} as ConstructorParameters<typeof AiToolHandlerService>[10],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    business,
    undefined,
    undefined,
    undefined,
    measurement as unknown as MeasurementReadService,
  );
  return { handler, db, business, measurement, state };
}

describe('reviews exact calendar handler owner binding', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('resolves branch calendar metadata without reading reviews', async () => {
    const f = fixture();
    const scope = await f.handler.resolveReviewCalendarScope(principal, {
      period: 'last_month',
      all_ratings: true,
      branch_id: 'branch-a',
    });
    expect(scope).toEqual({
      branchId: 'branch-a',
      timezone: 'Pacific/Kiritimati',
      period: 'named_month',
      month: '2026-09',
      fromInclusive: '2026-08-31T10:00:00.000Z',
      toExclusive: '2026-09-30T10:00:00.000Z',
      rating: null,
      limit: 20,
    });
    expect(Object.isFrozen(scope)).toBe(true);
    expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
    expect(f.measurement.reviewScope).toHaveBeenLastCalledWith(
      'tenant-a',
      'owner-a',
      'branch-a',
      true,
    );
  });

  it('uses current tenant timezone for a tenant-wide request', async () => {
    const f = fixture();
    const scope = await f.handler.resolveReviewCalendarScope(principal, {
      period: 'last_month',
      rating: 1,
    });
    expect(scope).toMatchObject({
      branchId: null,
      timezone: 'Pacific/Honolulu',
      fromInclusive: '2026-09-01T10:00:00.000Z',
      toExclusive: '2026-10-01T10:00:00.000Z',
    });
    expect(f.db.branch.findFirst).not.toHaveBeenCalled();
  });

  it('pins last month across year rollover to a named month', async () => {
    jest.setSystemTime(new Date('2027-01-15T12:00:00.000Z'));
    const f = fixture();
    const scope = await f.handler.resolveReviewCalendarScope(principal, {
      period: 'last_month',
      all_ratings: true,
    });
    expect(scope).toMatchObject({
      period: 'named_month',
      month: '2026-12',
      fromInclusive: '2026-12-01T10:00:00.000Z',
      toExclusive: '2027-01-01T10:00:00.000Z',
    });
  });

  it('uses the effective member branch instead of a tenant-wide fallback', async () => {
    const f = fixture();
    f.state.memberBranch = 'branch-a';
    expect(
      await f.handler.resolveReviewCalendarScope(principal, {
        period: 'last_month',
        rating: 2,
      }),
    ).toMatchObject({ branchId: 'branch-a', timezone: 'Pacific/Kiritimati' });
  });

  it('executes exactly one existing local registry read and returns its bounded facts', async () => {
    const f = fixture();
    const result = await f.handler.execute(
      'reviews.list.read',
      principal,
      exact,
      'read-a',
    );
    expect(f.db.businessReview.findMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      count: 1,
      reviews: [{ rating: 2 }],
      read_scope: {
        contract: 'maya.review-registry-query/2',
        month: '2026-09',
        branch_id: 'branch-a',
      },
    });
  });

  it.each([
    { rating: undefined },
    { all_ratings: true },
    { rating: '2' },
    { rating: 'low' },
    { rating: 0 },
    { rating: 6 },
    { days: 30 },
    { month: '2026-09\n' },
    { month: '2026-13' },
    { branch_id: ['branch-a'] },
    { limit: 51 },
  ])(
    'refuses ambiguous or malformed query %# before owner reads',
    async (change) => {
      const f = fixture();
      await expect(
        f.handler.resolveReviewCalendarScope(principal, {
          ...exact,
          ...change,
        }),
      ).rejects.toThrow('review_calendar_query_invalid');
      expect(f.measurement.reviewScope).not.toHaveBeenCalled();
      expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-10', '2027-01', '9999-12'])(
    'refuses unfinished/future %s with no truncation',
    async (month) => {
      const f = fixture();
      await expect(
        f.handler.resolveReviewCalendarScope(principal, { ...exact, month }),
      ).rejects.toThrow('review_calendar_period_unavailable');
      expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
    },
  );

  it('refuses missing or foreign explicit branch rather than returning empty', async () => {
    const f = fixture();
    f.db.branch.findFirst.mockResolvedValue(null);
    await expect(
      f.handler.execute('reviews.list.read', principal, exact, 'read-a'),
    ).rejects.toThrow('review_calendar_source_unavailable');
    expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
  });

  it('refuses timezone drift inside the reporting window read', async () => {
    const f = fixture();
    f.db.branch.findFirst
      .mockResolvedValueOnce({ timezone: 'Pacific/Kiritimati' })
      .mockImplementationOnce(() => {
        f.state.timezone = 'UTC';
        return Promise.resolve({ timezone: 'UTC' });
      });
    await expect(
      f.handler.resolveReviewCalendarScope(principal, exact),
    ).rejects.toThrow('review_calendar_scope_changed');
  });

  it('refuses timezone drift inside terminal reviewScope entitlement work', async () => {
    const f = fixture();
    f.measurement.reviewScope
      .mockResolvedValueOnce({
        branchId: 'branch-a',
        registryAllowed: true,
        timezone: f.state.timezone,
      })
      .mockImplementationOnce(() => {
        f.state.timezone = 'UTC';
        return Promise.resolve({
          branchId: 'branch-a',
          registryAllowed: true,
          timezone: 'UTC',
        });
      });
    await expect(
      f.handler.resolveReviewCalendarScope(principal, exact),
    ).rejects.toThrow('review_calendar_scope_changed');
  });

  it('refuses effective membership branch changes during a completed read', async () => {
    const f = fixture();
    const rows = [
      {
        id: 'r',
        tenantId: 'tenant-a',
        branchId: 'branch-a',
        rating: 2,
        occurredAt: new Date('2026-09-15T00:00:00.000Z'),
        topicTagsJson: [],
      },
    ];
    f.db.businessReview.findMany.mockImplementationOnce(() => {
      f.state.memberBranch = 'branch-b';
      return Promise.resolve(rows);
    });
    await expect(
      f.handler.execute('reviews.list.read', principal, exact, 'read-a'),
    ).rejects.toThrow('review_calendar_scope_changed');
  });

  it('retains authoritative refusal without mapping it to empty or source configuration', async () => {
    const f = fixture();
    f.measurement.reviewScope.mockRejectedValue(
      new ForbiddenException('measurement_membership_revoked'),
    );
    await expect(
      f.handler.execute('reviews.list.read', principal, exact, 'read-a'),
    ).rejects.toThrow('measurement_membership_revoked');
    expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
  });
});
