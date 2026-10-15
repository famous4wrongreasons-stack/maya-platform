import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ForbiddenException } from '@nestjs/common';
import type { C8ResultRevision } from '@prisma/client';
import { C8ReadService } from './c8.read';
import { c8ComputeDeterministic } from './c8.deterministic';
// Existing reader/explanation; synthetic persistence/viewer. No provider, model or writes.
function fixture(policyContent?: unknown) {
  const row = {
    id: 'result-one',
    tenantId: 'tenant-a',
    subjectKind: 'tenant',
    subjectId: 'tenant-a',
    kind: 'OBSERVED_VALUE',
    state: 'PUBLISHED',
    qualification: 'VERIFIED',
    completeness: 'PARTIAL',
    basis: 'observed_attended_count',
    currency: null,
    ruleKey: 'c8.value/count',
    ruleVersion: 1,
    policyRevisionId: 'private-policy',
    policyContentHash: 'b'.repeat(64),
    scopeJson: { branchIds: [], serviceScope: [] },
    t0: new Date('2026-10-14T08:00:00.000Z'),
    periodFrom: new Date('2026-10-01T00:00:00.000Z'),
    periodTo: new Date('2026-10-14T08:00:00.000Z'),
    timezone: 'Europe/Moscow',
    expiresAt: new Date('2099-10-15T08:00:00.000Z'),
    snapshotHash: 'a'.repeat(64),
    revision: 1,
    rankingJson: null,
    valuesJson: {
      values: [
        {
          key: 'count',
          type: 'observed',
          value: '3',
          unit: 'count',
          basis: 'observed_attended_count',
          currency: null,
        },
      ],
    },
    reasonsJson: [],
    horizonEnd: null,
    modelVersionId: null,
  } as unknown as C8ResultRevision;
  let rows = [row],
    active = true,
    financeAllowed = true;
  const member = { role: 'tenant_owner', branchId: null as string | null };
  const viewer = {
    viewer: jest.fn((tenant: string, user: string, purpose: string) =>
      Promise.resolve().then(() => {
        expect(tenant).toBe('tenant-a');
        expect(user).toBe('user-a');
        if (!active) throw new ForbiddenException('revoked');
        if (!financeAllowed && purpose === 'business_period')
          throw new ForbiddenException('finance_denied');
        return member;
      }),
    ),
  };
  const findMany = jest.fn(
    (q: {
      where: { tenantId: string; expiresAt: { gt: Date } };
      take: number;
    }) =>
      Promise.resolve().then(() => {
        expect(q.where.tenantId).toBe('tenant-a');
        expect(q.take).toBe(26);
        return rows.filter((r) => r.expiresAt > q.where.expiresAt.gt);
      }),
  );
  const tx = {
    c8ResultRevision: {
      findFirst: jest.fn().mockResolvedValue({ id: row.id }),
    },
  };
  const store = {
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    refsCurrent: jest.fn().mockResolvedValue(true),
  };
  const write = jest.fn(() => {
    throw Error('read cannot compute or mutate');
  });
  const policyRecord = {
    id: row.policyRevisionId,
    hash: row.policyContentHash,
    content: policyContent,
  };
  const policyRead = jest.fn(() =>
    Promise.resolve().then(() => {
      if (!policyContent) throw Error('unexpected policy read');
      return policyRecord;
    }),
  );
  const reader = new C8ReadService(
    { c8ResultRevision: { findMany } } as never,
    {
      get: () => member,
      runAsSystemTenant: (tenant: string, fn: () => unknown) => {
        expect(tenant).toBe('tenant-a');
        return fn();
      },
    } as never,
    viewer as never,
    store as never,
    { policy: policyRead } as never,
    { compute: write } as never,
    { compute: write } as never,
  );
  return {
    row,
    policyRecord,
    policyRead,
    member,
    store,
    tx,
    findMany,
    viewer,
    write,
    rows: (v: C8ResultRevision[]) => {
      rows = v;
    },
    denyFinance: () => {
      financeAllowed = false;
    },
    revoke: () => {
      active = false;
    },
    read: () => reader.list('tenant-a', 'user-a'),
  };
}
function project(list: unknown) {
  const moduleUrl = pathToFileURL(
    resolve(__dirname, '../../../maya-chat-shell/src/net/ideas.ts'),
  ).href;
  const projected: unknown = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `import fs from 'node:fs'; import { projectIdeas } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(projectIdeas(JSON.parse(fs.readFileSync(0,'utf8')))));`,
      ],
      {
        input: JSON.stringify(list),
        encoding: 'utf8',
        timeout: 10000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      },
    ),
  );
  if (
    typeof projected !== 'object' ||
    projected === null ||
    !('rows' in projected) ||
    !Array.isArray(projected.rows) ||
    !(projected.rows as unknown[]).every(
      (row) => typeof row === 'object' && row !== null && 'finding' in row,
    )
  )
    throw new Error('Invalid shipped Ideas projection');
  // Retain the complete object so privacy assertions inspect every emitted field.
  return projected as {
    rows: Array<Record<string, unknown> & { finding: unknown }>;
  };
}
describe('Companion Ideas existing C8 list source', () => {
  it('passes the actual C8 list through the shipped runtime projector without exposing subjects or unprojected evidence', async () => {
    const list = await fixture().read();
    const projected = project(list);
    expect(projected).not.toBeNull();
    expect(projected.rows[0]).toMatchObject({
      key: 'result-one',
      scope: 'tenant',
      coverage: 'PARTIAL',
      available: true,
      finding: {
        kind: 'observation',
        basis: 'observed_attended_count',
        value: '3',
        currency: null,
      },
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /private-policy|tenant-a|subjectId|values|boundaries/,
    );
  });

  it('returns canonical explanation metadata and authority boundaries without computing', async () => {
    const f = fixture(),
      list = await f.read();
    expect(list).toMatchObject({
      contract: 'c8.valuation.list/1',
      numericPredictionsAvailable: false,
      nextCursor: null,
    });
    expect(list.items[0]).toMatchObject({
      contract: 'c8.valuation.read/1',
      version: 1,
      mode: 'immutable_snapshot',
      id: f.row.id,
      revision: 1,
      snapshotHash: f.row.snapshotHash,
      current: true,
      available: true,
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      numericPrediction: null,
      activation: 'DISABLED',
      period: { timezone: 'Europe/Moscow' },
      boundaries: {
        factIsPrediction: false,
        predictionIsPolicy: false,
        valueImpliesConsent: false,
        rankingImpliesContactPermission: false,
        rankingImpliesActionAuthority: false,
        opportunityImpliesExecution: false,
      },
    });
    expect(f.findMany).toHaveBeenCalledTimes(1);
    expect(f.viewer.viewer.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('does not substitute general access for existing financial reader authority', async () => {
    const f = fixture();
    f.row.basis = 'confirmed_cash';
    f.row.currency = 'RUB';
    f.denyFinance();
    expect((await f.read()).items).toEqual([]);
    expect(f.viewer.viewer).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'business_period',
    );
    expect(f.write).not.toHaveBeenCalled();
  });
  it('filters foreign tenant rows even if persistence returns them', async () => {
    const f = fixture();
    f.row.tenantId = 'tenant-b';
    expect((await f.read()).items).toEqual([]);
  });
  it('filters branch scope mismatch', async () => {
    const f = fixture();
    f.member.branchId = 'branch-a';
    expect((await f.read()).items).toEqual([]);
  });
  it('does not expose superseded or stale published results', async () => {
    const f = fixture();
    f.store.refsCurrent.mockResolvedValue(false);
    expect((await f.read()).items).toEqual([]);
    f.store.refsCurrent.mockResolvedValue(true);
    f.tx.c8ResultRevision.findFirst.mockResolvedValue({ id: 'new-result' });
    expect((await f.read()).items).toEqual([]);
  });
  it('preserves unavailable and prediction limitations', async () => {
    const f = fixture();
    f.row.state = 'UNAVAILABLE';
    f.store.refsCurrent.mockResolvedValue(false);
    let x = (await f.read()).items[0];
    expect(x.available).toBe(false);
    expect(x.values).toEqual([]);
    f.row.kind = 'PREDICTION';
    f.row.state = 'PUBLISHED';
    f.store.refsCurrent.mockResolvedValue(true);
    x = (await f.read()).items[0];
    expect(x.available).toBe(false);
    expect(x.numericPrediction).toBeNull();
    expect(x.reasons).toContain(
      'qualified_model_and_approved_activation_evidence_required',
    );
  });
  it('rechecks authority after dependency resolution and before list exposure', async () => {
    const f = fixture();
    f.store.refsCurrent.mockImplementation(() => {
      f.revoke();
      return Promise.resolve(true);
    });
    await expect(f.read()).rejects.toThrow('revoked');
  });
  it('queries expiry and omits expired rows', async () => {
    const f = fixture();
    f.row.expiresAt = new Date('2000-01-01T00:00:00.000Z');
    expect((await f.read()).items).toEqual([]);
  });
  it('discloses pre-filter cap even when first page is inaccessible', async () => {
    const f = fixture();
    f.rows(
      Array.from({ length: 26 }, (_, i) => ({
        ...f.row,
        id: 'result-' + i,
        tenantId: 'tenant-b',
      })),
    );
    expect(await f.read()).toMatchObject({
      items: [],
      nextCursor: 'result-24',
    });
  });
});

// Reuse actual deterministic producer and reader; no alternate frontend arithmetic/authority.
describe('Companion Ideas deterministic production values through reader and projector', () => {
  const policy = {
    version: 1,
    valueMeasures: [],
    predictionTargets: [],
    dormancyRules: [
      {
        ruleKey: 'cadence',
        serviceScope: [] as string[],
        elapsed: { unit: 'day', count: 30 },
        comparison: 'gt',
        evidence: 'proven_attendance',
        minimumCoverage: 'PARTIAL',
      },
    ],
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
  it.each([
    'observed_attended_count',
    'confirmed_cash',
    'confirmed_refunds',
    'confirmed_cash_net_linked_refunds',
    'booked_value',
    'provider_reported_gross',
    'dormancy',
    'scenario',
  ])('preserves canonical %s meaning without writes', async (basis) => {
    const f = fixture(policy),
      r = f.row;
    const dormancy = basis === 'dormancy',
      scenario = basis === 'scenario',
      count = basis === 'observed_attended_count';
    r.eligibility = 'ELIGIBLE';
    r.basis = dormancy
      ? 'proven_attendance_policy'
      : scenario
        ? 'booked_value'
        : basis;
    r.kind = dormancy
      ? 'POLICY_SIGNAL'
      : scenario
        ? 'SCENARIO'
        : 'OBSERVED_VALUE';
    r.subjectKind = dormancy ? 'client' : scenario ? 'appointment' : 'tenant';
    r.ruleKey = dormancy
      ? 'c8.dormancy/cadence'
      : scenario
        ? 'c8.scenario/booked_appointment'
        : 'c8.value/measure';
    r.currency = dormancy || count ? null : 'RUB';
    r.horizonEnd = scenario ? new Date('2026-11-01T00:00:00.000Z') : null;
    r.inputSnapshotJson = {
      version: 1,
      features: [
        {
          key: dormancy ? 'last_proven_visit_at' : r.basis,
          value: dormancy
            ? '2026-08-01T00:00:00.000Z'
            : count
              ? '3'
              : '9007199254740993',
          unit: dormancy ? 'instant' : count ? 'count' : 'money_minor',
          basis: dormancy ? 'proven_attendance' : r.basis,
          currency: r.currency,
          sourceRefs: [
            {
              owner: 'MeasurementRevision',
              tenantId: r.tenantId,
              id: 'private-source',
              revisionOrStateHash: 'b'.repeat(64),
              observedAt: r.t0.toISOString(),
              asOf: r.t0.toISOString(),
              qualification: 'VERIFIED',
              coverage: 'PARTIAL',
              expiresAt: r.expiresAt.toISOString(),
            },
          ],
        },
      ],
      missingness: [],
      coverage: 'PARTIAL',
      dependencies: [],
    };
    const output = c8ComputeDeterministic(r, {
      ...policy,
      valueMeasures:
        dormancy || scenario
          ? []
          : [
              {
                key: 'measure',
                basis: r.basis,
                currency: r.currency,
                window: { unit: 'day', count: 30 },
                serviceScope: [],
              },
            ],
    });
    r.valuesJson = output.valuesJson;
    r.reasonsJson = output.reasonsJson;
    const result = project(await f.read()).rows[0].finding;
    expect(result).toMatchObject(
      dormancy
        ? { kind: 'policy', met: true }
        : scenario
          ? {
              kind: 'scenario',
              value: '9007199254740993',
              currency: 'RUB',
              horizonEnd: r.horizonEnd?.toISOString(),
            }
          : {
              kind: 'observation',
              basis,
              value: count ? '3' : '9007199254740993',
              currency: r.currency,
            },
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private|sourceRefs|ruleKey|subjectId/,
    );
    expect(f.write).not.toHaveBeenCalled();
    r.state = 'UNAVAILABLE';
    expect(project(await f.read()).rows[0].finding).toEqual({
      kind: 'unavailable',
    });
  });
  function ruleFixture(
    unit = 'day',
    count = 37,
    comparison = 'gt',
    services: string[] = [],
  ) {
    const content = structuredClone(policy);
    content.dormancyRules[0] = {
      ...content.dormancyRules[0],
      elapsed: { unit, count },
      comparison,
      serviceScope: services,
    };
    const f = fixture(content),
      r = f.row;
    r.kind = 'POLICY_SIGNAL';
    r.subjectKind = 'client';
    r.subjectId = 'private-client';
    r.basis = 'proven_attendance_policy';
    r.currency = null;
    r.ruleKey = 'c8.dormancy/cadence';
    r.scopeJson = { branchIds: [], serviceScope: services };
    r.valuesJson = {
      values: [
        {
          key: 'cadence',
          type: 'policy',
          value: false,
          unit: 'boolean',
          basis: 'proven_attendance_policy',
          currency: null,
        },
      ],
    };
    return f;
  }
  it.each([
    ['day', 37, 'gt'],
    ['calendar_month', 2, 'gte'],
  ])(
    'retains exact source rule %s/%s/%s with no inferred schedule',
    async (unit, count, comparison) => {
      const f = ruleFixture(String(unit), Number(count), String(comparison), [
        'private-service',
      ]);
      const list = await f.read(),
        result = project(list).rows[0].finding;
      expect(result).toEqual({
        kind: 'policy',
        met: false,
        parameters: {
          elapsed: { unit, count },
          comparison,
          evidence: 'proven_attendance',
          minimumCoverage: 'PARTIAL',
          serviceScope: { restricted: true, count: 1 },
          timezone: 'Europe/Moscow',
        },
      });
      expect(f.policyRead).toHaveBeenCalledTimes(1);
      expect(f.policyRead).toHaveBeenCalledWith(f.tx);
      expect(JSON.stringify(result)).not.toMatch(
        /private|subjectId|serviceIds|policyContentHash/,
      );
      expect(f.write).not.toHaveBeenCalled();
    },
  );
  it.each(['policy-id', 'policy-hash', 'service-scope', 'version'])(
    'does not borrow replacement parameters after %s substitution',
    async (change) => {
      const f = ruleFixture();
      if (change === 'policy-id') f.policyRecord.id = 'other-policy';
      if (change === 'policy-hash') f.policyRecord.hash = 'f'.repeat(64);
      if (change === 'service-scope')
        f.row.scopeJson = { branchIds: [], serviceScope: ['other-service'] };
      if (change === 'version') f.row.ruleVersion = 2;
      expect(project(await f.read()).rows).toEqual([]);
      expect(f.write).not.toHaveBeenCalled();
    },
  );
  it('rechecks revocation during exact rule read before exposing parameters', async () => {
    const f = ruleFixture();
    f.policyRead.mockImplementation(() => {
      f.revoke();
      return Promise.resolve(f.policyRecord);
    });
    await expect(f.read()).rejects.toThrow('revoked');
  });
  it('withholds expired rule while read is in flight', async () => {
    const f = ruleFixture();
    f.policyRead.mockImplementation(() => {
      f.row.expiresAt = new Date('2000-01-01T00:00:00.000Z');
      return Promise.resolve(f.policyRecord);
    });
    await expect(f.read()).rejects.toThrow('c8_result_unavailable');
  });
});
