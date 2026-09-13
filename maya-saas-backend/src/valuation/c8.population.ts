import { Prisma, C8ResultRevision } from '@prisma/client';
import { C8Object, c8Object, c8Id, c8Instant, c8Hash } from './c8.contract';

export type C8PopulationQuery = {
  version: 1;
  tenantId: string;
  owner: 'Appointment' | 'Client';
  clientId: string | null;
  staffId: string | null;
  branchIds: string[];
  serviceScope: string[];
  from: string;
  to: string;
};
/** Released query contract: exact canonical IDs, closed predicates, no SQL/caller payload. */
export function c8PopulationQuery(
  value: unknown,
  tenantId: string,
): C8PopulationQuery {
  const q = c8Object(value, [
    'version',
    'tenantId',
    'owner',
    'clientId',
    'staffId',
    'branchIds',
    'serviceScope',
    'from',
    'to',
  ]);
  if (
    q.version !== 1 ||
    q.tenantId !== tenantId ||
    !['Appointment', 'Client'].includes(String(q.owner))
  )
    throw new Error('c8_population_scope');
  for (const key of ['clientId', 'staffId']) if (q[key] !== null) c8Id(q[key]);
  for (const key of ['branchIds', 'serviceScope']) {
    if (
      !Array.isArray(q[key]) ||
      q[key].length > 100 ||
      new Set(q[key]).size !== q[key].length
    )
      throw new Error('c8_population_scope');
    q[key].forEach(c8Id);
  }
  if (c8Instant(q.from) >= c8Instant(q.to))
    throw new Error('c8_population_window');
  if (
    q.owner === 'Client' &&
    (q.clientId !== null ||
      q.staffId !== null ||
      (q.serviceScope as string[]).length)
  )
    throw new Error('c8_client_population_scope');
  return q as C8PopulationQuery;
}
export async function c8ReadPopulation(
  tx: Prisma.TransactionClient,
  query: C8PopulationQuery,
) {
  const q = c8PopulationQuery(query, query.tenantId);
  if (q.owner === 'Client') {
    // A branch-scoped client cohort contains only exact canonical appointments in that branch.
    const rows = await tx.client.findMany({
      where: {
        tenantId: q.tenantId,
        mergedIntoClientId: null,
        ...(q.branchIds.length
          ? {
              appointments: {
                some: { tenantId: q.tenantId, branchId: { in: q.branchIds } },
              },
            }
          : {}),
      },
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: 5001,
    });
    if (rows.length > 5000)
      throw new Error('c8_complete_bounded_cohort_required');
    return populationReceipt(
      tx,
      q,
      rows.map((r) => r.id),
    );
  }
  const rows = await tx.appointment.findMany({
    where: {
      tenantId: q.tenantId,
      ...(q.clientId ? { mayaClientId: q.clientId } : {}),
      ...(q.staffId ? { staffId: q.staffId } : {}),
      ...(q.branchIds.length ? { branchId: { in: q.branchIds } } : {}),
      startAt: { gte: new Date(q.from), lt: new Date(q.to) },
      ...(q.serviceScope.length
        ? {
            source: 'internal',
            OR: q.serviceScope.map((id) => ({
              serviceIds: { array_contains: [id] },
            })),
          }
        : {}),
    },
    select: { id: true, updatedAt: true, mayaClientId: true },
    orderBy: { id: 'asc' },
    take: 2001,
  });
  // Each appointment has a source reference and a C7 snapshot; leave space in the 5,000-ref envelope.
  if (rows.length > 2000) throw new Error('c8_source_population_over_limit');
  return populationReceipt(
    tx,
    q,
    rows.map((r) => r.id),
  );
}
async function populationReceipt(
  tx: Prisma.TransactionClient,
  q: C8PopulationQuery,
  ids: string[],
) {
  if (!ids.length) return { ids, hash: c8Hash([]) };
  const rows = await tx.$queryRaw<Array<{ id: string; hash: string }>>(
    Prisma.sql`SELECT id,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') hash FROM ${Prisma.raw('"' + q.owner + '"')} s WHERE "tenantId"=${q.tenantId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`,
  );
  if (rows.length !== ids.length)
    throw new Error('c8_source_population_changed');
  // A timestamp alone does not prove unchanged business content.
  return { ids, hash: c8Hash(rows.map((r) => [r.id, r.hash])) };
}
export async function c8PopulationCurrent(
  tx: Prisma.TransactionClient,
  row: Pick<C8ResultRevision, 'tenantId' | 'inputSnapshotJson'>,
): Promise<boolean> {
  const input = c8Object(row.inputSnapshotJson, [
    'version',
    'features',
    'missingness',
    'coverage',
    'dependencies',
  ]);
  const coverage = input.coverage as C8Object;
  if (!coverage || typeof coverage !== 'object' || !('queries' in coverage))
    return true; // P01's source-ref-only fixtures/explicit inputs.
  c8Object(coverage, ['version', 'state', 'queries']);
  if (
    coverage.version !== 1 ||
    !Array.isArray(coverage.queries) ||
    coverage.queries.length > 100
  )
    return false;
  for (const entry of coverage.queries) {
    const e = c8Object(entry, ['query', 'hash']);
    const query = c8PopulationQuery(e.query, row.tenantId);
    if ((await c8ReadPopulation(tx, query)).hash !== e.hash) return false;
  }
  return true;
}
