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
import { C8RankingService } from '../src/valuation/c8.ranking';
import { C8Worker } from '../src/valuation/c8.worker';
import { MeasurementOutcomesReader } from '../src/measurement/measurement.outcomes';
import { C8ResultRevision, Prisma } from '@prisma/client';
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
const ranking = new C8RankingService(store, sources, producer);
const worker = new C8Worker(store, sources, producer, ranking);
function object(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function entries(
  value: Prisma.JsonValue | null,
  key: string,
): Prisma.JsonObject[] {
  const rows = object(value)[key];
  assert.ok(Array.isArray(rows));
  return rows.map(object);
}
async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C8 Wave2 synthetic',
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
  let value: C8ResultRevision | undefined;
  await proof(
    'historical booked value uses exact C7 evidence and Client without Maya User',
    () =>
      system(async () => {
        value = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/booked',
          branchIds: [],
        });
        assert.equal(value.state, 'PUBLISHED');
        assert.equal(entries(value.valuesJson, 'values')[0].value, '150000');
        assert.equal(value.completeness, 'PARTIAL');
        assert.equal(value.currency, 'RUB');
        assert.equal(
          (object(value.valuesJson).limitations as Prisma.JsonArray).includes(
            'observed_proxy_not_cash_profit_or_clv',
          ),
          true,
        );
      }),
  );
  await proof(
    'unknown cash stays unavailable and historical money never becomes CLV',
    () =>
      system(async () => {
        const row = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/cash',
          branchIds: [],
        });
        assert.equal(row.state, 'UNAVAILABLE');
        assert.equal(row.valuesJson, null);
      }),
  );
  await proof(
    'confirmed cadence uses exact last proven visit; no visit is not dormant',
    () =>
      system(async () => {
        const dormant = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'dormancy/barber_cadence',
          branchIds: [],
        });
        assert.equal(entries(dormant.valuesJson, 'values')[0].value, true);
        const active = await producer.compute({
          subjectKind: 'client',
          subjectId: b.id,
          capability: 'dormancy/barber_cadence',
          branchIds: [],
        });
        assert.equal(entries(active.valuesJson, 'values')[0].value, false);
        const unknown = await producer.compute({
          subjectKind: 'client',
          subjectId: empty.id,
          capability: 'dormancy/barber_cadence',
          branchIds: [],
        });
        assert.equal(unknown.state, 'UNAVAILABLE');
      }),
  );
  await proof(
    'whole deterministic cohort preserves stable order and separate unknowns',
    () =>
      system(async () => {
        const rank = await ranking.compute('visits_first', []);
        assert.equal(rank.state, 'PUBLISHED');
        const members = entries(rank.rankingJson, 'members');
        assert.deepEqual(
          members.map((m) => m.subjectRef),
          [a.id, b.id, empty.id],
        );
        assert.equal((await ranking.resume(rank.id)).id, rank.id);
        assert.deepEqual(
          (await store.result(rank.id))?.rankingJson,
          rank.rankingJson,
        );
        assert.equal(
          JSON.stringify(rank.rankingJson).includes('150000'),
          false,
        );
      }),
  );
  await proof(
    'disabled predictive comparator cannot silently become deterministic ranking',
    () =>
      system(async () => {
        const rank = await ranking.compute('return_first', []);
        assert.equal(rank.state, 'UNAVAILABLE');
        assert.equal(rank.rankingJson, null);
      }),
  );
  await proof(
    'new canonical Appointment invalidates old query despite unchanged old rows',
    () =>
      system(async () => {
        value = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/booked',
          branchIds: [],
        });
        assert.equal(
          await store.transaction((tx) => store.refsCurrent(value!, tx)),
          true,
        );
        await appointment(a.id, 20, 10000);
        assert.equal(
          await store.transaction((tx) => store.refsCurrent(value!, tx)),
          false,
        );
        const next = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/booked',
          branchIds: [],
        });
        assert.equal(entries(next.valuesJson, 'values')[0].value, '160000');
        assert.deepEqual(
          (await store.result(value.id))?.valuesJson,
          value.valuesJson,
        );
      }),
  );
  await proof(
    'source Client correction succeeds; immutable old result loses current eligibility',
    () =>
      system(async () => {
        const before = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/booked',
          branchIds: [],
        });
        await store.transaction((tx) =>
          tx.appointment.update({
            where: { id: past.id },
            data: { mayaClientId: b.id },
          }),
        );
        assert.equal(
          await store.transaction((tx) => store.refsCurrent(before, tx)),
          false,
        );
        assert.deepEqual(
          (await store.result(before.id))?.valuesJson,
          before.valuesJson,
        );
      }),
  );
  const future = await system(() => appointment(a.id, -1, 35000, 'awaiting'));
  await proof(
    'future no-show captures existing Appointment schedule but publishes no numeric probability',
    () =>
      system(async () => {
        const r = await producer.compute({
          subjectKind: 'appointment',
          subjectId: future.id,
          capability: 'prediction/appointment_no_show',
          branchIds: [],
        });
        assert.equal(r.state, 'UNAVAILABLE');
        assert.equal(r.valuesJson, null);
        assert.ok(r.modelVersionId);
        assert.equal(r.horizonEnd?.toISOString(), future.endAt.toISOString());
        assert.equal(
          entries(r.inputSnapshotJson, 'features').find(
            (f) => f.key === 'scheduled_start_at',
          )?.value,
          future.startAt.toISOString(),
        );
        assert.equal((await producer.resume(r.id)).intentHash, r.intentHash);
      }),
  );
  await proof(
    'conditional existing-booking scenario is explicitly not cash or expected revenue',
    () =>
      system(async () => {
        const r = await producer.compute({
          subjectKind: 'appointment',
          subjectId: future.id,
          capability: 'scenario/booked_appointment',
          branchIds: [],
        });
        assert.equal(r.state, 'PUBLISHED');
        assert.equal(entries(r.valuesJson, 'values')[0].type, 'scenario');
      }),
  );
  await proof(
    'worker restart retains T0 and horizon rather than manufacturing duplicate observations',
    () =>
      system(async () => {
        await worker.tickTenant(tenant.id);
        const one = await store.transaction((tx) =>
          tx.c8ResultRevision.findMany({
            where: { tenantId: tenant.id, kind: 'PREDICTION' },
            orderBy: { id: 'asc' },
            select: { id: true, t0: true, intentHash: true },
          }),
        );
        const resumedWorker = new C8Worker(store, sources, producer, ranking);
        await resumedWorker.tickTenant(tenant.id);
        const two = await store.transaction((tx) =>
          tx.c8ResultRevision.findMany({
            where: { tenantId: tenant.id, kind: 'PREDICTION' },
            orderBy: { id: 'asc' },
            select: { id: true, t0: true, intentHash: true },
          }),
        );
        assert.deepEqual(two, one);
      }),
  );
  await proof(
    'concurrent claims publish one immutable result; direct user producer denied',
    async () => {
      await assert.rejects(
        () =>
          producer.compute({
            subjectKind: 'client',
            subjectId: a.id,
            capability: 'value/booked',
            branchIds: [],
          }),
        /system_tenant/,
      );
      await system(async () => {
        const r = await producer.compute({
          subjectKind: 'client',
          subjectId: a.id,
          capability: 'value/booked',
          branchIds: [],
        });
        const outcomes = await Promise.all(
          Array.from({ length: 8 }, () => producer.resume(r.id)),
        );
        assert.equal(new Set(outcomes.map((x) => x.id)).size, 1);
      });
    },
  );
  await proof(
    'all eight target instances persist honest prospective disabled contracts',
    () =>
      system(async () => {
        const staff = await db.staff.create({
          data: { tenantId: tenant.id, active: true },
        });
        for (const target of policy.predictionTargets) {
          const subjectKind = [
            'attended_return',
            'client_expected_value',
          ].includes(target.targetKey)
            ? 'client'
            : target.targetKey === 'appointment_no_show'
              ? 'appointment'
              : target.targetKey === 'staff_earnings_conditional'
                ? 'staff'
                : 'tenant';
          const subjectId =
            subjectKind === 'client'
              ? a.id
              : subjectKind === 'appointment'
                ? future.id
                : subjectKind === 'staff'
                  ? staff.id
                  : tenant.id;
          const row = await producer.compute({
            subjectKind,
            subjectId,
            capability: 'prediction/' + target.targetKey,
            branchIds: [],
          });
          assert.equal(row.state, 'UNAVAILABLE');
          assert.equal(row.valuesJson, null);
          assert.ok(row.modelVersionId);
          assert.ok(row.horizonEnd && row.horizonEnd > row.t0);
          if (target.targetKey !== 'appointment_no_show')
            assert.equal(
              row.horizonEnd.getTime() - row.t0.getTime(),
              7 * 86400000,
            );
          const model = await store.transaction((tx) =>
            tx.c8ModelVersion.findUniqueOrThrow({
              where: { id: row.modelVersionId! },
            }),
          );
          assert.equal(model.targetKey, target.targetKey);
          assert.equal(object(model.methodJson).methodKey, 'unfitted_target');
        }
      }),
  );
  await proof(
    'concurrent first prospective worker capture has one immutable T0 winner',
    () =>
      system(async () => {
        const client = await db.client.create({
          data: { tenantId: tenant.id },
        });
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            producer.compute(
              {
                subjectKind: 'client',
                subjectId: client.id,
                capability: 'prediction/attended_return',
                branchIds: [],
              },
              undefined,
              true,
            ),
          ),
        );
        assert.equal(new Set(results.map((r) => r.id)).size, 1);
        assert.equal(new Set(results.map((r) => r.t0.toISOString())).size, 1);
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
