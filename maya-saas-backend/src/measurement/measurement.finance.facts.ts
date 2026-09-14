import type { CrmService } from '../crm/crm.service';
import { isEvidencedBasis } from '../domain/revenue-basis';
import { foldExpenseRows } from '../expenses/expense-period.reader';
import { resolveExpenseCategory } from '../expenses/expense-category';
import {
  measurementHash,
  MeasurementMetric,
  Completeness,
} from './measurement.contract';

/** Consume the canonical service read contract; do not couple a measurement to an adapter. */
export type MeasurementFinancialRead = Awaited<
  ReturnType<CrmService['getFinancialSummary']>
>;
export type MeasurementValueRead = NonNullable<
  Awaited<
    ReturnType<CrmService['getClientLoyaltyEvidenceByExternalIdReadOnly']>
  >
>;
type FinancialMoney = NonNullable<MeasurementFinancialRead['revenue']['total']>;

export function financeMetric(
  key: string,
  value: string | boolean | null,
  unit: string,
  basis: string,
  state: Completeness,
  sourceRefs: number[],
  currency: string | null = null,
  dimensions: Record<string, string> = {},
): MeasurementMetric {
  return { key, value, unit, basis, state, sourceRefs, currency, dimensions };
}
export function financeMoney(value: FinancialMoney | null | undefined) {
  return value &&
    Number.isSafeInteger(value.amount_kopecks) &&
    /^[A-Z]{3}$/.test(value.currency)
    ? { amount: String(value.amount_kopecks), currency: value.currency }
    : null;
}

/** Existing payroll DTO facts only. No percentage model or revenue-to-salary inference. */
export function measurementSalaryFacts(
  summary: MeasurementFinancialRead,
  sourceRef: number,
) {
  const eligible =
    summary.payroll.status === 'available' && summary.payroll.verified;
  return (['accrued', 'paid'] as const).map((kind) => {
    const money = eligible
      ? financeMoney(summary.payroll[`${kind}_total`])
      : null;
    return financeMetric(
      `confirmed_salary_${kind}`,
      money?.amount ?? null,
      money ? 'money_minor' : 'status',
      `provider_payroll_${kind}`,
      money ? 'COMPLETE' : 'NOT_MEASURED',
      [sourceRef],
      money?.currency ?? null,
    );
  });
}

/** Minimize before hashing: staff names, account labels and provider messages never enter C7. */
export function measurementFinancialFacts(
  summary: MeasurementFinancialRead,
  sourceRef: number,
) {
  const revenue = summary.revenue;
  const gross =
    revenue.status === 'available' &&
    revenue.verified &&
    isEvidencedBasis(revenue.basis)
      ? financeMoney(revenue.total)
      : null;
  const metrics = [
    financeMetric(
      'provider_reported_gross',
      gross?.amount ?? null,
      gross ? 'money_minor' : 'status',
      'provider_transactions',
      gross ? 'PARTIAL' : 'NOT_MEASURED',
      [sourceRef],
      gross?.currency ?? null,
    ),
    ...measurementSalaryFacts(summary, sourceRef),
  ];
  for (const kind of ['negative', 'zero', 'untyped'] as const) {
    const count = revenue.discarded?.[`${kind}_count`];
    const valid = Number.isSafeInteger(count) && count >= 0;
    metrics.push(
      financeMetric(
        `discarded_${kind}_operations`,
        valid ? String(count) : null,
        'count',
        'provider_transactions_discarded',
        valid ? 'COMPLETE' : 'NOT_MEASURED',
        [sourceRef],
      ),
    );
  }
  for (const axis of ['staff', 'service'] as const) {
    const coverage = revenue[`${axis}_attribution_coverage_percent`];
    const valid =
      typeof coverage === 'number' &&
      Number.isFinite(coverage) &&
      coverage >= 0 &&
      coverage <= 100;
    metrics.push(
      financeMetric(
        `${axis}_revenue_attribution_coverage_percent`,
        valid ? String(coverage) : null,
        'percent',
        'provider_transactions',
        valid ? 'PARTIAL' : 'NOT_MEASURED',
        [sourceRef],
      ),
    );
    const status = revenue[`${axis}_attribution_status`];
    const known = ['available', 'partial', 'unavailable'].includes(status);
    metrics.push(
      financeMetric(
        `${axis}_revenue_attribution_status`,
        known ? status : null,
        'status',
        'provider_transactions',
        known ? 'COMPLETE' : 'NOT_MEASURED',
        [sourceRef],
      ),
    );
  }
  return metrics;
}

export type FinanceExpenseRow = {
  id: string;
  source: string;
  externalId: string | null;
  category: string;
  currency: string;
  amountKopecks: number;
  occurredAt: Date;
  updatedAt: Date;
};

