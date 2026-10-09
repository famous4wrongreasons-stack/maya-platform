import { ForbiddenException } from '@nestjs/common';
import type { C8ResultRevision } from '@prisma/client';
import { C8ReadService } from './c8.read';

// Actual reader, policy parser and explanation. Only persistence/current ACL
// ports are finite in-memory doubles; no database, model, provider or mutation.
const PERIOD = 'more_than_two_months' as const;
type Rule = {
  ruleKey: string;
  serviceScope: string[];
  elapsed: { unit: 'day' | 'calendar_month'; count: number };
  comparison: 'gt' | 'gte';
  evidence: 'proven_attendance';
  minimumCoverage: 'COMPLETE' | 'PARTIAL';
};
type Query = { where: Record<string, unknown>; take?: number };

function rule(ruleKey = 'two_months', patch: Partial<Rule> = {}): Rule {
  return {
    ruleKey,
    serviceScope: [],
    elapsed: { unit: 'calendar_month', count: 2 },
    comparison: 'gt',
    evidence: 'proven_attendance',
    minimumCoverage: 'PARTIAL',
    ...patch,
  };
}

function row(id: string, patch: Partial<C8ResultRevision> = {}) {
  return {
    id,
    tenantId: 'tenant',
    subjectKind: 'client',
    subjectId: 'PRIVATE_CLIENT_' + id,
    kind: 'POLICY_SIGNAL',
    state: 'PUBLISHED',
    qualification: 'VERIFIED',
    completeness: 'PARTIAL',
    basis: 'proven_attendance_policy',
    currency: null,
    ruleKey: 'c8.dormancy/two_months',
    ruleVersion: 1,
    policyRevisionId: 'PRIVATE_POLICY',
    policyContentHash: 'a'.repeat(64),
    scopeJson: { branchIds: [], serviceScope: [] },
    t0: new Date('2035-05-10T08:00:00.000Z'),
    admittedAt: new Date('2035-05-10T08:01:00.000Z'),
    periodFrom: new Date('2035-01-01T00:00:00.000Z'),
    periodTo: new Date('2035-05-10T08:00:00.000Z'),
    timezone: 'Europe/Moscow',
    expiresAt: new Date('2099-05-11T00:00:00.000Z'),
    snapshotHash: 'b'.repeat(64),
    revision: 1,
    horizonEnd: null,
    rankingJson: null,
    valuesJson: { values: [{ key: 'two_months', value: true }] },
    reasonsJson: [],
    ...patch,
  } as C8ResultRevision;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('synthetic_query_shape');
  return value as Record<string, unknown>;
}

// Small relational fake applies the actual WHERE before TAKE. It does not know
// which policy/rule is correct, so removing the production filter exposes newer
// decoys and fails the test instead of returning a preselected golden result.
function matches(
  value: C8ResultRevision,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, expected]): boolean => {
    if (key === 'AND' || key === 'OR') {
      if (!Array.isArray(expected)) throw new Error('synthetic_query_boolean');
      const clauses: unknown[] = expected;
      return key === 'AND'
        ? clauses.every((clause) => matches(value, object(clause)))
        : clauses.some((clause) => matches(value, object(clause)));
    }
    const actual = object(value)[key];
    if (key === 'scopeJson') {
      const filter = object(expected);
      const path = filter.path;
      const observed = Array.isArray(path)
        ? (path as unknown[]).reduce<unknown>(
            (current, part) => object(current)[String(part)],
            actual,
          )
        : actual;
      return JSON.stringify(observed) === JSON.stringify(filter.equals);
    }
    if (key === 'expiresAt') {
      const gt = object(expected).gt;
      if (!(actual instanceof Date) || !(gt instanceof Date))
        throw new Error('synthetic_query_expiry');
      return actual > gt;
    }
    if (expected && typeof expected === 'object') {
      const filter = object(expected);
      if (Array.isArray(filter.in)) return filter.in.includes(actual);
      throw new Error('synthetic_query_operator');
    }
    return actual === expected;
  });
}

