import { ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import type { ClientChannelProvider } from './client-channel-link.service';

export interface ConsentChannelBinding {
  linkId: string;
  provider: ClientChannelProvider;
  providerSubjectHash: string;
  verificationEvidenceHash: string;
}

/** A durable verified Client link is the only consent identity source. */
export async function assertConsentChannelBinding(
  db: Pick<PrismaClient | Prisma.TransactionClient, 'clientChannelLink'>,
  tenantId: string,
  clientId: string,
  binding: ConsentChannelBinding | undefined,
) {
  if (!binding || !binding.linkId)
    throw new ForbiddenException('Verified Client link required');
  const link = await db.clientChannelLink.findUnique({
    where: { id_tenantId: { id: binding.linkId, tenantId } },
  });
  if (
    !link ||
    link.revokedAt ||
    link.clientId !== clientId ||
    link.provider !== binding.provider ||
    link.providerSubjectHash !== binding.providerSubjectHash ||
    link.verificationEvidenceHash !== binding.verificationEvidenceHash ||
    link.verificationVersion !== 1 ||
    link.subjectHashVersion !== 1
  ) {
    throw new ForbiddenException(
      'Verified Client link is missing, changed or revoked',
    );
  }
  return link;
}
