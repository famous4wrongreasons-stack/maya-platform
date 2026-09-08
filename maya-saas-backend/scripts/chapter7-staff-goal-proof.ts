import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { canonicalUtcTransaction } from '../src/prisma/canonical-utc-transaction';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { CrmService } from '../src/crm/crm.service';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from '../src/package5-wave1/package5-wave1.service';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  EntitlementsService,
} from '../src/entitlements/entitlements.service';
import {
  MeasurementStaffGoalReader,
  STAFF_GOAL_QUERY,
} from '../src/measurement/measurement.staff-goal';
import {
  MeasurementService,
  MeasurementLease,
} from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import {
  MeasurementIntent,
  MeasurementMetric,
} from '../src/measurement/measurement.contract';
import { MeasurementFinancialRead } from '../src/measurement/measurement.finance.facts';

// Exact owned disposable database only, before constructing a database client.
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55517');
assert.equal(url.pathname, '/maya_c7_replay');
assert.equal(url.username, 'maya_c7');
const db = new PrismaService(
  new ConfigService({ DATABASE_URL: url.toString() }),
);
const context = new TenantContextService();
const minor = (amount_kopecks: number, currency = 'RUB') => ({
  amount_kopecks,
  currency,
  amount_major_units: amount_kopecks / 100,
});
const metric = (row: { valuesJson: unknown }, key: string) =>
  (row.valuesJson as { metrics: MeasurementMetric[] }).metrics.find(
    (m) => m.key === key,
  );
const checks: string[] = [];
async function proof(name: string, run: () => unknown) {
  await run();
  checks.push(name);
  console.log('PASS ' + name);
}
const occurrence = () => ({
  namespace: 'measurement_request' as const,
  id: randomUUID(),
});
let remoteHook: (() => Promise<void>) | undefined;
let remoteCount = 0;
const crm = {
  getFinancialSummary: async (
    tenantId: string,
    period: { from: string; to: string },
  ): Promise<MeasurementFinancialRead> => {
    assert.equal(tenantId, fixtureTenantId);
    remoteCount++;
    await remoteHook?.();
    return {
      source: 'external_crm',
      provider: 'yclients',
      verified: true,
      period: {
        from: period.from.slice(0, 10),
        to: period.to.slice(0, 10),
        timezone: 'UTC',
      },
      revenue: {
        status: 'available',
        verified: true,
        basis: 'provider_transactions',
        total: minor(30000),
        discarded: { negative_count: 0, zero_count: 0, untyped_count: 0 },
        transaction_count: 3,
        by_type: [],
        by_account: [],
        by_staff: [
          { staff_id: 'owner-subject', transaction_count: 2, ...minor(10000) },
          { staff_id: 'own-subject', transaction_count: 1, ...minor(20000) },
        ],
        by_service: [],
        staff_attribution_status: 'available',
        staff_attribution_coverage_percent: 100,
        unattributed_service_total: minor(0),
        unattributed_service_transaction_count: 0,
        service_attribution_status: 'available',
        service_attribution_coverage_percent: 100,
        unattributed_service_breakdown_total: minor(0),
        unattributed_service_breakdown_transaction_count: 0,
      },
      payroll: {
        status: 'partial',
        verified: false,
        accrued_total: null,
        paid_total: null,
        balance_total: null,
        staff: ['owner-subject', 'own-subject'].map((staff_id) => ({
          staff_id,
          name: 'SYNTHETIC_PRIVATE_NAME_NOT_RETAINED',
          status: 'available' as const,
          verified: true,
          accrued: minor(3000),
          paid: minor(2000),
          balance: minor(1000),
        })),
      },
      warnings: [],
    };
  },
} as unknown as CrmService;
let fixtureTenantId: string;
const reader = new MeasurementStaffGoalReader(db, crm, context);
const owner = new MeasurementService(
  db,
  context,
  new MeasurementSources(db, undefined, undefined, undefined, reader),
);

