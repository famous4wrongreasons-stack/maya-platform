import { c8Eligibility, c8SafeValue } from './c8.eligibility';
import { c8Hash, C8Ref } from './c8.contract';
const policy = {
  version: 1,
  valueMeasures: [],
  predictionTargets: [],
  dormancyRules: [],
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
const t0 = new Date('2026-09-13T00:00:00.000Z');
const ref: C8Ref = {
  owner: 'MeasurementRevision',
  tenantId: 'tenant-a',
  id: 'source-a',
  revisionOrStateHash: c8Hash('source'),
  observedAt: t0.toISOString(),
  asOf: t0.toISOString(),
  qualification: 'VERIFIED',
  coverage: 'COMPLETE',
};
const feature = {
  key: 'observed_frequency',
  value: '0',
  unit: 'count',
  basis: 'observed_attended_count',
  currency: null,
  sourceRefs: [ref],
};
const base = {
  tenantId: 'tenant-a',
  t0,
  features: [feature],
  policy,
  requiredFeatures: ['observed_frequency'],
  providerSupported: true,
  coverage: 'COMPLETE' as const,
};
describe('C8 deterministic source eligibility and cold start', () => {
  it('proven zero and unknown remain distinct', () => {
    expect(c8Eligibility(base).eligibility).toBe('ELIGIBLE');
    expect(
      c8Eligibility({ ...base, features: [{ ...feature, value: null }] })
        .eligibility,
    ).toBe('INSUFFICIENT_DATA');
  });
  it('unsupported provider never generates a client prior', () =>
    expect(
      c8Eligibility({ ...base, providerSupported: false }).eligibility,
    ).toBe('UNSUPPORTED'));
  it('complete facts are not a qualified statistical model', () =>
    expect(
      c8Eligibility({ ...base, target: 'attended_return' }).eligibility,
    ).toBe('INSUFFICIENT_DATA'));
  it('unqualified source cannot establish eligibility', () =>
    expect(
      c8Eligibility({
        ...base,
        features: [
          {
            ...feature,
            sourceRefs: [{ ...ref, qualification: 'UNQUALIFIED' }],
          },
        ],
      }).eligibility,
    ).toBe('INSUFFICIENT_DATA'));
  it('different tenant feature is denied', () =>
    expect(() =>
      c8Eligibility({
        ...base,
        features: [{ ...feature, sourceRefs: [{ ...ref, tenantId: 'other' }] }],
      }),
    ).toThrow());
  it('NFC key collisions cannot overwrite immutable inputs', () =>
    expect(() => c8Hash({ é: 1, 'e\u0301': 2 })).toThrow('collision'));
  it('a safe observed value is not an expected prediction', () => {
    const v = {
      key: 'visits',
      type: 'observed',
      value: '1',
      unit: 'count',
      basis: 'observed_attended_count',
      currency: null,
    };
    expect(c8SafeValue(v)).toEqual(v);
    expect(() => c8SafeValue({ ...v, type: 'expected' })).toThrow(
      'not_qualified',
    );
  });
});

describe('C8 explicit policy evidence requirements', () => {
  it('tenant evidence floor cannot be replaced by row existence', () => {
    const p = {
      ...policy,
      minimumEvidence: [
        {
          targetKey: 'observed_frequency',
          minimumObservedEvents: 2,
          requiredCoverage: 'COMPLETE',
          maximumInputAge: { unit: 'day', count: 1 },
        },
      ],
    };
    expect(
      c8Eligibility({ ...base, policy: p, timezone: 'UTC' }).eligibility,
    ).toBe('INSUFFICIENT_DATA');
    expect(
      c8Eligibility({
        ...base,
        policy: p,
        timezone: 'UTC',
        features: [{ ...feature, value: '3' }],
      }).eligibility,
    ).toBe('ELIGIBLE');
  });
  it('partial coverage cannot satisfy a complete requirement', () => {
    const p = {
      ...policy,
      minimumEvidence: [
        {
          targetKey: 'observed_frequency',
          minimumObservedEvents: 0,
          requiredCoverage: 'COMPLETE',
          maximumInputAge: { unit: 'day', count: 1 },
        },
      ],
    };
    expect(
      c8Eligibility({
        ...base,
        policy: p,
        timezone: 'UTC',
        features: [
          { ...feature, sourceRefs: [{ ...ref, coverage: 'PARTIAL' }] },
        ],
      }).eligibility,
    ).toBe('INSUFFICIENT_DATA');
  });
});
