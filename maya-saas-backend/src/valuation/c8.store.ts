import { Injectable } from '@nestjs/common';
import { c8PopulationCurrent } from './c8.population';
import { randomUUID } from 'node:crypto';
import {
  C8ResultRevision,
  C8ModelVersion,
  C8EvaluationRevision,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { isPostgresSerializationConflict } from '../common/postgres-transaction-conflict';
import {
  C8Kind,
  C8Object,
  C8Ref,
  C8_LEASE_MS,
  C8_RETENTION_MS,
  c8Features,
  c8Id,
  c8Digest,
  c8Normalize,
  c8Hash,
  c8Object,
  C8_TARGETS,
} from './c8.contract';
import {
  C8_SEMANTIC_EVALUATION_HASH,
  C8_TARGET_DEFINITIONS,
} from './c8.targets';

import { c8SafeValue } from './c8.eligibility';
import { c8Cases, c8CaseCounts, C8Case } from './c8.evaluation.contract';
type Tx = Prisma.TransactionClient;
type Table = 'C8ModelVersion' | 'C8ResultRevision' | 'C8EvaluationRevision';
export type C8Lease = {
  table: 'C8ResultRevision' | 'C8EvaluationRevision';
  id: string;
  tenantId: string;
  generation: number;
  token: string;
};
export type C8PreparedResult = {
  kind: C8Kind;
  subjectKind:
    'client' | 'appointment' | 'staff' | 'branch' | 'tenant' | 'cohort';
  subjectId: string;
  ruleKey: string;
  ruleVersion: number;
  t0: Date;
  horizonEnd: Date | null;
  periodFrom: Date;
  periodTo: Date;
  timezone: string;
  policyRevisionId: string;
  policyContentHash: string;
  scopeJson: C8Object;
  basis: string;
  currency: string | null;
  inputSnapshotJson: C8Object;
  evidenceRefsJson: C8Ref[];
  completeness: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_MEASURED';
  qualification: 'VERIFIED' | 'SOURCE_LABELLED' | 'UNQUALIFIED';
  eligibility: 'ELIGIBLE' | 'INSUFFICIENT_DATA' | 'UNSUPPORTED' | 'INELIGIBLE';
  modelVersionId?: string | null;
  modelManifestHash?: string | null;
};
const resultMutable = [
  'state',
  'leaseGeneration',
  'leaseTokenHash',
  'leaseExpiresAt',
  'publishedAt',
  'snapshotHash',
  'valuesJson',
  'uncertaintyJson',
  'reasonsJson',
  'rankingJson',
];
const evalMutable = [
  'state',
  'leaseGeneration',
  'leaseTokenHash',
  'leaseExpiresAt',
  'publishedAt',
  'snapshotHash',
  'metricsJson',
  'calibrationJson',
  'driftJson',
  'outcome',
  'reasonsJson',
];
const ZERO = '0'.repeat(64);
/** Safe only around a rolled-back, database-only C8 transaction. */
function c8UniqueConflict(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const e = error as Record<string, unknown>;
  return (
    ['P2002', '23505'].includes(String(e.code ?? e.originalCode)) ||
    [e.cause, e.meta, e.driverAdapterError].some((child) =>
      c8UniqueConflict(child, depth + 1),
    )
  );
}
const tableSql = (table: Table) => {
  if (
    !['C8ModelVersion', 'C8ResultRevision', 'C8EvaluationRevision'].includes(
      table,
    )
  )
    throw new Error('c8_table');
  return Prisma.raw(`"${table}"`);
};
const encode = (value: unknown) => JSON.stringify(value);
export async function c8PgHash(tx: Tx, value: unknown): Promise<string> {
  const [r] = await tx.$queryRaw<
    { hash: string }[]
  >`SELECT encode(sha256(convert_to(${encode(value)}::jsonb::text,'UTF8')),'hex') hash`;
  return r.hash;
}
/** Sole C8 derived store. No HTTP, AI, source owner, provider or delivery executor. */
@Injectable()
export class C8Store {
  constructor(
    private readonly db: PrismaService,
    private readonly context: TenantContextService,
  ) {}
  tenant(): string {
    const c = this.context.get();
    if (!c?.tenantId || c.source !== 'system' || c.userId)
      throw new Error('c8_exact_system_tenant_required');
    return c.tenantId;
  }
  async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    this.tenant();
    for (let attempt = 0; ; attempt++)
      try {
        return await canonicalUtcTransaction(this.db, work);
      } catch (e) {
        if (
          attempt >= 7 ||
          !(isPostgresSerializationConflict(e) || c8UniqueConflict(e))
        )
          throw e;
      }
  }
  private async now(tx: Tx): Promise<Date> {
    const [r] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT date_trunc('milliseconds',clock_timestamp()) AS now`;
    return r.now;
  }
  private async record(
    tx: Tx,
    table: Table,
    value: unknown,
  ): Promise<C8Object> {
    const [r] = await tx.$queryRaw<{ value: C8Object }[]>(
      Prisma.sql`SELECT to_jsonb(r) value FROM jsonb_populate_record(NULL::${tableSql(table)},${encode(value)}::jsonb) r`,
    );
    return r.value;
  }
  private async insert<T>(tx: Tx, table: Table, value: unknown): Promise<T> {
    const rows = await tx.$queryRaw<T[]>(
      Prisma.sql`INSERT INTO ${tableSql(table)} SELECT (jsonb_populate_record(NULL::${tableSql(table)},${encode(value)}::jsonb)).* RETURNING *`,
    );
    return rows[0];
  }
  /** Registry records a real released *unfitted definition*, never fake fitted coefficients. */
  async admitDefinition(
    targetJson: C8Object,
    scopeJson: C8Object,
  ): Promise<C8ModelVersion> {
    const tenantId = this.tenant();
    c8Object(targetJson, [
      'version',
      'targetKey',
      'eventDefinition',
      'horizon',
      'basis',
      'currency',
      'unit',
      'labelMaturity',
      'requiredCoverage',
      'conditioning',
    ]);
    c8Object(scopeJson, [
      'version',
      'tenantId',
      'branchIds',
      'serviceScope',
      'providerCapability',
      'verticalDomain',
      'cohortDefinitionHash',
    ]);
    const targetKey =
      targetJson.targetKey as keyof typeof C8_TARGET_DEFINITIONS;
    if (
      !C8_TARGETS.includes(targetKey) ||
      scopeJson.tenantId !== tenantId ||
      targetJson.eventDefinition !== C8_TARGET_DEFINITIONS[targetKey].event
    )
      throw new Error('c8_definition_scope');
    return this.transaction(async (tx) => {
      const now = await this.now(tx);
      const modelKey = `${targetKey}/${c8Hash([targetJson, scopeJson])}`;
      const prior = await tx.c8ModelVersion.findUnique({
        where: {
          tenantId_modelKey_version: { tenantId, modelKey, version: 1 },
        },
      });
      if (prior) return prior;
      const parametersJson = {
        version: 1,
        coefficientNames: [],
        coefficients: [],
      };
      const definitionHash = c8Hash(C8_TARGET_DEFINITIONS);
      let record = await this.record(tx, 'C8ModelVersion', {
        id: randomUUID(),
        tenantId,
        modelKey,
        version: 1,
        contractVersion: 1,
        manifestHash: ZERO,
        intentHash: ZERO,
        requestKeyHash: ZERO,
        artifactHash: await c8PgHash(tx, parametersJson),
        featureContractHash: c8Hash(['c8.features/1', targetKey]),
        evaluationContractHash: C8_SEMANTIC_EVALUATION_HASH,
        targetKey,
        targetJson,
        scopeJson,
        methodJson: {
          version: 1,
          methodKey: 'unfitted_target',
          implementationDigest: definitionHash,
          hyperparameters: {},
          transforms: [],
          seed: null,
          numberFormat: 'canonical_decimal_string',
          intervalMethod: null,
        },
        parametersJson,
        trainingEvidenceJson: {
          version: 1,
          datasetHash: c8Hash([]),
          splitHash: c8Hash([]),
          sourceContractHashes: [],
          qualifiedCounts: { cases: 0 },
          excludedCounts: { cases: 0 },
          originFrom: now.toISOString(),
          originTo: now.toISOString(),
          labelsAsOf: now.toISOString(),
          knowledgeEvidenceHash: c8Hash([
            'unfitted_definition',
            targetJson,
            scopeJson,
          ]),
        },
        informationCutoffAt: now,
        trainingMode: 'PROSPECTIVE',
        releaseDigest: definitionHash,
        admittedAt: now,
        expiresAt: new Date(now.getTime() + C8_RETENTION_MS),
      });
      const immutable = { ...record };
      for (const k of [
        'id',
        'manifestHash',
        'intentHash',
        'requestKeyHash',
        'admittedAt',
        'expiresAt',
      ])
        delete immutable[k];
      const manifestHash = await c8PgHash(tx, immutable);
      record = {
        ...record,
        manifestHash,
        intentHash: manifestHash,
        requestKeyHash: await c8PgHash(tx, [
          tenantId,
          modelKey,
          1,
          definitionHash,
        ]),
      };
      return this.insert<C8ModelVersion>(tx, 'C8ModelVersion', record);
    });
  }
  async admitResult(
    prepared: C8PreparedResult,
    reuseOpenTarget = false,
  ): Promise<C8ResultRevision> {
    const tenantId = this.tenant();
    c8Id(prepared.subjectId);
    c8Id(prepared.ruleKey);
    c8Id(prepared.policyRevisionId);
    c8Digest(prepared.policyContentHash);
    new Intl.DateTimeFormat('en', { timeZone: prepared.timezone });
    const input = c8Object(prepared.inputSnapshotJson, [
      'version',
      'features',
      'missingness',
      'coverage',
      'dependencies',
    ]);
    const features = c8Features(input.features, tenantId, prepared.t0);
    const evidence = c8Normalize(
      prepared.evidenceRefsJson,
    ) as unknown as C8Ref[];
    for (const feature of features)
      for (const ref of feature.sourceRefs)
        if (!evidence.some((r) => c8Hash(r) === c8Hash(ref)))
          throw new Error('c8_feature_evidence_not_in_manifest');
    return this.transaction(async (tx) => {
      const now = await this.now(tx);
      if (reuseOpenTarget) {
        if (prepared.kind !== 'PREDICTION')
          throw new Error('c8_open_target_kind');
        const captureKey = c8Hash([
          tenantId,
          prepared.subjectKind,
          prepared.subjectId,
          prepared.ruleKey,
          prepared.policyRevisionId,
          prepared.scopeJson,
        ]);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`c8/open-target/${captureKey}`},0))::text`;
        const existing = await tx.c8ResultRevision.findFirst({
          where: {
            tenantId,
            subjectKind: prepared.subjectKind,
            subjectId: prepared.subjectId,
            ruleKey: prepared.ruleKey,
            policyRevisionId: prepared.policyRevisionId,
            scopeJson: { equals: prepared.scopeJson },
            horizonEnd: { gt: now },
            expiresAt: { gt: now },
          },
          orderBy: { admittedAt: 'desc' },
        });
        if (existing) return existing;
      }
      const expiry = Math.min(
        now.getTime() + C8_RETENTION_MS,
        ...evidence
          .filter((r) => r.expiresAt)
          .map((r) => Date.parse(r.expiresAt!)),
      );
      let record = await this.record(tx, 'C8ResultRevision', {
        ...prepared,
        inputSnapshotJson: { ...input, features },
        evidenceRefsJson: evidence,
        id: randomUUID(),
        tenantId,
        identityHash: ZERO,
        revision: 1,
        intentHash: ZERO,
        contractVersion: 1,
        inputHash: await c8PgHash(tx, [{ ...input, features }, evidence]),
        modelVersionId: prepared.modelVersionId ?? null,
        modelManifestHash: prepared.modelManifestHash ?? null,
        admittedAt: now,
        expiresAt: new Date(expiry),
        state: 'PENDING',
        leaseGeneration: 0,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        publishedAt: null,
        snapshotHash: null,
        valuesJson: null,
        uncertaintyJson: null,
        reasonsJson: null,
        rankingJson: null,
      });
      const [identity] = await tx.$queryRaw<{ hash: string }[]>(
        Prisma.sql`SELECT encode(sha256(convert_to(jsonb_build_array(r."tenantId",r.kind,r."subjectKind",r."subjectId",r."ruleKey",r.basis,r.currency,r."periodFrom",r."periodTo",r.t0,r."horizonEnd",r."scopeJson")::text,'UTF8')),'hex') hash FROM jsonb_populate_record(NULL::"C8ResultRevision",${encode(record)}::jsonb) r`,
      );
      const immutable = { ...record };
      for (const k of [
        ...resultMutable,
        'id',
        'revision',
        'identityHash',
        'intentHash',
        'admittedAt',
        'expiresAt',
      ])
        delete immutable[k];
      const intentHash = await c8PgHash(tx, immutable);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`c8/result/${tenantId}/${identity.hash}`},0))::text`;
      const prior = await tx.c8ResultRevision.findUnique({
        where: { tenantId_intentHash: { tenantId, intentHash } },
      });
      if (prior) return prior;
      // Caller-facing capture producers must obtain this T0 from a just-published canonical snapshot.
      if (prepared.t0 > now || now.getTime() - prepared.t0.getTime() > 60_000)
        throw new Error('c8_prospective_capture_requires_current_t0');
      const head = await tx.c8ResultRevision.aggregate({
        where: { tenantId, identityHash: identity.hash },
        _max: { revision: true },
      });
      record = {
        ...record,
        identityHash: identity.hash,
        intentHash,
        revision: (head._max.revision ?? 0) + 1,
      };
      if (
        !(await c8PopulationCurrent(tx, {
          tenantId,
          inputSnapshotJson: prepared.inputSnapshotJson,
        }))
      )
        throw new Error('c8_source_population_changed');
      return this.insert<C8ResultRevision>(tx, 'C8ResultRevision', record);
    });
  }
  /** P01 shared evaluation durability. P05 alone selects later canonical labels. */
  async admitEvaluation(prepared: {
    modelVersionId: string;
    modelManifestHash: string;
    evaluationContractHash: string;
    targetKey: string;
    scopeJson: C8Object;
    t0From: Date;
    t0To: Date;
    labelsAsOf: Date;
    casesJson: C8Case[];
  }): Promise<C8EvaluationRevision> {
    const tenantId = this.tenant();
    c8Id(prepared.modelVersionId);
    c8Digest(prepared.modelManifestHash);
    c8Digest(prepared.evaluationContractHash);
    const cases = c8Cases(prepared.casesJson, tenantId, prepared.labelsAsOf);
    c8Object(prepared.scopeJson, [
      'version',
      'targetContractHash',
      'tenantId',
      'providerCapability',
      'verticalDomain',
      'cohortDefinitionHash',
      'splitHash',
      'baselineKey',
      'featureContractHash',
    ]);
    if (prepared.scopeJson.tenantId !== tenantId)
      throw new Error('c8_evaluation_tenant');
    const counts = c8CaseCounts(cases);
    return this.transaction(async (tx) => {
      const now = await this.now(tx);
      const model = await tx.c8ModelVersion.findFirstOrThrow({
        where: { id: prepared.modelVersionId, tenantId },
      });
      const expiry = Math.min(
        now.getTime() + C8_RETENTION_MS,
        model.expiresAt.getTime(),
        ...cases.map((c) => Date.parse(c.dependencyDeadline)),
        ...cases.flatMap((c) =>
          c.labelRefs
            .filter((r) => r.expiresAt)
            .map((r) => Date.parse(r.expiresAt!)),
        ),
      );
      let record = await this.record(tx, 'C8EvaluationRevision', {
        ...prepared,
        casesJson: cases,
        countsJson: counts,
        mode: 'PROSPECTIVE',
        tenantId,
        id: randomUUID(),
        identityHash: ZERO,
        revision: 1,
        intentHash: ZERO,
        contractVersion: 1,
        evidenceHash: await c8PgHash(tx, [cases, counts]),
        admittedAt: now,
        expiresAt: new Date(expiry),
        state: 'PENDING',
        leaseGeneration: 0,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        publishedAt: null,
        snapshotHash: null,
        metricsJson: null,
        calibrationJson: null,
        driftJson: null,
        outcome: null,
        reasonsJson: null,
      });
      const [identity] = await tx.$queryRaw<{ hash: string }[]>(
        Prisma.sql`SELECT encode(sha256(convert_to(jsonb_build_array(r."tenantId",r."modelVersionId",r.mode,r."targetKey",r."scopeJson",r."t0From",r."t0To")::text,'UTF8')),'hex') hash FROM jsonb_populate_record(NULL::"C8EvaluationRevision",${encode(record)}::jsonb) r`,
      );
      const immutable = { ...record };
      for (const k of [
        ...evalMutable,
        'id',
        'revision',
        'identityHash',
        'intentHash',
        'admittedAt',
        'expiresAt',
      ])
        delete immutable[k];
      const intentHash = await c8PgHash(tx, immutable);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`c8/eval/${tenantId}/${identity.hash}`},0))::text`;
      const prior = await tx.c8EvaluationRevision.findUnique({
        where: { tenantId_intentHash: { tenantId, intentHash } },
      });
      if (prior) return prior;
      // c8_evaluation_same_evidence: a poll-clock change is not a new evaluation transition.
      const sameEvidence = await tx.c8EvaluationRevision.findFirst({
        where: {
          tenantId,
          identityHash: identity.hash,
          evidenceHash: c8Digest(record.evidenceHash),
          modelManifestHash: prepared.modelManifestHash,
          evaluationContractHash: prepared.evaluationContractHash,
        },
        orderBy: { revision: 'desc' },
      });
      if (sameEvidence) {
        // A new current observation must requalify its labels even when deduplicated.
        // Exact historical retries above still return their immutable original receipt.
        if (prepared.labelsAsOf > now || expiry <= now.getTime())
          throw new Error('c8_evaluation_current_time_required');
        for (const c of cases) {
          const [valid] = await tx.$queryRaw<{ valid: boolean }[]>(Prisma.sql`
            SELECT "C8_validate_refs"(${tenantId},${encode(c.labelRefs)}::jsonb,${prepared.labelsAsOf}::timestamptz) valid`);
          if (!valid.valid) throw new Error('c8_current_label_unavailable');
          if (
            c.labelState === 'QUALIFIED' &&
            ['attended_return', 'appointment_no_show'].includes(
              prepared.targetKey,
            )
          ) {
            const prediction = await tx.c8ResultRevision.findFirstOrThrow({
              where: { tenantId, id: c.predictionRef.id },
            });
            for (const ref of c.labelRefs) {
              const label = await tx.measurementRevision.findFirstOrThrow({
                where: { tenantId, id: ref.id },
              });
              if (
                prepared.targetKey === 'attended_return' &&
                c.labelValue === '0'
              )
                continue;
              const ap = label.appointmentId
                ? await tx.appointment.findFirst({
                    where: { tenantId, id: label.appointmentId },
                  })
                : null;
              if (
                !ap ||
                ap.mayaClientId !== label.clientId ||
                ap.status !== 'confirmed' ||
                ap.endAt > prepared.labelsAsOf
              )
                throw new Error('c8_current_binary_label_unavailable');
              if (prepared.targetKey === 'attended_return') {
                if (
                  c.labelValue !== '1' ||
                  ap.attendance !== 'arrived' ||
                  ap.startAt <= prediction.t0 ||
                  ap.startAt > prediction.horizonEnd!
                )
                  throw new Error('c8_current_return_label_unavailable');
              } else {
                const features = (
                  prediction.inputSnapshotJson as unknown as {
                    features: Array<{ key: string; value: unknown }>;
                  }
                ).features;
                if (
                  ap.startAt.toISOString() !==
                    features.find((f) => f.key === 'scheduled_start_at')
                      ?.value ||
                  ap.endAt.toISOString() !==
                    features.find((f) => f.key === 'scheduled_end_at')?.value ||
                  !['arrived', 'no_show'].includes(ap.attendance ?? '') ||
                  c.labelValue !== (ap.attendance === 'no_show' ? '1' : '0')
                )
                  throw new Error('c8_current_no_show_label_unavailable');
              }
            }
          }
        }
        return sameEvidence;
      }
      const head = await tx.c8EvaluationRevision.aggregate({
        where: { tenantId, identityHash: identity.hash },
        _max: { revision: true },
      });
      record = {
        ...record,
        identityHash: identity.hash,
        intentHash,
        revision: (head._max.revision ?? 0) + 1,
      };
      return this.insert<C8EvaluationRevision>(
        tx,
        'C8EvaluationRevision',
        record,
      );
    });
  }
  async claim(table: C8Lease['table'], id: string): Promise<C8Lease | null> {
    const tenantId = this.tenant();
    c8Id(id);
    return this.transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          state: string;
          leaseGeneration: number;
          leaseExpiresAt: Date | null;
          expiresAt: Date;
        }>
      >(
        Prisma.sql`SELECT * FROM ${tableSql(table)} WHERE id=${id}::uuid AND "tenantId"=${tenantId} FOR UPDATE`,
      );
      const row = rows[0];
      if (!row) throw new Error('c8_revision_not_found');
      const now = await this.now(tx);
      if (
        row.state !== 'PENDING' ||
        (row.leaseExpiresAt && row.leaseExpiresAt > now) ||
        row.expiresAt <= now
      )
        return null;
      const token = randomUUID();
      const generation = row.leaseGeneration + 1;
      const until = new Date(
        Math.min(now.getTime() + C8_LEASE_MS, row.expiresAt.getTime()),
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE ${tableSql(table)} SET "leaseGeneration"=${generation},"leaseTokenHash"=${c8Hash(token)},"leaseExpiresAt"=${until} WHERE id=${id}::uuid AND "tenantId"=${tenantId}`,
      );
      return { table, id, tenantId, generation, token };
    });
  }
  async publishUnavailable(
    lease: C8Lease,
    reasons: string[],
    outcome: 'INSUFFICIENT_DATA' | 'NOT_YET_OBSERVED' = 'INSUFFICIENT_DATA',
  ): Promise<void> {
    const tenantId = this.tenant();
    if (lease.tenantId !== tenantId)
      throw new Error('c8_lease_tenant_mismatch');
    const reasonRows = reasons.map((code) => {
      if (!/^[a-z][a-z0-9_]{0,100}$/.test(code))
        throw new Error('c8_reason_code');
      return { code, featureRefs: [], evidenceRefs: [], parameters: {} };
    });
    await this.transaction(async (tx) => {
      const tokenHash = c8Hash(lease.token);
      await tx.$queryRaw`SELECT set_config('maya.c8_fence',${tokenHash},true)`;
      const now = await this.now(tx);
      let updated: number;
      if (lease.table === 'C8ResultRevision') {
        const uncertainty = {
          version: 1,
          state: 'UNAVAILABLE',
          methodKey: null,
          level: null,
          lower: null,
          upper: null,
          errorSummary: null,
          evaluationRef: null,
          limitations: reasons,
        };
        const snapshotHash = await c8PgHash(tx, [
          'UNAVAILABLE',
          null,
          uncertainty,
          reasonRows,
          null,
        ]);
        updated =
          await tx.$executeRaw`UPDATE "C8ResultRevision" SET state='UNAVAILABLE',"publishedAt"=${now},"snapshotHash"=${snapshotHash},"uncertaintyJson"=${encode(uncertainty)}::jsonb,"reasonsJson"=${encode(reasonRows)}::jsonb,"leaseTokenHash"=NULL,"leaseExpiresAt"=NULL WHERE id=${lease.id}::uuid AND "tenantId"=${tenantId} AND state='PENDING' AND "leaseGeneration"=${lease.generation} AND "leaseTokenHash"=${tokenHash}`;
      } else {
        const snapshotHash = await c8PgHash(tx, [
          'UNAVAILABLE',
          outcome,
          null,
          null,
          null,
          reasonRows,
        ]);
        updated =
          await tx.$executeRaw`UPDATE "C8EvaluationRevision" SET state='UNAVAILABLE',outcome=${outcome},"publishedAt"=${now},"snapshotHash"=${snapshotHash},"reasonsJson"=${encode(reasonRows)}::jsonb,"leaseTokenHash"=NULL,"leaseExpiresAt"=NULL WHERE id=${lease.id}::uuid AND "tenantId"=${tenantId} AND state='PENDING' AND "leaseGeneration"=${lease.generation} AND "leaseTokenHash"=${tokenHash}`;
      }
      if (updated !== 1) throw new Error('c8_publication_fenced');
    });
  }
  /** Trusted deterministic producer only. Sources/policy are checked again by SQL at publication. */
  async publishResult(
    lease: C8Lease,
    compute: (
      row: C8ResultRevision,
      tx: Tx,
    ) => Promise<{
      valuesJson: C8Object;
      reasonsJson: C8Object[];
      rankingJson: C8Object | null;
    }>,
  ): Promise<void> {
    const tenantId = this.tenant();
    if (lease.table !== 'C8ResultRevision' || lease.tenantId !== tenantId)
      throw new Error('c8_result_lease_required');
    const valid = await this.transaction(async (tx) => {
      const row = await tx.c8ResultRevision.findFirstOrThrow({
        where: { id: lease.id, tenantId },
      });
      if (row.state !== 'PENDING') return true;
      if (row.kind === 'PREDICTION' || !(await this.refsCurrent(row, tx)))
        return false;
      const output = await compute(row, tx);
      c8Object(output, ['valuesJson', 'reasonsJson', 'rankingJson']);
      c8Object(output.valuesJson, ['version', 'values', 'limitations']);
      if (!Array.isArray(output.valuesJson.values))
        throw new Error('c8_values_array');
      output.valuesJson.values.forEach(c8SafeValue);
      const now = await this.now(tx);
      const tokenHash = c8Hash(lease.token);
      const uncertainty = {
        version: 1,
        state: 'NOT_APPLICABLE',
        methodKey: null,
        level: null,
        lower: null,
        upper: null,
        errorSummary: null,
        evaluationRef: null,
        limitations: [],
      };
      const snapshotHash = await c8PgHash(tx, [
        'PUBLISHED',
        output.valuesJson,
        uncertainty,
        output.reasonsJson,
        output.rankingJson,
      ]);
      await tx.$queryRaw`SELECT set_config('maya.c8_fence',${tokenHash},true)`;
      const n =
        await tx.$executeRaw`UPDATE "C8ResultRevision" SET state='PUBLISHED',"publishedAt"=${now},"snapshotHash"=${snapshotHash},"valuesJson"=${encode(c8Normalize(output.valuesJson))}::jsonb,"uncertaintyJson"=${encode(uncertainty)}::jsonb,"reasonsJson"=${encode(c8Normalize(output.reasonsJson))}::jsonb,"rankingJson"=${output.rankingJson === null ? null : encode(c8Normalize(output.rankingJson))}::jsonb,"leaseTokenHash"=NULL,"leaseExpiresAt"=NULL WHERE id=${lease.id}::uuid AND "tenantId"=${tenantId} AND state='PENDING' AND "leaseGeneration"=${lease.generation} AND "leaseTokenHash"=${tokenHash}`;
      if (n !== 1) throw new Error('c8_publication_fenced');
      return true;
    });
    if (!valid)
      await this.publishUnavailable(lease, ['source_or_model_unavailable']);
  }
  async result(id: string): Promise<C8ResultRevision | null> {
    const tenantId = this.tenant();
    return this.transaction((tx) =>
      tx.c8ResultRevision.findFirst({ where: { id, tenantId } }),
    );
  }
  async current(identityHash: string): Promise<C8ResultRevision | null> {
    const tenantId = this.tenant();
    return this.transaction((tx) =>
      tx.c8ResultRevision.findFirst({
        where: { tenantId, identityHash },
        orderBy: { revision: 'desc' },
      }),
    );
  }
  async refsCurrent(
    row: C8ResultRevision,
    tx: Tx,
    depth = 0,
  ): Promise<boolean> {
    if (depth > 4) return false;
    if (row.tenantId !== this.tenant() || row.expiresAt <= new Date())
      return false;
    const active = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "Tenant" WHERE id=${row.tenantId} AND status='active' FOR SHARE`;
    if (!active.length) return false;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${row.tenantId}:p5-wave1:setting:tenant-config:c8_valuation`},0))::text`;
    const [policy] = await tx.$queryRaw<
      Array<{
        id: string;
        contentHash: string;
        encryptedContent: string | null;
      }>
    >`SELECT id,"contentHash","encryptedContent" FROM "TenantBusinessConfigurationRevision" WHERE "tenantId"=${row.tenantId} AND namespace='c8_valuation' ORDER BY revision DESC LIMIT 1 FOR SHARE`;
    if (
      !policy ||
      policy.id !== row.policyRevisionId ||
      policy.contentHash !== row.policyContentHash ||
      !policy.encryptedContent
    )
      return false;
    const [r] = await tx.$queryRaw<
      { valid: boolean }[]
    >`SELECT "C8_validate_refs"(${row.tenantId},${encode(row.evidenceRefsJson)}::jsonb,${row.t0}) valid`;
    if (!r.valid || !(await c8PopulationCurrent(tx, row))) return false;
    for (const ref of row.evidenceRefsJson as unknown as C8Ref[]) {
      if (ref.owner !== 'C8ResultRevision') continue;
      const dependency = await tx.c8ResultRevision.findFirst({
        where: { id: ref.id, tenantId: row.tenantId },
      });
      if (!dependency || !(await this.refsCurrent(dependency, tx, depth + 1)))
        return false;
    }
    return true;
  }
}
