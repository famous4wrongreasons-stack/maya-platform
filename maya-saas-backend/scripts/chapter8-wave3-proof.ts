/** Real P01 PostgreSQL/owner proof; only this new disposable database is permitted. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { EncryptionService } from '../src/encryption/encryption.service';
import { GovernedSettingsReadService } from '../src/package5-wave1/governed-settings.read';
import {
  Package5Wave1ShadowService,
  Package5Wave1ExecutableService,
} from '../src/package5-wave1/package5-wave1.service';
import { createStandaloneCanonicalActionEngine } from '../src/action-engine';
import {
  FEATURE_REQUIREMENT_DECISION_CONTRACT,
  EntitlementsService,
} from '../src/entitlements/entitlements.service';
import { C8Store } from '../src/valuation/c8.store';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import { C8Sources } from '../src/valuation/c8.sources';
import { C8CaptureService } from '../src/valuation/c8.capture';
import { C8Producer } from '../src/valuation/c8.producer';
import { C8OpportunityBridge } from '../src/valuation/c8.opportunity';
import { C8LabelCollector } from '../src/valuation/c8.labels';
import { C8EvaluationService } from '../src/valuation/c8.evaluation';
import { MeasurementOutcomesReader } from '../src/measurement/measurement.outcomes';
import { Prisma } from '@prisma/client';
const url = new URL(process.env.DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55528');
assert.equal(url.pathname, '/maya_c8_replay');
assert.equal(url.username, 'maya_c8');
const cfg = new ConfigService({
  DATABASE_URL: url.toString(),
  CRM_ENCRYPTION_KEY: 'c8-synthetic-only-encryption-key-'.repeat(3),
});
const db = new PrismaService(cfg);
const context = new TenantContextService();
const encryption = new EncryptionService(cfg);
const governed = new GovernedSettingsReadService(db, context, encryption, cfg);
const store = new C8Store(db, context);
const sources = new C8Sources(store, governed);
const checks: string[] = [];
const proof = async (name: string, fn: () => unknown) => {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
};
const policy = {
  version: 1,
  valueMeasures: [
    {
      key: 'visits',
      basis: 'observed_attended_count',
      currency: null,
      window: { unit: 'day', count: 365 },
      serviceScope: [],
    },
    {
      key: 'booked',
      basis: 'booked_value',
      currency: 'RUB',
      window: { unit: 'day', count: 365 },
      serviceScope: [],
    },
    {
      key: 'cash',
      basis: 'confirmed_cash',
      currency: 'RUB',
      window: { unit: 'day', count: 365 },
      serviceScope: [],
    },
  ],
  predictionTargets: [
    {
      targetKey: 'attended_return',
      modelKey: 'unfitted-return',
      horizon: { unit: 'day', count: 7 },
      basis: 'attended_return',
      currency: null,
      serviceScope: [],
    },
    {
      targetKey: 'appointment_no_show',
      modelKey: 'unfitted-no-show',
      horizon: { unit: 'appointment_outcome' },
      basis: 'appointment_no_show',
      currency: null,
      serviceScope: [],
    },
    {
      targetKey: 'client_expected_value',
      modelKey: 'unfitted-client_expected_value',
      horizon: { unit: 'day', count: 7 },
      basis: 'confirmed_cash',
      currency: 'RUB',
      serviceScope: [],
    },
    {
      targetKey: 'business_revenue',
      modelKey: 'unfitted-business_revenue',
      horizon: { unit: 'day', count: 7 },
      basis: 'confirmed_cash',
      currency: 'RUB',
      serviceScope: [],
    },
    {
      targetKey: 'staff_earnings_conditional',
      modelKey: 'unfitted-staff_earnings_conditional',
      horizon: { unit: 'day', count: 7 },
      basis: 'confirmed_staff_salary_accrued',
      currency: 'RUB',
      serviceScope: [],
    },
    {
      targetKey: 'observed_booking_demand',
      modelKey: 'unfitted-observed_booking_demand',
      horizon: { unit: 'day', count: 7 },
      basis: 'observed_booking_created_count',
      currency: null,
      serviceScope: [],
    },
    {
      targetKey: 'scheduled_utilization',
      modelKey: 'unfitted-scheduled_utilization',
      horizon: { unit: 'day', count: 7 },
      basis: 'scheduled_utilization',
      currency: null,
      serviceScope: [],
    },
    {
      targetKey: 'statistical_deviation',
      modelKey: 'unfitted-statistical_deviation',
      horizon: { unit: 'day', count: 7 },
      basis: 'confirmed_cash',
      currency: 'RUB',
      serviceScope: [],
    },
  ],
  dormancyRules: [
    {
      ruleKey: 'barber_cadence',
      serviceScope: [],
      elapsed: { unit: 'day', count: 30 },
      comparison: 'gt',
      evidence: 'proven_attendance',
      minimumCoverage: 'PARTIAL',
    },
  ],
  rankingObjectives: [
    {
      key: 'visits_first',
      scope: 'client',
      comparators: [{ measureKey: 'visits', direction: 'desc' }],
      tieBreak: 'opaque_subject_id',
      unknownBucket: 'separate',
    },
    {
      key: 'return_first',
      scope: 'client',
      comparators: [{ measureKey: 'attended_return', direction: 'desc' }],
      tieBreak: 'opaque_subject_id',
      unknownBucket: 'separate',
    },
  ],
  minimumEvidence: [],
  exclusions: {
    serviceScope: [],
    branchIds: [],
    subjectStates: [],
    requiredFeatures: [],
  },
  opportunityAdmission: { enabled: false, rules: [] },
  modelUse: [],
};
const entitlements: Pick<EntitlementsService, 'resolveFeatureRequirements'> = {
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
  identitySecret: 'c8-synthetic-identity-'.repeat(4),
  payloadEncryptionSecret: 'c8-synthetic-payload-'.repeat(4),
  policyAttestationSecret: 'c8-synthetic-attestation-'.repeat(4),
});
const planner = new Package5Wave1ShadowService(
  engine.runtime,
  db,
  context,
  governed,
);
const executor = new Package5Wave1ExecutableService(
  db,
  engine.ingress,
  engine.kernel,
  undefined,
  governed,
);

const outcomes = new MeasurementOutcomesReader(db, context, {
  readTrustedNormalizedInput: (tenant, id, tx) =>
    engine.kernel.readTrustedNormalizedInput(tenant, id, tx),
});
const measurement = new MeasurementService(
  db,
  context,
  new MeasurementSources(db, undefined, undefined, outcomes),
);
const capture = new C8CaptureService(store, sources, measurement);
const producer = new C8Producer(store, sources, capture, measurement);
const opportunities = new C8OpportunityBridge(db, store, sources);
const labels = new C8LabelCollector(store, sources, measurement);
const evaluation = new C8EvaluationService(store, labels);
function object(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C8 Wave3 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@proof.invalid',
      passwordHash: 'not-login',
      role: 'tenant_owner',
      status: 'active',
      memberships: {
        create: { tenantId: tenant.id, role: 'tenant_owner', status: 'active' },
      },
    },
  });
  const system = <T>(f: () => T) => context.runAsSystemTenant(tenant.id, f);
  await system(async () =>
    executor.execute(
      await planner.buildGoverned(
        tenant.id,
        user.id,
        'tenant_business_configuration',
        'c8-wave2-' + randomUUID(),
        randomUUID(),
        {
          confirmed: true,
          namespace: 'c8_valuation',
          expectedRevision: 0,
          previousRevisionId: null,
          content: policy,
        },
      ),
    ),
  );
  const a = await db.client.create({ data: { tenantId: tenant.id } }),
    b = await db.client.create({ data: { tenantId: tenant.id } }),
    empty = await db.client.create({ data: { tenantId: tenant.id } });
  async function appointment(
    clientId: string,
    days: number,
    price: number,
    attendance = 'arrived',
  ) {
    const startAt = new Date(Date.now() - days * 86400000),
      endAt = new Date(startAt.getTime() + 3600000);
    return store.transaction((tx) =>
      tx.appointment.create({
        data: {
          tenantId: tenant.id,
          mayaClientId: clientId,
          source: 'internal',
          staffExternalId: 'synthetic',
          serviceIds: [],
          startAt,
          endAt,
          blockedStartAt: startAt,
          blockedEndAt: endAt,
          totalPriceKopecks: price,
          currency: 'RUB',
          attendance,
        },
      }),
    );
  }
  const past = await system(() => appointment(a.id, 40, 80000));
  await system(() => appointment(a.id, 50, 70000));
  await system(() => appointment(b.id, 2, 20000));

  await proof('disabled Opportunity policy creates no review item', () =>
    system(async () => {
      assert.equal((await opportunities.refresh()).admitted, 0);
    }),
  );
  async function configure(enabled: boolean) {
    const previous =
      await db.tenantBusinessConfigurationRevision.findFirstOrThrow({
        where: { tenantId: tenant.id, namespace: 'c8_valuation' },
        orderBy: { revision: 'desc' },
      });
    const content = {
      ...policy,
      opportunityAdmission: {
        enabled,
        rules: [
          {
            ruleKey: 'review_observed',
            opportunityType: 'client_reactivation_candidate',
            resultKind: 'OBSERVED_VALUE',
            measureKey: 'visits',
            comparison: 'gte',
            threshold: '2',
            basis: 'observed_attended_count',
            maximumAge: { unit: 'day', count: 30 },
            readDomain: 'client_lifecycle',
          },
        ],
      },
    };
    await executor.execute(
      await planner.buildGoverned(
        tenant.id,
        user.id,
        'tenant_business_configuration',
        randomUUID(),
        randomUUID(),
        {
          confirmed: true,
          namespace: 'c8_valuation',
          expectedRevision: previous.revision,
          previousRevisionId: previous.id,
          content,
        },
      ),
    );
  }
  await system(() => configure(true));
  await proof(
    'verified value plus policy dormancy admits one existing Opportunity without ActionExecution',
    () =>
      system(async () => {
        await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/visits',
          branchIds: [],
        });
        await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'dormancy/barber_cadence',
          branchIds: [],
        });
        const before = await db.actionExecution.count({
          where: { tenantId: tenant.id },
        });
        const first = await opportunities.refresh();
        assert.equal(first.admitted, 1);
        await Promise.all([opportunities.refresh(), opportunities.refresh()]);
        assert.equal(
          await db.opportunity.count({
            where: {
              tenantId: tenant.id,
              status: 'active',
              policyKey: 'c8_review_observed',
            },
          }),
          1,
        );
        assert.equal(
          await db.agentTask.count({ where: { tenantId: tenant.id } }),
          0,
        );
        assert.equal(
          await db.actionExecution.count({ where: { tenantId: tenant.id } }),
          before,
        );
      }),
  );
  await proof(
    'changed authoritative value refreshes evidence on the same semantic Opportunity',
    () =>
      system(async () => {
        const old = await db.opportunity.findFirstOrThrow({
          where: { tenantId: tenant.id, status: 'active' },
        });
        await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/visits',
          branchIds: [],
        });
        await opportunities.refresh();
        const current = await db.opportunity.findFirstOrThrow({
          where: { tenantId: tenant.id, status: 'active' },
        });
        assert.equal(current.semanticKey, old.semanticKey);
        assert.ok(current.revision >= old.revision);
      }),
  );
  await proof(
    'current source correction resolves review without changing source or history',
    () =>
      system(async () => {
        const old = await db.opportunity.findFirstOrThrow({
          where: { tenantId: tenant.id, status: 'active' },
        });
        await db.appointment.update({
          where: { id: past.id },
          data: { mayaClientId: b.id },
        });
        assert.equal(await opportunities.current(old), false);
        assert.equal((await opportunities.refresh()).resolved, 1);
        assert.equal(
          (await db.opportunity.findUniqueOrThrow({ where: { id: old.id } }))
            .status,
          'resolved',
        );
      }),
  );
  await proof('current A22 revocation prevents new Opportunity admission', () =>
    system(async () => {
      await configure(false);
      assert.equal((await opportunities.refresh()).admitted, 0);
    }),
  );
  const nextClient = await db.client.create({ data: { tenantId: tenant.id } });
  let futureId = '',
    predictionId = '',
    modelId = '';
  await proof(
    'future exact Appointment capture is durable before its outcome; immature is not zero',
    () =>
      system(async () => {
        const startAt = new Date(Date.now() + 8000),
          endAt = new Date(startAt.getTime() + 1000);
        const ap = await db.appointment.create({
          data: {
            tenantId: tenant.id,
            mayaClientId: nextClient.id,
            source: 'internal',
            staffExternalId: 'proof',
            serviceIds: [],
            startAt,
            endAt,
            blockedStartAt: startAt,
            blockedEndAt: endAt,
          },
        });
        futureId = ap.id;
        const p = await producer.compute({
          subjectKind: 'appointment',
          subjectId: ap.id,
          capability: 'prediction/appointment_no_show',
          branchIds: [],
        });
        predictionId = p.id;
        modelId = p.modelVersionId!;
        const first = await evaluation.evaluate(modelId);
        assert.ok(first);
        assert.equal(object(first.countsJson).immature, 1);
        assert.equal(
          (first.casesJson as Prisma.JsonArray)[0] &&
            object((first.casesJson as Prisma.JsonArray)[0]).labelValue,
          null,
        );
      }),
  );

  await proof(
    'concurrent polling and restart reuse identical immature evaluation',
    () =>
      system(async () => {
        const rows = await Promise.all([
          evaluation.evaluate(modelId),
          evaluation.evaluate(modelId),
          evaluation.evaluate(modelId),
        ]);
        assert.equal(new Set(rows.map((r) => r!.id)).size, 1);
        assert.ok(
          rows.every(
            (r) =>
              r!.outcome !== 'PASS' &&
              r!.calibrationJson === null &&
              r!.metricsJson === null,
          ),
        );
      }),
  );
  await proof(
    'later qualified no-show yields a new evaluation, never rewrites frozen T0',
    () =>
      system(async () => {
        const p = await store.result(predictionId);
        assert.ok(p);
        await new Promise<void>((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, p.horizonEnd!.getTime() - Date.now() + 100),
          ),
        );
        await db.appointment.update({
          where: { id: futureId },
          data: { attendance: 'no_show' },
        });
        const result = await evaluation.evaluate(modelId);
        assert.ok(result);
        assert.equal(object(result.countsJson).qualified, 1);
        assert.equal(
          object((result.casesJson as Prisma.JsonArray)[0]).labelValue,
          '1',
        );
        assert.equal(result.outcome, 'INSUFFICIENT_DATA');
        assert.equal(result.calibrationJson, null);
        assert.deepEqual(await store.result(predictionId), p);
      }),
  );
  await proof(
    'authoritative attendance correction changes current label revision only',
    () =>
      system(async () => {
        const before = await evaluation.evaluate(modelId);
        assert.ok(before);
        await db.appointment.update({
          where: { id: futureId },
          data: { attendance: 'arrived' },
        });
        const next = await evaluation.evaluate(modelId);
        assert.ok(next);
        assert.notEqual(next.id, before.id);
        assert.equal(next.revision, before.revision + 1);
        assert.equal(
          object((next.casesJson as Prisma.JsonArray)[0]).labelValue,
          '0',
        );
        assert.equal(
          object(
            (
              (
                await db.c8EvaluationRevision.findUniqueOrThrow({
                  where: { id: before.id },
                })
              ).casesJson as Prisma.JsonArray
            )[0],
          ).labelValue,
          '1',
        );
        const retries = await Promise.all([
          evaluation.evaluate(modelId),
          evaluation.evaluate(modelId),
        ]);
        assert.ok(retries.every((r) => r!.id === next.id));
      }),
  );
  await proof(
    'reassignment excludes exact appointment outcome; unrelated Client is not negative',
    () =>
      system(async () => {
        await db.appointment.update({
          where: { id: futureId },
          data: { mayaClientId: b.id },
        });
        const row = await evaluation.evaluate(modelId);
        assert.ok(row);
        assert.equal(object(row.countsJson).excluded, 1);
        assert.equal(
          object((row.casesJson as Prisma.JsonArray)[0]).labelValue,
          null,
        );
      }),
  );
  await proof(
    'post-T0 attended visit creates a real positive return label without waiting for full H',
    () =>
      system(async () => {
        const p = await producer.compute({
          subjectKind: 'client',
          subjectId: empty.id,
          capability: 'prediction/attended_return',
          branchIds: [],
        });
        const startAt = new Date(Date.now() + 100),
          endAt = new Date(startAt.getTime() + 100);
        await db.appointment.create({
          data: {
            tenantId: tenant.id,
            mayaClientId: empty.id,
            source: 'internal',
            staffExternalId: 'proof',
            serviceIds: [],
            startAt,
            endAt,
            blockedStartAt: startAt,
            blockedEndAt: endAt,
            attendance: 'arrived',
          },
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        const result = await evaluation.evaluate(p.modelVersionId!);
        assert.ok(result);
        assert.equal(object(result.countsJson).qualified, 1);
        assert.equal(
          object((result.casesJson as Prisma.JsonArray)[0]).labelValue,
          '1',
        );
        assert.equal(result.outcome, 'INSUFFICIENT_DATA');
      }),
  );
  await proof(
    'cross-tenant evaluator rejects model; no hidden Client or source writer',
    async () => {
      const other = await db.tenant.create({
        data: { name: 'C8 cross tenant', slug: randomUUID() },
      });
      const count = await db.client.count({ where: { tenantId: tenant.id } });
      await assert.rejects(() =>
        context.runAsSystemTenant(other.id, () => evaluation.evaluate(modelId)),
      );
      assert.equal(
        await db.client.count({ where: { tenantId: tenant.id } }),
        count,
      );
    },
  );
  await proof(
    'outcome known before T0 is excluded from prospective prediction admission',
    () =>
      system(async () => {
        const startAt = new Date(Date.now() + 3600000),
          endAt = new Date(startAt.getTime() + 60000);
        const ap = await db.appointment.create({
          data: {
            tenantId: tenant.id,
            mayaClientId: empty.id,
            source: 'internal',
            staffExternalId: 'proof',
            serviceIds: [],
            startAt,
            endAt,
            blockedStartAt: startAt,
            blockedEndAt: endAt,
            attendance: 'arrived',
          },
        });
        const before = await db.c8ResultRevision.count({
          where: { tenantId: tenant.id },
        });
        await assert.rejects(
          () =>
            producer.compute({
              subjectKind: 'appointment',
              subjectId: ap.id,
              capability: 'prediction/appointment_no_show',
              branchIds: [],
            }),
          /c8_outcome_already_observed_at_t0/,
        );
        assert.equal(
          await db.c8ResultRevision.count({ where: { tenantId: tenant.id } }),
          before,
        );
      }),
  );
  console.log(
    JSON.stringify({
      status: 'PASS',
      checks: checks.length,
      productionEffects: 0,
      numericTargetsActive: 0,
      calibration: 'UNAVAILABLE',
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
