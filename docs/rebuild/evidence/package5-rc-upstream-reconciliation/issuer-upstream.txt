import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import type {
  ClientChallengeIssuerAuthority,
  TrustedClientResolution,
} from './client-link-challenge.service';
import { lockClientChannelIdentity } from './client-channel-link.service';

/**
 * First-link authority for an authenticated Maya account whose existing
 * tenant-qualified Client and CustomerProfile independently point to that
 * account. Neither a phone nor a caller-supplied Client identifier participates
 * in this resolution.
 */
export class MayaUserClientAssociationIssuer implements ClientChallengeIssuerAuthority {
  readonly resolverId = 'a18.maya-user-client-association.v1';

  constructor(
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
  ) {}

  async resolve(
    proof: string,
    tx: Prisma.TransactionClient,
  ): Promise<TrustedClientResolution> {
    const channel = await this.channels.authenticate(proof, tx);
    this.context.assertTenantId(channel.tenantId);
    if (channel.provider !== 'maya_user' || !channel.userId)
      throw new ForbiddenException(
        'Verified Maya account and Client association required',
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
      throw new ForbiddenException('Authenticated Maya account changed');

    const activeLinks = await tx.clientChannelLink.findMany({
      where: {
        tenantId: channel.tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
      select: { id: true },
    });
    if (activeLinks.length)
      throw new ForbiddenException('Client channel is already linked');

    const clients = await tx.client.findMany({
      where: {
        tenantId: channel.tenantId,
        userId: channel.userId,
        mergedIntoClientId: null,
      },
      take: 2,
      select: { id: true, userId: true },
    });
    if (clients.length !== 1)
      throw new ForbiddenException('Exact Maya account Client is unresolved');
    const client = clients[0];

    const profiles = await tx.customerProfile.findMany({
      where: {
        tenantId: channel.tenantId,
        OR: [{ userId: channel.userId }, { clientId: client.id }],
      },
      take: 2,
      select: { id: true, userId: true, clientId: true },
    });
    if (
      profiles.length !== 1 ||
      profiles[0].userId !== channel.userId ||
      (profiles[0].clientId !== null && profiles[0].clientId !== client.id)
    )
      throw new ForbiddenException(
        'Durable Maya account and Client association is unresolved',
      );

    const evidence = {
      contract: this.resolverId,
      tenantId: channel.tenantId,
      userId: channel.userId,
      clientId: client.id,
      customerProfileId: profiles[0].id,
      clientUserBinding: true,
      profileUserBinding: true,
    };
    return {
      tenantId: channel.tenantId,
      clientId: client.id,
      resolver: this.resolverId,
      resolutionEvidenceRef: `maya-user-client-association:${client.id}:${profiles[0].id}`,
      resolutionEvidenceHash: createHash('sha256')
        .update(JSON.stringify(evidence))
        .digest('hex'),
      issuerAuthorityHash: current.channelControlProofHash,
      validUntil: current.validUntil,
    };
  }
}
