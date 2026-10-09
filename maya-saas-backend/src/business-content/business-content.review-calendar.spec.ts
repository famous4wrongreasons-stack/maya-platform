import {
  BusinessContentService,
  type ReviewCalendarWindow,
} from './business-content.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const september: ReviewCalendarWindow = {
  month: '2026-09',
  timezone: 'Pacific/Kiritimati',
  fromInclusive: '2026-08-31T10:00:00.000Z',
  toExclusive: '2026-09-30T10:00:00.000Z',
};
const row = (id = 'r1', occurredAt = '2026-09-10T12:00:00.000Z') => ({
  id,
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  rating: 2,
  occurredAt: new Date(occurredAt),
  topicTagsJson: ['staff', 'staff', 'private-name'],
});

function fixture() {
  const db = {
    branch: {
      findFirst: jest.fn(() =>
        Promise.resolve<{ timezone: string } | null>({
          timezone: september.timezone,
        }),
      ),
    },
    tenant: {
      findUnique: jest.fn(() =>
        Promise.resolve({ defaultTimezone: 'Pacific/Honolulu' }),
      ),
    },
    businessReview: { findMany: jest.fn(() => Promise.resolve([row()])) },
  };
  const context = {
    assertTenantId: jest.fn((tenantId: string) => {
      if (tenantId !== 'tenant-a') throw new Error('foreign_tenant');
      return tenantId;
    }),
  };
  const service = new BusinessContentService(
    db as unknown as PrismaService,
    context as unknown as TenantContextService,
    {} as ConstructorParameters<typeof BusinessContentService>[2],
    {} as ConstructorParameters<typeof BusinessContentService>[3],
    {} as ConstructorParameters<typeof BusinessContentService>[4],
    {} as ConstructorParameters<typeof BusinessContentService>[5],
  );
  const read = () =>
    service.listReviews('tenant-a', {
      calendar: september,
      rating: 2,
      branchId: 'branch-a',
      limit: 2,
    });
  return { db, service, read };
}

