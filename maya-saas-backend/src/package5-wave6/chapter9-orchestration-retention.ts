import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export const C9_RETENTION_CLASSES = {
  expire_c9_orchestration_runs: {
    table: 'C9Run',
    stamp: 'admittedAt',
    expiry: 'retentionUntil',
    terminal: null,
    retentionMs: 0,
    policyKey: 'chapter9.orchestration-retention',
  },
} as const;
export const C9_RETENTION_KINDS = [
  'C9WorkReceipt',
  'C9StepBinding',
  'C9PlanStep',
  'C9StrategyRevision',
  'C9Run',
] as const;
type Kind = (typeof C9_RETENTION_KINDS)[number];
type Plan = {
  actionClass: string;
  fingerprint: string;
  tenantId: string | null;
  cutoffAt: Date;
  batchSize: number;
};
type Target = {
  id: string;
  rootId: string;
  itemKind: Kind;
  digest: string;
  expiresAt: Date;
};
const digest: Record<Kind, string> = {
  C9Run: 'requestHash',
  C9StrategyRevision: 'snapshotHash',
  C9PlanStep: 'intentHash',
  C9StepBinding: 'bindingHash',
  C9WorkReceipt: 'inputHash',
};
export const isC9RetentionClass = (s: string) =>
  s === 'expire_c9_orchestration_runs';
export function c9RetentionItem(plan: Plan, row: Target) {
  return {
    itemKind: row.itemKind,
    itemRefHash: createHash('sha256')
      .update(
        `${plan.fingerprint}/${row.itemKind}/${plan.tenantId}/${row.id}/${row.digest}/${row.expiresAt.getTime()}`,
      )
      .digest('hex'),
  };
}
/** Select due children even while their root identity still has retention remaining.
 * Only FK leaves are claimed; later bounded runs advance the same aggregate. */
export async function selectC9Retention(
  tx: Prisma.TransactionClient,
  plan: Plan,
  lock: boolean,
  runId?: string,
): Promise<Target[]> {
  if (!isC9RetentionClass(plan.actionClass) || !plan.tenantId)
    throw new Error('c9_exact_retention_scope');
  const result: Target[] = [];
  for (const kind of C9_RETENTION_KINDS) {
    if (result.length >= plan.batchSize) break;
    const tab = Prisma.raw(`"${kind}"`),
      d = Prisma.raw(`t."${digest[kind]}"`);
    const root = Prisma.raw(
      kind === 'C9Run'
        ? 't.id'
        : kind === 'C9WorkReceipt' || kind === 'C9StrategyRevision'
          ? 't."runId"'
          : kind === 'C9PlanStep'
            ? '(SELECT "runId" FROM "C9StrategyRevision" WHERE id=t."revisionId")'
            : '(SELECT r."runId" FROM "C9PlanStep" s JOIN "C9StrategyRevision" r ON r.id=s."revisionId" WHERE s.id=t."stepId")',
    );
    const leaf = Prisma.raw(
      kind === 'C9Run'
        ? 'NOT EXISTS(SELECT 1 FROM "C9StrategyRevision" x WHERE x."runId"=t.id) AND NOT EXISTS(SELECT 1 FROM "C9WorkReceipt" x WHERE x."runId"=t.id)'
        : kind === 'C9StrategyRevision'
          ? 'NOT EXISTS(SELECT 1 FROM "C9StrategyRevision" x WHERE x."parentRevisionId"=t.id) AND NOT EXISTS(SELECT 1 FROM "C9PlanStep" x WHERE x."revisionId"=t.id) AND NOT EXISTS(SELECT 1 FROM "C9WorkReceipt" x WHERE x."revisionId"=t.id)'
          : kind === 'C9PlanStep'
            ? 'NOT EXISTS(SELECT 1 FROM "C9StepBinding" x WHERE x."stepId"=t.id)'
            : 'TRUE',
    );
    const prefix = `${plan.fingerprint}/${kind}/${plan.tenantId}/`;
    const rows = await tx.$queryRaw<
      Target[]
    >(Prisma.sql`SELECT t.id,${root} AS "rootId",${kind} AS "itemKind",${d}::text digest,t."retentionUntil" AS "expiresAt" FROM ${tab} t WHERE t."tenantId"=${plan.tenantId} AND t."retentionUntil"<${plan.cutoffAt} AND ${leaf}
      ${runId ? Prisma.sql`AND EXISTS(SELECT 1 FROM "MaintenanceItemClaim" c WHERE c."maintenanceRunId"=${runId} AND c.state='CLAIMED' AND c."itemKind"=${kind} AND c."itemRefHash"=encode(sha256(convert_to(${prefix}||t.id::text||'/'||${d}||'/'||floor(extract(epoch FROM t."retentionUntil")*1000)::bigint::text,'UTF8')),'hex'))` : Prisma.empty}
      ORDER BY t."retentionUntil",t.id LIMIT ${plan.batchSize - result.length} ${lock ? Prisma.sql`FOR UPDATE OF t` : Prisma.empty}`);
    result.push(...rows);
  }
  return result;
}
export async function purgeC9Derived(
  tx: Prisma.TransactionClient,
  plan: Plan,
  row: Target,
): Promise<boolean> {
  if (
    !isC9RetentionClass(plan.actionClass) ||
    !plan.tenantId ||
    !C9_RETENTION_KINDS.includes(row.itemKind)
  )
    throw new Error('c9_exact_retention_scope');
  // Purged evidence cannot restart reasoning. Minimal request/budget stays until its own365d.
  await tx.$executeRaw`UPDATE "C9Run" SET state='STOPPED',"counterVersion"="counterVersion"+1,"updatedAt"=clock_timestamp() WHERE id=${row.rootId}::uuid AND "tenantId"=${plan.tenantId} AND state NOT IN ('STOPPED','COMPLETED','CANCELLED','EXPIRED')`;
  const tab = Prisma.raw(`"${row.itemKind}"`),
    d = Prisma.raw(`"${digest[row.itemKind]}"`);
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`DELETE FROM ${tab} WHERE id=${row.id}::uuid AND "tenantId"=${plan.tenantId} AND "retentionUntil"=${row.expiresAt} AND "retentionUntil"<${plan.cutoffAt} AND ${d}=${row.digest} RETURNING id`,
  );
  return rows.length === 1;
}