function fixture(rows = [row('result')], rules = [rule()]) {
  const policy = {
    id: 'PRIVATE_POLICY',
    hash: 'a'.repeat(64),
    createdAt: new Date('2035-01-01T00:00:00.000Z'),
    content: {
      version: 1,
      valueMeasures: [],
      predictionTargets: [],
      dormancyRules: rules,
      rankingObjectives: [],
      minimumEvidence: [],
      exclusions: {
        serviceScope: [],
        branchIds: [],
        subjectStates: [],
        requiredFeatures: [],
      },
      opportunityAdmission: { enabled: false, rules: [] },
      modelUse: [],
    },
  };
  const member: { role: string; branchId: string | null } = {
    role: 'tenant_owner',
    branchId: null,
  };
  const viewer = {
    viewer: jest
      .fn<Promise<typeof member>, [string, string, string]>()
      .mockResolvedValue(member),
  };
  const queryRows = (query: Query) =>
    rows
      .filter((value) => matches(value, query.where))
      .sort(
        (a, b) =>
          b.admittedAt.getTime() - a.admittedAt.getTime() ||
          b.id.localeCompare(a.id),
      );
  const findMany = jest
    .fn<Promise<C8ResultRevision[]>, [Query]>()
    .mockImplementation((query) =>
      Promise.resolve(queryRows(query).slice(0, query.take)),
    );
  const findFirst = jest
    .fn<Promise<C8ResultRevision | null>, [Query]>()
    .mockImplementation((query) =>
      Promise.resolve(queryRows(query)[0] ?? null),
    );
  const tx = {
    tenantBusinessConfigurationRevision: {
      findFirst: jest
        .fn<Promise<{ encryptedContent: string } | null>, [unknown]>()
        .mockResolvedValue({ encryptedContent: 'SYNTHETIC_PUBLISHED_POLICY' }),
    },
    c8ResultRevision: {
      findFirst: jest
        .fn<Promise<{ id: string } | null>, [Query]>()
        .mockImplementation((query) => {
          const current = queryRows(query)[0];
          return Promise.resolve(current ? { id: current.id } : null);
        }),
    },
  };
  const store = {
    transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    refsCurrent: jest
      .fn<Promise<boolean>, [C8ResultRevision, typeof tx]>()
      .mockResolvedValue(true),
  };
  const sources = {
    policy: jest
      .fn<Promise<typeof policy>, [typeof tx]>()
      .mockResolvedValue(policy),
  };
  const context = {
    get: () => ({ role: member.role }),
    runAsSystemTenant: (tenant: string, fn: () => unknown) => {
      expect(tenant).toBe('tenant');
      return fn();
    },
  };
  const reader = new C8ReadService(
    { c8ResultRevision: { findMany, findFirst } } as never,
    context as never,
    viewer as never,
    store as never,
    sources as never,
    {} as never,
    {} as never,
  );
  return {
    rows,
    rules,
    policy,
    member,
    viewer,
    tx,
    store,
    sources,
    findMany,
    findFirst,
    reader,
    list: () => reader.listDormancy('tenant', 'owner', PERIOD),
    snapshot: (id = rows[0].id) =>
      reader.snapshotDormancy('tenant', 'owner', id, PERIOD),
  };
}

