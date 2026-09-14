import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
export const C8_RETENTION_CLASSES = {
  expire_c8_result_revisions: {
    table: 'C8ResultRevision',
    stamp: 'admittedAt',
    expiry: 'expiresAt',
    terminal: null,
    retentionMs: 0,
    policyKey: 'chapter8.result-retention',
  },
  expire_c8_evaluation_revisions: {
    table: 'C8EvaluationRevision',
    stamp: 'admittedAt',
    expiry: 'expiresAt',
    terminal: null,
    retentionMs: 0,
    policyKey: 'chapter8.evaluation-retention',
  },
  expire_c8_model_versions: {
    table: 'C8ModelVersion',
    stamp: 'admittedAt',
    expiry: 'expiresAt',
    terminal: null,
    retentionMs: 0,
    policyKey: 'chapter8.model-retention',
  },
} as const;
export type C8RetentionClass = keyof typeof C8_RETENTION_CLASSES;
export function isC8RetentionClass(value: string): value is C8RetentionClass {
  return Object.prototype.hasOwnProperty.call(C8_RETENTION_CLASSES, value);
}
type Plan = {
  actionClass: string;
  fingerprint: string;
  tenantId: string | null;
  cutoffAt: Date;
  batchSize: number;
};
type Target = { id: string; digest: string; expiresAt: Date };
function rule(plan: Plan) {
  if (!isC8RetentionClass(plan.actionClass) || !plan.tenantId)
    throw new Error('c8_retention_exact_system_tenant_required');
  return C8_RETENTION_CLASSES[plan.actionClass];
}
export function c8RetentionItem(plan: Plan, row: Target) {
  const { table } = rule(plan);
  return {
    itemKind: table,
    itemRefHash: createHash('sha256')
      .update(
        `${plan.fingerprint}/${table}/${plan.tenantId}/${row.id}/${row.digest}/${row.expiresAt.getTime()}`,
      )
      .digest('hex'),
  };
}
export async function selectC8Retention(
  tx: Prisma.TransactionClient,
  plan: Plan,
  lock: boolean,
  runId?: string,
): Promise<Target[]> {
  const { table } = rule(plan);
  const target = Prisma.raw(`"${table}"`);
  const digest = Prisma.raw(
    table === 'C8ModelVersion'
      ? 't."intentHash"'
      : 'coalesce(t."snapshotHash",t."intentHash")',
  );
  const prefix = `${plan.fingerprint}/${table}/${plan.tenantId}/`;
  return tx.$queryRaw<
    Target[]
  >(Prisma.sql`SELECT t.id,${digest}::text digest,t."expiresAt" FROM ${target} t WHERE t."tenantId"=${plan.tenantId} AND t."expiresAt"<${plan.cutoffAt}
 ${runId ? Prisma.sql`AND EXISTS(SELECT 1 FROM "MaintenanceItemClaim" c WHERE c."maintenanceRunId"=${runId} AND c.state='CLAIMED' AND c."itemKind"=${table} AND c."itemRefHash"=encode(sha256(convert_to(${prefix}||t.id::text||'/'||${digest}||'/'||floor(extract(epoch FROM t."expiresAt")*1000)::bigint::text,'UTF8')),'hex'))` : Prisma.empty}
 ORDER BY t."expiresAt",t.id LIMIT ${plan.batchSize} ${lock ? Prisma.sql`FOR UPDATE OF t` : Prisma.empty}`);
}
export async function purgeC8Revision(
  tx: Prisma.TransactionClient,
  plan: Plan,
  row: Target,
): Promise<boolean> {
  const { table } = rule(plan);
  const digest = Prisma.raw(
    table === 'C8ModelVersion'
      ? '"intentHash"'
      : 'coalesce("snapshotHash","intentHash")',
  );
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE id=${row.id}::uuid AND "tenantId"=${plan.tenantId} AND "expiresAt"=${row.expiresAt} AND "expiresAt"<${plan.cutoffAt} AND ${digest}=${row.digest} RETURNING id`,
  );
  return rows.length === 1;
}
