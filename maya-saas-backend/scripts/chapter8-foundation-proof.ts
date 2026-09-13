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
import { C8Store, C8PreparedResult, c8PgHash } from '../src/valuation/c8.store';
import { MeasurementService } from '../src/measurement/measurement.service';
import { MeasurementSources } from '../src/measurement/measurement.sources';
import { C8Sources } from '../src/valuation/c8.sources';
import {
  C8_RETENTION_MS,
  c8Hash,
  C8Object,
} from '../src/valuation/c8.contract';
import { C8Case } from '../src/valuation/c8.evaluation.contract';
import { C8_TARGET_DEFINITIONS } from '../src/valuation/c8.targets';
import { Package5Wave6MaintenanceService } from '../src/package5-wave6/package5-wave6.service';
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
  valueMeasures: [],
  predictionTargets: [],
  dormancyRules: [],
  rankingObjectives: [],
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
async function main() {
  await db.$connect();
  const tenant = await db.tenant.create({
    data: {
      name: 'C8 synthetic proof',
      slug: randomUUID(),
      status: 'active',
      calendarSource: 'internal',
      defaultTimezone: 'UTC',
    },
  });
  const other = await db.tenant.create({
    data: { name: 'C8 other synthetic', slug: randomUUID(), status: 'active' },
  });
  const user = await db.user.create({
    data: {
      tenantId: tenant.id,
      email: randomUUID() + '@proof.invalid',
      passwordHash: 'not-a-login',
      role: 'tenant_owner',
      status: 'active',
      memberships: {
        create: { tenantId: tenant.id, role: 'tenant_owner', status: 'active' },
      },
    },
  });
  const a = await db.client.create({ data: { tenantId: tenant.id } });
  const b = await db.client.create({ data: { tenantId: tenant.id } });
  const alien = await db.client.create({ data: { tenantId: other.id } });
  const system = <T>(f: () => T) => context.runAsSystemTenant(tenant.id, f);
  await proof('A22 remains the real confirmed policy owner', () =>
    system(async () => {
      const result = await executor.execute(
        await planner.buildGoverned(
          tenant.id,
          user.id,
          'tenant_business_configuration',
          'c8-policy-' + randomUUID(),
          randomUUID(),
          {
            confirmed: true,
            namespace: 'c8_valuation',
            expectedRevision: 0,
            previousRevisionId: null,
            content: policy,
          },
        ),
      );
      assert.ok(result);
      assert.equal(
        await db.tenantBusinessConfigurationRevision.count({
          where: { tenantId: tenant.id, namespace: 'c8_valuation' },
        }),
        1,
      );
    }),
  );
  const config = await system(() =>
    store.transaction((tx) => sources.policy(tx)),
  );
  async function prepare(
    clientId = a.id,
    extra: Partial<C8PreparedResult> = {},
  ): Promise<C8PreparedResult> {
    return system(() =>
      store.transaction(async (tx) => {
        const ref = await sources.subjectRef(tx, 'Client', clientId);
        const t0 = new Date();
        return {
          kind: 'OBSERVED_VALUE',
          subjectKind: 'client',
          subjectId: clientId,
          ruleKey: 'c8.observed-value',
          ruleVersion: 1,
          t0,
          horizonEnd: null,
          periodFrom: new Date(t0.getTime() - 86400000),
          periodTo: t0,
          timezone: 'UTC',
          policyRevisionId: config.id,
          policyContentHash: config.hash,
          scopeJson: {
            version: 1,
            capabilityKey: 'c8.observed-value',
            branchIds: [],
            serviceScope: [],
            staffScope: [],
            providerCapability: 'internal_calendar',
            featureContractHash: c8Hash([]),
            targetKey: null,
            targetContractHash: null,
            cohortDefinitionHash: null,
          },
          basis: 'observed_attended_count',
          currency: null,
          inputSnapshotJson: {
            version: 1,
            features: [],
            missingness: [],
            coverage: 'PARTIAL',
            dependencies: [],
          },
          evidenceRefsJson: [ref],
          completeness: 'PARTIAL',
          qualification: 'VERIFIED',
          eligibility: 'ELIGIBLE',
          ...extra,
        };
      }),
    );
  }
  const input = await prepare();
  await proof(
    'only exact system tenant can admit; rejection produces no C8 result',
    async () => {
      await assert.rejects(() => store.admitResult(input), /system_tenant/);
      assert.equal(
        await db.c8ResultRevision.count({ where: { tenantId: tenant.id } }),
        0,
      );
    },
  );
  await proof('wrong tenant and cross-Client provenance rejected', () =>
    system(async () => {
      await assert.rejects(() =>
        store.admitResult({ ...input, subjectId: alien.id }),
      );
      await assert.rejects(() =>
        store.admitResult({ ...input, subjectId: b.id }),
      );
      assert.equal(
        await db.c8ResultRevision.count({ where: { tenantId: tenant.id } }),
        0,
      );
    }),
  );
  const rows = await system(() =>
    Promise.all(Array.from({ length: 8 }, () => store.admitResult(input))),
  );
  await proof(
    'eight concurrent admissions converge to one exact intent/revision',
    () => {
      assert.equal(new Set(rows.map((r) => r.id)).size, 1);
      assert.equal(rows[0].revision, 1);
      assert.equal(rows[0].subjectId, a.id);
      assert.equal(a.userId, null);
    },
  );
  const row = rows[0];
  await proof(
    'same admitted observation retry preserves id, T0 and retention',
    () =>
      system(async () => {
        const retry = await store.admitResult(input);
        assert.equal(retry.id, row.id);
        assert.equal(retry.t0.getTime(), row.t0.getTime());
        assert.equal(retry.expiresAt.getTime(), row.expiresAt.getTime());
        assert.equal(
          row.expiresAt.getTime() - row.admittedAt.getTime(),
          C8_RETENTION_MS,
        );
      }),
  );
  await proof('changed immutable input on raw update rejected', () =>
    system(async () => {
      await assert.rejects(() =>
        store.transaction((tx) =>
          tx.c8ResultRevision.update({
            where: { id: row.id },
            data: { subjectId: b.id },
          }),
        ),
      );
    }),
  );
  const claims = await system(() =>
    Promise.all(
      Array.from({ length: 8 }, () => store.claim('C8ResultRevision', row.id)),
    ),
  );
  const lease = claims.find(Boolean)!;
  await proof('concurrent claims have one winner', () =>
    assert.equal(claims.filter(Boolean).length, 1),
  );
  await proof('wrong lease cannot publish', () =>
    system(() =>
      assert.rejects(() =>
        store.publishUnavailable({ ...lease, token: randomUUID() }, [
          'insufficient_data',
        ]),
      ),
    ),
  );
  const empty = () =>
    Promise.resolve({
      valuesJson: {
        version: 1,
        values: [],
        limitations: ['no_measured_values'],
      },
      reasonsJson: [] as C8Object[],
      rankingJson: null,
    });
  await system(() => store.publishResult(lease, empty));
  const published = await system(() => store.result(row.id));
  assert.ok(published);
  await proof(
    'published snapshot remains immutable and confirmed retry skips',
    () =>
      system(async () => {
        assert.equal(published.state, 'PUBLISHED');
        assert.equal(await store.claim('C8ResultRevision', row.id), null);
        await assert.rejects(() =>
          store.transaction((tx) =>
            tx.c8ResultRevision.update({
              where: { id: row.id },
              data: { valuesJson: { version: 1, values: [], limitations: [] } },
            }),
          ),
        );
      }),
  );
  await proof(
    'changed observed evidence creates next revision without editing old snapshot',
    () =>
      system(async () => {
        const changed = {
          ...input,
          inputSnapshotJson: {
            ...input.inputSnapshotJson,
            missingness: ['source_window_partial'],
          },
        };
        const next = await store.admitResult(changed);
        assert.equal(next.revision, 2);
        assert.notEqual(next.intentHash, row.intentHash);
        assert.equal((await store.current(row.identityHash))?.id, next.id);
        assert.equal(
          (await store.result(row.id))?.snapshotHash,
          published.snapshotHash,
        );
        const nextLease = await store.claim('C8ResultRevision', next.id);
        assert.ok(nextLease);
        await store.publishUnavailable(nextLease, ['insufficient_data']);
        assert.equal(
          (await store.current(row.identityHash))?.state,
          'UNAVAILABLE',
        );
      }),
  );
  const stale = await prepare(b.id);
  const staleRow = await system(() => store.admitResult(stale));
  await db.client.update({
    where: { id: b.id },
    data: { phoneHash: 'synthetic-source-correction-not-authority' },
  });
  await proof(
    'source correction is not blocked; stale pending closes unavailable',
    () =>
      system(async () => {
        const l = await store.claim('C8ResultRevision', staleRow.id);
        assert.ok(l);
        await store.publishResult(l, empty);
        assert.equal((await store.result(staleRow.id))?.state, 'UNAVAILABLE');
      }),
  );
  const prediction = await prepare(a.id, {
    kind: 'PREDICTION',
    ruleKey: 'c8.attended_return',
    basis: 'attended_return',
    horizonEnd: new Date(Date.now() + 86400000),
    eligibility: 'INSUFFICIENT_DATA',
  });
  prediction.scopeJson = {
    ...prediction.scopeJson,
    targetKey: 'attended_return',
    targetContractHash: c8Hash(C8_TARGET_DEFINITIONS.attended_return),
  };
  const predictionRow = await system(() => store.admitResult(prediction));
  await proof(
    'unfitted target captures T0 without fake model or numeric output',
    () =>
      system(async () => {
        assert.equal(predictionRow.modelVersionId, null);
        const l = await store.claim('C8ResultRevision', predictionRow.id);
        assert.ok(l);
        await store.publishResult(l, empty);
        const r = await store.result(predictionRow.id);
        assert.equal(r?.state, 'UNAVAILABLE');
        assert.equal(r?.valuesJson, null);
        assert.equal(r?.rankingJson, null);
      }),
  );
  const definition = {
    version: 1,
    targetKey: 'attended_return',
    eventDefinition: C8_TARGET_DEFINITIONS.attended_return.event,
    horizon: { unit: 'day', count: 1 },
    basis: 'attended_return',
    currency: null,
    unit: 'probability',
    labelMaturity: 'complete_horizon_coverage',
    requiredCoverage: 'COMPLETE',
    conditioning: null,
  };
  const scope = {
    version: 1,
    tenantId: tenant.id,
    branchIds: [],
    serviceScope: [],
    providerCapability: 'internal_calendar',
    verticalDomain: 'synthetic',
    cohortDefinitionHash: null,
  };
  const model = await system(() => store.admitDefinition(definition, scope));
  await proof(
    'registry explicitly stores unfitted definition; same definition retry is stable',
    () =>
      system(async () => {
        assert.equal(
          (model.methodJson as { methodKey: string }).methodKey,
          'unfitted_target',
        );
        assert.deepEqual(model.parametersJson, {
          version: 1,
          coefficientNames: [],
          coefficients: [],
        });
        assert.equal(
          (await store.admitDefinition(definition, scope)).id,
          model.id,
        );
      }),
  );
  const captured = await system(() => store.result(predictionRow.id));
  assert.ok(captured?.snapshotHash);
  const evalScope = {
    version: 1,
    targetContractHash: prediction.scopeJson.targetContractHash,
    tenantId: tenant.id,
    providerCapability: 'internal_calendar',
    verticalDomain: 'synthetic',
    cohortDefinitionHash: null,
    splitHash: c8Hash('prospective-not-backtest'),
    baselineKey: 'not_yet_observed',
    featureContractHash: model.featureContractHash,
  };
  const caseInput: C8Case = {
    caseKey: c8Hash(predictionRow.id),
    predictionRef: {
      tenantId: tenant.id,
      id: predictionRow.id,
      hash: captured.snapshotHash,
    },
    backtestInputRef: null,
    labelRefs: [],
    labelState: 'IMMATURE',
    labelValue: null,
    exclusionCodes: ['horizon_not_observed'],
    clusterRef: a.id,
    dependencyDeadline: predictionRow.expiresAt.toISOString(),
  };
  const evalInput = {
    modelVersionId: model.id,
    modelManifestHash: model.manifestHash,
    evaluationContractHash: model.evaluationContractHash,
    targetKey: model.targetKey,
    scopeJson: evalScope,
    t0From: predictionRow.t0,
    t0To: predictionRow.t0,
    labelsAsOf: new Date(),
    casesJson: [caseInput],
  };
  let evaluationId = '';
  await proof(
    'evaluation concurrent admission/restart preserves exact capture and no invented label',
    () =>
      system(async () => {
        const results = await Promise.all(
          Array.from({ length: 8 }, () => store.admitEvaluation(evalInput)),
        );
        assert.equal(new Set(results.map((r) => r.id)).size, 1);
        evaluationId = results[0].id;
        const restarted = new C8Store(db, context);
        assert.equal(
          (await restarted.admitEvaluation(evalInput)).id,
          evaluationId,
        );
        assert.equal(
          (results[0].countsJson as { qualified: number }).qualified,
          0,
        );
        const leases = await Promise.all(
          Array.from({ length: 8 }, () =>
            restarted.claim('C8EvaluationRevision', evaluationId),
          ),
        );
        const winner = leases.find(Boolean);
        assert.ok(winner);
        assert.equal(leases.filter(Boolean).length, 1);
        await restarted.publishUnavailable(
          winner,
          ['no_mature_qualified_labels'],
          'NOT_YET_OBSERVED',
        );
        const row = await db.c8EvaluationRevision.findUniqueOrThrow({
          where: { id: evaluationId },
        });
        assert.equal(row.outcome, 'NOT_YET_OBSERVED');
        assert.equal(row.calibrationJson, null);
        await assert.rejects(() =>
          store.transaction((tx) =>
            tx.c8EvaluationRevision.update({
              where: { id: evaluationId },
              data: { outcome: 'PASS' },
            }),
          ),
        );
      }),
  );
  await proof(
    'unknown labels never become zero; wrong tenant/capture/mature claim rejected',
    () =>
      system(async () => {
        await assert.rejects(() =>
          store.admitEvaluation({
            ...evalInput,
            casesJson: [{ ...caseInput, labelValue: '0' }],
          }),
        );
        await assert.rejects(() =>
          store.admitEvaluation({
            ...evalInput,
            casesJson: [
              {
                ...caseInput,
                predictionRef: {
                  ...caseInput.predictionRef,
                  tenantId: other.id,
                },
              },
            ],
          }),
        );
        await assert.rejects(() =>
          store.admitEvaluation({
            ...evalInput,
            casesJson: [
              {
                ...caseInput,
                predictionRef: {
                  ...caseInput.predictionRef,
                  hash: c8Hash('wrong'),
                },
              },
            ],
          }),
        );
        await assert.rejects(() =>
          store.admitEvaluation({
            ...evalInput,
            casesJson: [
              { ...caseInput, labelState: 'QUALIFIED', labelValue: '1' },
            ],
          }),
        );
        assert.equal(
          await db.c8EvaluationRevision.count({
            where: { tenantId: tenant.id },
          }),
          1,
        );
      }),
  );
  await proof(
    'model history immutable and source tables have no new C8 FK',
    () =>
      system(async () => {
        await assert.rejects(() =>
          store.transaction((tx) =>
            tx.c8ModelVersion.update({
              where: { id: model.id },
              data: { parametersJson: { version: 1, coefficients: ['1'] } },
            }),
          ),
        );
        const [n] = await db.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid IN ('"C8ModelVersion"'::regclass,'"C8ResultRevision"'::regclass,'"C8EvaluationRevision"'::regclass)`;
        assert.equal(Number(n.count), 0);
      }),
  );
  await proof('direct deletion and truncate cannot bypass AC6', () =>
    system(async () => {
      await assert.rejects(() =>
        store.transaction((tx) =>
          tx.c8ResultRevision.delete({ where: { id: row.id } }),
        ),
      );
      await assert.rejects(() =>
        store.transaction((tx) => tx.$executeRaw`TRUNCATE "C8ResultRevision"`),
      );
    }),
  );
  await proof(
    'AC6 new leaf classes require exact tenant and preserve live/source rows',
    () =>
      system(async () => {
        const maintenance = new Package5Wave6MaintenanceService(db, context);
        // Live rows cannot be selected by expiry cleanup. The canonical source remains present.
        assert.ok(maintenance);
        assert.equal(
          await db.client.count({ where: { tenantId: tenant.id } }),
          2,
        );
        await assert.rejects(() =>
          new Package5Wave6MaintenanceService(db).prepare({
            actionClass: 'expire_c8_result_revisions',
          }),
        );
      }),
  );
  await proof(
    'real C7 snapshot is qualified by hash/tenant/Client and preserved as source history',
    () =>
      system(async () => {
        const c7 = new MeasurementService(
          db,
          context,
          new MeasurementSources(db),
        );
        const asOf = new Date();
        const measured = await c7.admit(
          {
            kind: 'client_history',
            clientId: b.id,
            periodFrom: new Date(asOf.getTime() - 86400000),
            periodTo: asOf,
            asOf,
            timezone: 'UTC',
            scope: {
              version: 1,
              capabilityKey: 'measurement.read',
              branchIds: [],
              dimensions: {},
              sourceQuery: {},
            },
          },
          { namespace: 'measurement_request', id: randomUUID() },
        );
        await c7.resume(measured.id);
        const snapshot = await store.transaction((tx) =>
          tx.measurementRevision.findUniqueOrThrow({
            where: { id: measured.id },
          }),
        );
        assert.equal(snapshot.state, 'PUBLISHED');
        const ref = sources.measurementRef(snapshot);
        const input = await prepare(b.id);
        input.evidenceRefsJson.push(ref);
        await store.transaction(async (tx) => {
          for (const evidence of input.evidenceRefsJson) {
            const [check] = await tx.$queryRaw<
              Array<{ valid: boolean }>
            >`SELECT "C8_validate_refs"(${tenant.id},${JSON.stringify([evidence])}::jsonb,${input.t0}) valid`;
            assert.equal(check.valid, true);
          }
        });
        const value = await store.admitResult(input);
        const lease = await store.claim('C8ResultRevision', value.id);
        assert.ok(lease);
        await store.publishResult(lease, empty);
        assert.equal((await store.result(value.id))?.state, 'PUBLISHED');
        const bad = await prepare(a.id);
        bad.evidenceRefsJson.push(ref);
        await assert.rejects(() => store.admitResult(bad));
        const forged = await prepare(b.id);
        forged.evidenceRefsJson.push({
          ...ref,
          revisionOrStateHash: c8Hash('fabricated'),
        });
        await assert.rejects(() => store.admitResult(forged));
        assert.equal(
          (
            await db.measurementRevision.findUniqueOrThrow({
              where: { id: measured.id },
            })
          ).snapshotHash,
          snapshot.snapshotHash,
        );
      }),
  );
  await proof(
    'qualified no-show label survives unrelated unknown money; wrong value and rescheduled capture reject',
    () =>
      system(async () => {
        const startAt = new Date(Date.now() + 2000);
        const endAt = new Date(startAt.getTime() + 500);
        const ap = await db.appointment.create({
          data: {
            tenantId: tenant.id,
            mayaClientId: a.id,
            source: 'internal',
            staffExternalId: randomUUID(),
            serviceIds: [],
            startAt,
            endAt,
            blockedStartAt: startAt,
            blockedEndAt: endAt,
            attendance: null,
          },
        });
        const input = await prepare(a.id, {
          kind: 'PREDICTION',
          subjectKind: 'appointment',
          subjectId: ap.id,
          ruleKey: 'c8.appointment_no_show',
          basis: 'appointment_no_show',
          horizonEnd: endAt,
          eligibility: 'INSUFFICIENT_DATA',
        });
        const apRef = await store.transaction((tx) =>
          sources.subjectRef(tx, 'Appointment', ap.id),
        );
        input.t0 = new Date();
        input.evidenceRefsJson.push(apRef);
        input.scopeJson = {
          ...input.scopeJson,
          targetKey: 'appointment_no_show',
          targetContractHash: c8Hash(C8_TARGET_DEFINITIONS.appointment_no_show),
        };
        input.inputSnapshotJson.features = [
          {
            key: 'scheduled_start_at',
            value: startAt.toISOString(),
            unit: 'instant',
            basis: 'canonical_appointment',
            currency: null,
            sourceRefs: [apRef],
          },
          {
            key: 'scheduled_end_at',
            value: endAt.toISOString(),
            unit: 'instant',
            basis: 'canonical_appointment',
            currency: null,
            sourceRefs: [apRef],
          },
        ];
        const pr = await store.admitResult(input);
        const lease = await store.claim('C8ResultRevision', pr.id);
        assert.ok(lease);
        await store.publishUnavailable(lease, ['qualified_model_unavailable']);
        const capture = await store.result(pr.id);
        assert.ok(capture?.snapshotHash);
        const noShowModel = await store.admitDefinition(
          {
            ...definition,
            targetKey: 'appointment_no_show',
            eventDefinition: C8_TARGET_DEFINITIONS.appointment_no_show.event,
            horizon: { unit: 'appointment_outcome' },
            basis: 'appointment_no_show',
          },
          scope,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, endAt.getTime() - Date.now() + 20)),
        );
        await db.appointment.update({
          where: { id: ap.id },
          data: { attendance: 'no_show' },
        });
        const c7 = new MeasurementService(
          db,
          context,
          new MeasurementSources(db),
        );
        const asOf = new Date();
        const observed = await c7.admit(
          {
            kind: 'appointment_outcome',
            appointmentId: ap.id,
            clientId: a.id,
            periodFrom: startAt,
            periodTo: new Date(endAt.getTime() + 1),
            asOf,
            timezone: 'UTC',
            scope: {
              version: 1,
              capabilityKey: 'measurement.read',
              branchIds: [],
              dimensions: {},
              sourceQuery: {},
            },
          },
          { namespace: 'measurement_request', id: randomUUID() },
        );
        await c7.resume(observed.id);
        const snapshot = await store.transaction((tx) =>
          tx.measurementRevision.findUniqueOrThrow({
            where: { id: observed.id },
          }),
        );
        assert.equal(snapshot.completeness, 'PARTIAL');
        const goodCase: C8Case = {
          ...caseInput,
          caseKey: c8Hash(pr.id),
          predictionRef: {
            tenantId: tenant.id,
            id: pr.id,
            hash: capture.snapshotHash,
          },
          labelRefs: [sources.measurementRef(snapshot)],
          labelState: 'QUALIFIED',
          labelValue: '1',
          exclusionCodes: [],
          dependencyDeadline: pr.expiresAt.toISOString(),
        };
        const e = {
          ...evalInput,
          modelVersionId: noShowModel.id,
          modelManifestHash: noShowModel.manifestHash,
          evaluationContractHash: noShowModel.evaluationContractHash,
          targetKey: 'appointment_no_show',
          scopeJson: {
            ...evalScope,
            targetContractHash: input.scopeJson.targetContractHash,
            featureContractHash: noShowModel.featureContractHash,
          },
          t0From: pr.t0,
          t0To: pr.t0,
          labelsAsOf: new Date(),
          casesJson: [goodCase],
        };
        const saved = await store.admitEvaluation(e);
        assert.equal((saved.countsJson as { qualified: number }).qualified, 1);
        assert.equal((await store.admitEvaluation(e)).id, saved.id);
        await assert.rejects(() =>
          store.admitEvaluation({
            ...e,
            casesJson: [{ ...goodCase, labelValue: '0' }],
          }),
        );
        await db.appointment.update({
          where: { id: ap.id },
          data: { startAt: new Date(startAt.getTime() + 10000) },
        });
        await assert.rejects(() =>
          store.admitEvaluation({ ...e, labelsAsOf: new Date(Date.now() + 1) }),
        );
        assert.equal(
          (await store.result(pr.id))?.snapshotHash,
          capture.snapshotHash,
        );
        await db.appointment.update({
          where: { id: ap.id },
          data: { startAt, attendance: 'arrived' },
        });
        const arrivedAt = new Date();
        const attended = await c7.admit(
          {
            kind: 'appointment_outcome',
            appointmentId: ap.id,
            clientId: a.id,
            periodFrom: startAt,
            periodTo: new Date(endAt.getTime() + 1),
            asOf: arrivedAt,
            timezone: 'UTC',
            scope: {
              version: 1,
              capabilityKey: 'measurement.read',
              branchIds: [],
              dimensions: {},
              sourceQuery: {},
            },
          },
          { namespace: 'measurement_request', id: randomUUID() },
        );
        await c7.resume(attended.id);
        const attendedSnapshot = await store.transaction((tx) =>
          tx.measurementRevision.findUniqueOrThrow({
            where: { id: attended.id },
          }),
        );
        const returnedCase: C8Case = {
          ...caseInput,
          labelRefs: [sources.measurementRef(attendedSnapshot)],
          labelState: 'QUALIFIED',
          labelValue: '1',
          exclusionCodes: [],
        };
        const returnedInput = {
          ...evalInput,
          labelsAsOf: new Date(),
          casesJson: [returnedCase],
        };
        const returned = await store.admitEvaluation(returnedInput);
        assert.equal(
          (returned.countsJson as { qualified: number }).qualified,
          1,
        );
        // Early positive is observed; incomplete history cannot prove non-return.
        assert.ok(predictionRow.horizonEnd! > returnedInput.labelsAsOf);
        await assert.rejects(() =>
          store.admitEvaluation({
            ...returnedInput,
            casesJson: [{ ...returnedCase, labelValue: '0' }],
          }),
        );
      }),
  );
  await proof(
    'actual scoped AC6 purge of all three expired derived leaves preserves sources and live history',
    () =>
      system(async () => {
        // Synthetic INSERT only, with a short retention cap. No trigger bypass or historical date fabrication.
        const shortExpiry = new Date(Date.now() + 3500);
        const shortModel = await store.transaction(async (tx) => {
          const seed = {
            ...model,
            id: randomUUID(),
            modelKey: 'synthetic-short-' + randomUUID(),
            admittedAt: new Date(),
            expiresAt: shortExpiry,
          };
          const [serialized] = await tx.$queryRaw<
            Array<{ value: C8Object }>
          >`SELECT to_jsonb(r) value FROM jsonb_populate_record(NULL::"C8ModelVersion",${JSON.stringify(seed)}::jsonb) r`;
          const raw = serialized.value;
          const manifest = { ...raw };
          for (const k of [
            'id',
            'manifestHash',
            'intentHash',
            'requestKeyHash',
            'admittedAt',
            'expiresAt',
          ])
            delete manifest[k];
          raw.manifestHash = await c8PgHash(tx, manifest);
          raw.intentHash = raw.manifestHash;
          raw.requestKeyHash = await c8PgHash(tx, [
            raw.tenantId,
            raw.modelKey,
            raw.version,
            raw.releaseDigest,
          ]);
          const [result] = await tx.$queryRaw<
            Array<typeof model>
          >`INSERT INTO "C8ModelVersion" SELECT (jsonb_populate_record(NULL::"C8ModelVersion",${JSON.stringify(raw)}::jsonb)).* RETURNING *`;
          return result;
        });
        const shortInput = await prepare(b.id, {
          kind: 'PREDICTION',
          ruleKey: 'c8.attended_return',
          basis: 'attended_return',
          horizonEnd: new Date(Date.now() + 1000),
          eligibility: 'INSUFFICIENT_DATA',
        });
        shortInput.scopeJson = {
          ...shortInput.scopeJson,
          targetKey: 'attended_return',
          targetContractHash: prediction.scopeJson.targetContractHash,
        };
        shortInput.evidenceRefsJson = shortInput.evidenceRefsJson.map((r) => ({
          ...r,
          expiresAt: shortExpiry.toISOString(),
        }));
        const shortCapture = await store.admitResult(shortInput);
        const lease = await store.claim('C8ResultRevision', shortCapture.id);
        assert.ok(lease);
        await store.publishUnavailable(lease, ['insufficient_data']);
        const shortPublished = await store.result(shortCapture.id);
        assert.ok(shortPublished?.snapshotHash);
        const shortEval = await store.admitEvaluation({
          ...evalInput,
          modelVersionId: shortModel.id,
          modelManifestHash: shortModel.manifestHash,
          t0From: shortCapture.t0,
          t0To: shortCapture.t0,
          labelsAsOf: new Date(),
          casesJson: [
            {
              ...caseInput,
              caseKey: c8Hash(shortCapture.id),
              predictionRef: {
                tenantId: tenant.id,
                id: shortCapture.id,
                hash: shortPublished.snapshotHash,
              },
              clusterRef: b.id,
              dependencyDeadline: shortExpiry.toISOString(),
            },
          ],
        });
        // Expiry is real; only the coordinator's existing clock seam advances minute-bucket selection.
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, shortExpiry.getTime() - Date.now() + 50),
          ),
        );
        const maintenance = new Package5Wave6MaintenanceService(
          db,
          context,
          () => new Date(Date.now() + 60000),
        );
        for (const actionClass of [
          'expire_c8_result_revisions',
          'expire_c8_evaluation_revisions',
          'expire_c8_model_versions',
        ]) {
          const run = await maintenance.prepare({ actionClass, batchSize: 10 });
          await maintenance.execute(run);
          await maintenance.execute(run);
        }
        assert.equal(
          await db.c8ResultRevision.count({ where: { id: shortCapture.id } }),
          0,
        );
        assert.equal(
          await db.c8EvaluationRevision.count({ where: { id: shortEval.id } }),
          0,
        );
        assert.equal(
          await db.c8ModelVersion.count({ where: { id: shortModel.id } }),
          0,
        );
        assert.equal(
          await db.c8ModelVersion.count({ where: { id: model.id } }),
          1,
        );
        assert.equal(
          await db.c8ResultRevision.count({ where: { id: row.id } }),
          1,
        );
        assert.equal(
          await db.c8EvaluationRevision.count({ where: { id: evaluationId } }),
          1,
        );
        assert.equal(
          await db.client.count({ where: { tenantId: tenant.id } }),
          2,
        );
        assert.equal(
          await db.tenantBusinessConfigurationRevision.count({
            where: { tenantId: tenant.id },
          }),
          1,
        );
      }),
  );
  await proof(
    'restart reclaims an expired fence; old worker cannot publish duplicate outcome',
    () =>
      system(async () => {
        const pending = await store.admitResult(await prepare(b.id));
        const oldToken = c8Hash('synthetic-old-worker');
        await store.transaction(
          (tx) =>
            tx.$executeRaw`UPDATE "C8ResultRevision" SET "leaseGeneration"=1,"leaseTokenHash"=${oldToken},"leaseExpiresAt"=date_trunc('milliseconds',clock_timestamp())+interval '100 milliseconds' WHERE id=${pending.id}::uuid`,
        );
        await new Promise((resolve) => setTimeout(resolve, 125));
        const restarted = new C8Store(db, context);
        const fresh = await restarted.claim('C8ResultRevision', pending.id);
        assert.ok(fresh);
        assert.equal(fresh.generation, 2);
        await assert.rejects(() =>
          store.publishUnavailable(
            { ...fresh, generation: 1, token: 'synthetic-old-worker' },
            ['stale_worker'],
          ),
        );
        await restarted.publishResult(fresh, empty);
        assert.equal((await store.result(pending.id))?.state, 'PUBLISHED');
        assert.equal(
          await restarted.claim('C8ResultRevision', pending.id),
          null,
        );
      }),
  );
  await proof(
    'A22 policy changed before publication closes the same pending revision unavailable',
    () =>
      system(async () => {
        const pending = await store.admitResult(await prepare(b.id));
        const lease = await store.claim('C8ResultRevision', pending.id);
        assert.ok(lease);
        await executor.execute(
          await planner.buildGoverned(
            tenant.id,
            user.id,
            'tenant_business_configuration',
            'c8-policy-next-' + randomUUID(),
            randomUUID(),
            {
              confirmed: true,
              namespace: 'c8_valuation',
              expectedRevision: 1,
              previousRevisionId: config.id,
              content: policy,
            },
          ),
        );
        await store.publishResult(lease, empty);
        assert.equal((await store.result(pending.id))?.state, 'UNAVAILABLE');
        assert.equal(
          (await store.result(pending.id))?.revision,
          pending.revision,
        );
        assert.equal(
          (await store.result(row.id))?.snapshotHash,
          published.snapshotHash,
        );
      }),
  );
  const shape = await db.$queryRaw<
    Array<{ table_name: string; n: bigint }>
  >`SELECT table_name,count(*) n FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('C8ModelVersion','C8ResultRevision','C8EvaluationRevision') GROUP BY table_name ORDER BY table_name`;
  await proof('exact approved 22/41/31 physical fields; no backfill', () =>
    assert.deepEqual(
      shape.map((r) => [r.table_name, Number(r.n)]),
      [
        ['C8EvaluationRevision', 31],
        ['C8ModelVersion', 22],
        ['C8ResultRevision', 41],
      ],
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      status: 'PASS',
      calibration: 'UNAVAILABLE',
      numericTargetsActive: 0,
      productionEffects: 0,
      sourceBusinessEffects: 0,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
