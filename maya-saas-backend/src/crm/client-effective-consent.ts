import { Prisma, type PrismaClient } from '@prisma/client';

type Db = Pick<PrismaClient | Prisma.TransactionClient, 'clientConsentFact'>;

/** Same A18 target lock used by ordinary keyed consent and security invalidation. */
export async function lockClientConsent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  clientId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave3:client_consent:${clientId}`}, 0))::text`,
  );
}

/** Select the current head before invalidation: filtering first could resurrect
 * an older grant. Profile rows/preferences/audience membership are never proof.
 * Read-only: original facts remain visible to their audit/history readers.
 */
export async function effectiveClientConsent(
  db: Db,
  tenantId: string,
  clientId: string,
  kind: 'privacy' | 'marketing',
  now = new Date(),
) {
  if (!tenantId || !clientId)
    throw new Error('Exact tenant/Client consent scope required');
  const facts = await db.clientConsentFact.findMany({
    where: { tenantId, clientId, kind, effectiveAt: { lte: now } },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
    include: { invalidation: { select: { id: true } } },
  });
  const head = facts[0];
  const effective =
    !!head &&
    head.decision === 'grant' &&
    !head.invalidation &&
    !(
      facts[1]?.effectiveAt.getTime() === head.effectiveAt.getTime() &&
      facts[1].decision !== head.decision
    );
  return {
    effective,
    effectiveAt: effective ? head.effectiveAt : null,
    factId: head?.id ?? null,
    invalidated: !!head?.invalidation,
    decided: !!head,
  };
}

export async function effectiveClientConsents(
  db: Db,
  tenantId: string,
  clientId: string,
  now = new Date(),
) {
  const [privacy, marketing] = await Promise.all([
    effectiveClientConsent(db, tenantId, clientId, 'privacy', now),
    effectiveClientConsent(db, tenantId, clientId, 'marketing', now),
  ]);
  return { privacy, marketing };
}
