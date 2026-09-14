import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
export const C7_MEASUREMENT_RETENTION_CLASS =
  'expire_measurement_revisions' as const;
export const C7_MEASUREMENT_RETENTION_RULE = {
  table: 'MeasurementRevision',
  stamp: 'admittedAt',
  expiry: 'expiresAt',
  terminal: null,
  retentionMs: 0,
  policyKey: 'chapter7.measurement-retention',
} as const;
type Plan = {
  fingerprint: string;
  tenantId: string | null;
  cutoffAt: Date;
  batchSize: number;
};
type Target = { id: string; digest: string; expiresAt: Date };
export function measurementRetentionItem(plan: Plan, row: Target) {
  return {
    itemKind: 'MeasurementRevision',
    itemRefHash: createHash('sha256')
      .update(
        `${plan.fingerprint}/MeasurementRevision/${plan.tenantId}/${row.id}/${row.digest}/${row.expiresAt.getTime()}`,
      )
      .digest('hex'),
  };
}
export async function selectMeasurementRetention(
  tx: Prisma.TransactionClient,
  plan: Plan,
  lock: boolean,
  runId?: string,
): Promise<Target[]> {
  if (!plan.tenantId)
    throw new Error('measurement_retention_exact_system_tenant_required');
  const prefix = `${plan.fingerprint}/MeasurementRevision/${plan.tenantId}/`;
  return tx.$queryRaw<
    Target[]
  >(Prisma.sql`SELECT t.id,coalesce(t."snapshotHash",t."intentHash")::text AS digest,t."expiresAt"
    FROM "MeasurementRevision" t WHERE t."tenantId"=${plan.tenantId} AND t."expiresAt"<${plan.cutoffAt}
    ${
      runId
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM "MaintenanceItemClaim" c WHERE c."maintenanceRunId"=${runId}
      AND c.state='CLAIMED' AND c."itemKind"='MeasurementRevision' AND c."itemRefHash"=encode(sha256(convert_to(
        ${prefix} || t.id::text || '/' || coalesce(t."snapshotHash",t."intentHash") || '/' ||
        floor(extract(epoch FROM t."expiresAt")*1000)::bigint::text,'UTF8')),'hex'))`
        : Prisma.empty
    }
    ORDER BY t."expiresAt",t.id LIMIT ${plan.batchSize} ${lock ? Prisma.sql`FOR UPDATE OF t` : Prisma.empty}`);
}
/** Existing AC6 owns this exact leaf. The SQL trigger verifies its durable claim. */
export async function purgeMeasurementRevision(
  tx: Prisma.TransactionClient,
  plan: Plan,
  row: Target,
): Promise<boolean> {
  const deleted = await tx.$queryRaw<
    Array<{ id: string }>
  >`DELETE FROM "MeasurementRevision" WHERE id=${row.id}::uuid
    AND "tenantId"=${plan.tenantId} AND "expiresAt"=${row.expiresAt} AND "expiresAt"<${plan.cutoffAt}
    AND coalesce("snapshotHash","intentHash")=${row.digest} RETURNING id`;
  return deleted.length === 1;
}
