import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { package5Wave1Hash } from '../package5-wave1/package5-wave1.service';
import { MeasurementFinancialRead } from './measurement.finance.facts';
import {
  normalizeMeasurement,
  validateMeasurementResult,
} from './measurement.contract';
import {
  MeasurementStaffGoalReader,
  STAFF_GOAL_QUERY,
} from './measurement.staff-goal';
import {
  staffGoalFacts,
  staffGoalTargetMinor,
} from './measurement.staff-goal.facts';

const money = (amount_kopecks: number, currency = 'RUB') => ({
  amount_kopecks,
  currency,
  amount_major_units: amount_kopecks / 100,
});
function summary(): MeasurementFinancialRead {
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
      by_staff: [
        { staff_id: 'external-a', transaction_count: 3, ...money(10000) },
      ],
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
      status: 'partial',
      verified: false,
      accrued_total: null,
      paid_total: null,
      balance_total: null,
      staff: [
        {
          staff_id: 'external-a',
          name: 'PRIVATE PAYROLL NAME',
          status: 'available',
          verified: true,
          accrued: money(3000),
          paid: money(2000),
          balance: money(1000),
        },
      ],
    },
    warnings: [],
  };
}
function intent(own = false) {
  return normalizeMeasurement({
    kind: 'staff_goal',
    staffId: 'staff-a',
    configurationUserId: 'viewer-a',
    periodFrom: new Date('2026-08-31T21:00Z'),
    periodTo: new Date('2026-09-30T21:00Z'),
    asOf: new Date('2026-09-07T21:00Z'),
    timezone: 'Europe/Moscow',
    scope: {
      version: 1,
      capabilityKey: own
        ? 'analytics.employee.read'
        : 'analytics.business.finance.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {
        provider: 'yclients',
        integrationId: 'integration-a',
        queryContract: STAFF_GOAL_QUERY,
      },
    },
  });
}
function setup(own = false) {
  let inTransaction = false;
  const context = new TenantContextService();
  const at = new Date('2026-09-01Z');
  const state = {
    tenant: {
      id: 'tenant-a',
      status: 'active',
      defaultTimezone: 'Europe/Moscow',
      calendarSource: 'external',
    },
    membership: {
      id: 'membership-a',
      tenantId: 'tenant-a',
      userId: 'viewer-a',
      role: own ? 'staff' : 'tenant_owner',
      status: 'active',
      branchId: null as string | null,
      updatedAt: at,
      user: { status: 'active' },
    },
    staff: {
      id: 'staff-a',
      tenantId: 'tenant-a',
      userId: own ? 'viewer-a' : null,
      branchId: null,
      active: true,
      updatedAt: at,
    },
    integration: {
      id: 'integration-a',
      tenantId: 'tenant-a',
      provider: 'yclients',
      status: 'active',
      updatedAt: at,
    },
    link: {
      id: 'link-a',
      tenantId: 'tenant-a',
      staffId: 'staff-a',
      provider: 'yclients',
      externalId: 'external-a',
      updatedAt: at,
    },
    access: {
      id: 'access-a',
      tenantId: 'tenant-a',
      staffId: 'staff-a',
      userId: 'viewer-a',
      externalStaffId: 'external-a',
      role: 'staff',
      status: 'active',
      updatedAt: at,
    },
    preference: {
      id: 'pref-a',
      userId: 'viewer-a',
      tenantId: 'tenant-a',
      configJson: {
        schema_version: 1,
        enabled_widgets: ['summary'],
        monthly_target_rub: 90000,
        staff_targets_rub: { 'external-a': 200 },
      },
      updatedAt: at,
    },
    mutation: {
      id: 'mutation-a',
      tenantId: 'tenant-a',
      actionExecutionId: 'execution-a',
      targetKind: 'setting',
      targetRef: 'dashboard-preference:viewer-a:finance',
      mutationKind: 'finance_preferences',
      targetGeneration: 1,
      afterStateHash: '',
      createdAt: at,
    },
    execution: {
      id: 'execution-a',
      tenantId: 'tenant-a',
      actorUserId: 'viewer-a',
      state: 'SUCCEEDED',
      dryRun: false,
      actionClass: 'update_finance_dashboard_preferences',
      capability: 'package5.settings.finance.execute.v1',
      policyDecision: 'ALLOW',
      targetKind: 'setting',
      targetRef: 'dashboard-preference:viewer-a:finance',
      normalizedInputHash: 'safehash',
    },
  };
  state.mutation.afterStateHash = package5Wave1Hash(
    state.preference.configJson,
  );
  const copy = <T>(value: T): T => structuredClone(value);
  const delegates = {
    tenant: { findUnique: jest.fn(() => Promise.resolve(copy(state.tenant))) },
    membership: {
      findUnique: jest.fn(() => Promise.resolve(copy(state.membership))),
    },
    staff: { findUnique: jest.fn(() => Promise.resolve(copy(state.staff))) },
    crmIntegration: {
      findUnique: jest.fn(() => Promise.resolve(copy(state.integration))),
    },
    staffProviderLink: {
      findMany: jest.fn(() => Promise.resolve([copy(state.link)])),
    },
    crmStaffAccess: {
      findUnique: jest.fn(() => Promise.resolve(copy(state.access))),
    },
    dashboardPreference: {
      findUnique: jest.fn(() => Promise.resolve(copy(state.preference))),
    },
    actionTargetMutation: {
      findFirst: jest.fn(() => Promise.resolve(copy(state.mutation))),
    },
    actionExecution: {
      findFirst: jest.fn(() => Promise.resolve(copy(state.execution))),
    },
    $executeRaw: jest.fn(() => Promise.resolve(0)),
    $queryRaw: jest.fn(() => Promise.resolve([])),
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
  };
  const reader = new MeasurementStaffGoalReader(
    db as unknown as PrismaService,
    crm as unknown as CrmService,
    context,
  );
  return {
    state,
    db,
    crm,
    reader,
    run: <T>(fn: () => T) => context.runAsSystemTenant('tenant-a', fn),
  };
}
const metric = (
  result: { metrics: Array<{ key: string; value: string | null }> },
  key: string,
) => result.metrics.find((m) => m.key === key);

