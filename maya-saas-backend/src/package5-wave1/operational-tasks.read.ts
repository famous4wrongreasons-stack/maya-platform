import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  dayIsoRange,
  localCalendarDate,
} from '../owner-reports/owner-reports.time';
import { GOVERNED_STAFF_ROLES } from './governed-settings.contract';

const LIMIT = 100;
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** A23 facts only. Inbox is an optional locator, never the task's state owner.
 * NULL-linked pre-cutover history stays explicitly unverified and read-only.
 * No projection repair, delivery, action admission or execution occurs here. */
export async function readOwnOperationalTasks(
  prisma: PrismaService,
  context: TenantContextService,
  tenantId: string,
  userId: string,
  filters: { status: string; period: string },
) {
  const { status, period } = filters;
  if (
    !['active', 'all'].includes(status) ||
    !['today', 'overdue', 'all'].includes(period)
  )
    throw new BadRequestException('Invalid own task filters');
  const authorize = async () => {
    context.assertTenantId(tenantId);
    if (context.get()?.userId !== userId)
      throw new ForbiddenException('Exact task reader required');
    const member = await prisma.membership.findUnique({
      where: { userId_tenantId: { tenantId, userId } },
      select: {
        status: true,
        role: true,
        user: { select: { status: true } },
        tenant: { select: { status: true } },
      },
    });
    if (
      !member ||
      member.status !== 'active' ||
      member.user.status !== 'active' ||
      member.tenant.status !== 'active' ||
      !GOVERNED_STAFF_ROLES.has(member.role)
    )
      throw new ForbiddenException('Current staff membership required');
  };
  await authorize();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultTimezone: true },
  });
  const timezone = tenant?.defaultTimezone;
  if (!timezone)
    throw new ServiceUnavailableException('Task timezone unavailable');
  const now = new Date();
  let today: string;
  let day: { from: string; to: string };
  try {
    today = localCalendarDate(timezone, now);
    day = dayIsoRange(timezone, today);
  } catch {
    throw new ServiceUnavailableException('Task timezone unavailable');
  }
  const rows = await prisma.operationalWorkItem.findMany({
    where: {
      tenantId,
      assigneeUserId: userId,
      kind: 'task',
      status: status === 'active' ? 'OPEN' : { in: ['OPEN', 'COMPLETED'] },
      ...(period === 'today'
        ? { dueAt: { gte: new Date(day.from), lte: new Date(day.to) } }
        : period === 'overdue'
          ? { dueAt: { lt: new Date(day.from) } }
          : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: LIMIT + 1,
    select: {
      bodyText: true,
      status: true,
      dueAt: true,
      createdAt: true,
      inboxItems: {
        where: { tenantId, userId, type: 'maya_task', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 1,
      },
    },
  });
  const historical = await prisma.inboxItem.findMany({
    where: {
      tenantId,
      userId,
      type: 'maya_task',
      operationalWorkItemId: null,
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: LIMIT + 1,
    select: { id: true, bodyText: true, payloadJson: true, createdAt: true },
  });
  await authorize();
  const tasks = rows.slice(0, LIMIT).map((row) => ({
    id: row.inboxItems[0]?.id ?? null,
    canonical: true as const,
    task: row.bodyText.slice(0, 4000),
    content_truncated: row.bodyText.length > 4000,
    status:
      row.status === 'COMPLETED' ? ('completed' as const) : ('active' as const),
    due_at: row.dueAt?.toISOString() ?? null,
    // dueAt is an instant (including the native owner API); filtering and
    // presentation must use the same tenant-local day, never its UTC day.
    due_date: row.dueAt ? localCalendarDate(timezone, row.dueAt) : null,
    created_at: row.createdAt.toISOString(),
  }));
  const historicalTasks = historical.slice(0, LIMIT).map((row) => {
    const payload = record(row.payloadJson);
    const recordedStatus = ['active', 'completed'].includes(
      String(payload.status),
    )
      ? String(payload.status)
      : null;
    const date =
      typeof payload.due_date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.due_date) &&
      Number.isFinite(Date.parse(`${payload.due_date}T00:00:00Z`)) &&
      new Date(`${payload.due_date}T00:00:00Z`).toISOString().slice(0, 10) ===
        payload.due_date
        ? payload.due_date
        : null;
    return {
      id: row.id,
      canonical: false as const,
      read_only: true as const,
      task: row.bodyText.slice(0, 4000),
      content_truncated: row.bodyText.length > 4000,
      status: 'unverified' as const,
      recorded_status: recordedStatus,
      due_date: date,
      created_at: row.createdAt.toISOString(),
    };
  });
  const canonicalTruncated = rows.length > LIMIT;
  const historicalTruncated = historical.length > LIMIT;
  return {
    contract: 'maya.own-operational-tasks/1' as const,
    source: 'OperationalWorkItem' as const,
    scope: 'authenticated_user' as const,
    timezone,
    as_of: now.toISOString(),
    as_of_date: today,
    filters: { status, period },
    tasks,
    count: tasks.length,
    historical_tasks: historicalTasks,
    historical_count: historicalTasks.length,
    historical_scope: 'unfiltered_retained_history' as const,
    canonical_truncated: canonicalTruncated,
    historical_truncated: historicalTruncated,
    truncated: canonicalTruncated || historicalTruncated,
  };
}
