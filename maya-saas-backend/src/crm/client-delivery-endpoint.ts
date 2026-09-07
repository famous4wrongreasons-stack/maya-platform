import type { Prisma, PrismaClient } from '@prisma/client';
import type { EncryptionService } from '../encryption/encryption.service';
import type { ClientChannelLinkService } from './client-channel-link.service';
import { clientChannelSubjectHash } from './client-channel-subject';

/** Shared verified binding resolver; no address or User inference. */
export async function resolveVerifiedClientDeliveryEndpoint(
  db: Prisma.TransactionClient | PrismaClient,
  encryption: EncryptionService,
  links: ClientChannelLinkService,
  tenantId: string,
  clientId: string,
  linkId: string,
) {
  const link = await db.clientChannelLink.findUnique({
    where: { id_tenantId: { id: linkId, tenantId } },
  });
  if (
    !link ||
    link.clientId !== clientId ||
    link.revokedAt ||
    link.verificationVersion !== 1 ||
    link.subjectHashVersion !== 1 ||
    !link.deliveryAddressEncrypted
  )
    return null;
  let address: string;
  try {
    address = encryption.decrypt(link.deliveryAddressEncrypted);
  } catch {
    return null;
  }
  if (
    (link.provider === 'telegram' && !/^[1-9][0-9]{0,19}$/.test(address)) ||
    (link.provider === 'maya_user' &&
      !/^[A-Za-z0-9._:-]{1,240}$/.test(address)) ||
    !['telegram', 'maya_user'].includes(link.provider) ||
    clientChannelSubjectHash(
      encryption,
      link.provider as 'telegram' | 'maya_user',
      address,
    ) !== link.providerSubjectHash
  )
    return null;
  try {
    await links.assertClientEligible(db, tenantId, clientId);
  } catch {
    return null;
  }
  if (link.provider === 'maya_user') {
    const user = await db.user.findUnique({
      where: { id: address },
      select: {
        status: true,
        memberships: {
          where: { tenantId, status: 'active' },
          select: { id: true },
          take: 2,
        },
      },
    });
    if (!user || user.status !== 'active' || user.memberships.length !== 1)
      return null;
  }
  return {
    provider: link.provider as 'telegram' | 'maya_user',
    address,
    identityRef: link.providerSubjectHash,
  };
}