/** The canonical expense fold owns arithmetic/category aliases. No amount/date/name dedup. */
export function measurementExpenseFacts(
  rows: FinanceExpenseRow[],
  sourceRef: number,
) {
  const identities = new Set<string>();
  const durable = new Set<string>();
  const sum = new Map<string, bigint>();
  for (const row of rows) {
    if (
      identities.has(row.id) ||
      (row.externalId && durable.has(row.externalId))
    )
      throw new Error('measurement_duplicate_expense_source_identity');
    identities.add(row.id);
    if (row.externalId) durable.add(row.externalId);
    if (
      !Number.isSafeInteger(row.amountKopecks) ||
      !/^[A-Z]{3}$/.test(row.currency)
    )
      throw new Error('measurement_expense_money_invalid');
    sum.set(
      row.currency,
      (sum.get(row.currency) ?? 0n) + BigInt(row.amountKopecks),
    );
  }
  if (
    [...sum.values()].some(
      (n) =>
        n > BigInt(Number.MAX_SAFE_INTEGER) ||
        n < BigInt(Number.MIN_SAFE_INTEGER),
    )
  )
    throw new Error('measurement_expense_total_out_of_range');
  const folded = foldExpenseRows(rows);
  const metrics: MeasurementMetric[] = [
    financeMetric(
      'observed_expense_count',
      String(rows.length),
      'count',
      'canonical_recorded_expenses',
      'COMPLETE',
      [sourceRef],
    ),
  ];
  for (const total of folded.totals)
    metrics.push(
      financeMetric(
        'observed_expenses',
        String(total.amount_kopecks),
        'money_minor',
        'canonical_recorded_expenses',
        'COMPLETE',
        [sourceRef],
        total.currency,
      ),
    );
  const categories = [...folded.by_category].sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      b.amount_kopecks - a.amount_kopecks ||
      a.category.localeCompare(b.category),
  );
  for (const row of categories)
    metrics.push(
      financeMetric(
        `expense_category_${row.category}`,
        String(row.amount_kopecks),
        'money_minor',
        'canonical_recorded_expenses',
        'COMPLETE',
        [sourceRef],
        row.currency,
      ),
    );
  const groups = new Map<
    string,
    {
      raw: string;
      source: string;
      currency: string;
      amount: bigint;
      count: number;
    }
  >();
  for (const row of rows) {
    const key = measurementHash([row.category, row.source, row.currency]);
    const prior = groups.get(key);
    groups.set(key, {
      raw: row.category,
      source: row.source,
      currency: row.currency,
      amount: (prior?.amount ?? 0n) + BigInt(row.amountKopecks),
      count: (prior?.count ?? 0) + 1,
    });
  }
  const reasons: string[] = [];
  // Refuse the complete raw-label breakdown as one unit if it cannot fit. Totals remain exact.
  if (
    groups.size > 24 ||
    [...groups.values()].some(
      (g) => g.raw.length > 240 || g.source.length > 240,
    )
  ) {
    reasons.push('expense_raw_category_evidence_exceeds_bound');
    metrics.push(
      financeMetric(
        'expense_raw_category_evidence',
        null,
        'status',
        'canonical_recorded_expenses',
        'UNAVAILABLE',
        [sourceRef],
      ),
    );
  } else {
    for (const [hash, group] of [...groups].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const dimensions = { source: hash };
      metrics.push(
        financeMetric(
          'expense_raw_category',
          resolveExpenseCategory(group.raw).raw,
          'label',
          'accepted_expense_source_category',
          'COMPLETE',
          [sourceRef],
          group.currency,
          dimensions,
        ),
        financeMetric(
          'expense_raw_canonical_category',
          resolveExpenseCategory(group.raw).slug,
          'label',
          'canonical_recorded_expenses',
          'COMPLETE',
          [sourceRef],
          group.currency,
          dimensions,
        ),
        financeMetric(
          'expense_source',
          group.source,
          'label',
          'canonical_recorded_expenses',
          'COMPLETE',
          [sourceRef],
          group.currency,
          dimensions,
        ),
        financeMetric(
          'expense_source_category_total',
          String(group.amount),
          'money_minor',
          'canonical_recorded_expenses',
          'COMPLETE',
          [sourceRef],
          group.currency,
          dimensions,
        ),
      );
    }
  }
  for (const currency of folded.totals.map((row) => row.currency)) {
    const sources = new Set(
      rows.filter((row) => row.currency === currency).map((row) => row.source),
    );
    const unresolved =
      sources.size > 1 ||
      [...sources].some((source) => !['manual', 'crm'].includes(source));
    metrics.push(
      financeMetric(
        'expense_overlap_status',
        unresolved ? 'unresolved' : 'single_source',
        'status',
        'durable_source_identity_only',
        'COMPLETE',
        [sourceRef],
        currency,
      ),
    );
    if (unresolved) reasons.push('expense_cross_source_overlap_unresolved');
  }
  if (
    rows.some((row) => resolveExpenseCategory(row.category).slug === 'payroll')
  )
    reasons.push('recorded_payroll_not_combined_with_provider_salary');
  return {
    metrics,
    reasons,
    currencies: folded.totals.map((row) => row.currency),
  };
}
