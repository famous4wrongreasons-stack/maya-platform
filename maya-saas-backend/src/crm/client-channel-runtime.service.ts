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
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService } from './crm.service';

/** Only already verified provenance can issue another channel's challenge.
 * A cold-start Client with no trusted resolution fails closed; no heuristic enrollment.
 */
@Injectable()
export class ClientChannelRuntimeService implements ClientChallengeIssuerAuthority {
  readonly resolverId = 'a18.active-verified-client-channel.v1';
  private readonly challenges: ClientLinkChallengeService;
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
    private readonly consent: Package5Wave3CanonicalCutoverService,
    private readonly crm: CrmService,
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
    this.links = new ClientChannelLinkService(prisma, context, closedVerifier);
    this.challenges = new ClientLinkChallengeService(
      prisma,
      context,
      encryption,
      this.links,
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

  async refreshDeliveryAddress(channelProof: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const first = await this.channels.authenticate(channelProof, tx);
        await lockClientChannelIdentity(
          tx,
          first.tenantId,
          first.provider,
          first.providerSubjectHash,
        );
        const current = await this.channels.authenticate(channelProof, tx);
        if (
          current.tenantId !== first.tenantId ||
          current.provider !== first.provider ||
          current.providerSubjectHash !== first.providerSubjectHash ||
          current.deliveryAddress !== first.deliveryAddress
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
        });
        if (links.length !== 1)
          throw new ForbiddenException('client_link_required');
        await this.links.persistDeliveryAddressInTransaction(tx, {
          tenantId: current.tenantId,
          linkId: links[0].id,
          provider: current.provider,
          providerSubjectHash: current.providerSubjectHash,
          deliveryAddressEncrypted: this.encryption.encrypt(
            current.deliveryAddress,
          ),
        });
        return { stored: true, linkId: links[0].id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Server-internal delivery resolution. A caller supplies a canonical Client
   * and exact link reference, never a raw provider recipient. */
  async resolveVerifiedDeliveryEndpoint(clientId: string, linkId: string) {
    const tenantId = this.context.requireTenantId();
    const link = await this.prisma.clientChannelLink.findUnique({
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
      address = this.encryption.decrypt(link.deliveryAddressEncrypted);
    } catch {
      return null;
    }
    if (
      (link.provider === 'telegram' && !/^[1-9][0-9]{0,19}$/.test(address)) ||
      (link.provider === 'maya_user' &&
        !/^[A-Za-z0-9._:-]{1,240}$/.test(address)) ||
      !['telegram', 'maya_user'].includes(link.provider) ||
      clientChannelSubjectHash(
        this.encryption,
        link.provider as 'telegram' | 'maya_user',
        address,
      ) !== link.providerSubjectHash
    )
      return null;
    try {
      await this.links.assertClientEligible(this.prisma, tenantId, clientId);
    } catch {
      return null;
    }
    if (link.provider === 'maya_user') {
      const user = await this.prisma.user.findUnique({
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
        marketing_decided: Boolean(
          await tx.clientConsentFact.findFirst({
            where: {
              tenantId: channel.tenantId,
              clientId: links[0].clientId,
              kind: 'marketing',
            },
            select: { id: true },
          }),
        ),
        client_link_required: false,
      };
    });
  }

  /**
   * B16 read-only booking projection. Channel authentication and the exact
   * active ClientChannelLink select the Client before any PII is read. The
   * legacy channel id, phone and caller payload never participate in identity
   * resolution, and this reader creates no Client, link or consent fact.
   */
  async bookingPrefill(channelProof: string) {
    const identity = await this.prisma.$transaction(async (tx) => {
      const channel = await this.channels.authenticate(channelProof, tx);
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId: channel.tenantId,
          provider: channel.provider,
          providerSubjectHash: channel.providerSubjectHash,
          revokedAt: null,
          verificationVersion: 1,
          subjectHashVersion: 1,
        },
        take: 2,
      });
      if (links.length !== 1) return null;

      const client = await tx.client.findUnique({
        where: {
          id_tenantId: {
            id: links[0].clientId,
            tenantId: channel.tenantId,
          },
        },
        select: {
          id: true,
          tenantId: true,
          mergedIntoClientId: true,
          user: {
            select: {
              tenantId: true,
              status: true,
              phone: true,
              encryptedName: true,
            },
          },
          crmLinks: {
            where: { unlinkedAt: null },
            select: { provider: true, externalId: true },
          },
        },
      });
      if (!client || client.mergedIntoClientId) return null;

      const profile = await tx.customerProfile.findUnique({
        where: {
          tenantId_clientId: {
            tenantId: channel.tenantId,
            clientId: client.id,
          },
        },
        select: { privacyConsentAt: true },
      });
      return {
        tenantId: channel.tenantId,
        clientId: client.id,
        privacy: Boolean(profile?.privacyConsentAt),
        user: client.user,
        crmLinks: client.crmLinks,
      };
    });

    if (!identity)
      return {
        linked: false,
        known: false,
        has_phone: false,
        name: '',
        phone: '',
        client_link_required: true,
      };
    if (!identity.privacy)
      return {
        linked: true,
        known: true,
        needs_consent: true,
        has_phone: false,
        name: '',
        phone: '',
        client_link_required: false,
      };

    let name = '';
    let phone = '';
    if (
      identity.user?.tenantId === identity.tenantId &&
      identity.user.status === 'active'
    ) {
      phone = identity.user.phone?.trim() ?? '';
      if (identity.user.encryptedName) {
        try {
          name = this.encryption.decrypt(identity.user.encryptedName).trim();
        } catch {
          name = '';
        }
      }
    }

    if (!name || !phone) {
      try {
        const registry = await this.crm.getClientRegistry(identity.tenantId);
        const exactLinks = identity.crmLinks.filter(
          (link) => link.provider === registry.provider,
        );
        if (exactLinks.length === 1) {
          const matches = registry.clients.filter(
            (candidate) => candidate.external_id === exactLinks[0].externalId,
          );
          if (matches.length === 1) {
            name ||= matches[0].name?.trim() ?? '';
            phone ||= matches[0].phone?.trim() ?? '';
          }
        }
      } catch {
        // A provider read failure is an unavailable prefill, never a fallback
        // to a legacy channel/phone identity or a reason to expose other PII.
      }
    }

    const phoneDigits = phone.replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 10;
    return {
      linked: true,
      known: true,
      has_phone: hasPhone,
      name,
      phone: hasPhone ? phone : '',
      client_link_required: false,
    };
  }

