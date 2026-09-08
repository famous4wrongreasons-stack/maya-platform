import { Injectable } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { MeasurementRevision, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { MeasurementSources } from './measurement.sources';
import {
  MeasurementIntent,
  NormalizedMeasurementIntent,
  normalizeMeasurement,
  measurementIdentitySql,
  measurementIntentHash,
  measurementHash,
  measurementId,
  MEASUREMENT_LEASE_MS,
  MEASUREMENT_RETENTION_MS,
  normalizeMeasurementResult,
  MeasurementResult,
} from './measurement.contract';

export type MeasurementLease = {
  id: string;
  tenantId: string;
  generation: number;
  token: string;
};
export type MeasurementOccurrence = {
  namespace: 'source_event' | 'owner_report' | 'measurement_request';
  id: string;
};
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Sole C7 derived-state writer. Public consumers may read projections, not supply results. */
@Injectable()
export class MeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly sources: MeasurementSources,
  ) {}

  private authority(): string {
    const ctx = this.context.get();
    if (!ctx?.tenantId || ctx.source !== 'system' || ctx.userId)
      throw new Error('measurement_system_producer_required');
    return ctx.tenantId;
  }
  private readDb<T>(
    read: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return read(tx);
    });
  }
  private async time(tx: Prisma.TransactionClient): Promise<Date> {
    const [r] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT date_trunc('milliseconds',clock_timestamp()) AS now`;
    return r.now;
  }
  private intent(row: MeasurementRevision): NormalizedMeasurementIntent {
    return normalizeMeasurement({
      kind: row.kind as MeasurementIntent['kind'],
      clientId: row.clientId,
      appointmentId: row.appointmentId,
      staffId: row.staffId,
      branchId: row.branchId,
      configurationUserId: row.configurationUserId,
      periodFrom: row.periodFrom,
      periodTo: row.periodTo,
      timezone: row.timezone,
      asOf: row.asOf,
      scope: row.scopeJson as unknown as MeasurementIntent['scope'],
    });
  }

  async admit(
    input: MeasurementIntent,
    occurrence: MeasurementOccurrence,
  ): Promise<MeasurementRevision> {
    const tenantId = this.authority();
    const intent = normalizeMeasurement(input);
    if (!this.sources.supports(intent.kind))
      throw new Error('measurement_rule_not_enabled');
    if (
      !['source_event', 'owner_report', 'measurement_request'].includes(
        occurrence.namespace,
      )
    )
      throw new Error('measurement_producer_invalid');
    measurementId(occurrence.id);
    await this.sources.authorize(tenantId, intent);
    if (
      occurrence.namespace === 'source_event' &&
      !(await this.prisma.domainEvent.findFirst({
        where: { id: occurrence.id, tenantId },
      }))
    )
      throw new Error('measurement_event_not_owned');
    if (
      occurrence.namespace === 'owner_report' &&
      !(await this.prisma.ownerReportRun.findFirst({
        where: { id: occurrence.id, tenantId },
      }))
    )
      throw new Error('measurement_report_not_owned');
    const requestKeyHash = measurementHash([
      'c7.measurement.request/1',
      tenantId,
      occurrence.namespace,
      occurrence.id,
    ]);
    const intentHash = measurementIntentHash(tenantId, intent, requestKeyHash);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      // One key lock also fences same-key / changed-subject admission before identity locking.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`c7.request/${tenantId}/${requestKeyHash}`},0))::text`;
      const prior = await tx.measurementRevision.findUnique({
        where: { tenantId_requestKeyHash: { tenantId, requestKeyHash } },
      });
      const now = await this.time(tx);
      if (prior) {
        if (prior.intentHash !== intentHash)
          throw new Error('measurement_idempotency_conflict');
        if (prior.expiresAt <= now)
          throw new Error('measurement_receipt_expired');
        return prior;
      }
      const [{ hash: identityHash }] = await tx.$queryRaw<
        Array<{ hash: string }>
      >(measurementIdentitySql(tenantId, intent));
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`c7.measurement/${tenantId}/${identityHash}`},0))::text`;
      if (
        await tx.measurementRevision.findFirst({
          where: { tenantId, identityHash, state: 'PENDING' },
        })
      )
        throw new Error('measurement_refresh_pending');
      const head = await tx.measurementRevision.findFirst({
        where: { tenantId, identityHash },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      return tx.measurementRevision.create({
        data: {
          id: randomUUID(),
          tenantId,
          kind: intent.kind,
          identityHash,
          revision: (head?.revision ?? 0) + 1,
          requestKeyHash,
          intentHash,
          ruleKey: `c7.${intent.kind.replaceAll('_', '-')}`,
          ruleVersion: 1,
          clientId: intent.clientId,
          appointmentId: intent.appointmentId,
          staffId: intent.staffId,
          branchId: intent.branchId,
          configurationUserId: intent.configurationUserId,
          periodFrom: intent.periodFrom,
          periodTo: intent.periodTo,
          timezone: intent.timezone,
          scopeJson: intent.scope,
          asOf: intent.asOf,
          admittedAt: now,
          expiresAt: new Date(now.getTime() + MEASUREMENT_RETENTION_MS),
          state: 'PENDING',
          leaseGeneration: 0,
          contractVersion: 1,
        },
      });
    });
  }
  /** Resuming requires the original receipt; absence NEVER falls back to admission. */
  async resume(id: string): Promise<MeasurementRevision> {
    const tenantId = this.authority();
    const row = await this.readDb((tx) =>
      tx.measurementRevision.findFirst({
        where: { id, tenantId },
      }),
    );
    if (!row || row.expiresAt <= new Date())
      throw new Error('measurement_receipt_expired_or_missing');
    await this.sources.authorizeReceipt(tenantId, this.intent(row));
    if (row.state === 'PUBLISHED') return row;
    const lease = await this.claim(id);
    if (!lease) throw new Error('measurement_claim_busy');
    return this.compute(lease);
  }
  async claim(id: string): Promise<MeasurementLease | null> {
    const tenantId = this.authority();
    const source = await this.readDb((tx) =>
      tx.measurementRevision.findFirst({
        where: { id, tenantId },
      }),
    );
    if (!source) throw new Error('measurement_receipt_missing');
    await this.sources.authorizeReceipt(tenantId, this.intent(source));
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      const [row] = await tx.$queryRaw<
        MeasurementRevision[]
      >`SELECT * FROM "MeasurementRevision" WHERE id=${id}::uuid AND "tenantId"=${tenantId} FOR UPDATE`;
      const now = await this.time(tx);
      if (!row || row.expiresAt <= now)
        throw new Error('measurement_receipt_expired_or_missing');
      if (
        row.state === 'PUBLISHED' ||
        (row.leaseExpiresAt && row.leaseExpiresAt > now)
      )
        return null;
      const token = randomUUID();
      const generation = row.leaseGeneration + 1;
      await tx.measurementRevision.update({
        where: { id },
        data: {
          leaseGeneration: generation,
          leaseTokenHash: tokenHash(token),
          leaseExpiresAt: new Date(
            Math.min(
              now.getTime() + MEASUREMENT_LEASE_MS,
              row.expiresAt.getTime(),
            ),
          ),
        },
      });
      return { id, tenantId, generation, token };
    });
  }
  async compute(lease: MeasurementLease): Promise<MeasurementRevision> {
    const tenantId = this.authority();
    if (lease.tenantId !== tenantId)
      throw new Error('measurement_lease_tenant_mismatch');
    const row = await this.readDb((tx) =>
      tx.measurementRevision.findFirst({
        where: { id: lease.id, tenantId },
      }),
    );
    if (!row) throw new Error('measurement_receipt_missing');
    await this.sources.authorizeReceipt(tenantId, this.intent(row));
    if (row.state === 'PUBLISHED') return row;
    if (
      row.leaseGeneration !== lease.generation ||
      row.leaseTokenHash !== tokenHash(lease.token) ||
      !row.leaseExpiresAt ||
      row.leaseExpiresAt <= new Date()
    )
      throw new Error('measurement_lease_fenced');
    const intent = this.intent(row);
    const prepared = await this.sources.prepare(tenantId, intent);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$queryRaw`SELECT set_config('maya.c7.claim_token',${lease.token},true)`;
      // Hold the source owner's row lock through read + immutable publication.
      // The stable FK permits subsequent canonical corrections without rewriting history.
      let sourceMatches = true;
      if (intent.appointmentId) {
        const [source] = await tx.$queryRaw<
          Array<{ mayaClientId: string | null }>
        >`
          SELECT "mayaClientId" FROM "Appointment"
          WHERE id=${intent.appointmentId} AND "tenantId"=${tenantId} FOR SHARE`;
        if (!source) throw new Error('measurement_source_missing');
        sourceMatches = source.mayaClientId === intent.clientId;
      }
      await this.sources.authorizeReceipt(tenantId, intent, tx);
      const unavailable: MeasurementResult = {
        sources: [],
        dependencies: [],
        metrics: [],
        reasons: ['source_subject_changed'],
        completeness: 'UNAVAILABLE',
        qualification: 'UNQUALIFIED',
        attributionStatus: 'UNATTRIBUTED',
        creditedExecutionId: null,
        creditedAttemptId: null,
      };
      if (sourceMatches && prepared)
        await this.sources.assertPreparedCurrent(
          tenantId,
          intent,
          prepared,
          tx,
        );
      const result = normalizeMeasurementResult(
        sourceMatches
          ? (prepared ?? (await this.sources.read(tenantId, intent, tx)))
          : unavailable,
        tenantId,
      );
      const evidenceRefsJson = {
        version: 1,
        sources: result.sources,
        dependencies: result.dependencies,
      };
      const valuesJson = { version: 1, metrics: result.metrics };
      const limitationsJson = { version: 1, reasons: result.reasons };
      const evidenceHash = measurementHash(evidenceRefsJson);
      const snapshotHash = measurementHash([
        'c7.measurement.snapshot/1',
        row.intentHash,
        row.asOf,
        evidenceRefsJson,
        valuesJson,
        limitationsJson,
        result.completeness,
        result.qualification,
        result.attributionStatus,
        result.creditedExecutionId,
        result.creditedAttemptId,
      ]);
      const now = await this.time(tx);
      const changed = await tx.measurementRevision.updateMany({
        where: {
          id: row.id,
          tenantId,
          state: 'PENDING',
          leaseGeneration: lease.generation,
          leaseTokenHash: tokenHash(lease.token),
          leaseExpiresAt: { gt: now },
          expiresAt: { gt: now },
        },
        data: {
          state: 'PUBLISHED',
          publishedAt: now,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          evidenceHash,
          snapshotHash,
          evidenceRefsJson,
          valuesJson,
          limitationsJson,
          completeness: result.completeness,
          qualification: result.qualification,
          attributionStatus: result.attributionStatus,
          creditedExecutionId: result.creditedExecutionId,
          creditedAttemptId: result.creditedAttemptId,
        },
      });
      if (changed.count !== 1)
        throw new Error('measurement_publication_fenced');
      return tx.measurementRevision.findUniqueOrThrow({
        where: { id: row.id },
      });
    });
  }
  async current(input: MeasurementIntent): Promise<{
    revision: MeasurementRevision | null;
    refreshPending: boolean;
  }> {
    const tenantId = this.authority();
    const intent = normalizeMeasurement(input);
    await this.sources.authorize(tenantId, intent);
    const [{ hash: identityHash }] = await this.prisma.$queryRaw<
      Array<{ hash: string }>
    >(measurementIdentitySql(tenantId, intent));
    const now = new Date();
    const rows = await this.readDb((tx) =>
      tx.measurementRevision.findMany({
        where: { tenantId, identityHash, expiresAt: { gt: now } },
        orderBy: { revision: 'desc' },
        take: 2,
      }),
    );
    const published = rows.find((r) => r.state === 'PUBLISHED');
    return {
      // Never fall back to an older matching Client when the latest result differs.
      revision: published?.clientId === intent.clientId ? published : null,
      refreshPending: rows[0]?.state === 'PENDING',
    };
  }
}
