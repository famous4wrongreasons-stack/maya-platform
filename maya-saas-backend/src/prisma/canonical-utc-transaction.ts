import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

/** The pg adapter serializes DateTime without an offset and decodes timestamptz
 * as UTC. Bound the required session setting to this transaction; never alter
 * the production database/pool timezone or existing unrelated command paths.
 * The callback contains database work only, never provider or delivery effects.
 */
export function canonicalUtcTransaction<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: {
    readOnly?: boolean;
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeout?: number;
  } = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      if (options.readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      return work(tx);
    },
    {
      isolationLevel:
        options.isolationLevel ?? Prisma.TransactionIsolationLevel.Serializable,
      timeout: options.timeout ?? 30000,
      maxWait: 10000,
    },
  );
}
