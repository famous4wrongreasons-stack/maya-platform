import { C8ResultRevision } from '@prisma/client';
import {
  C8Feature,
  C8Object,
  c8Features,
  c8Hash,
  c8Object,
} from './c8.contract';
import { c8Policy } from './c8.policy';
import { c8ShiftWindow } from './c8.time';

export type C8DeterministicOutput = {
  valuesJson: C8Object;
  reasonsJson: C8Object[];
  rankingJson: C8Object | null;
};
export const c8Reason = (
  code: string,
  featureRefs: string[] = [],
  evidenceRefs: number[] = [],
): C8Object => ({ code, featureRefs, evidenceRefs, parameters: {} });
const reasonOutput = (
  values: C8Object[],
  reasons: C8Object[],
  limitations: string[],
): C8DeterministicOutput => ({
  valuesJson: { version: 1, values, limitations },
  reasonsJson: reasons,
  rankingJson: null,
});

/** Decimal comparison is exact. No floating-point money, default zero or hidden score. */
export function c8CompareScalar(
  a: string | boolean,
  b: string | boolean,
): number {
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    if (typeof a !== 'boolean' || typeof b !== 'boolean')
      throw new Error('c8_incompatible_scalar');
    return a === b ? 0 : a ? 1 : -1;
  }
  const parse = (s: string) => {
    if (s.length > 240 || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s))
      throw new Error('c8_decimal_comparator_required');
    const [whole, fraction = ''] = s.split('.');
    return { n: BigInt(whole + fraction), scale: fraction.length };
  };
  const x = parse(a),
    y = parse(b),
    scale = Math.max(x.scale, y.scale);
  const left = x.n * 10n ** BigInt(scale - x.scale),
    right = y.n * 10n ** BigInt(scale - y.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

function features(row: C8ResultRevision) {
  const input = c8Object(row.inputSnapshotJson, [
    'version',
    'features',
    'missingness',
    'coverage',
    'dependencies',
  ]);
  return c8Features(input.features, row.tenantId, row.t0);
}
function requireFeature(
  fs: C8Feature[],
  key: string,
): C8Feature & { value: string } {
  const f = fs.find((f) => f.key === key);
  if (!f || f.value === null || !f.sourceRefs.length)
    throw new Error('c8_required_fact_unavailable');
  return { ...f, value: f.value };
}
/** This function accepts already admitted, server-derived evidence. It cannot admit a source fact. */
export function c8ComputeDeterministic(
  row: C8ResultRevision,
  policyValue: unknown,
): C8DeterministicOutput {
  const policy = c8Policy(policyValue),
    fs = features(row);
  if (
    row.eligibility !== 'ELIGIBLE' ||
    ['UNAVAILABLE', 'NOT_MEASURED'].includes(row.completeness)
  )
    throw new Error('c8_result_not_eligible');
  const limitations =
    row.completeness === 'COMPLETE' ? [] : ['known_source_coverage_partial'];
  if (row.ruleKey.startsWith('c8.value/')) {
    const key = row.ruleKey.slice('c8.value/'.length);
    const measure = (policy.valueMeasures as C8Object[]).find(
      (m) => m.key === key,
    );
    if (
      !measure ||
      row.kind !== 'OBSERVED_VALUE' ||
      measure.basis !== row.basis ||
      measure.currency !== row.currency
    )
      throw new Error('c8_value_policy_mismatch');
    const f = requireFeature(fs, row.basis);
    if (
      f.currency !== row.currency ||
      f.basis !== row.basis ||
      f.unit !== (row.currency ? 'money_minor' : 'count')
    )
      throw new Error('c8_fact_basis_currency_mismatch');
    if (!/^-?(0|[1-9]\d*)$/.test(f.value))
      throw new Error('c8_exact_integral_value_required');
    return reasonOutput(
      [
        {
          key,
          type: 'observed',
          value: f.value,
          unit: f.unit,
          basis: row.basis,
          currency: row.currency,
        },
      ],
      [c8Reason('qualified_named_observation', [f.key])],
      [
        ...limitations,
        ...(['booked_value', 'provider_reported_gross'].includes(row.basis)
          ? ['observed_proxy_not_cash_profit_or_clv']
          : []),
      ],
    );
  }
  if (row.ruleKey.startsWith('c8.dormancy/')) {
    const key = row.ruleKey.slice('c8.dormancy/'.length);
    const rule = (policy.dormancyRules as C8Object[]).find(
      (m) => m.ruleKey === key,
    );
    if (
      !rule ||
      row.kind !== 'POLICY_SIGNAL' ||
      row.basis !== 'proven_attendance_policy'
    )
      throw new Error('c8_dormancy_policy_mismatch');
    const f = requireFeature(fs, 'last_proven_visit_at');
    if (
      rule.minimumCoverage === 'COMPLETE' &&
      f.sourceRefs.some((r) => r.coverage !== 'COMPLETE')
    )
      throw new Error('c8_absence_coverage_unavailable');
    const last = new Date(f.value);
    if (!Number.isFinite(last.getTime()) || last > row.t0)
      throw new Error('c8_last_visit_not_proven');
    const deadline = c8ShiftWindow(last, rule.elapsed, row.timezone, 1);
    const value =
      rule.comparison === 'gt' ? row.t0 > deadline : row.t0 >= deadline;
    return reasonOutput(
      [
        {
          key,
          type: 'policy',
          value,
          unit: 'boolean',
          basis: row.basis,
          currency: null,
        },
      ],
      [
        c8Reason(
          value
            ? 'confirmed_dormancy_rule_met'
            : 'confirmed_dormancy_rule_not_met',
          [f.key],
        ),
      ],
      [...limitations, 'policy_signal_not_value_consent_or_return_probability'],
    );
  }
  if (row.ruleKey === 'c8.scenario/booked_appointment') {
    if (
      row.kind !== 'SCENARIO' ||
      row.subjectKind !== 'appointment' ||
      row.basis !== 'booked_value'
    )
      throw new Error('c8_scenario_scope_required');
    const f = requireFeature(fs, 'booked_value');
    if (
      f.currency !== row.currency ||
      f.unit !== 'money_minor' ||
      !row.horizonEnd
    )
      throw new Error('c8_conditional_amount_unavailable');
    return reasonOutput(
      [
        {
          key: 'conditional_booked_value',
          type: 'scenario',
          value: f.value,
          unit: f.unit,
          basis: row.basis,
          currency: row.currency,
        },
      ],
      [c8Reason('existing_booking_retained_scenario', [f.key])],
      [
        ...limitations,
        'conditional_existing_booking_value_not_cash_received',
        'not_expected_return_revenue_or_causal_uplift',
      ],
    );
  }
  throw new Error('c8_released_deterministic_rule_required');
}

export type C8RankCandidate = {
  subjectRef: string;
  results: C8ResultRevision[];
  unavailableReasons: string[];
};
/** Whole bounded cohort. Its declared comparator remains intact when any component is unavailable. */
export function c8RankCohort(input: {
  tenantId: string;
  policy: unknown;
  objectiveKey: string;
  candidates: C8RankCandidate[];
  queryHash: string;
  coverage: 'COMPLETE' | 'PARTIAL';
  dependencyDeadline: string;
}): C8Object {
  if (
    input.candidates.length > 5000 ||
    new Set(input.candidates.map((c) => c.subjectRef)).size !==
      input.candidates.length
  )
    throw new Error('c8_complete_bounded_cohort_required');
  const p = c8Policy(input.policy);
  const objective = (p.rankingObjectives as C8Object[]).find(
    (o) => o.key === input.objectiveKey,
  );
  if (!objective) throw new Error('c8_confirmed_ranking_objective_required');
  const comparators = objective.comparators as {
    measureKey: string;
    direction: 'asc' | 'desc';
  }[];
  const predictive = new Set(
    (p.predictionTargets as C8Object[]).map((t) => t.targetKey),
  );
  if (comparators.some((c) => predictive.has(c.measureKey)))
    throw new Error('c8_predictive_comparator_unavailable');
  const signatures = new Map<string, string>();
  const excluded: C8Object[] = [];
  const ranked: Array<{
    subject: string;
    rows: C8ResultRevision[];
    values: (string | boolean)[];
    tieKey: string;
  }> = [];
  for (const candidate of [...input.candidates].sort((a, b) =>
    a.subjectRef < b.subjectRef ? -1 : a.subjectRef > b.subjectRef ? 1 : 0,
  )) {
    const reasons = [...candidate.unavailableReasons],
      rows: C8ResultRevision[] = [],
      values: (string | boolean)[] = [];
    for (const comparator of comparators) {
      const matches = candidate.results.filter(
        (r) =>
          r.ruleKey === `c8.value/${comparator.measureKey}` ||
          r.ruleKey === `c8.dormancy/${comparator.measureKey}`,
      );
      if (matches.length !== 1) {
        reasons.push('exact_comparator_result_unavailable');
        continue;
      }
      const row = matches[0];
      if (
        row.tenantId !== input.tenantId ||
        row.subjectKind !== 'client' ||
        row.subjectId !== candidate.subjectRef ||
        row.state !== 'PUBLISHED' ||
        !row.snapshotHash ||
        row.eligibility !== 'ELIGIBLE' ||
        row.qualification === 'UNQUALIFIED' ||
        ['UNAVAILABLE', 'NOT_MEASURED'].includes(row.completeness) ||
        row.expiresAt <= new Date()
      ) {
        reasons.push('comparator_result_not_eligible');
        continue;
      }
      const payload = c8Object(row.valuesJson, [
        'version',
        'values',
        'limitations',
      ]);
      if (!Array.isArray(payload.values))
        throw new Error('c8_ranking_values_contract');
      const found = payload.values
        .map((v) =>
          c8Object(v, ['key', 'type', 'value', 'unit', 'basis', 'currency']),
        )
        .filter((v) => v.key === comparator.measureKey);
      if (
        found.length !== 1 ||
        !['observed', 'policy'].includes(String(found[0].type)) ||
        !(
          typeof found[0].value === 'string' ||
          typeof found[0].value === 'boolean'
        )
      ) {
        reasons.push('comparator_fact_unavailable');
        continue;
      }
      const namedMeasure = (p.valueMeasures as C8Object[]).find(
        (m) => m.key === comparator.measureKey,
      );
      if (
        namedMeasure &&
        (namedMeasure.basis !== row.basis ||
          namedMeasure.currency !== row.currency)
      ) {
        reasons.push('comparator_policy_basis_mismatch');
        continue;
      }
      const signature = c8Hash([
        row.basis,
        row.currency,
        row.kind === 'POLICY_SIGNAL' ? null : row.periodFrom.toISOString(),
        row.periodTo.toISOString(),
        row.timezone,
        row.horizonEnd?.toISOString() ?? null,
        row.policyRevisionId,
        row.policyContentHash,
        row.scopeJson,
      ]);
      const previous = signatures.get(comparator.measureKey);
      if (previous && previous !== signature) {
        reasons.push('incomparable_basis_window_or_scope');
        continue;
      }
      signatures.set(comparator.measureKey, signature);
      rows.push(row);
      values.push(found[0].value);
    }
    if (reasons.length || values.length !== comparators.length)
      excluded.push({
        subjectRef: candidate.subjectRef,
        reasonCodes: [...new Set(reasons)].sort(),
      });
    else
      ranked.push({
        subject: candidate.subjectRef,
        rows,
        values,
        tieKey: c8Hash(values),
      });
  }
  ranked.sort((a, b) => {
    for (let i = 0; i < comparators.length; i++) {
      const compared = c8CompareScalar(a.values[i], b.values[i]);
      if (compared)
        return comparators[i].direction === 'asc' ? compared : -compared;
    }
    return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0;
  });
  return {
    version: 1,
    objectiveKey: input.objectiveKey,
    queryHash: input.queryHash,
    coverage: input.coverage,
    comparators,
    tieBreak: 'opaque_subject_id',
    members: ranked.map((r, i) => ({
      subjectRef: r.subject,
      resultRef: {
        tenantId: input.tenantId,
        id: r.rows[0].id,
        hash: r.rows[0].snapshotHash,
      },
      position: i + 1,
      tieKey: r.tieKey,
    })),
    excluded,
    dependencyDeadline: input.dependencyDeadline,
  };
}