describe('C8 exact more-than-two-calendar-month READ', () => {
  it('filters current policy, exact rule and tenant-wide raw scope before the three-result page limit', async () => {
    const decoys = [0, 1, 2, 3].map((i) =>
      row('newer-' + i, {
        ruleKey: 'c8.dormancy/sixty_days',
        admittedAt: new Date('2035-05-11T08:00:00.000Z'),
      }),
    );
    const f = fixture(
      [...decoys, row('matching')],
      [rule('sixty_days', { elapsed: { unit: 'day', count: 60 } }), rule()],
    );
    const result = await f.list();
    expect(result.items.map((item) => item.id)).toEqual(['matching']);
    expect(result.nextCursor).toBeNull();
    expect(f.findMany).toHaveBeenCalledTimes(1);
    const query = f.findMany.mock.calls[0][0];
    expect(query.take).toBe(4);
    expect(query.where).toMatchObject({
      tenantId: 'tenant',
      kind: 'POLICY_SIGNAL',
      subjectKind: 'client',
    });
    expect(query.where.AND).toContainEqual({
      state: 'PUBLISHED',
      qualification: 'VERIFIED',
      basis: 'proven_attendance_policy',
      policyRevisionId: f.policy.id,
      policyContentHash: f.policy.hash,
      ruleKey: { in: ['c8.dormancy/two_months'] },
      AND: [
        { scopeJson: { path: ['branchIds'], equals: [] } },
        { scopeJson: { path: ['serviceScope'], equals: [] } },
      ],
    });
  });

  it('admits both matching rules and preserves current false alongside true without creating action authority', async () => {
    const f = fixture(
      [
        row('true', { ruleKey: 'c8.dormancy/first' }),
        row('false', {
          ruleKey: 'c8.dormancy/second',
          valuesJson: { values: [{ key: 'second', value: false }] },
        }),
      ],
      [rule('first'), rule('second')],
    );
    const result = await f.list();
    expect(result.items.map((item) => item.id).sort()).toEqual([
      'false',
      'true',
    ]);
    expect(result.items.find((item) => item.id === 'false')?.values).toEqual([
      { key: 'second', value: false },
    ]);
    for (const item of result.items) {
      expect(item.current).toBe(true);
      expect(item.available).toBe(true);
      expect(item.rule.parameters).toMatchObject({
        elapsed: { unit: 'calendar_month', count: 2 },
        comparison: 'gt',
        evidence: 'proven_attendance',
        serviceScope: { restricted: false, count: 0 },
      });
      expect(item.boundaries.rankingImpliesContactPermission).toBe(false);
      expect(item.boundaries.rankingImpliesActionAuthority).toBe(false);
      expect(item.numericPrediction).toBeNull();
      expect(JSON.stringify(item.rule)).not.toContain('PRIVATE_');
    }
    expect((await f.snapshot('false')).values).toEqual([
      { key: 'second', value: false },
    ]);
  });

  it('retains the bounded three-result page and sentinel without admitting every exact-rule row', async () => {
    const f = fixture([row('a'), row('b'), row('c'), row('d'), row('e')]);
    const result = await f.list();
    expect(result.items.map((item) => item.id)).toEqual(['e', 'd', 'c']);
    expect(result.nextCursor).toBe('c');
    expect(f.store.refsCurrent).toHaveBeenCalledTimes(3);
    expect(result.numericPredictionsAvailable).toBe(false);
  });

  it.each(['day-60', 'gte', 'one-month', 'service-rule'])(
    'does not reinterpret %s as the requested rule',
    async (change) => {
      const f = fixture();
      if (change === 'day-60') f.rules[0].elapsed = { unit: 'day', count: 60 };
      if (change === 'gte') f.rules[0].comparison = 'gte';
      if (change === 'one-month') f.rules[0].elapsed.count = 1;
      if (change === 'service-rule') {
        f.rules[0].serviceScope = ['private-service'];
        f.rows[0].scopeJson = {
          branchIds: [],
          serviceScope: ['private-service'],
        };
      }
      expect((await f.list()).items).toEqual([]);
      await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
    },
  );

  it.each([
    'branch',
    'services',
    'missing-branches',
    'missing-services',
    'malformed-branches',
  ])(
    'rejects %s raw scope on both discovery and exact snapshot',
    async (change) => {
      const f = fixture();
      if (change === 'branch')
        f.rows[0].scopeJson = { branchIds: ['branch'], serviceScope: [] };
      if (change === 'services')
        f.rows[0].scopeJson = {
          branchIds: [],
          serviceScope: ['private-service'],
        };
      if (change === 'missing-branches')
        f.rows[0].scopeJson = { serviceScope: [] };
      if (change === 'missing-services')
        f.rows[0].scopeJson = { branchIds: [] };
      if (change === 'malformed-branches')
        f.rows[0].scopeJson = { branchIds: 'branch', serviceScope: [] };
      expect((await f.list()).items).toEqual([]);
      await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
    },
  );

  it.each([
    'policy-id',
    'policy-hash',
    'missing-rule',
    'rule-version',
    'unpublished',
    'unqualified',
    'stale',
    'superseded',
  ])(
    'withholds %s result rather than attaching replacement parameters',
    async (change) => {
      const f = fixture();
      if (change === 'policy-id') f.policy.id = 'replacement-policy';
      if (change === 'policy-hash') f.policy.hash = 'c'.repeat(64);
      if (change === 'missing-rule') f.policy.content.dormancyRules = [];
      if (change === 'rule-version') f.rows[0].ruleVersion = 2;
      if (change === 'unpublished') f.rows[0].state = 'PENDING';
      if (change === 'unqualified') f.rows[0].qualification = 'UNQUALIFIED';
      if (change === 'stale') f.store.refsCurrent.mockResolvedValue(false);
      if (change === 'superseded')
        f.tx.c8ResultRevision.findFirst.mockResolvedValue({
          id: 'newer-revision',
        });
      expect((await f.list()).items).toEqual([]);
      await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
    },
  );

  it('requires the configured COMPLETE evidence and never upgrades PARTIAL coverage', async () => {
    const f = fixture();
    f.rules[0].minimumCoverage = 'COMPLETE';
    expect((await f.list()).items).toEqual([]);
    await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
    f.rows[0].completeness = 'COMPLETE';
    expect((await f.snapshot()).rule.parameters?.minimumCoverage).toBe(
      'COMPLETE',
    );
  });

  it('returns no items when there is no configured policy and does not invoke a default policy read', async () => {
    const f = fixture();
    f.tx.tenantBusinessConfigurationRevision.findFirst.mockResolvedValue(null);
    expect((await f.list()).items).toEqual([]);
    expect(f.sources.policy).not.toHaveBeenCalled();
  });

  it('returns no items for no published results and refuses a missing exact snapshot', async () => {
    const f = fixture([]);
    expect((await f.list()).items).toEqual([]);
    await expect(f.snapshot('missing')).rejects.toThrow(
      'c8_result_unavailable',
    );
    expect(f.store.refsCurrent).not.toHaveBeenCalled();
  });

  it('withholds an originally matching row when policy changes between query binding and presentation', async () => {
    const f = fixture();
    f.sources.policy
      .mockImplementationOnce(() => Promise.resolve(f.policy))
      .mockImplementation(() =>
        Promise.resolve({
          ...f.policy,
          id: 'replacement-policy',
          hash: 'c'.repeat(64),
        }),
      );
    expect((await f.list()).items).toEqual([]);
    expect(f.findMany).toHaveBeenCalledTimes(1);
    expect(f.sources.policy).toHaveBeenCalledTimes(2);
  });

  it('does not broaden a branch-restricted actor to tenant-wide dormant clients', async () => {
    const f = fixture();
    f.member.branchId = 'branch';
    expect((await f.list()).items).toEqual([]);
    await expect(f.snapshot()).rejects.toThrow('c8_branch_scope_denied');
    expect(f.store.refsCurrent).not.toHaveBeenCalled();
  });

  it('excludes foreign tenant rows and rejects a wrong-tenant row even if a faulty persistence port returns it', async () => {
    const f = fixture([row('foreign', { tenantId: 'foreign-tenant' })]);
    expect((await f.list()).items).toEqual([]);
    await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
    f.findFirst.mockResolvedValue(f.rows[0]);
    await expect(f.snapshot()).rejects.toThrow('c8_tenant_scope_denied');
    expect(f.store.refsCurrent).not.toHaveBeenCalled();
  });

  it.each(['list', 'snapshot'] as const)(
    'propagates revoked current access during %s without returning facts',
    async (operation) => {
      const f = fixture();
      f.sources.policy.mockImplementation(() => {
        f.viewer.viewer.mockRejectedValue(new ForbiddenException('revoked'));
        return Promise.resolve(f.policy);
      });
      await expect(f[operation]()).rejects.toThrow('revoked');
    },
  );

  it('rejects expiry both before lookup and during the exact policy await', async () => {
    const expired = fixture([
      row('expired', { expiresAt: new Date('2000-01-01T00:00:00.000Z') }),
    ]);
    expect((await expired.list()).items).toEqual([]);
    await expect(expired.snapshot()).rejects.toThrow('c8_result_unavailable');
    expect(expired.store.refsCurrent).not.toHaveBeenCalled();
    const late = fixture();
    late.sources.policy.mockImplementation(() => {
      late.rows[0].expiresAt = new Date('2000-01-01T00:00:00.000Z');
      return Promise.resolve(late.policy);
    });
    await expect(late.snapshot()).rejects.toThrow('c8_result_unavailable');
  });

  it('rejects a noncanonical request period before source or ACL reads', async () => {
    const f = fixture();
    await expect(
      f.reader.listDormancy('tenant', 'owner', '60_days' as typeof PERIOD),
    ).rejects.toThrow('c8_invalid_dormancy_period');
    await expect(
      f.reader.snapshotDormancy(
        'tenant',
        'owner',
        'result',
        'two_months' as typeof PERIOD,
      ),
    ).rejects.toThrow('c8_invalid_dormancy_period');
    expect(f.viewer.viewer).not.toHaveBeenCalled();
    expect(f.findMany).not.toHaveBeenCalled();
    expect(f.findFirst).not.toHaveBeenCalled();
    expect(f.sources.policy).not.toHaveBeenCalled();
  });
});
