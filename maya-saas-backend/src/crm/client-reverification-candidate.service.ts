import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { normalizeRussianPhone } from '../common/phone.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { lockClientChannelIdentity } from './client-channel-link.service';
import { clientChannelSubjectHash } from './client-channel-subject';
import { CrmService } from './crm.service';

/** A candidate for a fresh challenge, NEVER a Client authority proof.
 * The challenge coordinator revalidates this candidate under its identity lock.
 */
@Injectable()
export class ClientReverificationCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
  ) {}

  async resolve(user: AuthenticatedUser) {
    const actor = { ...user };
    const before = await this.lineage(actor);
    // Exact provider/externalId lookup. No phone-search or User.phone fallback.
    const registry = await this.crm.getClientRegistry(before.tenantId);
    if (registry.complete !== true)
      throw new ForbiddenException('canonical_client_channel_unavailable');
    const sources = before.crmLinks.filter(
      (l) => l.provider === registry.provider,
    );
    if (sources.length !== 1)
      throw new ForbiddenException('canonical_client_channel_ambiguous');
    const source = sources[0];
    const matches = registry.clients.filter(
      (c) => c.external_id === source.externalId,
    );
    if (matches.length !== 1 || !matches[0].phone)
      throw new ForbiddenException('canonical_client_channel_unavailable');
    const phone = normalizeRussianPhone(matches[0].phone);
    // Re-read local lineage after the external read; the coordinator must also
    // resolve again at consumption and compare the entire persisted binding.
    const after = await this.lineage(actor);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new ForbiddenException('client_reverification_lineage_changed');
    return Object.freeze({
      lineageHash: this.encryption.opaqueReference(
        'sb1.lineage.v2',
        JSON.stringify(before),
      ),
      tenantId: before.tenantId,
      userId: before.userId,
      providerSubjectHash: before.providerSubjectHash,
      clientId: before.clientId,
      predecessorLinkId: before.predecessorLinkId,
      verificationChannel: Object.freeze({
        kind: 'sms' as const,
        crmLinkId: source.id,
        addressHash: this.encryption.opaqueReference(
          'sb1.client-reverification.channel.v1',
          JSON.stringify([
            before.tenantId,
            before.clientId,
            source.id,
            source.provider,
            source.externalId,
            phone,
          ]),
        ),
      }),
      // Ephemeral server-only delivery address. Never return this object over
      // HTTP, persist its plaintext phone, or use it as verified authority.
      deliveryPhone: phone,
    });
  }

  async assertCurrentInTransaction(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    candidate: Awaited<
      ReturnType<ClientReverificationCandidateService['resolve']>
    >,
  ) {
    const current = await this.lineage(user, tx);
    if (
      this.encryption.opaqueReference(
        'sb1.lineage.v2',
        JSON.stringify(current),
      ) !== candidate.lineageHash
    )
      throw new ForbiddenException('client_reverification_lineage_changed');
  }

  private async lineage(
    user: AuthenticatedUser,
    transaction?: Prisma.TransactionClient,
  ) {
    if (!user.tenantId || !user.sessionId || !user.membershipId)
      throw new ForbiddenException('tenant_qualified_account_required');
    const tenantId = this.context.assertTenantId(user.tenantId);
    if (this.context.get()?.userId !== user.userId)
      throw new ForbiddenException('authenticated_account_required');
    const subject = clientChannelSubjectHash(
      this.encryption,
      'maya_user',
      user.userId,
    );
    const work = async (tx: Prisma.TransactionClient) => {
      await lockClientChannelIdentity(tx, tenantId, 'maya_user', subject);
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
      );
      const session = await tx.authSession.findUnique({
        where: { id: user.sessionId },
        include: { user: true, membership: true },
      });
      const member = session?.membership;
      if (
        !session ||
        session.userId !== user.userId ||
        session.tenantId !== tenantId ||
        session.revokedAt ||
        session.expiresAt <= clock.now ||
        session.user.id !== user.userId ||
        session.user.status !== 'active' ||
        !member ||
        member.id !== user.membershipId ||
        member.userId !== user.userId ||
        member.tenantId !== tenantId ||
        member.status !== 'active' ||
        member.role.toString() !== user.role.toString()
      )
        throw new ForbiddenException('client_reverification_session_inactive');
      const clients = await tx.client.findMany({
        where: { tenantId, userId: user.userId },
        include: {
          crmLinks: { where: { unlinkedAt: null }, orderBy: { id: 'asc' } },
        },
        take: 2,
      });
      if (
        clients.length !== 1 ||
        clients[0].mergedIntoClientId ||
        clients[0].tenantId !== tenantId ||
        clients[0].userId !== user.userId
      )
        throw new ForbiddenException(
          'client_reverification_candidate_ambiguous',
        );
      const client = clients[0];
      const tips = await tx.clientChannelLink.findMany({
        where: {
          tenantId,
          provider: 'maya_user',
          providerSubjectHash: subject,
          successors: { none: {} },
        },
        take: 2,
      });
      const prior = tips[0];
      if (
        tips.length !== 1 ||
        !prior.revokedAt ||
        prior.tenantId !== tenantId ||
        prior.provider !== 'maya_user' ||
        prior.providerSubjectHash !== subject ||
        prior.clientId !== client.id ||
        prior.subjectHashVersion !== 1 ||
        prior.verificationVersion !== 1
      )
        throw new ForbiddenException(
          'latest_revoked_exact_client_predecessor_required',
        );
      const holds =
        client.crmLinks.length &&
        (await tx.unresolvedClientIdentityHold.findFirst({
          where: {
            tenantId,
            resolvedAt: null,
            OR: client.crmLinks.map((l) => ({
              provider: l.provider,
              externalId: l.externalId,
            })),
          },
          select: { id: true },
        }));
      if (holds) throw new ForbiddenException('client_identity_unresolved');
      return {
        tenantId,
        userId: user.userId,
        providerSubjectHash: subject,
        clientId: client.id,
        predecessorLinkId: prior.id,
        crmLinks: client.crmLinks.map((l) => ({
          id: l.id,
          provider: l.provider,
          externalId: l.externalId,
        })),
      };
    };
    return transaction ? work(transaction) : this.prisma.$transaction(work);
  }
}
