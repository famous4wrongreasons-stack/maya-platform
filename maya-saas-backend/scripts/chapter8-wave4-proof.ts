import { C8ReadService } from '../src/valuation/c8.read';
import { C8RankingService } from '../src/valuation/c8.ranking';
import { MeasurementReadService } from '../src/measurement/measurement.read.service';
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
import { MeasurementOutcomesReader } from '../src/measurement/measurement.outcomes';
import { UserRole } from '@prisma/client';
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

const viewer = new MeasurementReadService(
  db,
  context,
  entitlements as EntitlementsService,
  measurement,
  new MeasurementSources(db, undefined, undefined, outcomes),
);
const reader = new C8ReadService(
  db,
  context,
  viewer,
  store,
  sources,
  producer,
  new C8RankingService(store, sources, producer),
);
async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C8 P06 synthetic',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const branch = await db.branch.create({
    data: { tenantId: tenant.id, name: 'Synthetic branch' },
  });
  const makeUser = (role: UserRole, branchId: string | null = null) =>
    db.user.create({
      data: {
        tenantId: tenant.id,
        role,
        email: randomUUID() + '@proof.invalid',
        passwordHash: 'no-login',
        status: 'active',
        memberships: {
          create: { tenantId: tenant.id, role, status: 'active', branchId },
        },
      },
    });
  const owner = await makeUser('tenant_owner'),
    manager = await makeUser('manager'),
    worker = await makeUser('staff'),
    branchManager = await makeUser('branch_manager', branch.id);
  const auth = <T>(actor: typeof owner, fn: () => T) =>
    context.runAsAuthPrincipal(
      { tenantId: tenant.id, userId: actor.id, role: actor.role },
      fn,
    );
  const system = <T>(fn: () => T) => context.runAsSystemTenant(tenant.id, fn);

  await system(async () =>
    executor.execute(
      await planner.buildGoverned(
        tenant.id,
        owner.id,
        'tenant_business_configuration',
        'c8-p06-' + randomUUID(),
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
    b = await db.client.create({ data: { tenantId: tenant.id } });
  const at = new Date(Date.now() - 40 * 86400000),
    end = new Date(at.getTime() + 3600000);
  const ap = await db.appointment.create({
    data: {
      tenantId: tenant.id,
      mayaClientId: a.id,
      source: 'internal',
      staffExternalId: 'synthetic',
      serviceIds: [],
      startAt: at,
      endAt: end,
      blockedStartAt: at,
      blockedEndAt: end,
      attendance: 'arrived',
      totalPriceKopecks: 12345,
      currency: 'RUB',
    },
  });
  const body = {
    subjectKind: 'client',
    subjectId: a.id,
    capability: 'value/visits',
    branchIds: [],
  };
  await proof(
    'unauthenticated reads and compute denied before any derived admission',
    async () => {
      const before = await db.c8ResultRevision.count({
        where: { tenantId: tenant.id },
      });
      await assert.rejects(() => reader.compute(tenant.id, owner.id, body));
      await assert.rejects(() => reader.list(tenant.id, owner.id));
      assert.equal(
        await db.c8ResultRevision.count({ where: { tenantId: tenant.id } }),
        before,
      );
    },
  );
  let valueId = '',
    moneyId = '',
    rankId = '';
  await proof(
    'exact authorized Client without Maya User computes and reads canonical observed value',
    () =>
      auth(owner, async () => {
        const row = await reader.compute(tenant.id, owner.id, body);
        valueId = row.id;
        assert.equal(row.available, true);
        assert.equal(row.subject.id, a.id);
        assert.equal(
          (await db.client.findUniqueOrThrow({ where: { id: a.id } })).userId,
          null,
        );
      }),
  );
  await proof(
    'GET list, snapshot and readiness do not create rows or business executions',
    () =>
      auth(owner, async () => {
        const before = await db.c8ResultRevision.count({
            where: { tenantId: tenant.id },
          }),
          acts = await db.actionExecution.count({
            where: { tenantId: tenant.id },
          });
        await reader.list(tenant.id, owner.id);
        await reader.snapshot(tenant.id, owner.id, valueId);
        const ready = await reader.readiness(tenant.id, owner.id);
        assert.equal(ready.targets.length, 8);
        assert.ok(
          ready.targets.every(
            (x) =>
              x.activation === 'DISABLED' &&
              x.calibration === 'UNAVAILABLE' &&
              !x.userVisibleNumericPrediction,
          ),
        );
        assert.equal(
          await db.c8ResultRevision.count({ where: { tenantId: tenant.id } }),
          before,
        );
        assert.equal(
          await db.actionExecution.count({ where: { tenantId: tenant.id } }),
          acts,
        );
      }),
  );
  await proof(
    'caller features, past T0 and computed output are rejected before admission',
    () =>
      auth(owner, async () => {
        const before = await db.c8ResultRevision.count({
          where: { tenantId: tenant.id },
        });
        for (const field of [
          'features',
          't0',
          'probability',
          'valuesJson',
          'modelVersionId',
        ])
          await assert.rejects(() =>
            reader.compute(tenant.id, owner.id, { ...body, [field]: 'forged' }),
          );
        assert.equal(
          await db.c8ResultRevision.count({ where: { tenantId: tenant.id } }),
          before,
        );
      }),
  );
  await proof(
    'manager can read own permitted facts but cannot compute or read financial results',
    async () => {
      const money = await auth(owner, () =>
        reader.compute(tenant.id, owner.id, {
          ...body,
          capability: 'value/booked',
        }),
      );
      moneyId = money.id;
      await auth(manager, async () => {
        assert.equal(
          (await reader.snapshot(tenant.id, manager.id, valueId)).basis,
          'observed_attended_count',
        );
        await assert.rejects(() =>
          reader.snapshot(tenant.id, manager.id, moneyId),
        );
        await assert.rejects(() =>
          reader.compute(tenant.id, manager.id, {
            ...body,
            capability: 'value/booked',
          }),
        );
        assert.ok(
          (await reader.list(tenant.id, manager.id)).items.every(
            (x) => x.id !== moneyId,
          ),
        );
      });
    },
  );
  await proof(
    'whole rank uses shared owner; financial-derived rank is not disclosed by hiding amounts',
    async () => {
      const rank = await auth(owner, () =>
        reader.compute(tenant.id, owner.id, {
          subjectKind: 'tenant',
          subjectId: tenant.id,
          capability: 'ranking/visits_first',
          branchIds: [],
        }),
      );
      rankId = rank.id;
      assert.ok(rank.ranking);
      await auth(manager, () =>
        assert.rejects(() => reader.snapshot(tenant.id, manager.id, rankId)),
      );
    },
  );
  await proof(
    'AI receives bounded deterministic projection without stable Client/evidence/model IDs or contacts',
    () =>
      auth(owner, async () => {
        const ai = await reader.forAi(tenant.id, owner.id);
        const text = JSON.stringify(ai);
        assert.equal(ai.numericPredictionsAvailable, false);
        assert.equal(ai.canContact, false);
        assert.equal(ai.canExecute, false);
        for (const id of [a.id, b.id, ap.id, moneyId, rankId, owner.id])
          assert.ok(!text.includes(id));
        for (const key of [
          'inputSnapshotJson',
          'evidenceRefsJson',
          'phone',
          'email',
          'encrypted',
          'modelVersionId',
          'policyRevision',
        ])
          assert.ok(!text.includes(key));
        assert.ok(ai.items.length <= 20);
      }),
  );
  await proof(
    'cross-tenant result, wrong Client and out-of-branch requests fail closed',
    () =>
      auth(owner, async () => {
        const other = await db.tenant.create({
            data: { name: 'Other C8 synthetic', slug: randomUUID() },
          }),
          foreign = await db.client.create({ data: { tenantId: other.id } });
        await assert.rejects(() =>
          reader.compute(tenant.id, owner.id, {
            ...body,
            subjectId: foreign.id,
          }),
        );
        await assert.rejects(() =>
          reader.snapshot(other.id, owner.id, valueId),
        );
      }),
  );
  await proof('branch manager cannot compute a whole-tenant Client scope', () =>
    auth(branchManager, () =>
      assert.rejects(() => reader.compute(tenant.id, branchManager.id, body)),
    ),
  );
  await proof(
    'Staff receives only own permitted prospective salary state',
    async () => {
      const own = await db.staff.create({
        data: { tenantId: tenant.id, userId: worker.id, active: true },
      });
      const another = await db.staff.create({
        data: { tenantId: tenant.id, active: true },
      });
      await auth(worker, async () => {
        const request = {
          subjectKind: 'staff',
          subjectId: own.id,
          capability: 'prediction/staff_earnings_conditional',
          branchIds: [],
        };
        const p = await reader.compute(tenant.id, worker.id, request);
        assert.equal(p.numericPrediction, null);
        assert.equal(p.available, false);
        assert.equal(
          (await reader.snapshot(tenant.id, worker.id, p.id)).subject.id,
          own.id,
        );
        await assert.rejects(() =>
          reader.compute(tenant.id, worker.id, {
            ...request,
            subjectId: another.id,
          }),
        );
      });
    },
  );
  await proof('Staff cannot read another subject or whole-client rank', () =>
    auth(worker, async () => {
      await assert.rejects(() =>
        reader.snapshot(tenant.id, worker.id, valueId),
      );
      await assert.rejects(() => reader.snapshot(tenant.id, worker.id, rankId));
      assert.ok(
        (await reader.list(tenant.id, worker.id)).items.every(
          (x) => x.subject.kind === 'staff',
        ),
      );
    }),
  );
  await proof('bounded pages and forbidden query fields are enforced', () =>
    auth(owner, async () => {
      for (const limit of ['0', '101', 'Infinity', '-1'])
        await assert.rejects(() => reader.list(tenant.id, owner.id, { limit }));
      await assert.rejects(() =>
        reader.list(tenant.id, owner.id, { cursor: 'unknown' }),
      );
      await assert.rejects(() =>
        reader.list(tenant.id, owner.id, { export: 'contacts' } as never),
      );
    }),
  );
  await proof(
    'source correction makes old current projection unavailable without rewriting its snapshot',
    () =>
      auth(owner, async () => {
        const before = await db.c8ResultRevision.findUniqueOrThrow({
          where: { id: valueId },
        });
        await db.appointment.update({
          where: { id: ap.id },
          data: { mayaClientId: b.id },
        });
        const old = await reader.snapshot(tenant.id, owner.id, valueId);
        assert.equal(old.current, false);
        assert.equal(old.available, false);
        assert.deepEqual(old.values, []);
        assert.deepEqual(
          await db.c8ResultRevision.findUniqueOrThrow({
            where: { id: valueId },
          }),
          before,
        );
      }),
  );
  await proof(
    'current Membership revocation denies history, list and model readiness',
    async () => {
      await db.membership.update({
        where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
        data: { status: 'suspended' },
      });
      await auth(owner, async () => {
        await assert.rejects(() =>
          reader.snapshot(tenant.id, owner.id, valueId),
        );
        await assert.rejects(() => reader.list(tenant.id, owner.id));
        await assert.rejects(() => reader.readiness(tenant.id, owner.id));
      });
    },
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
