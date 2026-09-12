import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

// Fixed tenant event categories; no dynamic prefix supplied by a caller.
export const TENANT_AUDIT_EVENTS = {
  'appointment.created': 'appointment',
  'appointment.cancelled': 'appointment',
  'appointment.rescheduled': 'appointment',
  'appointment.previewed': 'appointment',
  'tenant.updated': 'tenant',
  'expense.created': 'expense',
  'expense.updated': 'expense',
  'expense.deleted': 'expense',
} as const;
export type TenantAuditQuery = {
  from?: string;
  to?: string;
  limit?: string;
  cursor?: string;
};

/** Q21: bounded read only. AuditLogService remains the sole audit writer. */
@Injectable()
export class TenantAuditReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  private async authority(tenantId: string, userId: string) {
    const ctx = this.context.get();
    if (
      !ctx ||
      ctx.tenantId !== tenantId ||
      ctx.userId !== userId ||
      !['membership', 'auth_session'].includes(ctx.source ?? '')
    )
      throw new ForbiddenException('tenant_audit_principal_required');
    const member = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { status: true } },
        tenant: { select: { status: true } },
      },
    });
    if (
      !member ||
      member.status !== 'active' ||
      member.user.status !== 'active' ||
      member.tenant.status !== 'active' ||
      !['tenant_owner', 'business_owner'].includes(member.role) ||
      member.role !== ctx.role ||
      (ctx.membershipId && member.id !== ctx.membershipId)
    )
      throw new ForbiddenException('tenant_audit_owner_required');
  }

  async read(
    tenantId: string,
    userId: string,
    query: TenantAuditQuery,
    now = new Date(),
  ) {
    await this.authority(tenantId, userId);
    if (
      Object.keys(query).some(
        (key) => !['from', 'to', 'limit', 'cursor'].includes(key),
      )
    )
      throw new BadRequestException('tenant_audit_query_invalid');
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 31 * 86400000);
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (
      ![from, to].every((d) => Number.isFinite(d.getTime())) ||
      from >= to ||
      to > now ||
      to.getTime() - from.getTime() > 31 * 86400000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('tenant_audit_bounds_invalid');
    let cursor: { createdAt: Date; id: string } | null = null;
    if (query.cursor) {
      try {
        if (query.cursor.length > 512) throw new Error();
        const decoded: unknown = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8'),
        );
        if (
          !Array.isArray(decoded) ||
          decoded.length !== 4 ||
          decoded[0] !== tenantId ||
          decoded[1] !== from.toISOString() + '/' + to.toISOString() ||
          typeof decoded[2] !== 'string' ||
          typeof decoded[3] !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(decoded[3])
        )
          throw new Error();
        cursor = { createdAt: new Date(decoded[2]), id: decoded[3] };
        if (
          !Number.isFinite(cursor.createdAt.getTime()) ||
          cursor.createdAt < from ||
          cursor.createdAt >= to
        )
          throw new Error();
      } catch {
        throw new BadRequestException('tenant_audit_cursor_invalid');
      }
    }
    const where: Prisma.AuditLogWhereInput = {
      scope: 'tenant',
      tenantId,
      createdAt: { gte: from, lt: to },
      OR: Object.entries(TENANT_AUDIT_EVENTS).map(([action, entityType]) => ({
        action,
        entityType,
      })),
      ...(cursor
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : {}),
    };
    const rows = await canonicalUtcTransaction(
      this.prisma,
      (tx) =>
        tx.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: { id: true, createdAt: true, action: true, entityType: true },
        }),
      { readOnly: true },
    );
    // No raw metadata is fetched; no platform or entity/person identifiers are projected.
    await this.authority(tenantId, userId);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      items: page,
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify([
                tenantId,
                from.toISOString() + '/' + to.toISOString(),
                last.createdAt.toISOString(),
                last.id,
              ]),
            ).toString('base64url')
          : null,
    };
  }
}
