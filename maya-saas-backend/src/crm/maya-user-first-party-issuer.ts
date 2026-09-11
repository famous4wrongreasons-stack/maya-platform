import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { lockClientChannelIdentity } from './client-channel-link.service';
import type {
  ClientChallengeIssuerAuthority,
  TrustedClientResolution,
} from './client-link-challenge.service';

/** Exact first-party Maya User → Client. JWT ownership only, never phone/CRM
 * or CustomerProfile. Used solely to issue the initial linking challenge.
 */
export class MayaUserFirstPartyIssuer implements ClientChallengeIssuerAuthority {
  readonly resolverId = 'a18.first-party-maya-user.v1';
  constructor(
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
  ) {}

  async resolve(
    proof: string,
    tx: Prisma.TransactionClient,
  ): Promise<TrustedClientResolution> {
    const channel = await this.channels.authenticate(proof, tx);
    this.context.assertTenantId(channel.tenantId);
    if (channel.provider !== 'maya_user' || !channel.userId)
      throw new ForbiddenException(
        'Trusted verified Client resolution required',
      );
    await lockClientChannelIdentity(
      tx,
      channel.tenantId,
      channel.provider,
      channel.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    if (
      current.tenantId !== channel.tenantId ||
      current.provider !== channel.provider ||
      current.providerSubjectHash !== channel.providerSubjectHash ||
      current.userId !== channel.userId
    )
      throw new ForbiddenException('Authenticated channel changed');
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId: current.tenantId,
        provider: current.provider,
        providerSubjectHash: current.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
      select: { id: true },
    });
    if (links.length)
      throw new ForbiddenException(
        'Trusted verified Client resolution required',
      );
    const clients = await tx.client.findMany({
      where: {
        tenantId: current.tenantId,
        userId: current.userId,
        mergedIntoClientId: null,
      },
      take: 2,
      select: { id: true },
    });
    if (clients.length !== 1)
      throw new ForbiddenException(
        'Trusted verified Client resolution required',
      );
    const clientId = clients[0].id;
    return {
      tenantId: current.tenantId,
      clientId,
      resolver: this.resolverId,
      resolutionEvidenceRef: `first-party-maya-user:${current.userId}`,
      resolutionEvidenceHash: this.encryption.opaqueReference(
        'a18.first-party-maya-user.resolution.v1',
        `${current.tenantId}\0${current.userId}\0${clientId}`,
      ),
      issuerAuthorityHash: current.channelControlProofHash,
      validUntil: current.validUntil,
    };
  }
}
