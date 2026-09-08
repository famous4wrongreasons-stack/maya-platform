import type { CrmFinancialSummary } from '../crm/crm-adapter.interface';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MeasurementFinanceReader } from './measurement.finance';
import {
  FinanceExpenseRow,
  measurementExpenseFacts,
  measurementFinancialFacts,
} from './measurement.finance.facts';
import {
  normalizeMeasurement,
  validateMeasurementResult,
} from './measurement.contract';

const money = (amount_kopecks: number, currency = 'RUB') => ({
  amount_kopecks,
  currency,
  amount_major_units: amount_kopecks / 100,
});
function summary(): CrmFinancialSummary {
  return {
    source: 'external_crm',
    provider: 'yclients',
    verified: true,
    period: { from: '2026-09-01', to: '2026-09-07', timezone: 'Europe/Moscow' },
    revenue: {
      status: 'available',
      verified: true,
      basis: 'provider_transactions',
      total: money(10000),
      discarded: { negative_count: 0, zero_count: 0, untyped_count: 0 },
      transaction_count: 3,
      by_type: [],
      by_account: [],
      by_staff: [],
      by_service: [],
      staff_attribution_status: 'available',
      staff_attribution_coverage_percent: 100,
      unattributed_service_total: money(0),
      unattributed_service_transaction_count: 0,
      service_attribution_status: 'available',
      service_attribution_coverage_percent: 100,
      unattributed_service_breakdown_total: money(0),
      unattributed_service_breakdown_transaction_count: 0,
    },
    payroll: {
      status: 'available',
      verified: true,
      accrued_total: money(3000),
      paid_total: money(2000),
      balance_total: money(1000),
      staff: [],
    },
    warnings: [],
  };
}
function intent() {
  return normalizeMeasurement({
    kind: 'business_period',
    periodFrom: new Date('2026-08-31T21:00Z'),
    periodTo: new Date('2026-09-07T21:00Z'),
    asOf: new Date('2026-09-08T01:00Z'),
    timezone: 'Europe/Moscow',
    scope: {
      version: 1,
      capabilityKey: 'analytics.business.finance.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {
        provider: 'yclients',
        integrationId: 'integration-a',
        queryContract: 'c7.finance.read.v1',
      },
    },
  });
}
const expense = (
  overrides: Partial<FinanceExpenseRow> = {},
): FinanceExpenseRow => ({
  id: 'expense-a',
  source: 'manual',
  externalId: null,
  category: 'rent',
  currency: 'RUB',
  amountKopecks: 100,
  occurredAt: new Date('2026-09-02Z'),
  updatedAt: new Date('2026-09-02Z'),
  ...overrides,
});
function setup() {
  let inTransaction = false;
  const context = new TenantContextService();
  const integration = {
    id: 'integration-a',
    tenantId: 'tenant-a',
    provider: 'yclients',
    status: 'active',
    updatedAt: new Date('2026-09-01Z'),
  };
  const tenant = {
    id: 'tenant-a',
    status: 'active',
    calendarSource: 'external',
    defaultTimezone: 'Europe/Moscow',
  };
  const delegates = {
    tenant: { findUnique: jest.fn(() => Promise.resolve({ ...tenant })) },
    crmIntegration: {
      findUnique: jest.fn(() => Promise.resolve({ ...integration })),
    },
    expense: {
      findMany: jest.fn((args?: unknown) => {
        void args;
        return Promise.resolve([expense()]);
      }),
    },
    expensePeriodDeclaration: {
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    expensePeriodDeclarationInvalidation: { findFirst: jest.fn() },
    actionExecution: { findFirst: jest.fn() },
    $queryRaw: jest.fn((sql: unknown) =>
      Promise.resolve(
        String(
          (sql as { strings: string[] }).strings?.join('') ?? sql,
        ).includes('FROM "Appointment"')
          ? [
              {
                currency: 'RUB',
                amount: '12000',
                count: '3',
                missing: '0',
                updatedAt: new Date('2026-09-02Z'),
              },
            ]
          : [],
      ),
    ),
    $executeRaw: jest.fn(() => Promise.resolve(0)),
  };
  const db = {
    ...delegates,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await fn(delegates);
      } finally {
        inTransaction = false;
      }
    }),
  };
  const crm = {
    getFinancialSummary: jest.fn(() => {
      expect(inTransaction).toBe(false);
      return Promise.resolve(summary());
    }),
    getClientLoyaltyEvidenceByExternalIdReadOnly: jest.fn(),
  };
  const reader = new MeasurementFinanceReader(
    db as unknown as PrismaService,
    crm as unknown as CrmService,
    context,
  );
  return {
    db,
    crm,
    reader,
    integration,
    tenant,
    run: <T>(f: () => T) => context.runAsSystemTenant('tenant-a', f),
  };
}
describe('C7 P02 financial truth reader', () => {
  it('reuses canonical finance outside publication transactions and never promotes gross to cash/refunds/net', async () => {
    const t = setup();
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    validateMeasurementResult(result, 'tenant-a');
    expect(t.crm.getFinancialSummary).toHaveBeenCalledWith('tenant-a', {
      from: '2026-08-31T21:00:00.000Z',
      to: '2026-09-07T20:59:59.999Z',
    });
    expect(
      result.metrics.find((m) => m.key === 'provider_reported_gross'),
    ).toMatchObject({
      value: '10000',
      basis: 'provider_transactions',
      state: 'PARTIAL',
    });
    for (const key of ['confirmed_cash', 'confirmed_refunds', 'net_profit'])
      expect(result.metrics.find((m) => m.key === key)).toMatchObject({
        value: null,
        state: 'NOT_MEASURED',
      });
    expect(
      result.metrics.find((m) => m.key === 'confirmed_salary_accrued'),
    ).toMatchObject({
      value: '3000',
      currency: 'RUB',
      basis: 'provider_payroll_accrued',
    });
    expect(result.qualification).toBe('SOURCE_LABELLED');
    expect(result.sources).toHaveLength(5);
  });
  it('refuses unsupported dimensions and missing/foreign integration before any source read', async () => {
    for (const change of [
      'branch',
      'staff',
      'service',
      'integration',
      'coverage',
      'capability',
    ]) {
      const t = setup();
      const i = intent();
      if (change === 'branch') i.branchId = 'branch-b';
      if (change === 'staff') i.staffId = 'staff-b';
      if (change === 'service') i.scope.dimensions.serviceId = 'service-b';
      if (change === 'integration')
        i.scope.sourceQuery.integrationId = 'integration-b';
      if (change === 'coverage') i.scope.sourceQuery.coverage = 'complete';
      if (change === 'capability')
        i.scope.capabilityKey = 'analytics.business.read';
      await expect(t.run(() => t.reader.read('tenant-a', i))).rejects.toThrow();
      expect(t.crm.getFinancialSummary).not.toHaveBeenCalled();
      expect(t.db.expense.findMany).not.toHaveBeenCalled();
    }
  });
  it('never widens intraday requests to full provider days', async () => {
    const t = setup();
    const i = intent();
    i.asOf = new Date('2026-09-07T12:00Z');
    const result = await t.run(() => t.reader.read('tenant-a', i));
    expect(t.crm.getFinancialSummary).not.toHaveBeenCalled();
    expect(result.reasons).toContain(
      'financial_reader_requires_complete_local_days',
    );
    expect(
      result.metrics.find((m) => m.key === 'provider_reported_gross')?.value,
    ).toBeNull();
    expect(t.db.expense.findMany.mock.calls[0][0]).toMatchObject({
      where: { occurredAt: { lt: i.asOf } },
    });
  });
  it('does not invent RUB if all currency evidence is absent', async () => {
    const t = setup();
    t.db.expense.findMany.mockResolvedValue([]);
    t.db.$queryRaw.mockResolvedValue([]);
    t.crm.getFinancialSummary.mockRejectedValue(new Error('offline'));
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(result.metrics.every((m) => m.currency === null)).toBe(true);
    expect(result.metrics.find((m) => m.key === 'net_profit')).toMatchObject({
      value: null,
      unit: 'status',
      currency: null,
    });
  });
  it('source capacity limits publish explicit unavailable data rather than a first-N total or a retry loop', async () => {
    const t = setup();
    t.db.expense.findMany.mockResolvedValue(
      Array.from({ length: 10001 }, (_, n) => expense({ id: `row-${n}` })),
    );
    const limited = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(
      limited.metrics.find((m) => m.key === 'observed_expenses'),
    ).toMatchObject({ value: null, state: 'UNAVAILABLE' });
    expect(limited.reasons).toContain('expense_query_row_limit_exceeded');
    expect(limited.sources.find((s) => s.owner === 'Expense')?.coverage).toBe(
      'expense_query_row_limit_exceeded',
    );
    const currencies = [
      'RUB',
      'EUR',
      'USD',
      'GBP',
      'JPY',
      'CNY',
      'INR',
      'CHF',
      'TRY',
    ];
    t.db.expense.findMany.mockResolvedValue(
      currencies.map((currency, n) =>
        expense({ id: `currency-${n}`, currency }),
      ),
    );
    const many = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(many.completeness).toBe('UNAVAILABLE');
    expect(many.metrics).toEqual([]);
    expect(many.reasons).toEqual(['measurement_currency_groups_exceeds_bound']);
  });
  it('malformed expense source data becomes unavailable without hiding implementation or authority errors', async () => {
    const t = setup();
    t.db.expense.findMany.mockResolvedValue([expense({ currency: 'unknown' })]);
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(
      result.metrics.find((m) => m.key === 'observed_expenses'),
    ).toMatchObject({ value: null, state: 'UNAVAILABLE' });
    expect(result.reasons).toContain('measurement_expense_money_invalid');
    t.db.expense.findMany.mockRejectedValue(
      new Error('implementation regression'),
    );
    await expect(
      t.run(() => t.reader.read('tenant-a', intent())),
    ).rejects.toThrow('implementation regression');
  });
  it('rejects remote integration rebind and rejects changed binding before publication', async () => {
    const t = setup();
    t.crm.getFinancialSummary.mockImplementation(() => {
      t.integration.updatedAt = new Date('2026-09-08Z');
      return Promise.resolve(summary());
    });
    await expect(
      t.run(() => t.reader.read('tenant-a', intent())),
    ).rejects.toThrow('measurement_prepared_authority_changed');
    const fresh = setup();
    const result = await fresh.run(() =>
      fresh.reader.read('tenant-a', intent()),
    );
    fresh.integration.status = 'inactive';
    await expect(
      fresh.run(() =>
        fresh.reader.assertPreparedCurrent(
          'tenant-a',
          intent(),
          result,
          fresh.db as never,
        ),
      ),
    ).rejects.toThrow('measurement_finance_integration_mismatch');
  });
  it('rejects mismatched provider period rather than trusting its day label', async () => {
    const t = setup();
    const dto = summary();
    dto.period.from = '2026-08-01';
    t.crm.getFinancialSummary.mockResolvedValue(dto);
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(result.reasons).toContain('financial_reader_scope_mismatch');
    expect(result.sources.some((s) => s.owner === 'CrmFinancialSummary')).toBe(
      false,
    );
  });
  it('retains normalized coverage/discard evidence but drops names and arbitrary warning messages', () => {
    const dto = summary();
    dto.revenue.discarded = {
      negative_count: 2,
      zero_count: 1,
      untyped_count: 9,
    };
    dto.warnings = [{ code: 'unknown', message: 'SECRET PROVIDER MESSAGE' }];
    dto.payroll.status = 'partial';
    const metrics = measurementFinancialFacts(dto, 0);
    expect(
      metrics.find((m) => m.key === 'discarded_negative_operations')?.value,
    ).toBe('2');
    expect(
      metrics.find((m) => m.key === 'confirmed_salary_accrued')?.value,
    ).toBeNull();
    expect(JSON.stringify(metrics)).not.toContain('SECRET');
  });
  it('booked prices or malformed money never become provider cash or salary', () => {
    const dto = summary();
    dto.revenue.basis = 'booked_prices';
    dto.payroll.accrued_total = money(0.5);
    const metrics = measurementFinancialFacts(dto, 0);
    expect(
      metrics.find((m) => m.key === 'provider_reported_gross')?.value,
    ).toBeNull();
    expect(
      metrics.find((m) => m.key === 'confirmed_salary_accrued')?.value,
    ).toBeNull();
  });
});
describe('C7 P02 canonical expense facts', () => {
  it('never fuzzy-deduplicates matching amounts/dates and keeps currencies/raw labels separate', () => {
    const result = measurementExpenseFacts(
      [
        expense(),
        expense({
          id: 'import-a',
          source: 'crm',
          externalId: 'provider-a',
          category: 'Неизвестная статья',
        }),
        expense({ id: 'eur-a', currency: 'EUR', amountKopecks: 900 }),
      ],
      0,
    );
    expect(
      result.metrics
        .filter((m) => m.key === 'observed_expenses')
        .map((m) => [m.currency, m.value]),
    ).toEqual([
      ['EUR', '900'],
      ['RUB', '200'],
    ]);
    expect(result.reasons).toContain('expense_cross_source_overlap_unresolved');
    expect(
      result.metrics.find(
        (m) =>
          m.key === 'expense_raw_category' && m.value === 'Неизвестная статья',
      ),
    ).toBeDefined();
    expect(
      result.metrics.find((m) => m.key === 'expense_category_other'),
    ).toMatchObject({ value: '100', currency: 'RUB' });
  });
  it('rejects exact durable identity conflicts; preserves all rows above historical list cap', () => {
    expect(() => measurementExpenseFacts([expense(), expense()], 0)).toThrow(
      'measurement_duplicate_expense_source_identity',
    );
    const result = measurementExpenseFacts(
      Array.from({ length: 1501 }, (_, n) => expense({ id: `row-${n}` })),
      0,
    );
    expect(
      result.metrics.find((m) => m.key === 'observed_expenses')?.value,
    ).toBe('150100');
    expect(result.metrics.length).toBeLessThan(12);
  });
  it('refuses unrepresentable raw breakdown without silently truncating totals', () => {
    const result = measurementExpenseFacts(
      Array.from({ length: 30 }, (_, n) =>
        expense({ id: `row-${n}`, category: `source-${n}` }),
      ),
      0,
    );
    expect(result.reasons).toContain(
      'expense_raw_category_evidence_exceeds_bound',
    );
    expect(
      result.metrics.find((m) => m.key === 'observed_expenses')?.value,
    ).toBe('3000');
    expect(result.metrics.some((m) => m.key === 'expense_raw_category')).toBe(
      false,
    );
  });
});
