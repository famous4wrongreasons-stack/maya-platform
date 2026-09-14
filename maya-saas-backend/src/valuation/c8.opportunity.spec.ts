import { C8ResultRevision } from '@prisma/client';
import { c8Hash, C8Object } from './c8.contract';
import {
  c8OpportunityProjection,
  c8ParseOpportunityRef,
  c8OpportunityRef,
  c8AssertOpportunityBranch,
} from './c8.opportunity.contract';
import { c8Explanation, c8CompareExplanations } from './c8.explanation';
const now = new Date('2026-09-15T00:00:00.000Z');
const rule: C8Object = {
  ruleKey: 'review_known_value',
  opportunityType: 'client_reactivation_candidate',
  resultKind: 'OBSERVED_VALUE',
  measureKey: 'visits',
  comparison: 'gte',
  threshold: '3',
  basis: 'observed_attended_count',
  maximumAge: { unit: 'day', count: 30 },
  readDomain: 'client_lifecycle',
};
function row(dormant = false): C8ResultRevision {
  return {
    id: dormant ? 'dormant' : 'value',
    tenantId: 'tenant',
    subjectKind: 'client',
    subjectId: 'client',
    policyRevisionId: 'policy',
    policyContentHash: c8Hash('policy'),
    modelManifestHash: null,
    modelVersionId: null,
    ruleKey: dormant ? 'c8.dormancy/cadence' : 'c8.value/visits',
    ruleVersion: 1,
    kind: dormant ? 'POLICY_SIGNAL' : 'OBSERVED_VALUE',
    state: 'PUBLISHED',
    eligibility: 'ELIGIBLE',
    basis: dormant ? 'proven_attendance_policy' : 'observed_attended_count',
    currency: null,
    completeness: 'PARTIAL',
    qualification: 'VERIFIED',
    scopeJson: { branchIds: [], serviceScope: [] },
    t0: new Date('2026-09-14T00:00:00.000Z'),
    periodFrom: new Date('2026-08-14T00:00:00.000Z'),
    periodTo: new Date('2026-09-14T00:00:00.000Z'),
    publishedAt: new Date('2026-09-14T00:00:01.000Z'),
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    timezone: 'UTC',
    snapshotHash: c8Hash(dormant),
    valuesJson: {
      version: 1,
      values: [
        { key: dormant ? 'cadence' : 'visits', value: dormant ? true : '3' },
      ],
    },
    reasonsJson: [],
  } as unknown as C8ResultRevision;
}
describe('C8 qualified existing-owner Opportunity and grounded explanation', () => {
  it('named threshold requires both known value and confirmed exact-Client dormancy; no execution', () => {
    const v = row(),
      d = row(true),
      p = c8OpportunityProjection(v, [v, d], rule, 1, now)!;
    expect(p).not.toBeNull();
    expect(p.outcome).toBe('inform_only');
    expect(p.proposedActionIntent).toBeUndefined();
    expect(p.evidence).toHaveLength(2);
    expect(() => c8AssertOpportunityBranch(p)).not.toThrow();
    expect(c8OpportunityProjection(v, [v], rule, 1, now)).toBeNull();
    expect(
      c8OpportunityProjection(
        v,
        [v, { ...d, subjectId: 'other' }],
        rule,
        1,
        now,
      ),
    ).toBeNull();
  });
  it('different evidence is a revision of the same semantic condition, not second business outcome', () => {
    const v = row(),
      d = row(true),
      a = c8OpportunityProjection(v, [v, d], rule, 1, now)!;
    const updated = { ...v, id: 'next', snapshotHash: c8Hash('next') },
      b = c8OpportunityProjection(updated, [updated, d], rule, 1, now)!;
    expect(a.semanticKey).toBe(b.semanticKey);
    expect(a.identityFingerprint).not.toBe(b.identityFingerprint);
  });
  it.each(['UNAVAILABLE', 'PENDING'])(
    'never admits %s or disabled prediction',
    (state) => {
      const v = { ...row(), state };
      expect(
        c8OpportunityProjection(v, [v, row(true)], rule, 1, now),
      ).toBeNull();
      expect(
        c8OpportunityProjection(
          { ...row(), modelVersionId: 'model' },
          [row(true)],
          rule,
          1,
          now,
        ),
      ).toBeNull();
    },
  );
  it('rejects threshold failure, expired result, current age and conflicting cadence', () => {
    const v = row(),
      d = row(true);
    expect(
      c8OpportunityProjection(v, [v, d], { ...rule, threshold: '4' }, 1, now),
    ).toBeNull();
    expect(
      c8OpportunityProjection({ ...v, expiresAt: now }, [v, d], rule, 1, now),
    ).toBeNull();
    expect(
      c8OpportunityProjection(
        v,
        [v, d],
        { ...rule, maximumAge: { unit: 'day', count: 1 } },
        1,
        now,
      ),
    ).toBeNull();
    expect(
      c8OpportunityProjection(
        v,
        [v, d, { ...d, id: 'd2', ruleKey: 'c8.dormancy/other' }],
        rule,
        1,
        now,
      ),
    ).toBeNull();
  });
  it('closed reference preserves exact snapshot and policy, rejecting substituted or raw data', () => {
    const v = row();
    expect(c8ParseOpportunityRef(c8OpportunityRef(v))).toMatchObject({
      id: v.id,
      hash: v.snapshotHash,
      policyId: v.policyRevisionId,
    });
    expect(() => c8ParseOpportunityRef('phone-name')).toThrow();
    expect(() =>
      c8ParseOpportunityRef(
        'c8.v1.' +
          Buffer.from(JSON.stringify(['id', 'bad'])).toString('base64url'),
      ),
    ).toThrow();
  });
  it('explanation has deterministic limitations, no numerical prediction and no stale values', () => {
    const v = row();
    expect(c8Explanation(v, true).values).toEqual(
      (v.valuesJson as C8Object).values,
    );
    expect(c8Explanation(v, false).values).toEqual([]);
    const disabled = c8Explanation({ ...v, kind: 'PREDICTION' }, true);
    expect(disabled.numericPrediction).toBeNull();
    expect(disabled.available).toBe(false);
    expect(disabled.boundaries.valueImpliesConsent).toBe(false);
    expect(disabled.calibration).toBe('UNAVAILABLE');
  });
});

it('compares only matching window/basis/currency and preserves noncausal meaning', () => {
  const a = row(),
    b = row();
  expect(c8CompareExplanations(a, b, true).comparable).toBe(true);
  expect(
    c8CompareExplanations(a, { ...b, currency: 'USD' }, true).comparable,
  ).toBe(false);
  expect(c8CompareExplanations(a, b, false).comparable).toBe(false);
});
