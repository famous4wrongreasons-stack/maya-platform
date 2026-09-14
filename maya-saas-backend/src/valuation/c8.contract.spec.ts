import {
  c8Features,
  c8Hash,
  c8Normalize,
  c8Ref,
  C8_TARGETS,
} from './c8.contract';
import { c8Policy } from './c8.policy';
import { c8RequireNumericActivation, c8TargetReadiness } from './c8.targets';
export const emptyC8Policy = () => ({
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
});
const t0 = new Date('2026-09-13T00:00:00.000Z');
const ref = {
  owner: 'Client',
  tenantId: 'tenant-a',
  id: 'client-without-user',
  revisionOrStateHash: 'a'.repeat(64),
  observedAt: t0.toISOString(),
  asOf: t0.toISOString(),
  qualification: 'VERIFIED',
  coverage: 'PARTIAL',
};
describe('C8 approved limited-data contracts', () => {
  it.each(C8_TARGETS)(
    '%s remains unavailable, not calibration PASS',
    (target) => {
      expect(c8TargetReadiness(target)).toMatchObject({
        qualifiedData: 'INSUFFICIENT',
        calibration: 'UNAVAILABLE',
        activation: 'DISABLED',
        userVisibleNumericPrediction: false,
      });
    },
  );
  it('rejects any numeric activation without approved evidence', () =>
    expect(c8RequireNumericActivation).toThrow('not_qualified'));
  it('canonical identity normalizes NFC and object order but keeps comparator order', () => {
    expect(c8Hash({ b: 1, a: 'e\u0301' })).toBe(c8Hash({ a: 'é', b: 1 }));
    expect(c8Hash(['a', 'b'])).not.toBe(c8Hash(['b', 'a']));
  });
  it('rejects floating money/undefined/unsafe integers instead of inventing normalized values', () => {
    for (const v of [NaN, undefined, 0.3, Number.MAX_SAFE_INTEGER + 1])
      expect(() => c8Normalize(v)).toThrow();
  });
  it('Client without Maya User remains valid exact subject', () =>
    expect(c8Ref(ref, 'tenant-a', t0).id).toBe('client-without-user'));
  it('rejects User/phone authority and another tenant', () => {
    expect(() => c8Ref({ ...ref, userId: 'u' }, 'tenant-a', t0)).toThrow();
    expect(() => c8Ref({ ...ref, phone: 'phone' }, 'tenant-a', t0)).toThrow();
    expect(() => c8Ref(ref, 'tenant-b', t0)).toThrow();
  });
  it('rejects future knowledge and expired evidence', () => {
    expect(() =>
      c8Ref({ ...ref, asOf: '2026-09-14T00:00:00.000Z' }, 'tenant-a', t0),
    ).toThrow('future_input');
    expect(() =>
      c8Ref({ ...ref, expiresAt: t0.toISOString() }, 'tenant-a', t0),
    ).toThrow('expired');
  });
  it('keeps unknown financial input null, never zero', () => {
    expect(
      c8Features(
        [
          {
            key: 'confirmed_cash',
            value: null,
            unit: 'money_minor',
            basis: 'confirmed_cash',
            currency: 'RUB',
            sourceRefs: [],
          },
        ],
        'tenant-a',
        t0,
      )[0].value,
    ).toBeNull();
  });
  it('rejects a number without source evidence and identifying/freeform feature names', () => {
    for (const key of ['phone', 'name', 'diagnosis', 'model_probability'])
      expect(() =>
        c8Features(
          [
            {
              key,
              value: '1',
              unit: 'count',
              basis: 'x',
              currency: null,
              sourceRefs: [ref],
            },
          ],
          'tenant-a',
          t0,
        ),
      ).toThrow();
    expect(() =>
      c8Features(
        [
          {
            key: 'booked_value',
            value: '100',
            unit: 'money_minor',
            basis: 'booked_value',
            currency: 'RUB',
            sourceRefs: [],
          },
        ],
        'tenant-a',
        t0,
      ),
    ).toThrow('without_evidence');
  });
  it('does not invent a dormant rule or target at cold start', () => {
    const p = c8Policy(emptyC8Policy());
    expect(p.dormancyRules).toEqual([]);
    expect(p.predictionTargets).toEqual([]);
  });
  it.each([
    ['barbershop', 28],
    ['dental', 180],
    ['auto_service', 300],
    ['wellness', 42],
  ])('uses explicit %s policy and never global cadence', (_, days) => {
    const p = c8Policy({
      ...emptyC8Policy(),
      dormancyRules: [
        {
          ruleKey: 'confirmed_rule',
          serviceScope: [],
          elapsed: { unit: 'day', count: days },
          comparison: 'gt',
          evidence: 'proven_attendance',
          minimumCoverage: 'COMPLETE',
        },
      ],
    });
    expect(
      (p.dormancyRules as Array<{ elapsed: { count: number } }>)[0].elapsed
        .count,
    ).toBe(days);
  });
  it('rejects absent cadence, scoring as permission and arbitrary weights', () => {
    expect(() =>
      c8Policy({ ...emptyC8Policy(), dormancyRules: [{ ruleKey: 'x' }] }),
    ).toThrow();
    expect(() => c8Policy({ ...emptyC8Policy(), consent: true })).toThrow();
    expect(() =>
      c8Policy({
        ...emptyC8Policy(),
        rankingObjectives: [{ key: 'x', weights: [1] }],
      }),
    ).toThrow();
  });
  it('allows exact deterministic measure comparator without predictive fallback', () => {
    const p = c8Policy({
      ...emptyC8Policy(),
      valueMeasures: [
        {
          key: 'visits',
          basis: 'observed_attended_count',
          currency: null,
          window: { unit: 'day', count: 90 },
          serviceScope: [],
        },
      ],
      rankingObjectives: [
        {
          key: 'attention',
          scope: 'client',
          comparators: [{ measureKey: 'visits', direction: 'desc' }],
          tieBreak: 'opaque_subject_id',
          unknownBucket: 'separate',
        },
      ],
    });
    expect(p.rankingObjectives).toHaveLength(1);
  });
  it('denies requested model enable even if caller supplies hash-shaped quality assertions', () => {
    expect(() =>
      c8Policy({
        ...emptyC8Policy(),
        modelUse: [
          {
            targetKey: 'attended_return',
            modelVersionId: 'm',
            manifestHash: 'a'.repeat(64),
            evaluationRevisionId: 'e',
            evaluationSnapshotHash: 'b'.repeat(64),
            requested: 'enabled',
          },
        ],
      }),
    ).toThrow();
  });
});
