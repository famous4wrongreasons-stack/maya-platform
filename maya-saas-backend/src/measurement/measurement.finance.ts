import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CrmService } from '../crm/crm.service';
import type {
  CrmFinancialSummary,
  ClientLoyaltySnapshot,
} from '../crm/crm-adapter.interface';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  measurementHash,
  MeasurementResult,
  MeasurementSource,
  NormalizedMeasurementIntent,
} from './measurement.contract';
import {
  financeMetric,
  measurementExpenseFacts,
  measurementFinancialFacts,
} from './measurement.finance.facts';
import { measurementReadWindow } from './measurement.period';
import {
  measurementValueFacts,
  readMeasurementValueAccount,
} from './measurement.value';

export const MEASUREMENT_FINANCE_QUERY = 'c7.finance.read.v1';
export const MEASUREMENT_VALUE_QUERY = 'c7.value.read.v1';
export const MEASUREMENT_EXPENSE_READ_LIMIT = 10_000;

/** Read-only package. The shared MeasurementService remains the sole publisher.
 * This class never accepts provider DTOs or caller-supplied measured values.
 */
@Injectable()
export class MeasurementFinanceReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly context: TenantContextService,
  ) {}

  supports(kind: string): boolean {
    return ['business_period', 'value_discrepancy'].includes(kind);
  }

  async authorize(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    this.context.assertTenantId(tenantId);
    if (this.context.get()?.source !== 'system' || this.context.get()?.userId)
      throw new Error('measurement_system_producer_required');
    if (!this.supports(i.kind)) throw new Error('measurement_rule_not_enabled');
    const value = i.kind === 'value_discrepancy';
    const query = i.scope.sourceQuery;
    if (
      i.scope.capabilityKey !==
        (value ? 'clients.dossier.read' : 'analytics.business.finance.read') ||
      i.branchId ||
      i.scope.branchIds.length ||
      i.staffId ||
      i.appointmentId ||
      i.configurationUserId ||
      (!value && i.clientId) ||
      (value && !i.clientId) ||
      Object.keys(i.scope.dimensions).some(
        (key) => !value || key !== 'accountId',
      ) ||
      Object.keys(query).some(
        (key) => !['provider', 'integrationId', 'queryContract'].includes(key),
      ) ||
      query.queryContract !==
        (value ? MEASUREMENT_VALUE_QUERY : MEASUREMENT_FINANCE_QUERY) ||
      !query.provider
    )
      throw new Error('measurement_scope_not_supported_by_rule');
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        status: true,
        calendarSource: true,
        defaultTimezone: true,
      },
    });
    if (!tenant || tenant.status !== 'active')
      throw new Error('measurement_tenant_inactive');
    if (
      !tenant.defaultTimezone ||
      new Intl.DateTimeFormat('en', {
        timeZone: tenant.defaultTimezone,
      }).resolvedOptions().timeZone !== i.timezone
    )
      throw new Error('measurement_finance_timezone_mismatch');
    const integration = await db.crmIntegration.findUnique({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        provider: true,
        status: true,
        updatedAt: true,
      },
    });
    if (tenant.calendarSource === 'internal' && !value) {
      if (query.provider !== 'internal' || query.integrationId)
        throw new Error('measurement_finance_integration_mismatch');
      return { tenant, integration: null };
    }
    if (
      tenant.calendarSource !== 'external' ||
      !query.integrationId ||
      !integration ||
      integration.id !== query.integrationId ||
      integration.provider !== query.provider ||
      integration.status !== 'active'
    )
      throw new Error('measurement_finance_integration_mismatch');
    // Existing finance/card contracts have been inspected for this provider only.
    if (integration.provider !== 'yclients')
      throw new Error('measurement_finance_provider_not_supported');
    if (value) await readMeasurementValueAccount(db, tenantId, i);
    return { tenant, integration };
  }

  private binding(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    authority: Awaited<ReturnType<MeasurementFinanceReader['authorize']>>,
    observedAt: string,
  ): MeasurementSource {
    return {
      owner: 'CrmIntegration',
      kind:
        i.kind === 'business_period'
          ? 'financial_query_binding'
          : 'value_query_binding',
      tenantId,
      id:
        authority.integration?.id ??
        measurementHash(['c7.internal-finance/1', tenantId]),
      stateHash: measurementHash(authority),
      observedAt,
      qualification: 'VERIFIED',
      coverage: 'server_bound_query_authority',
    };
  }

  /** Called before the publication transaction. Only database work enters read snapshots. */
  async read(
    tenantId: string,
    i: NormalizedMeasurementIntent,
  ): Promise<MeasurementResult> {
    await this.authorize(tenantId, i);
    if (i.kind === 'value_discrepancy') return this.value(tenantId, i);
    const window = measurementReadWindow(i);
    if (!window.nonempty)
      return {
        sources: [],
        dependencies: [],
        metrics: [],
        reasons: ['measurement_period_not_started'],
        completeness: 'NOT_MEASURED',
        qualification: 'UNQUALIFIED',
        attributionStatus: 'NOT_APPLICABLE',
        creditedExecutionId: null,
        creditedAttemptId: null,
      };
    const local = await canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const authority = await this.authorize(tenantId, i, tx);
        const rows = await tx.expense.findMany({
          where: { tenantId, occurredAt: { gte: window.from, lt: window.to } },
          select: {
            id: true,
            source: true,
            externalId: true,
            category: true,
            currency: true,
            amountKopecks: true,
            occurredAt: true,
            updatedAt: true,
          },
          orderBy: { id: 'asc' },
          take: MEASUREMENT_EXPENSE_READ_LIMIT + 1,
        });
        const booked = await tx.$queryRaw<
          Array<{
            currency: string;
            amount: string | null;
            count: string;
            missing: string;
            updatedAt: Date | null;
          }>
        >`
        SELECT currency, sum("totalPriceKopecks")::text AS amount, count(*)::text AS count,
        count(*) FILTER (WHERE "totalPriceKopecks" IS NULL)::text AS missing, max("updatedAt") AS "updatedAt"
        FROM "Appointment" WHERE "tenantId"=${tenantId} AND "startAt">=${window.from} AND "startAt"<${window.to}
        GROUP BY currency ORDER BY currency LIMIT 9`;
        const declaration = window.wholeLocalDays
          ? await tx.expensePeriodDeclaration.findUnique({
              where: {
                tenantId_periodFromDay_periodToDay: {
                  tenantId,
                  periodFromDay: window.fromDay,
                  periodToDay: window.toDay,
                },
              },
              select: {
                id: true,
                declarationEpoch: true,
                actionExecutionId: true,
                createdAt: true,
                updatedAt: true,
              },
            })
          : null;
        const invalidation = declaration
          ? await tx.expensePeriodDeclarationInvalidation.findFirst({
              where: {
                tenantId,
                periodFromDay: window.fromDay,
                periodToDay: window.toDay,
              },
              orderBy: { nextDeclarationEpoch: 'desc' },
              select: { nextDeclarationEpoch: true },
            })
          : null;
        const execution = declaration?.actionExecutionId
          ? await tx.actionExecution.findFirst({
              where: {
                tenantId,
                id: declaration.actionExecutionId,
                state: 'SUCCEEDED',
              },
              select: { id: true },
            })
          : null;
        return {
          authority,
          rows,
          booked,
          declaration,
          invalidation,
          execution,
          observedAt: new Date().toISOString(),
        };
      },
      {
        readOnly: true,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    let summary: CrmFinancialSummary | null = null;
    const reasons: string[] = [
      'refund_coverage_not_supported',
      'fiscal_cash_not_proven',
      'net_requires_complete_cash_refund_and_expense_evidence',
      'source_observations_are_not_historical_reconstruction',
    ];
    if (window.open) reasons.push('measurement_period_open');
    if (local.authority.integration && window.wholeLocalDays) {
      try {
        summary = await this.crm.getFinancialSummary(tenantId, {
          from: window.from.toISOString(),
          to: new Date(window.to.getTime() - 1).toISOString(),
        });
      } catch {
        reasons.push('financial_reader_unavailable');
      }
      if (
        summary &&
        (summary.provider !== i.scope.sourceQuery.provider ||
          summary.source !== 'external_crm' ||
          !sameTimezone(summary.period.timezone, i.timezone) ||
          summary.period.from !== window.fromDay ||
          summary.period.to !== window.toDay)
      ) {
        summary = null;
        reasons.push('financial_reader_scope_mismatch');
      }
    } else
      reasons.push(
        local.authority.integration
          ? 'financial_reader_requires_complete_local_days'
          : 'financial_source_unavailable',
      );
    const observedAt = new Date().toISOString();
    if (
      measurementHash(await this.authorize(tenantId, i)) !==
      measurementHash(local.authority)
    )
      throw new Error('measurement_prepared_authority_changed');
    const expensesExceeded = local.rows.length > MEASUREMENT_EXPENSE_READ_LIMIT;
    const sources: MeasurementSource[] = [
      this.binding(tenantId, i, local.authority, local.observedAt),
      {
        owner: 'Expense',
        kind: 'canonical_expense_query',
        tenantId,
        id: measurementHash([
          'c7.expense-query/1',
          tenantId,
          window.from,
          window.to,
        ]),
        stateHash: measurementHash(
          expensesExceeded
            ? { readLimitExceeded: true, limit: MEASUREMENT_EXPENSE_READ_LIMIT }
            : local.rows,
        ),
        observedAt: local.observedAt,
        qualification: 'VERIFIED',
        coverage: expensesExceeded
          ? 'expense_query_row_limit_exceeded'
          : 'all_recorded_expenses_in_exact_window',
      },
      {
        owner: 'Appointment',
        kind: 'canonical_booked_period_query',
        tenantId,
        id: measurementHash([
          'c7.booked-period/1',
          tenantId,
          window.from,
          window.to,
        ]),
        stateHash: measurementHash(local.booked),
        observedAt: local.observedAt,
        qualification: 'VERIFIED',
        coverage: 'canonical_stored_booked_prices',
      },
      {
        owner: 'ExpensePeriodDeclaration',
        kind: 'canonical_declaration_query',
        tenantId,
        id: measurementHash([
          'c7.expense-declaration/1',
          tenantId,
          window.from,
          window.to,
        ]),
        stateHash: measurementHash({
          declaration: local.declaration,
          invalidation: local.invalidation,
          execution: local.execution,
        }),
        observedAt: local.observedAt,
        qualification: 'VERIFIED',
        coverage: 'exact_period_current_declaration_epoch',
      },
    ];
    const unavailableExpenses = (reason: string) => ({
      metrics: [
        financeMetric(
          'observed_expenses',
          null,
          'status',
          'canonical_recorded_expenses',
          'UNAVAILABLE',
          [1],
        ),
        financeMetric(
          'observed_expense_count',
          null,
          'count',
          'canonical_recorded_expenses',
          'UNAVAILABLE',
          [1],
        ),
      ],
      reasons: [reason],
      currencies: [] as string[],
    });
    let expenses: ReturnType<typeof measurementExpenseFacts>;
    try {
      expenses = expensesExceeded
        ? unavailableExpenses('expense_query_row_limit_exceeded')
        : measurementExpenseFacts(local.rows, 1);
    } catch (error) {
      const expected = [
        'measurement_duplicate_expense_source_identity',
        'measurement_expense_money_invalid',
        'measurement_expense_total_out_of_range',
      ];
      if (!(error instanceof Error) || !expected.includes(error.message))
        throw error;
      expenses = unavailableExpenses(error.message);
    }
    const metrics = [...expenses.metrics];
    reasons.push(...expenses.reasons);
    const bookedValid = local.booked.every(
      (row) =>
        /^[A-Z]{3}$/.test(row.currency) &&
        (row.amount === null || /^-?\d+$/.test(row.amount)) &&
        /^\d+$/.test(row.missing),
    );
    if (!bookedValid) {
      reasons.push('measurement_booked_value_invalid');
      metrics.push(
        financeMetric(
          'observed_booked_value',
          null,
          'status',
          'booked_prices',
          'UNAVAILABLE',
          [2],
        ),
      );
    }
    for (const row of bookedValid ? local.booked : []) {
      metrics.push(
        financeMetric(
          'observed_booked_value',
          row.amount,
          'money_minor',
          'booked_prices',
          row.amount === null ? 'NOT_MEASURED' : 'PARTIAL',
          [2],
          row.currency,
        ),
      );
      metrics.push(
        financeMetric(
          'bookings_without_price',
          row.missing,
          'count',
          'booked_prices',
          'COMPLETE',
          [2],
          row.currency,
        ),
      );
    }
    reasons.push('canonical_booked_history_coverage_not_proven_complete');
    const declared =
      !!local.declaration &&
      !!local.execution &&
      local.declaration.declarationEpoch !== null &&
      local.declaration.declarationEpoch >=
        (local.invalidation?.nextDeclarationEpoch ?? 0) &&
      local.declaration.updatedAt <= i.asOf;
    metrics.push(
      financeMetric(
        'expense_period_declared_complete',
        declared,
        'status',
        'existing_owner_declaration',
        'COMPLETE',
        [3],
      ),
    );
    if (!declared) reasons.push('expense_period_completeness_not_declared');
    if (
      local.rows.some((row) => row.updatedAt > i.asOf) ||
      local.booked.some((row) => row.updatedAt && row.updatedAt > i.asOf)
    )
      reasons.push('source_observed_after_business_cutoff');
    if (summary) {
      const facts = measurementFinancialFacts(summary, sources.length);
      sources.push({
        owner: 'CrmFinancialSummary',
        kind: 'canonical_financial_query',
        tenantId,
        id: measurementHash([
          'c7.finance-query/1',
          tenantId,
          i.scope.sourceQuery,
          window.from,
          window.to,
        ]),
        stateHash: measurementHash(facts),
        observedAt,
        qualification: 'SOURCE_LABELLED',
        coverage: 'provider_gross_excludes_refunds_and_untyped_operations',
      });
      metrics.push(...facts);
    } else
      for (const key of [
        'provider_reported_gross',
        'confirmed_salary_accrued',
        'confirmed_salary_paid',
      ])
        metrics.push(
          financeMetric(
            key,
            null,
            'status',
            key.startsWith('confirmed_salary')
              ? 'provider_payroll'
              : 'provider_transactions',
            'NOT_MEASURED',
            [],
          ),
        );
    const currencies = [
      ...new Set([
        ...expenses.currencies,
        ...(bookedValid ? local.booked.map((row) => row.currency) : []),
        ...metrics.flatMap((m) => (m.currency ? [m.currency] : [])),
      ]),
    ].sort();
    if (currencies.length > 8 || local.booked.length > 8)
      return {
        sources,
        dependencies: [],
        metrics: [],
        reasons: ['measurement_currency_groups_exceeds_bound'],
        completeness: 'UNAVAILABLE',
        qualification: 'UNQUALIFIED',
        attributionStatus: 'NOT_APPLICABLE',
        creditedExecutionId: null,
        creditedAttemptId: null,
      };
    for (const currency of currencies.length ? currencies : [null])
      for (const key of ['confirmed_cash', 'confirmed_refunds', 'net_profit'])
        metrics.push(
          financeMetric(
            key,
            null,
            currency ? 'money_minor' : 'status',
            key,
            'NOT_MEASURED',
            summary ? [sources.length - 1] : [],
            currency,
          ),
        );
    metrics.push(
      financeMetric(
        'observed_period_from',
        window.from.toISOString(),
        'instant',
        'canonical_half_open_window',
        'COMPLETE',
        [],
      ),
      financeMetric(
        'observed_period_to_exclusive',
        window.to.toISOString(),
        'instant',
        'canonical_half_open_window',
        'COMPLETE',
        [],
      ),
    );
    if (metrics.length > 256)
      return {
        sources,
        dependencies: [],
        metrics: [],
        reasons: ['measurement_finance_result_exceeds_bound'],
        completeness: 'UNAVAILABLE',
        qualification: 'UNQUALIFIED',
        attributionStatus: 'NOT_APPLICABLE',
        creditedExecutionId: null,
        creditedAttemptId: null,
      };
    return {
      sources,
      dependencies: [],
      metrics,
      reasons: [...new Set(reasons)].sort(),
      completeness: 'PARTIAL',
      qualification: summary ? 'SOURCE_LABELLED' : 'VERIFIED',
      attributionStatus: 'NOT_APPLICABLE',
      creditedExecutionId: null,
      creditedAttemptId: null,
    };
  }

  private async value(
    tenantId: string,
    i: NormalizedMeasurementIntent,
  ): Promise<MeasurementResult> {
    const local = await canonicalUtcTransaction(
      this.prisma,
      async (tx) => ({
        authority: await this.authorize(tenantId, i, tx),
        account: await readMeasurementValueAccount(tx, tenantId, i),
      }),
      {
        readOnly: true,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
    let card: ClientLoyaltySnapshot | null = null;
    try {
      card = await this.crm.getClientLoyaltyEvidenceByExternalIdReadOnly(
        tenantId,
        local.account.link.externalId,
      );
    } catch {
      /* An unavailable source is not a zero balance. */
    }
    const observedAt = new Date().toISOString();
    const result = measurementValueFacts(
      tenantId,
      i,
      local.account,
      card,
      observedAt,
      this.binding(tenantId, i, local.authority, observedAt),
    );
    return result;
  }

  /** Shared publisher invokes this under its DB transaction before immutable publication.
   * The binding is locked through publish; values retain their explicit observation time.
   */
  async assertPreparedCurrent(
    tenantId: string,
    i: NormalizedMeasurementIntent,
    result: MeasurementResult,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR SHARE`;
    if (i.scope.sourceQuery.integrationId)
      await tx.$queryRaw`SELECT id FROM "CrmIntegration" WHERE "tenantId"=${tenantId} AND id=${i.scope.sourceQuery.integrationId} FOR SHARE`;
    const authority = await this.authorize(tenantId, i, tx);
    const receipt = result.sources.find(
      (source) => source.owner === 'CrmIntegration',
    );
    if (!receipt && result.reasons.includes('measurement_period_not_started'))
      return;
    if (!receipt || receipt.stateHash !== measurementHash(authority))
      throw new Error('measurement_prepared_authority_changed');
    if (i.kind === 'value_discrepancy') {
      await tx.$queryRaw`SELECT id FROM "Client" WHERE "tenantId"=${tenantId} AND id=${i.clientId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "CrmClientLink" WHERE "tenantId"=${tenantId} AND "clientId"=${i.clientId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "LoyaltyAccount" WHERE "tenantId"=${tenantId} AND "clientId"=${i.clientId} FOR SHARE`;
      const local = await readMeasurementValueAccount(tx, tenantId, i);
      const expected = [
        ['LoyaltyAccount', measurementHash(local.account)],
        ['CrmClientLink', measurementHash(local.link)],
        [
          'LoyaltyTransaction',
          measurementHash({ latest: local.latest, count: local.count }),
        ],
      ];
      for (const [owner, hash] of expected)
        if (
          result.sources.find((source) => source.owner === owner)?.stateHash !==
          hash
        )
          throw new Error('measurement_prepared_value_changed');
    }
  }
}

function sameTimezone(left: string, right: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat('en', { timeZone: left }).resolvedOptions()
        .timeZone === right
    );
  } catch {
    return false;
  }
}
