import { MeasurementReadService } from './measurement.read.service';
import { MeasurementService } from './measurement.service';
import { MeasurementSources } from './measurement.sources';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  presentMeasurement,
  measurementForAi,
  measurementMoney,
} from './measurement.presentation';
import {
  normalizeMeasurement,
  MeasurementResult,
} from './measurement.contract';

const result: MeasurementResult = {
  sources: [],
  dependencies: [],
  metrics: [
    {
      key: 'net_profit',
      dimensions: {},
      unit: 'money_minor',
      currency: 'RUB',
      basis: 'confirmed_net',
      state: 'NOT_MEASURED',
      value: null,
      sourceRefs: [],
    },
  ],
  reasons: ['refund_support_unknown'],
  completeness: 'NOT_MEASURED',
  qualification: 'UNQUALIFIED',
  attributionStatus: 'NOT_APPLICABLE',
  creditedExecutionId: null,
  creditedAttemptId: null,
};
const query = {
  kind: 'business_period' as const,
  from: '2026-09-01T00:00:00Z',
  to: '2026-09-02T00:00:00Z',
};
function fixture() {
  const ctx = new TenantContextService();
  const member = {
    id: 'm',
    role: 'tenant_owner',
    status: 'active',
    branchId: null as string | null,
    user: { status: 'active' },
    tenant: {
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  };
  const db = {
    membership: { findUnique: jest.fn(() => Promise.resolve(member)) },
    crmIntegration: { findUnique: jest.fn(() => Promise.resolve(null)) },
    staff: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'staff-a' }])),
      findUnique: jest.fn(() =>
        Promise.resolve({
          active: true,
          userId: 'actor',
          branchId: null,
        }),
      ),
    },
    appointment: { findFirst: jest.fn() },
    measurementRevision: { findFirst: jest.fn() },
  };
  const entitlements = {
    resolveFeatureRequirements: jest.fn(() =>
      Promise.resolve({ allowed: true }),
    ),
  };
  const engine = {
    observe: jest.fn(() => Promise.resolve(result)),
    admit: jest.fn(),
    resume: jest.fn(),
  };
  const sources = { authorizeReceipt: jest.fn() };
  Object.assign(db, {
    $transaction: (work: (tx: unknown) => unknown) => Promise.resolve(work(db)),
    $executeRaw: jest.fn(),
  });
  const reader = new MeasurementReadService(
    db as unknown as PrismaService,
    ctx,
    entitlements as unknown as EntitlementsService,
    engine as unknown as MeasurementService,
    sources as unknown as MeasurementSources,
  );
  const run = <T>(f: () => T, role = member.role) =>
    ctx.run('test', () => {
      ctx.setResolvedTenant({
        tenantId: 'tenant-a',
        userId: 'actor',
        membershipId: 'm',
        role,
        source: 'membership',
      });
      return f();
    });
  return { db, member, engine, reader, entitlements, run };
}
describe('C7 P06 measurement read authority and projection', () => {
  it('returns one live typed result without admission or creating a business action', async () => {
    const f = fixture();
    const actual = await f.run(() => f.reader.read('tenant-a', 'actor', query));
    expect(actual.mode).toBe('live');
    expect(actual.revisionId).toBeNull();
    expect(actual.metrics[0].value).toBeNull();
    expect(f.engine.admit).not.toHaveBeenCalled();
    expect(f.engine.resume).not.toHaveBeenCalled();
    expect(f.db.membership.findUnique).toHaveBeenCalledTimes(2);
  });
  it.each(['manager', 'staff', 'provider'])(
    '%s has no implicit company finance authority',
    async (role) => {
      const f = fixture();
      f.member.role = role;
      await expect(
        f.run(() => f.reader.read('tenant-a', 'actor', query)),
      ).rejects.toThrow('measurement_capability_denied');
      expect(f.engine.observe).not.toHaveBeenCalled();
    },
  );
  it('requires exact request tenant and authenticated principal', async () => {
    const f = fixture();
    await expect(
      f.run(() => f.reader.read('tenant-b', 'actor', query)),
    ).rejects.toThrow('measurement_authenticated_principal_required');
    await expect(
      f.run(() => f.reader.read('tenant-a', 'other', query)),
    ).rejects.toThrow('measurement_authenticated_principal_required');
    expect(f.engine.observe).not.toHaveBeenCalled();
  });
  it('revocation while source is read prevents response and the next retry', async () => {
    const f = fixture();
    f.engine.observe.mockImplementation(() => {
      f.member.status = 'revoked';
      return Promise.resolve(result);
    });
    await expect(
      f.run(() => f.reader.read('tenant-a', 'actor', query)),
    ).rejects.toThrow('measurement_membership_revoked');
    await expect(
      f.run(() => f.reader.read('tenant-a', 'actor', query)),
    ).rejects.toThrow('measurement_membership_revoked');
    expect(f.engine.observe).toHaveBeenCalledTimes(1);
  });
  it('feature revocation also prevents disclosure, even with unchanged membership', async () => {
    const f = fixture();
    f.entitlements.resolveFeatureRequirements
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    await expect(
      f.run(() => f.reader.read('tenant-a', 'actor', query)),
    ).rejects.toThrow('measurement_feature_denied');
  });
  it('branch restriction cannot turn into company finance scope', async () => {
    const f = fixture();
    f.member.branchId = 'branch-a';
    await expect(
      f.run(() =>
        f.reader.read('tenant-a', 'actor', { ...query, branchId: 'branch-b' }),
      ),
    ).rejects.toThrow('measurement_branch_scope_denied');
    expect(f.engine.observe).not.toHaveBeenCalled();
  });
  it('a staff reader cannot choose a colleague or private owner configuration', async () => {
    const f = fixture();
    f.member.role = 'staff';
    f.db.staff.findUnique.mockResolvedValue({
      active: true,
      userId: 'colleague',
      branchId: null,
    });
    await expect(
      f.run(() =>
        f.reader.read('tenant-a', 'actor', {
          ...query,
          kind: 'staff_goal',
          staffId: 'staff-b',
        }),
      ),
    ).rejects.toThrow('measurement_staff_scope_denied');
    expect(f.engine.observe).not.toHaveBeenCalled();
  });
  it('unknown transport/source/SQL/result parameters do not enter the core', async () => {
    const f = fixture();
    await expect(
      f.run(() =>
        f.reader.read('tenant-a', 'actor', {
          ...query,
          sql: 'select *',
        } as typeof query),
      ),
    ).rejects.toThrow('measurement_read_query_invalid');
    expect(f.engine.observe).not.toHaveBeenCalled();
  });
  it('snapshot address remains exact and cannot select current or another tenant', async () => {
    const f = fixture();
    const intent = normalizeMeasurement({
      kind: 'business_period',
      periodFrom: new Date(query.from),
      periodTo: new Date(query.to),
      asOf: new Date(query.to),
      timezone: 'UTC',
      scope: {
        version: 1,
        capabilityKey: 'analytics.business.finance.read',
        branchIds: [],
        dimensions: {},
        sourceQuery: {
          provider: 'internal',
          queryContract: 'c7.finance.read.v1',
        },
      },
    });
    const row = {
      ...intent,
      tenantId: 'tenant-a',
      id: 'snapshot-a',
      state: 'PUBLISHED',
      snapshotHash: 'a'.repeat(64),
      revision: 2,
      expiresAt: new Date('2099-01-01'),
      scopeJson: intent.scope,
      evidenceRefsJson: { sources: [], dependencies: [] },
      valuesJson: { metrics: result.metrics },
      limitationsJson: { reasons: result.reasons },
      completeness: result.completeness,
      qualification: result.qualification,
      attributionStatus: result.attributionStatus,
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
    f.db.measurementRevision.findFirst.mockResolvedValue(row);
    const actual = await f.run(() =>
      f.reader.snapshot('tenant-a', 'actor', row.id),
    );
    expect(actual.mode).toBe('as_reported');
    expect(actual.snapshotHash).toBe(row.snapshotHash);
    expect(actual.asOf).toBe(intent.asOf.toISOString());
    expect(f.engine.observe).not.toHaveBeenCalled();
    for (const [arg] of f.db.measurementRevision.findFirst.mock.calls)
      expect((arg as { where: unknown }).where).toMatchObject({
        tenantId: 'tenant-a',
        id: 'snapshot-a',
        state: 'PUBLISHED',
      });
  });
  it('shared presentation preserves null and currencies while removing prompt identifiers', () => {
    const intent = normalizeMeasurement({
      kind: 'business_period',
      periodFrom: new Date(query.from),
      periodTo: new Date(query.to),
      asOf: new Date(query.to),
      timezone: 'UTC',
      scope: {
        version: 1,
        capabilityKey: 'analytics.business.finance.read',
        branchIds: [],
        dimensions: {},
        sourceQuery: {},
      },
    });
    const raw = {
      ...result,
      metrics: [
        ...result.metrics,
        {
          key: 'observed_expense',
          dimensions: {
            serviceId: 'PRIVATE_CONTACT',
            accountId: 'private-source-id',
          },
          unit: 'money_minor',
          currency: 'USD',
          basis: 'observed_expense',
          state: 'PARTIAL' as const,
          value: '100',
          sourceRefs: [],
        },
      ],
    };
    const presented = presentMeasurement('tenant-a', intent, raw);
    expect(measurementMoney(presented, 'net_profit')).toEqual([]);
    expect(measurementMoney(presented, 'observed_expense')).toEqual([
      { currency: 'USD', amount_kopecks: 100 },
    ]);
    const ai = measurementForAi(presented);
    expect(JSON.stringify(ai)).not.toMatch(
      /PRIVATE_CONTACT|private-source-id|sourceRefs|evidenceRefs/,
    );
    expect(ai.metrics.map((m) => m.value)).toEqual(
      presented.metrics.map((m) => m.value),
    );
  });
});

describe('C7 P06 additional privacy and monthly-goal boundary', () => {
  it('an open monthly target is explicit full-month/asOf, not a silently rebased target', async () => {
    const f = fixture();
    const read = jest.spyOn(f.reader, 'readPeriod');
    await f.run(() =>
      f.reader.teamGoals('tenant-a', 'actor', {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-12T12:00:00Z',
      }),
    );
    expect(read).toHaveBeenCalledWith(
      'tenant-a',
      'actor',
      'staff_goal',
      { from: '2026-09-01T00:00:00Z', to: '2026-09-30T23:59:59.999Z' },
      { staffId: 'staff-a' },
    );
    expect(f.engine.observe.mock.calls[0][0].asOf).toBeInstanceOf(Date);
  });
  it('a non-monthly target query stays explicitly unavailable without source work', async () => {
    const f = fixture();
    const response = await f.run(() =>
      f.reader.teamGoals('tenant-a', 'actor', {
        from: '2026-09-10T00:00:00Z',
        to: '2026-09-12T12:00:00Z',
      }),
    );
    expect(response.items).toEqual([]);
    expect(response.limitations).toContain(
      'staff_goal_requires_single_local_calendar_month',
    );
    expect(f.engine.observe).not.toHaveBeenCalled();
  });
  it('raw category labels/identifiers do not enter AI, independently of their field name', () => {
    const intent = normalizeMeasurement({
      kind: 'business_period',
      periodFrom: new Date(query.from),
      periodTo: new Date(query.to),
      asOf: new Date(query.to),
      timezone: 'UTC',
      scope: {
        version: 1,
        capabilityKey: 'measurement.read',
        branchIds: [],
        dimensions: {},
        sourceQuery: {},
      },
    });
    const view = presentMeasurement('tenant-a', intent, {
      ...result,
      metrics: [
        {
          key: 'expense_category_raw',
          unit: 'label',
          basis: 'source_labelled',
          currency: null,
          value: 'PRIVATE_NAME',
          state: 'PARTIAL',
          dimensions: {},
          sourceRefs: [],
        },
        {
          key: 'review_count',
          unit: 'count',
          basis: 'observed',
          currency: null,
          value: '2',
          state: 'PARTIAL',
          dimensions: { source: 'PRIVATE_ACCOUNT' },
          sourceRefs: [],
        },
      ],
    });
    const ai = measurementForAi(view);
    expect(JSON.stringify(ai)).not.toContain('PRIVATE');
    expect(ai.metrics).toHaveLength(1);
    expect(ai.metrics[0].dimensions).toEqual({ source: 'source_group_1' });
  });
});
