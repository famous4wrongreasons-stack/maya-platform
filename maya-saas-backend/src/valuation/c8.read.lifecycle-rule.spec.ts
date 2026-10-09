import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { C8ResultRevision } from '@prisma/client';
import { C8ReadService } from './c8.read';
import { lifecycleStatement } from '../orchestration/c9.lifecycle-presentation';

// Actual C8 reader and Lifecycle presenter; finite in-memory persisted rows.
// No publication/computation, database, provider, model or action execution.
function fixture() {
  const row = {
    id: 'c8-result',
    tenantId: 'tenant',
    subjectKind: 'client',
    subjectId: 'PRIVATE_CLIENT',
    kind: 'POLICY_SIGNAL',
    state: 'PUBLISHED',
    qualification: 'VERIFIED',
    completeness: 'PARTIAL',
    basis: 'proven_attendance_policy',
    currency: null,
    ruleKey: 'c8.dormancy/cadence',
    ruleVersion: 1,
    policyRevisionId: 'PRIVATE_POLICY',
    policyContentHash: 'a'.repeat(64),
    scopeJson: { branchIds: [], serviceScope: [] },
    t0: new Date('2035-05-10T08:00:00.000Z'),
    periodFrom: new Date('2035-01-01T00:00:00.000Z'),
    periodTo: new Date('2035-05-10T08:00:00.000Z'),
    timezone: 'Europe/Moscow',
    expiresAt: new Date('2099-05-11T00:00:00.000Z'),
    snapshotHash: 'b'.repeat(64),
    revision: 1,
    rankingJson: null,
    valuesJson: { values: [{ key: 'cadence', value: true }] },
    reasonsJson: [],
  } as unknown as C8ResultRevision;
  const rule = {
    ruleKey: 'cadence',
    serviceScope: [] as string[],
    elapsed: { unit: 'day', count: 37 },
    comparison: 'gt',
    evidence: 'proven_attendance',
    minimumCoverage: 'PARTIAL',
  };
  const policy = {
    id: row.policyRevisionId,
    hash: row.policyContentHash,
    createdAt: new Date('2035-01-01T00:00:00.000Z'),
    content: {
      version: 1,
      valueMeasures: [],
      predictionTargets: [],
      dormancyRules: [rule],
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
  const viewer = {
    viewer: jest
      .fn()
      .mockResolvedValue({ role: 'tenant_owner', branchId: null }),
  };
  const tx = {
    c8ResultRevision: {
      findFirst: jest.fn().mockResolvedValue({ id: row.id }),
    },
  };
  const store = {
    transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(tx)),
    refsCurrent: jest.fn().mockResolvedValue(true),
  };
  const sources = { policy: jest.fn().mockResolvedValue(policy) };
  const find = jest
    .fn()
    .mockImplementation(
      (query: {
        where: { tenantId: string; id: string; expiresAt: { gt: Date } };
      }) => {
        expect(query.where.tenantId).toBe('tenant');
        expect(query.where.id).toBe(row.id);
        return Promise.resolve(
          row.expiresAt > query.where.expiresAt.gt ? row : null,
        );
      },
    );
  const context = {
    get: () => ({ role: 'tenant_owner' }),
    runAsSystemTenant: (tenant: string, fn: () => unknown) => {
      expect(tenant).toBe('tenant');
      return fn();
    },
  };
  const reader = new C8ReadService(
    { c8ResultRevision: { findFirst: find } } as never,
    context as never,
    viewer as never,
    store as never,
    sources as never,
    {} as never,
    {} as never,
  );
  return {
    row,
    rule,
    policy,
    viewer,
    store,
    sources,
    tx,
    reader,
    find,
    read: () => reader.snapshot('tenant', 'owner', row.id),
  };
}

describe('exact current C8 dormancy rule parameters', () => {
  it('projects the matched policy through the existing reader and explains its real threshold without private policy or client data', async () => {
    const f = fixture();
    const result = await f.read();
    expect(result.rule).toEqual({
      key: 'c8.dormancy/cadence',
      version: 1,
      parameters: {
        elapsed: { unit: 'day', count: 37 },
        comparison: 'gt',
        evidence: 'proven_attendance',
        minimumCoverage: 'PARTIAL',
        serviceScope: { restricted: false, count: 0 },
        timezone: 'Europe/Moscow',
      },
    });
    expect(f.sources.policy).toHaveBeenCalledTimes(1);
    expect(f.sources.policy).toHaveBeenCalledWith(f.tx);
    expect(f.store.refsCurrent).toHaveBeenCalledWith(f.row, f.tx);
    const text = lifecycleStatement(result);
    expect(text).toContain('37 дней');
    expect(text).toContain('строго после');
    expect(text).toContain('подтверждённого посещения');
    expect(text).toContain('допускает частичное');
    expect(JSON.stringify(result.rule) + text).not.toMatch(
      /PRIVATE_|policyContentHash|serviceIds/,
    );
    expect(result.boundaries.rankingImpliesContactPermission).toBe(false);
    expect(result.numericPrediction).toBeNull();
  });

  it('preserves inclusive calendar-month semantics, exact timezone and explicit service restriction without exposing IDs', async () => {
    const f = fixture();
    f.rule.elapsed = { unit: 'calendar_month', count: 2 };
    f.rule.comparison = 'gte';
    f.rule.minimumCoverage = 'COMPLETE';
    f.row.completeness = 'COMPLETE';
    f.rule.serviceScope = ['PRIVATE_SERVICE'];
    f.row.scopeJson = { branchIds: [], serviceScope: ['PRIVATE_SERVICE'] };
    const result = await f.read();
    expect(result.rule.parameters).toMatchObject({
      elapsed: { unit: 'calendar_month', count: 2 },
      comparison: 'gte',
      serviceScope: { restricted: true, count: 1 },
    });
    const text = lifecycleStatement(result);
    expect(text).toContain('2 календарных месяца');
    expect(text).toContain('включительно');
    expect(text).toContain('Europe/Moscow');
    expect(text).toContain('последним днём месяца');
    expect(text).toContain('требует полного');
    expect(JSON.stringify(result.rule) + text).not.toContain('PRIVATE_SERVICE');
  });

  it.each(['revision', 'hash', 'missing-rule', 'scope', 'version'])(
    'does not attach replacement policy parameters after %s changes',
    async (change) => {
      const f = fixture();
      if (change === 'revision') f.policy.id = 'new-policy';
      if (change === 'hash') f.policy.hash = 'c'.repeat(64);
      if (change === 'missing-rule') f.policy.content.dormancyRules = [];
      if (change === 'scope')
        f.row.scopeJson = { branchIds: [], serviceScope: ['other-service'] };
      if (change === 'version') f.row.ruleVersion = 2;
      const result = await f.read();
      expect(result.current).toBe(false);
      expect(result.available).toBe(false);
      expect(result.values).toEqual([]);
      expect(result.rule).not.toHaveProperty('parameters');
      expect(lifecycleStatement(result)).not.toContain('37');
    },
  );

  it.each(['stale', 'superseded', 'unpublished', 'unqualified', 'other-kind'])(
    'does not read policy parameters for %s results',
    async (state) => {
      const f = fixture();
      if (state === 'stale') f.store.refsCurrent.mockResolvedValue(false);
      if (state === 'superseded')
        f.tx.c8ResultRevision.findFirst.mockResolvedValue({
          id: 'newer-result',
        });
      if (state === 'unpublished') f.row.state = 'PENDING';
      if (state === 'unqualified') f.row.qualification = 'UNQUALIFIED';
      if (state === 'other-kind') f.row.kind = 'OBSERVED_VALUE';
      const result = await f.read();
      expect(result.rule).not.toHaveProperty('parameters');
      expect(f.sources.policy).not.toHaveBeenCalled();
    },
  );

  it('refuses expired and foreign tenant/branch rows before reading policy', async () => {
    const expired = fixture();
    expired.row.expiresAt = new Date('2000-01-01T00:00:00.000Z');
    await expect(expired.read()).rejects.toBeInstanceOf(NotFoundException);
    expect(expired.sources.policy).not.toHaveBeenCalled();
    const foreign = fixture();
    foreign.row.tenantId = 'other-tenant';
    await expect(foreign.read()).rejects.toThrow('c8_tenant_scope_denied');
    expect(foreign.sources.policy).not.toHaveBeenCalled();
    const branch = fixture();
    branch.viewer.viewer.mockResolvedValue({
      role: 'tenant_owner',
      branchId: 'other-branch',
    });
    await expect(branch.read()).rejects.toThrow('c8_branch_scope_denied');
    expect(branch.sources.policy).not.toHaveBeenCalled();
  });

  it('rejects revocation during the policy read before any explanation is exposed', async () => {
    const f = fixture();
    f.sources.policy.mockImplementation(() => {
      f.viewer.viewer.mockRejectedValue(new ForbiddenException('revoked'));
      return Promise.resolve(f.policy);
    });
    await expect(f.read()).rejects.toThrow('revoked');
    expect(f.sources.policy).toHaveBeenCalledTimes(1);
  });

  it('withholds parameters when the snapshot expires while awaiting its exact policy', async () => {
    const f = fixture();
    f.sources.policy.mockImplementation(() => {
      f.row.expiresAt = new Date('2000-01-01T00:00:00.000Z');
      return Promise.resolve(f.policy);
    });
    await expect(f.read()).rejects.toThrow('c8_result_unavailable');
    expect(f.sources.policy).toHaveBeenCalledTimes(1);
  });

  it('does not substitute defaults for an invalid or unavailable confirmed policy', async () => {
    const invalid = fixture();
    invalid.rule.elapsed.count = 0;
    await expect(invalid.read()).rejects.toThrow('c8_policy_integer');
    const unavailable = fixture();
    unavailable.sources.policy.mockRejectedValue(
      new Error('c8_confirmed_policy_unavailable'),
    );
    await expect(unavailable.read()).rejects.toThrow(
      'c8_confirmed_policy_unavailable',
    );
  });
});