  /** AC4 delivery reader. Caller must be the configured internal transport;
   * recipient id selects an existing verified link and never creates authority.
   * This is intentionally unavailable as a public channel authentication path.
   */
  async telegramDeliveryConsent(subject: string) {
    if (!/^[1-9][0-9]{0,19}$/.test(subject))
      throw new BadRequestException(
        'Exact Telegram delivery recipient required',
      );
    const tenantId = this.context.requireTenantId();
    const links = await this.prisma.clientChannelLink.findMany({
      where: {
        tenantId,
        provider: 'telegram',
        providerSubjectHash: clientChannelSubjectHash(
          this.encryption,
          'telegram',
          subject,
        ),
        revokedAt: null,
        verificationVersion: 1,
        subjectHashVersion: 1,
      },
      take: 2,
    });
    if (links.length !== 1)
      return { privacy: false, marketing: false, marketing_decided: false };
    const profile = await this.prisma.customerProfile.findFirst({
      where: { tenantId, clientId: links[0].clientId },
    });
    const decision = await this.prisma.clientConsentFact.findFirst({
      where: { tenantId, clientId: links[0].clientId, kind: 'marketing' },
      select: { id: true },
    });
    return {
      privacy: Boolean(profile?.privacyConsentAt),
      marketing: Boolean(profile?.marketingConsentAt),
      marketing_decided: Boolean(decision),
    };
  }
}
