/** Only explicit PostgreSQL transaction-abort evidence is safe to replay.
 * Prisma's driver adapter may surface that evidence at COMMIT in a nested cause.
 * A timeout, lost connection or unclassified write error is never a retry proof.
 */
export function isPostgresSerializationConflict(
  error: unknown,
  depth = 0,
): boolean {
  if (!error || typeof error !== 'object' || depth > 5) return false;
  const e = error as Record<string, unknown>;
  return (
    ['P2034', '40001', '40P01'].includes(String(e.code ?? e.originalCode)) ||
    e.kind === 'TransactionWriteConflict' ||
    [e.cause, e.meta, e.driverAdapterError].some((child) =>
      isPostgresSerializationConflict(child, depth + 1),
    )
  );
}
