import { Injectable } from '@nestjs/common';
import { MeasurementRevision, Prisma } from '@prisma/client';
import { GovernedSettingsReadService } from '../package5-wave1/governed-settings.read';
import { C8Store } from './c8.store';
import {
  C8Object,
  C8Ref,
  C8SourceOwner,
  c8Digest,
  c8Id,
  c8Object,
} from './c8.contract';
import { c8Policy } from './c8.policy';
/** Canonical readers and minimal evidence only. This class cannot change any source fact. */
@Injectable()
export class C8Sources {
  constructor(
    private readonly store: C8Store,
    private readonly governed: GovernedSettingsReadService,
  ) {}
  async policy(tx: Prisma.TransactionClient) {
    const tenantId = this.store.tenant();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave1:setting:tenant-config:c8_valuation`},0))::text`;
    const current = await this.governed.configuration(
      tx,
      tenantId,
      'c8_valuation',
    );
    if (!current.previousRevisionId || !current.content)
      throw new Error('c8_confirmed_policy_unavailable');
    const row = await tx.tenantBusinessConfigurationRevision.findFirstOrThrow({
      where: {
        id: current.previousRevisionId,
        tenantId,
        namespace: 'c8_valuation',
      },
    });
    return {
      id: row.id,
      hash: row.contentHash,
      createdAt: row.createdAt,
      content: c8Policy(current.content),
    };
  }
  async subjectRef(
    tx: Prisma.TransactionClient,
    owner: Extract<
      C8SourceOwner,
      'Client' | 'Appointment' | 'Staff' | 'Branch'
    >,
    id: string,
  ): Promise<C8Ref> {
    const tenantId = this.store.tenant();
    c8Id(id);
    if (!['Client', 'Appointment', 'Staff', 'Branch'].includes(owner))
      throw new Error('c8_subject_owner');
    const [r] = await tx.$queryRaw<
      Array<{
        hash: string;
        observedAt: Date;
        sourceAsOf: Date;
        merged: string | null;
      }>
    >(Prisma.sql`SELECT encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') hash,
   date_trunc('milliseconds',clock_timestamp()) "observedAt",coalesce((to_jsonb(s)->>'updatedAt')::timestamptz,(to_jsonb(s)->>'createdAt')::timestamptz,transaction_timestamp()) "sourceAsOf",to_jsonb(s)->>'mergedIntoClientId' merged
   FROM ${Prisma.raw(`"${owner}"`)} s WHERE id=${id} AND "tenantId"=${tenantId} FOR SHARE`);
    if (!r || r.merged) throw new Error('c8_exact_canonical_subject_required');
    return {
      owner,
      tenantId,
      id,
      revisionOrStateHash: r.hash,
      observedAt: r.sourceAsOf.toISOString(),
      asOf: r.sourceAsOf.toISOString(),
      qualification: 'VERIFIED',
      coverage: 'PARTIAL',
    };
  }
  measurementRef(row: MeasurementRevision): C8Ref {
    if (
      row.tenantId !== this.store.tenant() ||
      row.state !== 'PUBLISHED' ||
      !row.snapshotHash ||
      !row.publishedAt ||
      row.expiresAt <= new Date()
    )
      throw new Error('c8_qualified_measurement_reference_required');
    c8Digest(row.snapshotHash);
    return {
      owner: 'MeasurementRevision',
      tenantId: row.tenantId,
      id: row.id,
      revisionOrStateHash: row.snapshotHash,
      observedAt: row.publishedAt.toISOString(),
      asOf: row.asOf.toISOString(),
      qualification: row.qualification as C8Ref['qualification'],
      coverage: row.completeness as C8Ref['coverage'],
      expiresAt: row.expiresAt.toISOString(),
    };
  }
  /** Later consumers derive numbers from validated C7 metrics, never caller assertions. */
  metrics(row: MeasurementRevision): Array<Record<string, unknown>> {
    const v = c8Object(row.valuesJson, ['version', 'metrics']);
    if (v.version !== 1 || !Array.isArray(v.metrics))
      throw new Error('c8_measurement_values_contract');
    return v.metrics.map((m) =>
      c8Object(m, [
        'key',
        'value',
        'unit',
        'currency',
        'basis',
        'state',
        'dimensions',
        'sourceRefs',
      ]),
    );
  }
  async scope(tenantId: string): Promise<C8Object> {
    if (tenantId !== this.store.tenant()) throw new Error('c8_tenant_scope');
    return this.store.transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { status: true, industryPresetId: true, calendarSource: true },
      });
      if (tenant?.status !== 'active') throw new Error('c8_tenant_inactive');
      const provider = await tx.crmIntegration.findFirst({
        where: { tenantId, status: 'active' },
        select: { provider: true, verifiedAt: true },
      });
      return {
        version: 1,
        tenantId,
        branchIds: [],
        serviceScope: [],
        providerCapability:
          tenant.calendarSource === 'internal'
            ? 'internal_calendar'
            : provider?.verifiedAt
              ? provider.provider
              : 'unavailable',
        verticalDomain: tenant.industryPresetId ?? 'unspecified',
        cohortDefinitionHash: null,
      };
    });
  }
}
