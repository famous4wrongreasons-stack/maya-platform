import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { C8ResultRevision, Prisma } from '@prisma/client';
import type { C8Ref } from './c8.contract';
import { C8Store } from './c8.store';
import { C8ReadService } from './c8.read';

// Actual C8Store.refsCurrent, calendar guard, dependency recursion and reader.
// SQL/ACL/configuration ports are synthetic; no real transaction, encryption,
// database, external source, publication or historical row rewrite is proved.
const GAP = '2026-01-08T07:30:45.123Z';
const FOLD = '2026-09-01T05:30:45.123Z';
const UNIQUE = '2026-01-08T17:30:45.123Z';

function fixture(lastVisit = UNIQUE) {
  const at = new Date('2026-11-02T12:00:00.000Z');
  const ref = {
    owner: 'MeasurementRevision',
    tenantId: 'tenant',
    id: 'measurement',
    revisionOrStateHash: 'a'.repeat(64),
    observedAt: at.toISOString(),
    asOf: at.toISOString(),
    qualification: 'VERIFIED',
    coverage: 'PARTIAL',
    expiresAt: '2099-01-01T00:00:00.000Z',
  } satisfies C8Ref;
  const feature = {
    key: 'last_proven_visit_at',
    value: lastVisit as string | null,
    unit: 'instant',
    basis: 'proven_attendance',
    currency: null as string | null,
    sourceRefs: [ref],
  };
  const row: C8ResultRevision = {
    id: 'result',
    tenantId: 'tenant',
    kind: 'POLICY_SIGNAL',
    subjectKind: 'client',
    subjectId: 'synthetic-client',
    identityHash: 'd'.repeat(64),
    intentHash: 'e'.repeat(64),
    contractVersion: 1,
    ruleKey: 'c8.dormancy/two_months',
    ruleVersion: 1,
    modelVersionId: null,
    modelManifestHash: null,
    policyRevisionId: 'policy',
    policyContentHash: 'b'.repeat(64),
    t0: at,
    periodFrom: new Date(lastVisit),
    periodTo: at,
    timezone: 'America/New_York',
    horizonEnd: null,
    scopeJson: { branchIds: [], serviceScope: [] },
    basis: 'proven_attendance_policy',
    currency: null,
    completeness: 'PARTIAL',
    qualification: 'VERIFIED',
    eligibility: 'ELIGIBLE',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    state: 'PUBLISHED',
    revision: 1,
    snapshotHash: 'c'.repeat(64),
    inputHash: 'f'.repeat(64),
    admittedAt: at,
    publishedAt: at,
    leaseGeneration: 1,
    leaseTokenHash: null,
    leaseExpiresAt: null,
    uncertaintyJson: null,
    valuesJson: {
      version: 1,
      values: [{ key: 'two_months', type: 'policy', value: true }],
      limitations: [],
    },
    reasonsJson: [{ code: 'confirmed_dormancy_rule_met' }],
    rankingJson: null,
    evidenceRefsJson: [ref],
    inputSnapshotJson: {
      version: 1,
      features: [feature],
      missingness: [],
      coverage: { version: 1, state: 'PARTIAL', queries: [] },
      dependencies: [],
    },
  };
  const rule = {
    ruleKey: 'two_months',
    serviceScope: [] as string[],
    elapsed: { unit: 'calendar_month', count: 2 },
    comparison: 'gt',
    evidence: 'proven_attendance',
    minimumCoverage: 'PARTIAL',
  };
  const content = {
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
  };
  const header: {
    id: string;
    contentHash: string;
    encryptedContent: string | null;
  } = {
    id: row.policyRevisionId,
    contentHash: row.policyContentHash,
    encryptedContent: 'SYNTHETIC_CANONICAL_POLICY',
  };
  const configuration = {
    namespace: 'c8_valuation',
    revision: 1,
    previousRevisionId: header.id,
    content,
  };
  const state = { active: true, hasPolicy: true, refsValid: true };
  const rows = new Map([[row.id, row]]);
  const statements: string[] = [];
  const queryRaw = jest
    .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
    .mockImplementation((parts, ...values) => {
      const sql = parts.join('?');
      statements.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) {
        expect(values).toEqual([
          'tenant:p5-wave1:setting:tenant-config:c8_valuation',
        ]);
        return Promise.resolve([]);
      }
      expect(values[0]).toBe('tenant');
      if (sql.startsWith('SELECT id FROM "Tenant"'))
        return Promise.resolve(state.active ? [{ id: 'tenant' }] : []);
      if (sql.includes('FROM "TenantBusinessConfigurationRevision"'))
        return Promise.resolve(state.hasPolicy ? [header] : []);
      if (sql.includes('"C8_validate_refs"'))
        return Promise.resolve([{ valid: state.refsValid }]);
      throw new Error('unexpected_synthetic_read');
    });
  type FindQuery = {
    where: {
      tenantId: string;
      id?: string;
      expiresAt?: { gt: Date };
      subjectId?: string;
      ruleKey?: string;
    };
  };
  const findFirst = jest
    .fn<Promise<C8ResultRevision | null>, [FindQuery]>()
    .mockImplementation(({ where }) => {
      const candidate = where.id
        ? rows.get(where.id)
        : [...rows.values()].find(
            (value) =>
              value.subjectId === where.subjectId &&
              value.ruleKey === where.ruleKey,
          );
      return Promise.resolve(
        candidate &&
          candidate.tenantId === where.tenantId &&
          (!where.expiresAt || candidate.expiresAt > where.expiresAt.gt)
          ? candidate
          : null,
      );
    });
  const executeRaw = jest
    .fn<Promise<number>, [TemplateStringsArray]>()
    .mockImplementation((parts) => {
      expect(parts.join('')).toBe("SET LOCAL TIME ZONE 'UTC'");
      return Promise.resolve(0);
    });
  const ports = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    c8ResultRevision: { findFirst },
  };
  const tx = ports as unknown as Prisma.TransactionClient;
  const db = {
    c8ResultRevision: { findFirst },
    $transaction: jest.fn(
      (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        work(tx),
    ),
  };
  const context = {
    get: () => ({ tenantId: 'tenant', source: 'system', role: 'tenant_owner' }),
    runAsSystemTenant: (tenantId: string, work: () => unknown) => {
      expect(tenantId).toBe('tenant');
      return work();
    },
  };
  const governed = {
    configuration: jest
      .fn<
        Promise<typeof configuration>,
        [Prisma.TransactionClient, string, string]
      >()
      .mockResolvedValue(configuration),
  };
  const store = new C8Store(db as never, context as never, governed as never);
  const sources = {
    policy: jest.fn().mockResolvedValue({
      id: header.id,
      hash: header.contentHash,
      content,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  };
  const viewer = {
    viewer: jest
      .fn()
      .mockResolvedValue({ role: 'tenant_owner', branchId: null }),
  };
  const reader = new C8ReadService(
    db as never,
    context as never,
    viewer as never,
    store,
    sources as never,
    {} as never,
    {} as never,
  );
  const ranking = (id: string, childId: string): C8ResultRevision => {
    const childRef = { ...ref, owner: 'C8ResultRevision', id: childId };
    const parent: C8ResultRevision = {
      ...row,
      id,
      kind: 'RANKING',
      subjectKind: 'cohort',
      subjectId: id,
      ruleKey: 'c8.ranking/return',
      evidenceRefsJson: [childRef],
    };
    rows.set(id, parent);
    return parent;
  };
  return {
    row,
    feature,
    rule,
    content,
    header,
    configuration,
    state,
    rows,
    statements,
    queryRaw,
    findFirst,
    executeRaw,
    db,
    tx,
    governed,
    store,
    sources,
    reader,
    ranking,
    current: (value = row, depth = 0) => store.refsCurrent(value, tx, depth),
    snapshot: () =>
      reader.snapshotDormancy(
        'tenant',
        'owner',
        row.id,
        'more_than_two_months',
      ),
  };
}

describe('actual C8 store currentness rejects ambiguous historical calendar inputs', () => {
  it.each([
    ['historical local seconds', '1880-01-01T12:00:45.123Z', 'Europe/Paris'],
    ['legacy year coercion', '0099-12-31T12:34:56.789Z', 'UTC'],
  ])(
    'withholds %s whose old deadline differs even though the corrected target is unique',
    async (_label, visit, timezone) => {
      const f = fixture(visit);
      f.row.timezone = timezone;
      const before = JSON.stringify(f.row);
      expect(await f.current()).toBe(false);
      await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
      expect(JSON.stringify(f.row)).toBe(before);
    },
  );
  it.each([
    ['gap', GAP],
    ['fold', FOLD],
  ])(
    'withholds a published NY %s without changing historical bytes',
    async (_label, visit) => {
      const f = fixture(visit);
      const before = JSON.stringify(f.row);
      expect(await f.current()).toBe(false);
      expect(f.governed.configuration).toHaveBeenCalledWith(
        f.tx,
        'tenant',
        'c8_valuation',
      );
      expect(f.statements.some((sql) => sql.includes('C8_validate_refs'))).toBe(
        false,
      );
      expect(JSON.stringify(f.row)).toBe(before);
      expect(f.row.state).toBe('PUBLISHED');
      expect(f.row.snapshotHash).toBe('c'.repeat(64));
      expect(f.executeRaw).not.toHaveBeenCalled();
    },
  );

  it('keeps a unique calendar result current without recomputing its saved value', async () => {
    const f = fixture();
    f.row.valuesJson = { values: [{ key: 'two_months', value: false }] };
    const before = JSON.stringify(f.row);
    expect(await f.current()).toBe(true);
    expect(f.statements.some((sql) => sql.includes('C8_validate_refs'))).toBe(
      true,
    );
    expect(JSON.stringify(f.row)).toBe(before);
  });

  it('preserves elapsed-day behavior for the same visit whose calendar target is ambiguous', async () => {
    const f = fixture(FOLD);
    f.rule.elapsed = { unit: 'day', count: 60 };
    const before = JSON.stringify(f.row);
    expect(await f.current()).toBe(true);
    expect(JSON.stringify(f.row)).toBe(before);
  });

  it('leaves PENDING calendar validation to the existing producer, retaining ordinary reference checks', async () => {
    const f = fixture(GAP);
    f.row.state = 'PENDING';
    expect(await f.current()).toBe(true);
    expect(f.governed.configuration).not.toHaveBeenCalled();
    f.state.refsValid = false;
    expect(await f.current()).toBe(false);
    expect(f.governed.configuration).not.toHaveBeenCalled();
  });

  it.each([
    'foreign',
    'expired',
    'inactive',
    'missing-policy',
    'policy-id',
    'policy-hash',
    'missing-content',
    'configuration-id',
  ])('%s still refuses before exposing a current result', async (change) => {
    const f = fixture();
    if (change === 'foreign') f.row.tenantId = 'foreign-tenant';
    if (change === 'expired')
      f.row.expiresAt = new Date('2000-01-01T00:00:00.000Z');
    if (change === 'inactive') f.state.active = false;
    if (change === 'missing-policy') f.state.hasPolicy = false;
    if (change === 'policy-id') f.header.id = 'other-policy';
    if (change === 'policy-hash') f.header.contentHash = 'd'.repeat(64);
    if (change === 'missing-content') f.header.encryptedContent = null;
    if (change === 'configuration-id')
      f.configuration.previousRevisionId = 'other-policy';
    expect(await f.current()).toBe(false);
    if (['foreign', 'expired'].includes(change))
      expect(f.queryRaw).not.toHaveBeenCalled();
    expect(f.statements.some((sql) => sql.includes('C8_validate_refs'))).toBe(
      false,
    );
  });

  it.each([
    'missing',
    'null',
    'invalid-instant',
    'future',
    'no-evidence',
    'foreign-evidence',
    'wrong-basis',
    'wrong-unit',
    'currency',
  ])(
    '%s admitted feature fails closed without a substitute visit',
    async (change) => {
      const f = fixture();
      if (change === 'missing')
        f.row.inputSnapshotJson = {
          version: 1,
          features: [],
          missingness: [],
          coverage: 'PARTIAL',
          dependencies: [],
        };
      if (change === 'null') f.feature.value = null;
      if (change === 'invalid-instant') f.feature.value = 'not-an-instant';
      if (change === 'future') f.feature.value = '2027-01-01T00:00:00.000Z';
      if (change === 'no-evidence') f.feature.sourceRefs = [];
      if (change === 'foreign-evidence')
        f.feature.sourceRefs[0].tenantId = 'other-tenant';
      if (change === 'wrong-basis') f.feature.basis = 'booked_value';
      if (change === 'wrong-unit') f.feature.unit = 'count';
      if (change === 'currency') f.feature.currency = 'RUB';
      const before = JSON.stringify(f.row);
      expect(await f.current()).toBe(false);
      expect(JSON.stringify(f.row)).toBe(before);
    },
  );

  it('requires the exact current rule and its valid configured content', async () => {
    const missing = fixture();
    missing.content.dormancyRules = [];
    expect(await missing.current()).toBe(false);
    const invalid = fixture();
    invalid.rule.elapsed.count = 0;
    expect(await invalid.current()).toBe(false);
  });

  it.each([
    new ServiceUnavailableException(
      'Canonical tenant configuration payload unavailable',
    ),
    new ForbiddenException('configuration_access_revoked'),
  ])(
    'propagates canonical configuration error %# rather than returning false',
    async (error) => {
      const f = fixture();
      f.governed.configuration.mockRejectedValue(error);
      await expect(f.current()).rejects.toBe(error);
      expect(f.statements.some((sql) => sql.includes('C8_validate_refs'))).toBe(
        false,
      );
    },
  );

  it('does not bypass existing SQL reference invalidation or hide a database failure', async () => {
    const f = fixture();
    f.state.refsValid = false;
    expect(await f.current()).toBe(false);
    const error = new Error('synthetic_database_failure');
    f.queryRaw.mockRejectedValue(error);
    await expect(f.current()).rejects.toBe(error);
  });

  it.each([
    ['gap', GAP],
    ['fold', FOLD],
  ])(
    'rejects a ranking parent with a published %s dependency through actual recursion',
    async (_label, visit) => {
      const f = fixture(visit);
      const parent = f.ranking('ranking', f.row.id);
      const before = JSON.stringify([parent, f.row]);
      expect(await f.current(parent)).toBe(false);
      expect(f.findFirst).toHaveBeenCalledTimes(1);
      expect(f.findFirst).toHaveBeenCalledWith({
        where: { id: f.row.id, tenantId: 'tenant' },
      });
      expect(JSON.stringify([parent, f.row])).toBe(before);
    },
  );

  it('accepts a unique current dependency but preserves the recursion depth bound', async () => {
    const f = fixture();
    const parent = f.ranking('ranking', f.row.id);
    expect(await f.current(parent)).toBe(true);
    const deep = fixture();
    let current = deep.row;
    for (let i = 0; i < 5; i++)
      current = deep.ranking('parent-' + i, current.id);
    expect(await deep.current(current)).toBe(false);
    expect(deep.findFirst).toHaveBeenCalledTimes(5);
    expect(deep.governed.configuration).not.toHaveBeenCalled();
  });

  it.each([
    ['gap', GAP],
    ['fold', FOLD],
  ])(
    'actual exact reader uses store currentness to withhold %s history without rewriting it',
    async (_label, visit) => {
      const f = fixture(visit);
      const before = JSON.stringify(f.row);
      await expect(f.snapshot()).rejects.toThrow('c8_result_unavailable');
      expect(f.governed.configuration).toHaveBeenCalledTimes(1);
      expect(f.sources.policy).not.toHaveBeenCalled();
      expect(f.db.$transaction).toHaveBeenCalledTimes(1);
      expect(f.executeRaw).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(f.row)).toBe(before);
    },
  );

  it('actual exact reader keeps a unique published result available with its original identity', async () => {
    const f = fixture();
    const before = JSON.stringify(f.row);
    const result = await f.snapshot();
    expect(result.current).toBe(true);
    expect(result.available).toBe(true);
    expect(result.id).toBe(f.row.id);
    expect(result.snapshotHash).toBe(f.row.snapshotHash);
    expect(result.rule.parameters?.elapsed).toEqual({
      unit: 'calendar_month',
      count: 2,
    });
    expect(JSON.stringify(f.row)).toBe(before);
  });
});
