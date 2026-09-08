import {
  financeMetric,
  financeMoney,
  type MeasurementFinancialRead,
} from './measurement.finance.facts';
import type { MeasurementMetric } from './measurement.contract';

export function staffGoalTargetMinor(value: unknown): string | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100_000_000
  )
    return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && Math.abs(value * 100 - minor) < 1e-6
    ? String(minor)
    : null;
}

/** Payroll row qualification is independent of the company aggregate's status. */
export function staffGoalFacts(input: {
  summary: MeasurementFinancialRead | null;
  externalStaffId: string | null;
  targetMinor: string | null;
  targetProven: boolean;
  exactWindow: boolean;
  financeRef: number;
  goalRefs: number[];
}) {
  const { summary, externalStaffId, financeRef, goalRefs } = input;
  const reasons: string[] = [];
  const payrollRows =
    summary?.payroll.staff.filter((row) => row.staff_id === externalStaffId) ??
    [];
  const payroll =
    payrollRows.length === 1 &&
    payrollRows[0].status === 'available' &&
    payrollRows[0].verified
      ? payrollRows[0]
      : null;
  const salary =
    input.exactWindow && payroll ? financeMoney(payroll.accrued) : null;
  const paid = input.exactWindow && payroll ? financeMoney(payroll.paid) : null;
  const revenueRows =
    summary?.revenue.by_staff.filter(
      (row) => row.staff_id === externalStaffId,
    ) ?? [];
  const revenueQualified =
    !!summary &&
    summary.revenue.status === 'available' &&
    summary.revenue.verified &&
    summary.revenue.basis === 'provider_transactions';
  const revenue =
    revenueQualified && input.exactWindow && revenueRows.length === 1
      ? financeMoney(revenueRows[0])
      : null;
  const covered =
    !!revenue &&
    !!summary &&
    summary.revenue.staff_attribution_status === 'available' &&
    summary.revenue.staff_attribution_coverage_percent === 100 &&
    summary.revenue.unattributed_service_transaction_count === 0 &&
    summary.revenue.discarded.untyped_count === 0 &&
    summary.revenue.discarded.negative_count === 0;
  const target = input.targetProven ? input.targetMinor : null;
  const comparable =
    covered &&
    target !== null &&
    BigInt(target) > 0n &&
    revenue.currency === 'RUB';
  const metric = (
    key: string,
    value: string | null,
    unit: string,
    basis: string,
    refs: number[],
    currency: string | null = null,
    complete = false,
  ): MeasurementMetric =>
    financeMetric(
      key,
      value,
      unit,
      basis,
      value === null ? 'NOT_MEASURED' : complete ? 'COMPLETE' : 'PARTIAL',
      refs,
      currency,
    );
  const metrics = [
    metric(
      'confirmed_staff_salary_accrued',
      salary?.amount ?? null,
      salary ? 'money_minor' : 'status',
      'crm_payroll_accrual',
      [financeRef],
      salary?.currency ?? null,
      true,
    ),
    metric(
      'confirmed_staff_salary_paid',
      paid?.amount ?? null,
      paid ? 'money_minor' : 'status',
      'crm_payroll_paid',
      [financeRef],
      paid?.currency ?? null,
      true,
    ),
    metric(
      'observed_staff_revenue',
      revenue?.amount ?? null,
      revenue ? 'money_minor' : 'status',
      'provider_transactions',
      [financeRef],
      revenue?.currency ?? null,
    ),
    metric(
      'private_monthly_staff_revenue_target',
      target,
      'money_minor',
      'a22_private_staff_revenue_target',
      goalRefs,
      'RUB',
      true,
    ),
    metric(
      'observed_revenue_goal_progress_percent',
      comparable ? percentage(BigInt(revenue.amount), BigInt(target)) : null,
      'percent',
      'observed_provider_revenue_against_private_monthly_target',
      [financeRef, ...goalRefs],
    ),
    metric(
      'revenue_goal_progress_numerator',
      comparable ? revenue.amount : null,
      'money_minor',
      'provider_transactions',
      [financeRef],
      'RUB',
    ),
    metric(
      'revenue_goal_progress_denominator',
      comparable ? target : null,
      'money_minor',
      'a22_private_staff_revenue_target',
      goalRefs,
      'RUB',
      true,
    ),
  ];
  metrics.push(
    financeMetric(
      'goal_progress_rounding',
      'half_away_from_zero_2dp',
      'rule',
      'deterministic_integer_ratio',
      'COMPLETE',
      [],
    ),
  );
  if (!salary) reasons.push('confirmed_staff_salary_not_measured');
  if (!input.exactWindow)
    reasons.push('staff_finance_requires_exact_complete_local_days');
  if (!revenue) reasons.push('qualified_staff_revenue_not_measured');
  if (revenue && !covered)
    reasons.push('staff_revenue_attribution_or_operation_coverage_incomplete');
  if (revenue && target !== null && revenue.currency !== 'RUB')
    reasons.push('staff_goal_currency_mismatch');
  if (target === null)
    reasons.push('private_staff_revenue_target_not_measured');
  if (target === '0') reasons.push('staff_goal_zero_denominator');
  reasons.push(
    'provider_revenue_is_not_fiscal_cash_or_net',
    'goal_progress_is_observed_not_forecast',
  );
  return { metrics, reasons };
}
function percentage(value: bigint, target: bigint): string {
  const scaled =
    ((value < 0n ? -value : value) * 10000n + target / 2n) / target;
  return `${value < 0n && scaled ? '-' : ''}${scaled / 100n}.${String(scaled % 100n).padStart(2, '0')}`;
}
