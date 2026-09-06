import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { clientChannelSubjectHash } from './client-channel-subject';

type ReadChannel = {
  tenantId: string;
  provider: 'maya_user' | 'telegram';
  providerSubjectHash: string;
};
const MANAGERS = [
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
];

/** B28: an account is a channel subject, never CustomerProfile ownership.
 * Exact verified Client identity and projection share one READ ONLY snapshot.
 * Habits stay in their approved B7 presentation boundary; never returned here.
 */
@Injectable()
export class ClientProfileReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
  ) {}

  forAccount(tenantId: string, userId: string) {
    this.context.assertTenantId(tenantId);
    if (this.context.get()?.userId !== userId)
      throw new ForbiddenException('Authenticated account required');
    return this.read(async (tx) => {
      await this.accountMembership(tx, tenantId, userId);
      return this.channelClient(tx, {
        tenantId,
        provider: 'maya_user',
        providerSubjectHash: clientChannelSubjectHash(
          this.encryption,
          'maya_user',
          userId,
        ),
      });
    });
  }

  forChannel(proof: string) {
    return this.read(async (tx) =>
      this.channelClient(tx, await this.channels.authenticate(proof, tx)),
    );
  }

  /** Existing customer-manager authority, with an exact verified target.
   * This does not grant staff access to Client-stated habits. */
  forStaffAccount(tenantId: string, userId: string) {
    return this.read(async (tx) => {
      await this.staffMembership(tx, tenantId, MANAGERS);
      await this.accountMembership(tx, tenantId, userId);
      return this.channelClient(tx, {
        tenantId,
        provider: 'maya_user',
        providerSubjectHash: clientChannelSubjectHash(
          this.encryption,
          'maya_user',
          userId,
        ),
      });
    }, true);
  }

  private async accountMembership(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const membership = await tx.membership.findFirst({
      where: { tenantId, userId, status: 'active', user: { status: 'active' } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('Active account required');
    return membership;
  }

  private async staffMembership(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roles: string[],
  ) {
    this.context.assertTenantId(tenantId);
    const actor = this.context.get();
    if (!actor?.userId || !actor.role || !roles.includes(actor.role))
      throw new ForbiddenException('Canonical staff authority required');
    const membership = await this.accountMembership(tx, tenantId, actor.userId);
    if (membership.role !== actor.role)
      throw new ForbiddenException('Canonical staff authority required');
  }

  private async channelClient(
    tx: Prisma.TransactionClient,
    channel: ReadChannel,
  ) {
    this.context.assertTenantId(channel.tenantId);
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
      links[0].subjectHashVersion !== 1 ||
      links[0].verificationVersion !== 1
    )
      throw new ForbiddenException('client_link_required');
    return { tenantId: channel.tenantId, clientId: links[0].clientId };
  }

  private read(
    resolve: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ tenantId: string; clientId: string }>,
    staff = false,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const { tenantId, clientId } = await resolve(tx);
        this.context.assertTenantId(tenantId);
        const client = await tx.client.findUnique({
          where: { id_tenantId: { id: clientId, tenantId } },
          select: {
            mergedIntoClientId: true,
            crmLinks: {
              where: { unlinkedAt: null },
              select: { provider: true, externalId: true },
            },
          },
        });
        if (!client || client.mergedIntoClientId)
          throw new ForbiddenException('client_identity_unresolved');
        if (
          client.crmLinks.length &&
          (await tx.unresolvedClientIdentityHold.findFirst({
            where: { tenantId, resolvedAt: null, OR: client.crmLinks },
            select: { id: true },
          }))
        )
          throw new ForbiddenException('client_identity_unresolved');
        const profile = await tx.customerProfile.findUnique({
          where: { tenantId_clientId: { tenantId, clientId } },
          select: {
            id: true,
            tenantId: true,
            clientId: true,
            preferredLocale: true,
            privacyConsentAt: true,
            marketingConsentAt: true,
            updatedAt: true,
            ...(staff ? { encryptedNotes: true } : {}),
          },
        });
        if (
          profile &&
          (profile.clientId !== clientId || profile.tenantId !== tenantId)
        )
          throw new ForbiddenException('client_profile_identity_mismatch');
        return {
          clientId,
          profile: {
            profile_id: profile?.id ?? null,
            preferred_locale: profile?.preferredLocale ?? null,
            privacy_consent_at: profile?.privacyConsentAt ?? null,
            marketing_consent_at: profile?.marketingConsentAt ?? null,
            updated_at: profile?.updatedAt ?? null,
            ...(staff
              ? {
                  notes: profile?.encryptedNotes
                    ? this.encryption.decrypt(profile.encryptedNotes)
                    : null,
                }
              : {}),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
