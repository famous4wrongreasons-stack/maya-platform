import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelRuntimeService } from '../crm/client-channel-runtime.service';
import { C9Principal, c9Hash } from './c9.contract';

/** Resolves current authenticated context, never IDs or role claims supplied by an agent. */
@Injectable()
export class C9Authority {
  constructor(
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelRuntimeService,
  ) {}
  async current(
    tx: Prisma.TransactionClient,
    channelProof?: string,
  ): Promise<C9Principal> {
    const ctx = this.context.get(),
      tenantId = this.context.requireTenantId();
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant?.status !== 'active') this.deny();
    if (channelProof) {
      const link = await this.channels.resolve(channelProof, tx);
      return {
        kind: 'CLIENT_CHANNEL',
        tenantId,
        userId: null,
        membershipId: null,
        clientId: link.clientId,
        channelLinkId: link.linkId,
        branchRefs: [],
        staffRef: null,
        proofHash: c9Hash('verified-client/1', [
          link.tenantId,
          link.clientId,
          link.linkId,
          link.resolutionEvidenceHash,
        ]),
      };
    }
    if (
      !ctx?.userId ||
      ![
        'membership',
        'auth_session',
        'custom_domain',
        'subdomain',
        'route_slug',
      ].includes(ctx.source ?? '')
    )
      this.deny();
    const members = await tx.$queryRaw<
      { id: string; userId: string; branchId: string | null; role: string }[]
    >`SELECT m.id,m."userId",m."branchId",m.role FROM "Membership" m JOIN "User" u ON u.id=m."userId" WHERE m."tenantId"=${tenantId} AND m."userId"=${ctx.userId} AND m.status='active' AND u.status='active' FOR SHARE OF m,u`;
    const eligible = ctx.membershipId
      ? members.filter((m) => m.id === ctx.membershipId)
      : members;
    if (eligible.length !== 1) this.deny();
    const m = eligible[0];
    const staff = await tx.staff.findMany({
      where: {
        tenantId,
        userId: m.userId,
        active: true,
        ...(m.branchId ? { branchId: m.branchId } : {}),
      },
      select: { id: true },
      take: 2,
    });
    if (
      ['staff', 'provider', 'employee'].includes(m.role) &&
      staff.length !== 1
    )
      this.deny();
    return {
      kind: 'USER',
      tenantId,
      userId: m.userId,
      membershipId: m.id,
      clientId: null,
      channelLinkId: null,
      branchRefs: m.branchId ? [m.branchId] : [],
      staffRef: staff.length === 1 ? staff[0].id : null,
      proofHash: c9Hash('membership/1', [
        tenantId,
        m.id,
        m.userId,
        m.branchId,
        m.role,
      ]),
    };
  }
  private deny(): never {
    throw new ForbiddenException('c9_current_principal_required');
  }
}
