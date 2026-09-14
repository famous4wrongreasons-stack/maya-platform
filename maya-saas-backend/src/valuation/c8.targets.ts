import { C8_TARGETS, C8Target, c8Hash } from './c8.contract';
/** Semantic manifests only. No fitted model or numerical quality threshold is released. */
export const C8_TARGET_DEFINITIONS = Object.freeze({
  attended_return: {
    event: 'exact_client_attended_visit_in_horizon',
    label: 'binary',
    baseline: 'qualified_prior_prevalence',
    maturity: 'complete_horizon_coverage',
  },
  appointment_no_show: {
    event: 'exact_future_appointment_attendance',
    label: 'binary',
    baseline: 'qualified_prior_prevalence',
    maturity: 'authoritative_appointment_outcome',
  },
  client_expected_value: {
    event: 'exact_client_same_basis_monetary_sum',
    label: 'money_minor',
    baseline: 'qualified_matching_horizon_mean',
    maturity: 'complete_monetary_horizon',
  },
  business_revenue: {
    event: 'exact_scope_same_basis_monetary_sum',
    label: 'money_minor',
    baseline: 'previous_comparable_period',
    maturity: 'complete_monetary_horizon',
  },
  staff_earnings_conditional: {
    event: 'exact_staff_actual_accrual_known_terms',
    label: 'money_minor',
    baseline: 'previous_comparable_accrual',
    maturity: 'qualified_terms_and_accrual',
  },
  observed_booking_demand: {
    event: 'canonical_created_event_with_qualified_clock',
    label: 'count',
    baseline: 'previous_comparable_count',
    maturity: 'complete_creation_event_window',
  },
  scheduled_utilization: {
    event: 'scheduled_occupied_over_available_minutes',
    label: 'ratio',
    baseline: 'previous_comparable_utilization',
    maturity: 'qualified_capacity_window',
  },
  statistical_deviation: {
    event: 'future_metric_vs_qualified_forecast_distribution',
    label: 'deviation',
    baseline: 'qualified_forecast_residual',
    maturity: 'qualified_metric_window',
  },
} satisfies Record<
  C8Target,
  { event: string; label: string; baseline: string; maturity: string }
>);
export const C8_SEMANTIC_EVALUATION = Object.freeze({
  version: 1,
  state: 'UNQUALIFIED',
  numericActivationContract: null,
  calibration: 'UNAVAILABLE',
});
export const C8_SEMANTIC_EVALUATION_HASH = c8Hash(C8_SEMANTIC_EVALUATION);
export function c8TargetReadiness(target: C8Target) {
  if (!C8_TARGETS.includes(target)) throw new Error('c8_target_unsupported');
  return Object.freeze({
    target,
    implementedContract: true,
    qualifiedData: 'INSUFFICIENT',
    calibration: 'UNAVAILABLE',
    activation: 'DISABLED',
    userVisibleNumericPrediction: false,
    reason: 'qualified_model_and_approved_activation_evidence_required',
  });
}
export function c8RequireNumericActivation(): never {
  throw new Error('c8_numeric_activation_not_qualified');
}
