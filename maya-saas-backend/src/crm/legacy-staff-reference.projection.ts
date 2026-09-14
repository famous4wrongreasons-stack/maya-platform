import type { Prisma } from '@prisma/client';

import type { StaffId } from '../domain/staff-identity';

/** Presentation only, after canonical account/access admission. This boundary
 * cannot select a User, membership or role from a provider identifier. */
export async function projectLegacyStaffReference(
  tx: Pick<Prisma.TransactionClient, 'staffProviderLink'>,
  input: { tenantId: string; provider: string; staffId: StaffId | null },
): Promise<{ externalStaffId: string | null }> {
  if (!input.staffId) return { externalStaffId: null };
  const links = await tx.staffProviderLink.findMany({
    where: {
      tenantId: input.tenantId,
      staffId: input.staffId,
      provider: input.provider,
      unlinkedAt: null,
      staff: { is: { tenantId: input.tenantId, active: true } },
    },
    select: { externalId: true },
    take: 2,
  });
  return {
    externalStaffId:
      links.length === 1 && links[0].externalId ? links[0].externalId : null,
  };
}