describe('C7 P04 exact staff salary and private goal', () => {
  it('keeps independently verified staff payroll despite partial company payroll, uses A22 staff revenue target and bounds receipts', async () => {
    const t = setup();
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    validateMeasurementResult(result, 'tenant-a');
    expect(metric(result, 'confirmed_staff_salary_accrued')).toMatchObject({
      value: '3000',
      currency: 'RUB',
      state: 'COMPLETE',
    });
    expect(metric(result, 'private_monthly_staff_revenue_target')?.value).toBe(
      '20000',
    );
    expect(
      metric(result, 'observed_revenue_goal_progress_percent')?.value,
    ).toBe('50.00');
    expect(t.crm.getFinancialSummary).toHaveBeenCalledWith('tenant-a', {
      from: '2026-08-31T21:00:00.000Z',
      to: '2026-09-07T20:59:59.999Z',
    });
    expect(t.db.crmStaffAccess.findUnique).not.toHaveBeenCalled();
    expect(result.sources).toHaveLength(8);
    expect(JSON.stringify(result)).not.toContain('PRIVATE PAYROLL NAME');
    expect(JSON.stringify(result)).not.toContain('90000');
  });
  it('allows own-staff only with exact current Membership, Staff and CrmStaffAccess', async () => {
    const t = setup(true);
    await expect(
      t.run(() => t.reader.read('tenant-a', intent(true))),
    ).resolves.toBeDefined();
    t.state.access.externalStaffId = 'external-other';
    await expect(
      t.run(() => t.reader.authorize('tenant-a', intent(true))),
    ).rejects.toThrow('own_access_revoked');
  });
  it.each(['manager', 'branch_manager'])(
    'does not grant implicit business finance to %s',
    async (role) => {
      const t = setup();
      t.state.membership.role = role;
      await expect(
        t.run(() => t.reader.authorize('tenant-a', intent())),
      ).rejects.toThrow('viewer_revoked');
      expect(t.crm.getFinancialSummary).not.toHaveBeenCalled();
    },
  );
  it.each(['viewer', 'role', 'staff', 'branch', 'link', 'integration', 'user'])(
    'fails %s authority before remote reads',
    async (failure) => {
      const t = setup(true);
      if (failure === 'viewer') t.state.membership.status = 'revoked';
      if (failure === 'role') t.state.membership.role = 'client';
      if (failure === 'staff') t.state.staff.userId = 'other';
      if (failure === 'branch') t.state.membership.branchId = 'other';
      if (failure === 'link')
        t.db.staffProviderLink.findMany.mockResolvedValue([]);
      if (failure === 'integration') t.state.integration.status = 'disabled';
      if (failure === 'user') t.state.membership.user.status = 'disabled';
      await expect(
        t.run(() => t.reader.read('tenant-a', intent(true))),
      ).rejects.toThrow();
      expect(t.crm.getFinancialSummary).not.toHaveBeenCalled();
    },
  );
  it.each([
    'generation',
    'hash',
    'execution',
    'actor',
    'future',
    'missing_target',
  ])('does not use unproved goal: %s', async (failure) => {
    const t = setup();
    if (failure === 'generation') t.state.mutation.mutationKind = 'other';
    if (failure === 'hash') t.state.mutation.afterStateHash = 'wrong';
    if (failure === 'execution') t.state.execution.state = 'FAILED';
    if (failure === 'actor') t.state.execution.actorUserId = 'other';
    if (failure === 'future')
      t.state.preference.updatedAt = new Date('2026-09-08Z');
    if (failure === 'missing_target') {
      t.state.preference.configJson.staff_targets_rub = {} as {
        'external-a': number;
      };
      t.state.mutation.afterStateHash = package5Wave1Hash(
        t.state.preference.configJson,
      );
    }
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(
      metric(result, 'private_monthly_staff_revenue_target')?.value,
    ).toBeNull();
    expect(
      metric(result, 'observed_revenue_goal_progress_percent')?.value,
    ).toBeNull();
    expect(metric(result, 'confirmed_staff_salary_accrued')?.value).toBe(
      '3000',
    );
  });
  it('keeps intraday finance unknown without widening the period', async () => {
    const t = setup();
    const i = intent();
    i.asOf = new Date('2026-09-07T12:00Z');
    const result = await t.run(() => t.reader.read('tenant-a', i));
    expect(t.crm.getFinancialSummary).not.toHaveBeenCalled();
    expect(metric(result, 'confirmed_staff_salary_accrued')?.value).toBeNull();
    expect(metric(result, 'private_monthly_staff_revenue_target')?.value).toBe(
      '20000',
    );
  });
  it('rejects non-calendar-month and caller-expanded query scope', async () => {
    const t = setup();
    const i = intent();
    i.periodTo = new Date('2026-09-15Z');
    await expect(
      t.run(() => t.reader.authorize('tenant-a', i)),
    ).rejects.toThrow('calendar_month_required');
    const j = intent();
    j.scope.sourceQuery.coverage = 'complete';
    await expect(
      t.run(() => t.reader.authorize('tenant-a', j)),
    ).rejects.toThrow('scope_unsupported');
  });
  it.each(['provider', 'period', 'timezone'])(
    'refuses a provider response with wrong %s',
    async (failure) => {
      const t = setup();
      const data = summary();
      if (failure === 'provider') data.source = 'internal_calendar';
      if (failure === 'period') data.period.to = '2026-09-08';
      if (failure === 'timezone') data.period.timezone = 'UTC';
      t.crm.getFinancialSummary.mockResolvedValue(data);
      const result = await t.run(() => t.reader.read('tenant-a', intent()));
      expect(
        metric(result, 'confirmed_staff_salary_accrued')?.value,
      ).toBeNull();
      expect(result.reasons).toContain('staff_financial_reader_scope_mismatch');
    },
  );
  it('publishes explicit unavailable when no source or private goal can be measured', async () => {
    const t = setup();
    t.state.execution.state = 'FAILED';
    t.crm.getFinancialSummary.mockRejectedValue(
      new Error('provider unavailable'),
    );
    const result = await t.run(() => t.reader.read('tenant-a', intent()));
    expect(result.completeness).toBe('UNAVAILABLE');
    expect(result.reasons).toContain('staff_financial_reader_unavailable');
  });
  it('rechecks exact authority and private configuration after remote read under canonical owner lock', async () => {
    const t = setup();
    const i = intent();
    const result = await t.run(() => t.reader.read('tenant-a', i));
    await t.run(() =>
      t.reader.assertPreparedCurrent('tenant-a', i, result, t.db as never),
    );
    expect(
      t.db.$queryRaw.mock.calls.some((args) =>
        JSON.stringify(args).includes('pg_advisory_xact_lock_shared'),
      ),
    ).toBe(true);
    t.state.mutation.targetGeneration++;
    await expect(
      t.run(() =>
        t.reader.assertPreparedCurrent('tenant-a', i, result, t.db as never),
      ),
    ).rejects.toThrow('configuration_changed');
    t.state.mutation.targetGeneration--;
    t.state.link.externalId = 'other';
    await expect(
      t.run(() =>
        t.reader.assertPreparedCurrent('tenant-a', i, result, t.db as never),
      ),
    ).rejects.toThrow('authority_changed');
  });
  it.each([
    'currency',
    'unknown_money',
    'coverage',
    'duplicate',
    'unverified',
    'zero_target',
  ])('keeps incomparable progress unknown: %s', (failure) => {
    const data = summary();
    if (failure === 'currency') data.revenue.by_staff[0].currency = 'EUR';
    if (failure === 'unknown_money')
      data.revenue.by_staff[0].amount_kopecks = Number.NaN;
    if (failure === 'coverage')
      data.revenue.staff_attribution_coverage_percent = 99;
    if (failure === 'duplicate')
      data.revenue.by_staff.push(data.revenue.by_staff[0]);
    if (failure === 'unverified') data.revenue.verified = false;
    const result = staffGoalFacts({
      summary: data,
      externalStaffId: 'external-a',
      targetMinor: failure === 'zero_target' ? '0' : '20000',
      targetProven: true,
      exactWindow: true,
      financeRef: 0,
      goalRefs: [1],
    });
    expect(
      metric(result, 'observed_revenue_goal_progress_percent')?.value,
    ).toBeNull();
  });
  it('does not manufacture salary, rejects fractional pennies, and rounds observed ratios deterministically', () => {
    const data = summary();
    data.payroll.staff = [];
    data.revenue.by_staff[0].amount_kopecks = 1;
    const result = staffGoalFacts({
      summary: data,
      externalStaffId: 'external-a',
      targetMinor: '6',
      targetProven: true,
      exactWindow: true,
      financeRef: 0,
      goalRefs: [1],
    });
    expect(metric(result, 'confirmed_staff_salary_accrued')?.value).toBeNull();
    expect(
      metric(result, 'observed_revenue_goal_progress_percent')?.value,
    ).toBe('16.67');
    expect(staffGoalTargetMinor(0.001)).toBeNull();
    expect(staffGoalTargetMinor(0)).toBe('0');
    expect(staffGoalTargetMinor(12.34)).toBe('1234');
    expect(staffGoalTargetMinor('12')).toBeNull();
  });
  it.each(['malformed', 'unknown_currency', 'duplicate', 'unverified'])(
    'does not measure invalid staff salary: %s',
    (failure) => {
      const data = summary();
      if (failure === 'malformed')
        data.payroll.staff[0].accrued = money(Number.NaN);
      if (failure === 'unknown_currency')
        data.payroll.staff[0].accrued = money(3000, '');
      if (failure === 'duplicate')
        data.payroll.staff.push(data.payroll.staff[0]);
      if (failure === 'unverified') data.payroll.staff[0].verified = false;
      const result = staffGoalFacts({
        summary: data,
        externalStaffId: 'external-a',
        targetMinor: null,
        targetProven: false,
        exactWindow: true,
        financeRef: 0,
        goalRefs: [1],
      });
      expect(
        metric(result, 'confirmed_staff_salary_accrued')?.value,
      ).toBeNull();
    },
  );
});