async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C7 P04 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'external',
      defaultTimezone: 'UTC',
    },
  });
  fixtureTenantId = tenant.id;
  const user = async (role: 'tenant_owner' | 'staff') =>
    db.user.create({
      data: {
        email: `${randomUUID()}@proof.invalid`,
        passwordHash: 'synthetic-only',
        role,
        tenantId: tenant.id,
        memberships: {
          create: { tenantId: tenant.id, role, status: 'active' },
        },
      },
    });
  const viewer = await user('tenant_owner');
  const employee = await user('staff');
  const staff = await db.staff.create({
    data: { tenantId: tenant.id, active: true },
  });
  const ownStaff = await db.staff.create({
    data: { tenantId: tenant.id, active: true, userId: employee.id },
  });
  const integration = await db.crmIntegration.create({
    data: {
      tenantId: tenant.id,
      provider: 'yclients',
      encryptedApiToken: 'synthetic-only',
      status: 'active',
    },
  });
  const link = await db.staffProviderLink.create({
    data: {
      tenantId: tenant.id,
      staffId: staff.id,
      provider: 'yclients',
      externalId: 'owner-subject',
    },
  });
  await db.staffProviderLink.create({
    data: {
      tenantId: tenant.id,
      staffId: ownStaff.id,
      provider: 'yclients',
      externalId: 'own-subject',
    },
  });
  const access = await db.crmStaffAccess.create({
    data: {
      tenantId: tenant.id,
      staffId: ownStaff.id,
      userId: employee.id,
      externalStaffId: 'own-subject',
      encryptedDisplayName: 'synthetic-only',
      role: 'staff',
      status: 'active',
    },
  });
  const entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'> =
    {
      resolveFeatureRequirements: (
        tenantId,
        requiredFeatures,
        evaluatedAt = new Date(),
      ) =>
        Promise.resolve({
          contract: FEATURE_REQUIREMENT_DECISION_CONTRACT,
          tenantId,
          planId: null,
          requiredFeatures: requiredFeatures.map((featureKey) => ({
            featureKey,
            enabled: true,
          })),
          allowed: true,
          evaluatedAt,
          validUntil: null,
        }),
    };
  const engine = createStandaloneCanonicalActionEngine(db, entitlements, {
    identitySecret: 'c7-p04-synthetic-identity-secret-'.repeat(3),
    payloadEncryptionSecret: 'c7-p04-synthetic-payload-secret-'.repeat(3),
    policyAttestationSecret: 'c7-p04-synthetic-attestation-secret-'.repeat(3),
  });
  const planner = new Package5Wave1ShadowService(engine.runtime, db, context);
  const executor = new Package5Wave1ExecutableService(
    db,
    engine.ingress,
    engine.kernel,
  );
  const system = <T>(fn: () => T) => context.runAsSystemTenant(tenant.id, fn);
  const configure = (amount: number) =>
    system(async () =>
      executor.execute(
        await planner.buildFinance(
          tenant.id,
          viewer.id,
          {
            sourceIntentRef: `c7-p04-${randomUUID()}`,
            enabledWidgets: ['summary', 'daily'],
            monthlyTargetRub: 999999,
            staffTargetsRub: { 'owner-subject': amount, 'own-subject': 77777 },
          },
          'execute',
        ),
      ),
    );
  await configure(200);
  // Current canonical configuration is observed now; prior completed month supplies exact day coverage.
  const input = (monthOffset: number, own = false): MeasurementIntent => {
    const now = new Date();
    const month = now.getUTCMonth() - monthOffset;
    return {
      kind: 'staff_goal',
      staffId: own ? ownStaff.id : staff.id,
      configurationUserId: own ? employee.id : viewer.id,
      periodFrom: new Date(Date.UTC(now.getUTCFullYear(), month, 1)),
      periodTo: new Date(Date.UTC(now.getUTCFullYear(), month + 1, 1)),
      asOf: now,
      timezone: 'UTC',
      scope: {
        version: 1,
        capabilityKey: own
          ? 'analytics.employee.read'
          : 'analytics.business.finance.read',
        branchIds: [],
        dimensions: {},
        sourceQuery: {
          provider: 'yclients',
          integrationId: integration.id,
          queryContract: STAFF_GOAL_QUERY,
        },
      },
    };
  };
  const publish = (i: MeasurementIntent) =>
    system(async () => {
      const row = await owner.admit(i, occurrence());
      return owner.resume(row.id);
    });
  const readRow = (id: string) =>
    canonicalUtcTransaction(
      db,
      (tx) => tx.measurementRevision.findUniqueOrThrow({ where: { id } }),
      { readOnly: true },
    );
  const sourceSnapshot = async () =>
    JSON.stringify(
      await canonicalUtcTransaction(
        db,
        async (tx) => ({
          preferences: await tx.dashboardPreference.findMany({
            where: { tenantId: tenant.id },
            orderBy: { id: 'asc' },
          }),
          mutations: await tx.actionTargetMutation.findMany({
            where: { tenantId: tenant.id },
            orderBy: { id: 'asc' },
          }),
          staff: await tx.staff.findMany({
            where: { tenantId: tenant.id },
            orderBy: { id: 'asc' },
          }),
          links: await tx.staffProviderLink.findMany({
            where: { tenantId: tenant.id },
            orderBy: { id: 'asc' },
          }),
          access: await tx.crmStaffAccess.findMany({
            where: { tenantId: tenant.id },
            orderBy: { id: 'asc' },
          }),
        }),
        { readOnly: true },
      ),
    );
  const baseline = await sourceSnapshot();
  await proof(
    'canonical A22 execution/generation plus Staff without User yields private revenue progress and exact salary despite partial company payroll',
    async () => {
      const result = await publish(input(1));
      assert.equal(result.state, 'PUBLISHED');
      assert.equal(staff.userId, null);
      assert.equal(
        metric(result, 'confirmed_staff_salary_accrued')?.value,
        '3000',
      );
      assert.equal(
        metric(result, 'private_monthly_staff_revenue_target')?.value,
        '20000',
      );
      assert.equal(
        metric(result, 'observed_revenue_goal_progress_percent')?.value,
        '50.00',
      );
      assert.ok(
        !JSON.stringify(result).includes('SYNTHETIC_PRIVATE_NAME_NOT_RETAINED'),
      );
      assert.ok(!JSON.stringify(result).includes('999999'));
      const evidence = result.evidenceRefsJson as unknown as {
        sources: Array<{ owner: string }>;
      };
      assert.ok(
        evidence.sources.some((s) => s.owner === 'ActionTargetMutation'),
      );
      assert.ok(evidence.sources.some((s) => s.owner === 'ActionExecution'));
    },
  );
  await proof(
    'own staff salary remains readable while owner-private target is absent from staff configuration',
    async () => {
      const result = await publish(input(1, true));
      assert.equal(
        metric(result, 'confirmed_staff_salary_accrued')?.value,
        '3000',
      );
      assert.equal(
        metric(result, 'private_monthly_staff_revenue_target')?.value,
        null,
      );
      assert.equal(
        metric(result, 'observed_revenue_goal_progress_percent')?.value,
        null,
      );
      assert.ok(!JSON.stringify(result).includes('77777'));
    },
  );
  await proof(
    'measurement readers leave salary binding and A22 source owners byte-for-byte unchanged',
    async () => assert.equal(await sourceSnapshot(), baseline),
  );
  await proof(
    'wrong own subject or integration is denied before a revision is admitted',
    async () => {
      const before = await db.measurementRevision.count({
        where: { tenantId: tenant.id },
      });
      const own = input(2, true);
      own.staffId = staff.id;
      await assert.rejects(
        () => system(() => owner.admit(own, occurrence())),
        /subject_mismatch/,
      );
      const foreign = input(2);
      foreign.scope.sourceQuery.integrationId = randomUUID();
      await assert.rejects(
        () => system(() => owner.admit(foreign, occurrence())),
        /integration_mismatch/,
      );
      assert.equal(
        await db.measurementRevision.count({ where: { tenantId: tenant.id } }),
        before,
      );
    },
  );
  await proof(
    'canonical A22 change while payroll read is pending prevents stale publication without holding its owner transaction',
    async () => {
      const row = await system(() => owner.admit(input(2), occurrence()));
      remoteHook = async () => {
        await configure(400);
      };
      await assert.rejects(
        () => system(() => owner.resume(row.id)),
        /configuration_changed/,
      );
      remoteHook = undefined;
      assert.equal((await readRow(row.id)).state, 'PENDING');
      assert.equal((await readRow(row.id)).snapshotHash, null);
    },
  );
  await proof(
    'exact provider Staff binding changed during payroll read fences publication',
    async () => {
      const row = await system(() => owner.admit(input(3), occurrence()));
      remoteHook = async () => {
        await db.staffProviderLink.update({
          where: { id: link.id },
          data: { externalId: 'changed-subject' },
        });
      };
      await assert.rejects(
        () => system(() => owner.resume(row.id)),
        /authority_changed/,
      );
      remoteHook = undefined;
      assert.equal((await readRow(row.id)).state, 'PENDING');
      await db.staffProviderLink.update({
        where: { id: link.id },
        data: { externalId: 'owner-subject' },
      });
    },
  );
  await proof(
    'own staff access revocation during payroll read prevents publication',
    async () => {
      const row = await system(() => owner.admit(input(3, true), occurrence()));
      remoteHook = async () => {
        await db.crmStaffAccess.update({
          where: { id: access.id },
          data: { status: 'disabled' },
        });
      };
      await assert.rejects(
        () => system(() => owner.resume(row.id)),
        /own_access_revoked/,
      );
      remoteHook = undefined;
      assert.equal((await readRow(row.id)).state, 'PENDING');
      await db.crmStaffAccess.update({
        where: { id: access.id },
        data: { status: 'active' },
      });
    },
  );
  await proof(
    'expired remote-read lease is fenced and retry publishes one logical outcome',
    async () => {
      const row = await system(() => owner.admit(input(4), occurrence()));
      const token = randomUUID();
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
      remoteHook = async () => {
        await new Promise((resolve) => setTimeout(resolve, 850));
      };
      await assert.rejects(() => system(() => owner.compute(lease)), /fenced/);
      remoteHook = undefined;
      assert.equal((await readRow(row.id)).state, 'PENDING');
      const result = await system(() => owner.resume(row.id));
      assert.equal(result.id, row.id);
      assert.equal(result.state, 'PUBLISHED');
      assert.equal(
        await db.measurementRevision.count({
          where: { tenantId: tenant.id, identityHash: row.identityHash },
        }),
        1,
      );
    },
  );
  await proof(
    'missing salary source remains explicit unknown without a heuristic fallback',
    async () => {
      const i = input(5);
      i.asOf = new Date(i.periodFrom.getTime() + 12 * 3600000);
      const before = remoteCount;
      const result = await publish(i);
      assert.equal(remoteCount, before);
      assert.equal(
        metric(result, 'confirmed_staff_salary_accrued')?.value,
        null,
      );
      assert.equal(
        metric(result, 'observed_revenue_goal_progress_percent')?.value,
        null,
      );
    },
  );
  console.log(
    JSON.stringify({
      package: 'C7-P04',
      checks: checks.length,
      tenantId: tenant.id,
      productionTouched: false,
      sourceWritesByMeasurement: 0,
    }),
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
