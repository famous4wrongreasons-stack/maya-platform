import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export const ACTIVE_MEMBERSHIP_STATUS = 'active';

/**
 * The membership as an in-transaction reader sees it: this row's own columns, nothing joined. `role` is
 * the LIVE role — the value another connection must take this row's lock to change while the reading
 * transaction is open.
 */
export interface ActiveMembershipInTransaction {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly role: string;
}

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * R6-4 (GATES-PLAN-V11 P-PRINCIPAL) — the live role, read inside the CALLER's transaction under
   * `FOR SHARE`.
   *
   * Block B B-02 of the widget contract V1.1 (C11:7189-7191): "The live role comes from the Membership
   * read inside the request transaction (FOR SHARE, `m.id === authority.membershipId`)." The caller has
   * already resolved a principal; this answers one question about THAT membership, inside the same
   * transaction, so the row cannot change role between the answer and the decision made from it.
   *
   * Four properties are deliberate:
   *   - the row is identified by `m.id`, with `userId` and `tenantId` as further conditions rather than
   *     as the key, so a membership id belonging to another user or another tenant returns null rather
   *     than a row;
   *   - it returns `null` for "no such active membership" and never throws for it. What a missing row
   *     means is the caller's decision to make (the widget layer maps it to `principal: null`, which
   *     Gate 3 refuses); a service that threw would make that decision for every caller;
   *   - it takes the caller's transaction client and never `this.prisma`. The same read on another
   *     connection would take no lock inside the caller's transaction, which is exactly what B-02 asks
   *     for;
   *   - `FOR SHARE`, not `FOR UPDATE`: the reader does not intend to write the row, two readers must not
   *     block each other, and only a concurrent WRITER of this membership waits — until the caller's
   *     transaction ends.
   */
  async activeMembershipInTransaction(
    tx: Prisma.TransactionClient,
    membershipId: string,
    userId: string,
    tenantId: string,
  ): Promise<ActiveMembershipInTransaction | null> {
    const rows = await tx.$queryRaw<ActiveMembershipInTransaction[]>`
      SELECT m.id, m."userId", m."tenantId", m."branchId", m.role
      FROM "Membership" m
      WHERE m.id = ${membershipId}
        AND m."userId" = ${userId}
        AND m."tenantId" = ${tenantId}
        AND m.status = ${ACTIVE_MEMBERSHIP_STATUS}
      FOR SHARE OF m
    `;
    return rows.length === 1 ? rows[0] : null;
  }

  async getActiveMembership(userId: string, tenantId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
    });

    if (
      !membership ||
      membership.status !== ACTIVE_MEMBERSHIP_STATUS ||
      !new Set(['trial', 'active', 'past_due']).has(membership.tenant.status)
    ) {
      throw new UnauthorizedException('Active tenant membership is required');
    }

    return membership;
  }
}
