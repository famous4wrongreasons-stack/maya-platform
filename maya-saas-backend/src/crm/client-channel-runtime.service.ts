import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import {
  ClientLinkChallengeService,
  type ClientChallengeIssuerAuthority,
} from './client-link-challenge.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from './client-channel-link.service';
import { EncryptionService } from '../encryption/encryption.service';
import { Package5Wave3CanonicalCutoverService } from '../package5-wave3/package5-wave3-canonical-cutover.service';

/** Only already verified provenance can issue another channel's challenge.
 * A cold-start Client with no trusted resolution fails closed; no heuristic enrollment.
 */
@Injectable()
export class ClientChannelRuntimeService implements ClientChallengeIssuerAuthority {
  readonly resolverId = 'a18.active-verified-client-channel.v1';
  private readonly challenges: ClientLinkChallengeService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    encryption: EncryptionService,
    private readonly consent: Package5Wave3CanonicalCutoverService,
  ) {
    const closedVerifier = {
      verifyLink: () =>
        Promise.reject(
          new ForbiddenException('Initial links require ClientLinkChallenge'),
        ),
      verifyRevocation: () =>
        Promise.reject(
          new ForbiddenException('Explicit verified rebind operation required'),
        ),
    };
    this.challenges = new ClientLinkChallengeService(
      prisma,
      context,
      encryption,
      new ClientChannelLinkService(prisma, context, closedVerifier),
      this,
      channels,
    );
  }

  async resolve(proof: string, tx: Prisma.TransactionClient) {
    const channel = await this.channels.authenticate(proof, tx);
    await lockClientChannelIdentity(
      tx,
      channel.tenantId,
      channel.provider,
      channel.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId: channel.tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (
      links.length !== 1 ||
      current.providerSubjectHash !== channel.providerSubjectHash ||
      links[0].verificationVersion !== 1 ||
      links[0].subjectHashVersion !== 1
    )
      throw new ForbiddenException(
        'Trusted verified Client resolution required',
      );
    const link = links[0];
    return {
      tenantId: link.tenantId,
      clientId: link.clientId,
      resolver: this.resolverId,
      resolutionEvidenceRef: `client-channel-link:${link.id}`,
      resolutionEvidenceHash: link.verificationEvidenceHash,
      issuerAuthorityHash: current.channelControlProofHash,
      validUntil: current.validUntil,
    };
  }

  issue(channelProof: string) {
    return this.challenges.issue({ resolutionProof: channelProof });
  }
  consume(channelProof: string, token: string) {
    return this.challenges.consume({ channelProof, token });
  }

  async submitConsent(channelProof: string, value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'idempotencyKey,marketing,privacy'
    )
      throw new BadRequestException(
        'Only consent decisions and command identity are accepted',
      );
    const input = value as {
      privacy: boolean;
      marketing: boolean;
      idempotencyKey: string;
    };
    if (
      typeof input.privacy !== 'boolean' ||
      typeof input.marketing !== 'boolean' ||
      typeof input.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey)
    )
      throw new BadRequestException(
        'Explicit consent decisions and stable command identity required',
      );
    const tenantId = this.context.requireTenantId();
    const channel = await this.prisma.$transaction((tx) =>
      this.channels.authenticate(channelProof, tx),
    );
    const recheck = async (tx: Prisma.TransactionClient) => {
      const current = await this.channels.authenticate(channelProof, tx);
      if (
        current.tenantId !== tenantId ||
        current.provider !== channel.provider ||
        current.providerSubjectHash !== channel.providerSubjectHash
      )
        throw new ForbiddenException('Authenticated channel changed');
    };
    const occurredAt = new Date();
    const privacy = await this.consent.recordChannelConsent(
      tenantId,
      channel,
      'privacy',
      input.privacy,
      occurredAt,
      input.idempotencyKey,
      recheck,
    );
    const marketing = await this.consent.recordChannelConsent(
      tenantId,
      channel,
      'marketing',
      input.marketing,
      occurredAt,
      input.idempotencyKey,
      recheck,
    );
    return { privacy, marketing };
  }

  async status(channelProof: string) {
    return this.prisma.$transaction(async (tx) => {
      const channel = await this.channels.authenticate(channelProof, tx);
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId: channel.tenantId,
          provider: channel.provider,
          providerSubjectHash: channel.providerSubjectHash,
          revokedAt: null,
        },
        take: 2,
      });
      if (links.length !== 1)
        return {
          linked: false,
          privacy: false,
          marketing: false,
          client_link_required: true,
        };
      const profile = await tx.customerProfile.findFirst({
        where: { clientId: links[0].clientId, tenantId: channel.tenantId },
      });
      return {
        linked: true,
        privacy: Boolean(profile?.privacyConsentAt),
        marketing: Boolean(profile?.marketingConsentAt),
        client_link_required: false,
      };
    });
  }
}
