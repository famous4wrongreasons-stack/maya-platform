import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { CrmService } from '../src/crm/crm.service';
import type {
  CrmFinancialSummary,
  ClientLoyaltySnapshot,
} from '../src/crm/crm-adapter.interface';
import { MeasurementFinanceReader } from '../src/measurement/measurement.finance';
import {
  MeasurementService,
  MeasurementLease,
} from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import {
  MeasurementIntent,
  MeasurementMetric,
  measurementHash,
} from '../src/measurement/measurement.contract';
import { compareMeasurementPeriods } from '../src/measurement/measurement.period';

// No production/old database, migrations, cleanup, transport or provider effects.
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(
  url.hostname,
  '127.0.0.1',
  'C7 finance proof requires its exact owned disposable database',
);
assert.equal(url.port, '55517');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.username, 'maya_c7');
const db = new PrismaService(
  new ConfigService({ DATABASE_URL: url.toString() }),
);
const context = new TenantContextService();
const checks: string[] = [];
async function proof(name: string, body: () => unknown) {
  await body();
  checks.push(name);
  console.log('PASS ' + name);
}
const minor = (amount_kopecks: number, currency = 'RUB') => ({
  amount_kopecks,
  currency,
  amount_major_units: amount_kopecks / 100,
});
const metrics = (row: { valuesJson: unknown }) =>
  (row.valuesJson as { metrics: MeasurementMetric[] }).metrics;
const metric = (row: { valuesJson: unknown }, key: string, currency?: string) =>
  metrics(row).find(
    (m) => m.key === key && (!currency || m.currency === currency),
  );
const occurrence = () => ({
  namespace: 'measurement_request' as const,
  id: randomUUID(),
});
let financeHook: (() => Promise<void>) | undefined;
let valueHook: (() => Promise<void>) | undefined;
let financeCalls = 0;
let card: ClientLoyaltySnapshot | null = null;
let summary: CrmFinancialSummary;
const crm = {
  getFinancialSummary: async () => {
    financeCalls++;
    await financeHook?.();
    return summary;
  },
  getClientLoyaltyEvidenceByExternalIdReadOnly: async (
    _tenantId: string,
    externalId: string,
  ) => {
    assert.equal(externalId, 'synthetic-exact-card-client');
    await valueHook?.();
    return card;
  },
} as unknown as CrmService;
const reader = new MeasurementFinanceReader(db, crm, context);
const owner = new MeasurementService(
  db,
  context,
  new MeasurementSources(db, reader),
);

