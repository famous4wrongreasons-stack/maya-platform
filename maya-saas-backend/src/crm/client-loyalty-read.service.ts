import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
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
// Existing clients.dossier.read audience; this reader does not grant an AI capability.
const DOSSIER_ROLES = [
  ...MANAGERS,
  'branch_manager',
  'accountant',
  'provider',
  'employee',
  'staff',
];

/** B27: private value queries never establish accounts or import provider value.
 * Identity, hold and value reads share one PostgreSQL read-only snapshot.
 */
@Injectable()
export class ClientLoyaltyReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly encryption: EncryptionService,
  ) {}

  forAccount(tenantId: string, userId: string, history = false, limit = 50) {
    this.context.assertTenantId(tenantId);
    if (this.context.get()?.userId !== userId)
      throw new ForbiddenException('Authenticated account required');
    return this.read(
      async (tx) => {
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
      },
      history,
      limit,
    );
  }

  forChannel(proof: string, history = false, limit = 50) {
    return this.read(
      async (tx) =>
        this.channelClient(tx, await this.channels.authenticate(proof, tx)),
      history,
      limit,
    );
  }

  forClient(tenantId: string, clientId: string, history = false, limit = 50) {
    this.context.assertTenantId(tenantId);
    const userId = this.context.get()?.userId;
    if (!userId) throw new ForbiddenException('Authenticated channel required');
    return this.read(
      async (tx) => {
        await this.accountMembership(tx, tenantId, userId);
        const identity = await this.channelClient(tx, {
          tenantId,
          provider: 'maya_user',
          providerSubjectHash: clientChannelSubjectHash(
            this.encryption,
            'maya_user',
            userId,
          ),
        });
        if (identity.clientId !== clientId)
          throw new ForbiddenException('client_link_required');
        return identity;
      },
      history,
      limit,
    );
  }

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
    });
  }

  /** Exact CRM discovery target, never a phone or a reverse first-link choice.
   * The existing single tenant integration qualifies the provider namespace.
   * Only a verified linked Client's canonical account is projected; no CRM card.
   */
  forStaffCrmClient(tenantId: string, externalId: string) {
    return this.read(async (tx) => {
      await this.staffMembership(tx, tenantId, DOSSIER_ROLES);
      const integration = await tx.crmIntegration.findUnique({
        where: { tenantId },
        select: { provider: true, status: true },
      });
      if (!integration || integration.status !== 'active' || !externalId)
        throw new ForbiddenException('client_link_required');
      const link = await tx.crmClientLink.findUnique({
        where: {
          tenantId_provider_externalId: {
            tenantId,
            provider: integration.provider,
            externalId,
          },
        },
        select: { clientId: true, unlinkedAt: true },
      });
      if (!link || link.unlinkedAt)
        throw new ForbiddenException('client_link_required');
      const verified = await tx.clientChannelLink.findFirst({
        where: {
          tenantId,
          clientId: link.clientId,
          revokedAt: null,
          subjectHashVersion: 1,
          verificationVersion: 1,
        },
        select: { id: true },
      });
      if (!verified) throw new ForbiddenException('client_link_required');
      return { tenantId, clientId: link.clientId };
    });
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
    history = false,
    limit = 50,
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
        const account = await tx.loyaltyAccount.findUnique({
          where: { tenantId_clientId: { tenantId, clientId } },
        });
        if (!account)
          throw new ConflictException({
            message: 'Client-owned loyalty account is not established.',
            error: { code: 'loyalty_account_not_established' },
          });
        const transactions = history
          ? await tx.loyaltyTransaction.findMany({
              where: { tenantId, accountId: account.id },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: Number.isFinite(limit)
                ? Math.min(Math.max(Math.trunc(limit), 1), 100)
                : 50,
            })
          : [];
        return {
          account_id: account.id,
          balance: account.balance,
          currency: 'RUB',
          source: account.source,
          authority: 'maya' as const,
          authoritative: 'maya' as const,
          authority_scope: 'resolved' as const,
          sync_status: 'current',
          stale: false,
          verification_required: false,
          warnings: [],
          synced_at: account.syncedAt,
          transactions: transactions.map((row) => ({
            id: row.id,
            kind: row.kind,
            delta: row.delta,
            balance_after: row.balanceAfter,
            reason: this.encryption.decrypt(row.encryptedReason),
            created_at: row.createdAt,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
