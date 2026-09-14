import { C8ResultRevision } from '@prisma/client';
import { C8Object } from './c8.contract';

/** Deterministic reason bundle. A language model may phrase it, never change facts, policy or availability. */
export function c8Explanation(
  row: C8ResultRevision,
  currentlyEligible: boolean,
) {
  const available =
    currentlyEligible && row.state === 'PUBLISHED' && row.kind !== 'PREDICTION';
  const values = available
    ? ((row.valuesJson as C8Object | null)?.values ?? [])
    : [];
  const reasonRows = (row.reasonsJson ?? []) as unknown as Array<{
    code: string;
  }>;
  return {
    version: 1,
    kind: row.kind,
    available,
    basis: row.basis,
    currency: row.currency,
    asOf: row.t0.toISOString(),
    period: {
      from: row.periodFrom.toISOString(),
      to: row.periodTo.toISOString(),
      timezone: row.timezone,
    },
    completeness: row.completeness,
    qualification: row.qualification,
    values,
    reasons: [
      ...new Set([
        ...reasonRows.map((r) => r.code),
        ...(currentlyEligible ? [] : ['current_source_or_policy_unavailable']),
        ...(row.kind === 'PREDICTION'
          ? ['qualified_model_and_approved_activation_evidence_required']
          : []),
      ]),
    ],
    rule: { key: row.ruleKey, version: row.ruleVersion },
    boundaries: {
      factIsPrediction: false,
      predictionIsPolicy: false,
      valueImpliesConsent: false,
      rankingImpliesContactPermission: false,
      rankingImpliesActionAuthority: false,
      opportunityImpliesExecution: false,
    },
    numericPrediction: null,
    calibration: 'UNAVAILABLE',
    activation: 'DISABLED',
    message:
      row.kind === 'PREDICTION'
        ? 'Прогноз пока недоступен — недостаточно проверенных данных.'
        : available
          ? 'Результат рассчитан по указанным фактам и подтверждённому правилу.'
          : 'Результат сейчас недоступен: факты или правило требуют проверки.',
  };
}

/** Comparison is permitted only on identical qualified dimensions; no causal or incremental claim. */
export function c8CompareExplanations(
  left: C8ResultRevision,
  right: C8ResultRevision,
  current: boolean,
) {
  const a = c8Explanation(left, current),
    b = c8Explanation(right, current);
  const scopeA = left.scopeJson as C8Object,
    scopeB = right.scopeJson as C8Object;
  const comparable =
    a.available &&
    b.available &&
    left.kind === right.kind &&
    left.ruleKey === right.ruleKey &&
    left.ruleVersion === right.ruleVersion &&
    left.policyRevisionId === right.policyRevisionId &&
    left.basis === right.basis &&
    left.currency === right.currency &&
    left.completeness === right.completeness &&
    left.timezone === right.timezone &&
    left.periodFrom.getTime() === right.periodFrom.getTime() &&
    left.periodTo.getTime() === right.periodTo.getTime() &&
    JSON.stringify(scopeA.branchIds) === JSON.stringify(scopeB.branchIds) &&
    JSON.stringify(scopeA.serviceScope) === JSON.stringify(scopeB.serviceScope);
  return {
    version: 1,
    comparable,
    left: a,
    right: b,
    reason: comparable
      ? 'same_qualified_dimensions'
      : 'incomparable_basis_scope_window_or_coverage',
    causalClaim: false,
  };
}