async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C7 P02 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'external',
      defaultTimezone: 'UTC',
    },
  });
  const other = await db.tenant.create({
    data: {
      name: 'C7 P02 foreign synthetic',
      slug: randomUUID(),
      status: 'active',
    },
  });
  const integration = await db.crmIntegration.create({
    data: {
      tenantId: tenant.id,
      provider: 'yclients',
      encryptedApiToken: 'synthetic-not-a-credential',
      status: 'active',
    },
  });
  const client = await db.client.create({ data: { tenantId: tenant.id } });
  const unlinked = await db.client.create({ data: { tenantId: tenant.id } });
  const foreign = await db.client.create({ data: { tenantId: other.id } });
  const account = await db.loyaltyAccount.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      source: 'internal',
      balance: 300,
    },
  });
  const wrongAccount = await db.loyaltyAccount.create({
    data: {
      tenantId: tenant.id,
      clientId: unlinked.id,
      source: 'internal',
      balance: 900,
    },
  });
  const link = await db.crmClientLink.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      provider: 'yclients',
      externalId: 'synthetic-exact-card-client',
    },
  });
  await db.loyaltyTransaction.create({
    data: {
      tenantId: tenant.id,
      accountId: account.id,
      kind: 'credit',
      delta: 300,
      balanceAfter: 300,
      encryptedReason: 'synthetic-only',
      idempotencyKey: randomUUID(),
    },
  });
  const to = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const from = new Date(to.getTime() - 86400000);
  // Source fixtures are inserted only in this disposable namespace, before baseline capture.
  await canonicalUtcTransaction(db, (tx) =>
    tx.expense.createMany({
      data: [
        {
          tenantId: tenant.id,
          category: 'rent',
          currency: 'RUB',
          amountKopecks: 100,
          source: 'manual',
          occurredAt: from,
        },
        {
          tenantId: tenant.id,
          category: 'Принятая импортная категория',
          currency: 'RUB',
          amountKopecks: 100,
          source: 'crm',
          externalId: randomUUID(),
          occurredAt: from,
        },
        {
          tenantId: tenant.id,
          category: 'supplies',
          currency: 'EUR',
          amountKopecks: 40,
          source: 'manual',
          occurredAt: from,
        },
        {
          tenantId: tenant.id,
          category: 'other',
          currency: 'RUB',
          amountKopecks: 999,
          source: 'manual',
          occurredAt: to,
        },
      ],
    }),
  );
  await canonicalUtcTransaction(db, (tx) =>
    tx.appointment.create({
      data: {
        tenantId: tenant.id,
        mayaClientId: client.id,
        source: 'internal',
        staffExternalId: 'synthetic-staff',
        serviceIds: ['synthetic-service'],
        startAt: from,
        endAt: new Date(from.getTime() + 3600000),
        blockedStartAt: from,
        blockedEndAt: new Date(from.getTime() + 3600000),
        totalPriceKopecks: 1500,
        currency: 'RUB',
      },
    }),
  );
  summary = {
    source: 'external_crm',
    provider: 'yclients',
    verified: true,
    period: {
      from: from.toISOString().slice(0, 10),
      to: from.toISOString().slice(0, 10),
      timezone: 'UTC',
    },
    revenue: {
      status: 'available',
      verified: true,
      basis: 'provider_transactions',
      discarded: { negative_count: 2, zero_count: 1, untyped_count: 4 },
      transaction_count: 3,
      total: minor(1000),
      by_type: [],
      by_account: [],
      by_staff: [],
      by_service: [],
      staff_attribution_status: 'partial',
      staff_attribution_coverage_percent: 50,
      unattributed_service_total: minor(500),
      unattributed_service_transaction_count: 1,
      service_attribution_status: 'partial',
      service_attribution_coverage_percent: 50,
      unattributed_service_breakdown_total: minor(500),
      unattributed_service_breakdown_transaction_count: 1,
    },
    payroll: {
      status: 'available',
      verified: true,
      accrued_total: minor(300),
      paid_total: minor(200),
      balance_total: minor(100),
      staff: [],
    },
    warnings: [
      { code: 'synthetic', message: 'PROVIDER_PAYLOAD_MUST_NOT_BE_RETAINED' },
    ],
  };
  card = {
    provider: 'yclients',
    external_client_id: link.externalId,
    external_card_id: 'synthetic-provider-card',
    balance: 450,
    currency: 'RUB',
    sold_amount: 900,
  };
  const system = <T>(f: () => T) => context.runAsSystemTenant(tenant.id, f);
  const business: MeasurementIntent = {
    kind: 'business_period',
    periodFrom: from,
    periodTo: to,
    asOf: new Date(),
    timezone: 'UTC',
    scope: {
      version: 1,
      capabilityKey: 'analytics.business.finance.read',
      branchIds: [],
      dimensions: {},
      sourceQuery: {
        provider: 'yclients',
        integrationId: integration.id,
        queryContract: 'c7.finance.read.v1',
      },
    },
  };
  const value: MeasurementIntent = {
    ...business,
    kind: 'value_discrepancy',
    clientId: client.id,
    scope: {
      ...business.scope,
      capabilityKey: 'clients.dossier.read',
      dimensions: { accountId: account.id },
      sourceQuery: {
        ...business.scope.sourceQuery,
        queryContract: 'c7.value.read.v1',
      },
    },
  };
  const readRevision = (id: string) =>
    canonicalUtcTransaction(
      db,
      (tx) => tx.measurementRevision.findUniqueOrThrow({ where: { id } }),
      { readOnly: true },
    );
  const publish = async (input: MeasurementIntent) => {
    const admitted = await system(() => owner.admit(input, occurrence()));
    return system(() => owner.resume(admitted.id));
  };
  const baseline = async () => ({
    expenses: await db.expense.count({ where: { tenantId: tenant.id } }),
    ledger: await db.loyaltyTransaction.count({
      where: { tenantId: tenant.id },
    }),
    actions: await db.actionExecution.count({ where: { tenantId: tenant.id } }),
    events: await db.domainEvent.count({ where: { tenantId: tenant.id } }),
  });
  const before = await baseline();
  await proof(
    'unsupported/cross-client/missing value authority rejects before any revision',
    async () => {
      for (const bad of [
        { ...business, branchId: randomUUID() },
        { ...value, clientId: foreign.id },
        { ...value, clientId: unlinked.id },
        {
          ...value,
          scope: { ...value.scope, dimensions: { accountId: wrongAccount.id } },
        },
        {
          ...business,
          scope: {
            ...business.scope,
            sourceQuery: {
              provider: 'yclients',
              queryContract: 'c7.finance.read.v1',
            },
          },
        },
      ])
        await assert.rejects(() =>
          system(() => owner.admit(bad, occurrence())),
        );
      assert.equal(
        await db.measurementRevision.count({ where: { tenantId: tenant.id } }),
        0,
      );
      assert.equal(financeCalls, 0);
    },
  );
  const financial = await publish(business);
  await proof(
    'actual shared owner publishes exact scoped financial/expense observation with unknown cash refund net',
    () => {
      assert.equal(financial.state, 'PUBLISHED');
      assert.equal(financial.qualification, 'SOURCE_LABELLED');
      assert.equal(metric(financial, 'observed_booked_value')?.value, '1500');
      assert.equal(metric(financial, 'observed_expenses', 'RUB')?.value, '200');
      assert.equal(metric(financial, 'observed_expenses', 'EUR')?.value, '40');
      assert.equal(metric(financial, 'provider_reported_gross')?.value, '1000');
      assert.equal(metric(financial, 'confirmed_salary_accrued')?.value, '300');
      for (const key of ['confirmed_cash', 'confirmed_refunds', 'net_profit'])
        assert.equal(metric(financial, key)?.value, null);
      assert.equal(
        metric(financial, 'discarded_negative_operations')?.value,
        '2',
      );
      assert.ok(
        metrics(financial).some(
          (m) =>
            m.key === 'expense_raw_category' &&
            m.value === 'Принятая импортная категория',
        ),
      );
      assert.ok(
        JSON.stringify(financial.limitationsJson).includes(
          'expense_cross_source_overlap_unresolved',
        ),
      );
      assert.ok(
        !JSON.stringify(financial).includes(
          'PROVIDER_PAYLOAD_MUST_NOT_BE_RETAINED',
        ),
      );
      assert.ok(
        Buffer.byteLength(JSON.stringify(financial.valuesJson)) < 262144,
      );
    },
  );
  const valueRow = await publish(value);
  await proof(
    'Client without Maya User exposes points observations and no mutation/valuation',
    async () => {
      assert.equal(client.userId, null);
      assert.equal(metric(valueRow, 'observed_value_difference')?.value, '150');
      assert.equal(
        metric(valueRow, 'observed_value_difference')?.unit,
        'points',
      );
      assert.equal(
        metric(valueRow, 'observed_value_difference')?.currency,
        null,
      );
      assert.equal(
        await db.loyaltyAccount
          .findUnique({ where: { id: account.id } })
          .then((a) => a?.balance),
        300,
      );
      assert.ok(!JSON.stringify(valueRow).includes('synthetic-provider-card'));
    },
  );
  await proof(
    'new finance observations preserve immutable as-reported revision',
    async () => {
      const oldHash = financial.snapshotHash;
      summary.revenue.total = minor(800);
      const next = await publish({ ...business, asOf: new Date() });
      assert.equal(next.identityHash, financial.identityHash);
      assert.equal(next.revision, financial.revision + 1);
      assert.equal(metric(next, 'provider_reported_gross')?.value, '800');
      assert.equal((await readRevision(financial.id)).snapshotHash, oldHash);
    },
  );
  await proof(
    'provider integration change during remote read prevents stale publication',
    async () => {
      const row = await system(() =>
        owner.admit({ ...business, asOf: new Date() }, occurrence()),
      );
      financeHook = async () => {
        await db.crmIntegration.update({
          where: { id: integration.id },
          data: { lastCheckedAt: new Date() },
        });
      };
      await assert.rejects(
        () => system(() => owner.resume(row.id)),
        /prepared_authority_changed/,
      );
      financeHook = undefined;
      assert.equal((await readRevision(row.id)).state, 'PENDING');
      const lease = await readRevision(row.id);
      // Retry the same live claim with its original token is tested separately in P01.
      assert.equal(lease.revision, financial.revision + 2);
    },
  );
  await proof(
    'exact Client link change during remote value read prevents stale publication',
    async () => {
      const row = await system(() =>
        owner.admit({ ...value, asOf: new Date() }, occurrence()),
      );
      valueHook = async () => {
        await db.crmClientLink.update({
          where: { id: link.id },
          data: { clientId: unlinked.id },
        });
      };
      await assert.rejects(
        () => system(() => owner.resume(row.id)),
        /binding_ambiguous|prepared_value_changed/,
      );
      valueHook = undefined;
      assert.equal((await readRevision(row.id)).state, 'PENDING');
      await db.crmClientLink.update({
        where: { id: link.id },
        data: { clientId: client.id },
      });
    },
  );
  await proof(
    'lease expiration while remote read is pending fences publish; one logical receipt survives',
    async () => {
      const different: MeasurementIntent = {
        ...business,
        periodFrom: new Date(from.getTime() - 86400000),
        asOf: new Date(),
      };
      const row = await system(() => owner.admit(different, occurrence()));
      const token = randomUUID();
      // A short initial claim passes the real SQL claim guard, avoiding a 60-second test sleep.
      await canonicalUtcTransaction(db, async (tx) => {
        const [{ now }] = await tx.$queryRaw<
          Array<{ now: Date }>
        >`SELECT clock_timestamp() AS now`;
        await tx.measurementRevision.update({
          where: { id: row.id },
          data: {
            leaseGeneration: 1,
            leaseTokenHash: createHash('sha256').update(token).digest('hex'),
            leaseExpiresAt: new Date(now.getTime() + 600),
          },
        });
      });
      const lease: MeasurementLease = {
        id: row.id,
        tenantId: tenant.id,
        generation: 1,
        token,
      };
      financeHook = async () => {
        await new Promise((resolve) => setTimeout(resolve, 850));
      };
      await assert.rejects(() => system(() => owner.compute(lease)), /fenced/);
      financeHook = undefined;
      assert.equal((await readRevision(row.id)).state, 'PENDING');
      summary.period.from = different.periodFrom.toISOString().slice(0, 10);
      const retried = await system(() => owner.resume(row.id));
      assert.equal(retried.id, row.id);
      assert.equal(retried.state, 'PUBLISHED');
      assert.equal(
        await db.measurementRevision.count({
          where: { tenantId: tenant.id, identityHash: row.identityHash },
        }),
        1,
      );
    },
  );
  await proof(
    'complete equal elapsed comparison only; raw partial observation has no growth claim',
    () => {
      const fact = {
        from,
        to,
        asOf: new Date(),
        timezone: 'UTC',
        basis: 'provider_transactions',
        currency: 'RUB',
        unit: 'money_minor',
        completeness: 'COMPLETE' as const,
        coverageFrom: from,
        coverageTo: to,
        value: '100',
      };
      const previous = {
        ...fact,
        from: new Date(from.getTime() - 86400000),
        to: from,
        coverageFrom: new Date(from.getTime() - 86400000),
        coverageTo: from,
        value: '80',
      };
      assert.equal(compareMeasurementPeriods(fact, previous).percent, '25.00');
      assert.equal(
        compareMeasurementPeriods(
          { ...fact, completeness: 'PARTIAL' },
          previous,
        ).percent,
        null,
      );
    },
  );
  await proof(
    'financial/value measurement creates zero source facts or business action executions',
    async () => assert.deepEqual(await baseline(), before),
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks: checks.length,
      requirements: ['Q05', 'Q06', 'Q07', 'Q11'],
      syntheticTenantId: tenant.id,
      sourceOwnerChangesByMeasurement: 0,
      providerEffects: 0,
      oldDatabasesTouched: 0,
      sourceBaselineHash: measurementHash(before),
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
