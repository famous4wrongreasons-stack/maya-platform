import { C8ResultRevision } from '@prisma/client';
import {
  c8CompareScalar,
  c8ComputeDeterministic,
  c8RankCohort,
} from './c8.deterministic';
import { C8Object, C8Ref, c8Hash } from './c8.contract';
const t0 = new Date('2026-09-13T12:00:00.000Z');
const ref: C8Ref = {
  owner: 'MeasurementRevision',
  tenantId: 'tenant',
  id: 'source',
  revisionOrStateHash: 'a'.repeat(64),
  observedAt: t0.toISOString(),
  asOf: t0.toISOString(),
  qualification: 'VERIFIED',
  coverage: 'PARTIAL',
  expiresAt: '2027-01-01T00:00:00.000Z',
};
const policy = {
  version: 1,
  valueMeasures: [
    {
      key: 'cash',
      basis: 'confirmed_cash',
      currency: 'RUB',
      window: { unit: 'day', count: 30 },
      serviceScope: [],
    },
  ],
  predictionTargets: [
    {
      targetKey: 'attended_return',
      modelKey: 'unfitted',
      horizon: { unit: 'day', count: 30 },
      basis: 'attended_return',
      currency: null,
      serviceScope: [],
    },
  ],
  dormancyRules: [
    {
      ruleKey: 'cadence',
      serviceScope: [],
      elapsed: { unit: 'day', count: 30 },
      comparison: 'gt',
      evidence: 'proven_attendance',
      minimumCoverage: 'PARTIAL',
    },
  ],
  rankingObjectives: [
    {
      key: 'value',
      scope: 'client',
      comparators: [{ measureKey: 'cash', direction: 'desc' }],
      tieBreak: 'opaque_subject_id',
      unknownBucket: 'separate',
    },
    {
      key: 'probability',
      scope: 'client',
      comparators: [{ measureKey: 'attended_return', direction: 'desc' }],
      tieBreak: 'opaque_subject_id',
      unknownBucket: 'separate',
    },
  ],
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
function row(
  id = 'client-a',
  amount: string | null = '9007199254740993',
): C8ResultRevision {
  return {
    tenantId: 'tenant',
    id: 'r-' + id,
    subjectKind: 'client',
    subjectId: id,
    kind: 'OBSERVED_VALUE',
    ruleKey: 'c8.value/cash',
    ruleVersion: 1,
    t0,
    periodFrom: new Date('2026-08-14T12:00:00.000Z'),
    periodTo: t0,
    horizonEnd: null,
    timezone: 'UTC',
    basis: 'confirmed_cash',
    currency: 'RUB',
    eligibility: 'ELIGIBLE',
    completeness: 'PARTIAL',
    qualification: 'VERIFIED',
    policyRevisionId: 'policy',
    policyContentHash: 'b'.repeat(64),
    scopeJson: { version: 1, serviceScope: [], branchIds: [] },
    state: 'PUBLISHED',
    snapshotHash: c8Hash(id),
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    inputSnapshotJson: {
      version: 1,
      features: [
        {
          key: 'confirmed_cash',
          value: amount,
          unit: 'money_minor',
          basis: 'confirmed_cash',
          currency: 'RUB',
          sourceRefs: [ref],
        },
      ],
      missingness: [],
      coverage: 'PARTIAL',
      dependencies: [],
    },
    valuesJson: {
      version: 1,
      values: [
        {
          key: 'cash',
          type: 'observed',
          value: amount,
          unit: 'money_minor',
          basis: 'confirmed_cash',
          currency: 'RUB',
        },
      ],
      limitations: ['known_source_coverage_partial'],
    },
  } as unknown as C8ResultRevision;
}
describe('C8 deterministic value, named policy and reproducible ranking', () => {
  test.each([
    ['9007199254740993', '9007199254740992', 1],
    ['-0.01', '-0.001', -1],
    ['1.20', '1.2', 0],
    ['-90', '0', -1],
  ])('exact decimal %s vs %s', (a, b, n) =>
    expect(c8CompareScalar(String(a), String(b))).toBe(n),
  );
  it('preserves negative/large evidence without zero floor or floating point', () => {
    for (const value of ['-150', '9007199254740993'])
      expect(
        (
          c8ComputeDeterministic(row('a', value), policy).valuesJson
            .values as C8Object[]
        )[0].value,
      ).toBe(value);
  });
  it('unknown money is unavailable, not observed zero', () =>
    expect(() => c8ComputeDeterministic(row('a', null), policy)).toThrow(
      'required_fact_unavailable',
    ));
  it('rejects cross currency and unsupported expected value', () => {
    expect(() =>
      c8ComputeDeterministic({ ...row(), currency: 'USD' }, policy),
    ).toThrow('policy_mismatch');
    expect(() =>
      c8ComputeDeterministic({ ...row(), kind: 'PREDICTION' }, policy),
    ).toThrow('policy_mismatch');
  });
  it('partial evidence carries limitations, never certified profit', () =>
    expect(
      c8ComputeDeterministic(row(), policy).valuesJson.limitations,
    ).toEqual(['known_source_coverage_partial']));
  it('cadence boundary is the confirmed comparison and unknown last visit is unavailable', () => {
    const r = {
      ...row(),
      kind: 'POLICY_SIGNAL',
      ruleKey: 'c8.dormancy/cadence',
      basis: 'proven_attendance_policy',
      currency: null,
    } as C8ResultRevision;
    r.inputSnapshotJson = {
      version: 1,
      features: [
        {
          key: 'last_proven_visit_at',
          value: '2026-08-14T12:00:00.000Z',
          unit: 'instant',
          basis: 'proven_attendance',
          currency: null,
          sourceRefs: [ref],
        },
      ],
      missingness: [],
      coverage: 'PARTIAL',
      dependencies: [],
    };
    expect(
      (c8ComputeDeterministic(r, policy).valuesJson.values as C8Object[])[0]
        .value,
    ).toBe(false);
    const gte = {
      ...policy,
      dormancyRules: policy.dormancyRules.map((x) => ({
        ...x,
        comparison: 'gte',
      })),
    };
    expect(
      (c8ComputeDeterministic(r, gte).valuesJson.values as C8Object[])[0].value,
    ).toBe(true);
    expect(() =>
      c8ComputeDeterministic(r, { ...policy, dormancyRules: [] }),
    ).toThrow('policy_mismatch');
    expect(() =>
      c8ComputeDeterministic(r, {
        ...policy,
        dormancyRules: policy.dormancyRules.map((x) => ({
          ...x,
          minimumCoverage: 'COMPLETE',
        })),
      }),
    ).toThrow('coverage_unavailable');
  });
  const rank = (
    candidates: Parameters<typeof c8RankCohort>[0]['candidates'],
    objectiveKey = 'value',
  ) =>
    c8RankCohort({
      tenantId: 'tenant',
      policy,
      objectiveKey,
      candidates,
      queryHash: c8Hash('cohort'),
      coverage: 'PARTIAL',
      dependencyDeadline: '2027-01-01T00:00:00.000Z',
    });
  it('stable ID ties, exact large amounts, unknown bucket and no copied financial values', () => {
    const x = rank([
      { subjectRef: 'b', results: [row('b', '100')], unavailableReasons: [] },
      { subjectRef: 'a', results: [row('a', '100')], unavailableReasons: [] },
      {
        subjectRef: 'unknown',
        results: [],
        unavailableReasons: ['insufficient_data'],
      },
    ]);
    expect((x.members as C8Object[]).map((m) => m.subjectRef)).toEqual([
      'a',
      'b',
    ]);
    expect(x.excluded).toHaveLength(1);
    expect(JSON.stringify(x)).not.toContain('"value":"100"');
  });
  it('does not drop a disabled probabilistic comparator', () =>
    expect(() => rank([], 'probability')).toThrow(
      'predictive_comparator_unavailable',
    ));
  it('rejects duplicate cohort members and over-limit cohort rather than truncating', () => {
    const c = { subjectRef: 'a', results: [row('a')], unavailableReasons: [] };
    expect(() => rank([c, c])).toThrow('complete_bounded_cohort');
    expect(() =>
      rank(
        Array.from({ length: 5001 }, (_, i) => ({
          ...c,
          subjectRef: String(i),
        })),
      ),
    ).toThrow('complete_bounded_cohort');
  });
  it('separates incompatible time/basis and wrong Client/tenant results', () => {
    const wrong = { ...row('b'), tenantId: 'other' };
    const x = rank([
      { subjectRef: 'a', results: [row('a')], unavailableReasons: [] },
      { subjectRef: 'b', results: [wrong], unavailableReasons: [] },
    ]);
    expect(x.members).toHaveLength(1);
    expect(x.excluded).toHaveLength(1);
  });
});

describe('C8 strict two-calendar-month dormancy policy', () => {
  const calendarPolicy = {
    ...policy,
    dormancyRules: policy.dormancyRules.map((rule) => ({
      ...rule,
      elapsed: { unit: 'calendar_month', count: 2 },
      comparison: 'gt',
    })),
  };

  const admitted = (lastVisit: string, at: Date, timezone: string) =>
    ({
      ...row(),
      kind: 'POLICY_SIGNAL',
      ruleKey: 'c8.dormancy/cadence',
      basis: 'proven_attendance_policy',
      currency: null,
      t0: at,
      periodFrom: new Date(lastVisit),
      periodTo: at,
      timezone,
      inputSnapshotJson: {
        version: 1,
        features: [
          {
            key: 'last_proven_visit_at',
            value: lastVisit,
            unit: 'instant',
            basis: 'proven_attendance',
            currency: null,
            sourceRefs: [
              {
                ...ref,
                observedAt: at.toISOString(),
                asOf: at.toISOString(),
                expiresAt: '2099-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
        missingness: [],
        coverage: 'PARTIAL',
        dependencies: [],
      },
    }) as C8ResultRevision;

  it.each([
    {
      label: 'non-leap month-end',
      lastVisit: '2025-12-31T12:34:56.789Z',
      deadline: '2026-02-28T12:34:56.789Z',
      timezone: 'UTC',
    },
    {
      label: 'leap month-end',
      lastVisit: '2023-12-31T12:34:56.789Z',
      deadline: '2024-02-29T12:34:56.789Z',
      timezone: 'UTC',
    },
    {
      label: 'New York spring DST',
      lastVisit: '2026-01-15T17:34:56.789Z',
      deadline: '2026-03-15T16:34:56.789Z',
      timezone: 'America/New_York',
    },
    {
      label: 'New York fall DST',
      lastVisit: '2026-09-15T16:34:56.789Z',
      deadline: '2026-11-15T17:34:56.789Z',
      timezone: 'America/New_York',
    },
  ])('$label: gt is false at −1ms and exactly, true only at +1ms', (sample) => {
    for (const delta of [-1, 0, 1]) {
      const at = new Date(new Date(sample.deadline).getTime() + delta);
      const result = c8ComputeDeterministic(
        admitted(sample.lastVisit, at, sample.timezone),
        calendarPolicy,
      );
      expect((result.valuesJson.values as C8Object[])[0]).toMatchObject({
        type: 'policy',
        value: delta === 1,
        unit: 'boolean',
        basis: 'proven_attendance_policy',
        currency: null,
      });
      expect(result.valuesJson.limitations).toContain(
        'policy_signal_not_value_consent_or_return_probability',
      );
    }
  });

  it.each([
    {
      label: 'clamped month-end plus one millisecond',
      lastVisit: '2025-12-31T12:34:56.789Z',
      at: '2026-02-28T12:34:56.790Z',
      timezone: 'UTC',
      calendar: true,
      sixtyDays: false,
    },
    {
      label: 'spring DST plus one millisecond',
      lastVisit: '2026-01-15T17:34:56.789Z',
      at: '2026-03-15T16:34:56.790Z',
      timezone: 'America/New_York',
      calendar: true,
      sixtyDays: false,
    },
    {
      label: 'fall DST exact calendar deadline',
      lastVisit: '2026-09-15T16:34:56.789Z',
      at: '2026-11-15T17:34:56.789Z',
      timezone: 'America/New_York',
      calendar: false,
      sixtyDays: true,
    },
  ])('$label differs from an explicit sixty-elapsed-day rule', (sample) => {
    const input = admitted(
      sample.lastVisit,
      new Date(sample.at),
      sample.timezone,
    );
    const daysPolicy = {
      ...calendarPolicy,
      dormancyRules: calendarPolicy.dormancyRules.map((rule) => ({
        ...rule,
        elapsed: { unit: 'day', count: 60 },
      })),
    };
    expect(
      (
        c8ComputeDeterministic(input, calendarPolicy).valuesJson
          .values as C8Object[]
      )[0].value,
    ).toBe(sample.calendar);
    expect(
      (
        c8ComputeDeterministic(input, daysPolicy).valuesJson
          .values as C8Object[]
      )[0].value,
    ).toBe(sample.sixtyDays);
  });
});
