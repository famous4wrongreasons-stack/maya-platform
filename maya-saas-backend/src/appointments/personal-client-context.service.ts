import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { clientChannelSubjectHash } from '../crm/client-channel-subject';
import { lockClientChannelIdentity } from '../crm/client-channel-link.service';

/** Server-only, request-local selection. Never a role, session mutation or bearer token. */
export interface PersonalClientContext {
  readonly kind: 'personal_client';
  readonly tenantId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly membershipId: string;
  readonly membershipRole: string;
  readonly linkId: string;
  readonly clientId: string;
  readonly verificationEvidenceHash: string;
  readonly evidenceRefs: readonly string[];
  revalidate(): Promise<void>;
}

@Injectable()
export class PersonalClientContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
  ) {}

  async select(
    user: AuthenticatedUser,
    selection: unknown,
  ): Promise<PersonalClientContext> {
    if (selection !== 'personal_client')
      throw new ForbiddenException('explicit_personal_client_context_required');
    // Snapshot the authenticated principal, never capture a mutable request body.
    const actor = { ...user };
    const read = () => this.readCurrent(actor);
    const selected = await read();
    return Object.freeze({
      kind: 'personal_client' as const,
      ...selected,
      evidenceRefs: Object.freeze([
        'personal-context:v1:personal_client',
        `personal-actor-user:v1:${selected.userId}`,
        `personal-actor-session:v1:${selected.sessionId}`,
        `personal-actor-membership:v1:${selected.membershipId}`,
        `personal-actor-role:v1:${selected.membershipRole}`,
      ]),
      revalidate: async () => {
        const current = await read();
        if (JSON.stringify(current) !== JSON.stringify(selected))
          throw new ForbiddenException('personal_client_context_changed');
      },
    });
  }

  private async readCurrent(user: AuthenticatedUser) {
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
    return this.prisma.$transaction(async (tx) => {
      await lockClientChannelIdentity(tx, tenantId, 'maya_user', subject);
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
      );
      const session = await tx.authSession.findUnique({
        where: { id: user.sessionId },
        include: { user: true, membership: true },
      });
      const membership = session?.membership;
      if (
        !session ||
        session.tenantId !== tenantId ||
        session.userId !== user.userId ||
        session.revokedAt ||
        session.expiresAt <= clock.now ||
        session.user.id !== user.userId ||
        session.user.status !== 'active' ||
        !membership ||
        membership.id !== user.membershipId ||
        membership.userId !== user.userId ||
        membership.tenantId !== tenantId ||
        membership.status !== 'active' ||
        membership.role.toString() !== user.role.toString()
      )
        throw new ForbiddenException('personal_client_session_inactive');
      const links = await tx.clientChannelLink.findMany({
        where: {
          tenantId,
          provider: 'maya_user',
          providerSubjectHash: subject,
          revokedAt: null,
        },
        take: 2,
      });
      const link = links[0];
      if (
        links.length !== 1 ||
        link.tenantId !== tenantId ||
        link.provider !== 'maya_user' ||
        link.providerSubjectHash !== subject ||
        link.revokedAt ||
        link.verificationVersion !== 1 ||
        link.subjectHashVersion !== 1 ||
        !/^[a-f0-9]{64}$/.test(link.verificationIdentityHash) ||
        !/^[a-f0-9]{64}$/.test(link.verificationEvidenceHash)
      )
        throw new ForbiddenException('new_verified_maya_user_binding_required');
      const client = await tx.client.findUnique({
        where: { id_tenantId: { id: link.clientId, tenantId } },
        include: { crmLinks: { where: { unlinkedAt: null } } },
      });
      if (
        !client ||
        client.tenantId !== tenantId ||
        client.mergedIntoClientId ||
        (client.crmLinks.length &&
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
          })))
      )
        throw new ForbiddenException('client_identity_unresolved');
      return {
        tenantId,
        userId: user.userId,
        sessionId: session.id,
        membershipId: membership.id,
        membershipRole: membership.role,
        linkId: link.id,
        clientId: link.clientId,
        verificationEvidenceHash: link.verificationEvidenceHash,
      };
    });
  }
}