describe('local review registry exact calendar query', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-09T12:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('queries the exact branch half-open calendar window without reading private text', async () => {
    const f = fixture();
    const result = await f.read();
    expect(f.db.businessReview.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        branchId: 'branch-a',
        rating: 2,
        occurredAt: {
          gte: new Date(september.fromInclusive),
          lt: new Date(september.toExclusive),
        },
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        rating: true,
        occurredAt: true,
        topicTagsJson: true,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    expect(result.reviews).toEqual([
      { rating: 2, occurred_at: '2026-09-10T12:00:00.000Z', topics: ['staff'] },
    ]);
    expect(result.read_scope).toMatchObject({
      contract: 'maya.review-registry-query/2',
      month: '2026-09',
      timezone: 'Pacific/Kiritimati',
      rating_mode: 'exact',
      configuration_status: 'not_observed',
      returned_count: 1,
      has_more: false,
    });
  });

  it('uses limit+1 for has_more, never an invented total', async () => {
    const f = fixture();
    f.db.businessReview.findMany.mockResolvedValue([
      row('r3'),
      row('r2'),
      row('r1'),
    ]);
    const result = await f.read();
    expect(result.count).toBe(2);
    expect(result.read_scope).toMatchObject({
      returned_count: 2,
      has_more: true,
    });
    expect(result).not.toHaveProperty('total');
  });

  it('keeps observed empty distinct from configuration absence', async () => {
    const f = fixture();
    f.db.businessReview.findMany.mockResolvedValue([]);
    const result = await f.read();
    expect(result).toMatchObject({
      source: 'tenant_review_registry',
      count: 0,
      reviews: [],
      read_scope: { configuration_status: 'not_observed', has_more: false },
    });
  });

  it('explicit all ratings omits only the SQL rating filter', async () => {
    const f = fixture();
    await f.service.listReviews('tenant-a', {
      calendar: september,
      allRatings: true,
      branchId: 'branch-a',
    });
    expect(f.db.businessReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          occurredAt: {
            gte: new Date(september.fromInclusive),
            lt: new Date(september.toExclusive),
          },
        },
        take: 21,
      }),
    );
  });

  it.each([
    [
      'leap February',
      '2024-02',
      'UTC',
      '2024-02-01T00:00:00.000Z',
      '2024-03-01T00:00:00.000Z',
    ],
    [
      'DST March',
      '2026-03',
      'Europe/Berlin',
      '2026-02-28T23:00:00.000Z',
      '2026-03-31T22:00:00.000Z',
    ],
    [
      'year rollover',
      '2025-12',
      'UTC',
      '2025-12-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ],
  ])(
    'accepts canonical %s bounds',
    async (_label, month, timezone, fromInclusive, toExclusive) => {
      const f = fixture();
      f.db.branch.findFirst.mockResolvedValue({ timezone });
      f.db.businessReview.findMany.mockResolvedValue([]);
      const result = await f.service.listReviews('tenant-a', {
        calendar: { month, timezone, fromInclusive, toExclusive },
        allRatings: true,
        branchId: 'branch-a',
      });
      expect(result.read_scope).toMatchObject({
        from_inclusive: fromInclusive,
        to_exclusive: toExclusive,
      });
    },
  );

  it.each([
    { rating: undefined },
    { rating: 2, allRatings: true },
    { rating: 0 },
    { rating: 1.5 },
    { days: 30 },
    { limit: 51 },
    { limit: 0 },
    { calendar: { ...september, timezone: 'Invalid/Zone' } },
    { calendar: { ...september, timezone: ' UTC ' } },
    { calendar: { ...september, toExclusive: '2026-09-30T09:59:59.999Z' } },
  ])(
    'refuses malformed or ambiguous exact options %# before review reads',
    async (change) => {
      const f = fixture();
      await expect(
        f.service.listReviews('tenant-a', {
          calendar: september,
          rating: 2,
          branchId: 'branch-a',
          ...change,
        } as Parameters<BusinessContentService['listReviews']>[1]),
      ).rejects.toThrow('review_calendar_query_invalid');
      expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-10', '2027-01', '9999-12'])(
    'refuses unfinished/future month %s without overflow or reading',
    async (month) => {
      const f = fixture();
      await expect(
        f.service.listReviews('tenant-a', {
          calendar: { ...september, month },
          allRatings: true,
        }),
      ).rejects.toThrow('review_calendar_period_unavailable');
      expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
    },
  );

  it('refuses missing/foreign selected branch with no tenant timezone fallback', async () => {
    const f = fixture();
    f.db.branch.findFirst.mockResolvedValue(null);
    await expect(f.read()).rejects.toThrow(
      'review_calendar_source_unavailable',
    );
    expect(f.db.branch.findFirst).toHaveBeenCalledWith({
      where: { id: 'branch-a', tenantId: 'tenant-a' },
      select: { timezone: true },
    });
    expect(f.db.tenant.findUnique).not.toHaveBeenCalled();
    expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
  });

  it('rejects a foreign tenant before DB access', async () => {
    const f = fixture();
    await expect(
      f.service.listReviews('tenant-b', {
        calendar: september,
        allRatings: true,
      }),
    ).rejects.toThrow('foreign_tenant');
    expect(f.db.businessReview.findMany).not.toHaveBeenCalled();
  });

  it('rejects a timezone change during the DB read', async () => {
    const f = fixture();
    f.db.branch.findFirst
      .mockResolvedValueOnce({ timezone: september.timezone })
      .mockResolvedValueOnce({ timezone: 'UTC' });
    await expect(f.read()).rejects.toThrow('review_calendar_scope_changed');
  });

  it('snapshots both caller options and returned source rows before later awaits', async () => {
    const f = fixture();
    const calendar = { ...september };
    const options = { calendar, rating: 2, branchId: 'branch-a', limit: 2 };
    const shared = row();
    f.db.businessReview.findMany.mockResolvedValue([shared]);
    f.db.branch.findFirst
      .mockImplementationOnce(() => {
        options.rating = 5;
        options.branchId = 'other';
        calendar.month = '2020-01';
        return Promise.resolve({ timezone: september.timezone });
      })
      .mockImplementationOnce(() => {
        shared.rating = 5;
        shared.occurredAt.setTime(0);
        shared.topicTagsJson.push('price');
        return Promise.resolve({ timezone: september.timezone });
      });
    const result = await f.service.listReviews('tenant-a', options);
    expect(result.reviews).toEqual([
      { rating: 2, occurred_at: '2026-09-10T12:00:00.000Z', topics: ['staff'] },
    ]);
    expect(result.read_scope).toMatchObject({
      month: '2026-09',
      branch_id: 'branch-a',
      rating_exact: 2,
    });
  });

  it.each([
    { tenantId: 'foreign' },
    { branchId: 'foreign' },
    { rating: 5 },
    { occurredAt: new Date(september.toExclusive) },
    { occurredAt: new Date(NaN) },
  ])('rejects malformed or unscoped returned facts %#', async (change) => {
    const f = fixture();
    f.db.businessReview.findMany.mockResolvedValue([{ ...row(), ...change }]);
    await expect(f.read()).rejects.toThrow(
      'review_calendar_source_unavailable',
    );
  });

  it('does not turn a database outage into an empty list', async () => {
    const f = fixture();
    f.db.businessReview.findMany.mockRejectedValue(
      new Error('private database error'),
    );
    await expect(f.read()).rejects.toThrow(
      'review_calendar_source_unavailable',
    );
  });
});
