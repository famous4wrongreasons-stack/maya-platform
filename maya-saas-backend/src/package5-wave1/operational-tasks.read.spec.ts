import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave1CanonicalCutoverService } from './package5-wave1-canonical-cutover.service';

describe('A23 bounded own task facts', () => {
  const actor = { tenantId: 'tenant-a', userId: 'staff-a', role: 'staff' };
  const member = {
    role: 'staff',
    status: 'active',
    user: { status: 'active' },
    tenant: { status: 'active' },
  };
  const task = {
    bodyText: 'Проверить отмены',
    status: 'OPEN',
    dueAt: new Date('2026-10-08T22:00:00Z'),
    createdAt: new Date('2026-10-07T12:00:00Z'),
    inboxItems: [] as { id: string }[],
  };
  const historical = {
    id: 'old-inbox',
    bodyText: 'Историческое поручение',
    payloadJson: { status: 'active', due_date: '2026-10-08' },
    createdAt: task.createdAt,
  };
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T22:30:00Z')),
  );
  afterEach(() => jest.useRealTimers());
  function fixture(timezone = 'Europe/Moscow') {
    const prisma = {
      membership: { findUnique: jest.fn().mockResolvedValue(member) },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ defaultTimezone: timezone }),
      },
      operationalWorkItem: { findMany: jest.fn().mockResolvedValue([task]) },
      inboxItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const effects = {
      publishForTenant: jest.fn(),
      projectOperationalWorkItemCompletion: jest.fn(),
      execute: jest.fn(),
      resume: jest.fn(),
    };
    const context = new TenantContextService();
    const service = new Package5Wave1CanonicalCutoverService(
      prisma as unknown as PrismaService,
      context,
      effects as never,
      effects as never,
      effects as never,
      effects as never,
    );
    const read = (
      filters = { status: 'active', period: 'all' },
      user = actor,
    ) =>
      context.runAsAuthPrincipal(actor, () =>
        service.readOwnTasks(user.tenantId, user.userId, filters),
      );
    return { prisma, effects, service, context, read };
  }

  it('reads canonical rows without delivery or an extra ActionExecution-state admission gate', async () => {
    const f = fixture();
    expect(await f.read()).toMatchObject({
      contract: 'maya.own-operational-tasks/1',
      source: 'OperationalWorkItem',
      scope: 'authenticated_user',
      count: 1,
      truncated: false,
      tasks: [
        {
          id: null,
          canonical: true,
          task: task.bodyText,
          status: 'active',
          due_at: task.dueAt.toISOString(),
          due_date: '2026-10-09',
        },
      ],
    });
    expect(f.prisma.operationalWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          assigneeUserId: actor.userId,
          kind: 'task',
          status: 'OPEN',
        },
        take: 101,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    for (const effect of Object.values(f.effects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('uses only a retained exact-user Inbox locator while domain state remains authoritative', async () => {
    const f = fixture();
    f.prisma.operationalWorkItem.findMany.mockResolvedValue([
      { ...task, status: 'COMPLETED', inboxItems: [{ id: 'inbox-a' }] },
    ]);
    const result = await f.read({ status: 'all', period: 'all' });
    expect(result.tasks[0]).toMatchObject({
      id: 'inbox-a',
      status: 'completed',
    });
    const [query] = f.prisma.operationalWorkItem.findMany.mock.calls[0] as [
      { select: { inboxItems: unknown } },
    ];
    expect(query.select.inboxItems).toEqual({
      where: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        type: 'maya_task',
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 1,
    });
  });

  it.each([
    [
      'Europe/Moscow',
      '2026-10-08T22:30:00Z',
      '2026-10-08T22:00:00Z',
      '2026-10-09',
      '2026-10-08T21:00:00.000Z',
      '2026-10-09T20:59:59.999Z',
    ],
    [
      'America/New_York',
      '2026-11-01T12:00:00Z',
      '2026-11-02T04:30:00Z',
      '2026-11-01',
      '2026-11-01T04:00:00.000Z',
      '2026-11-02T04:59:59.999Z',
    ],
  ])(
    'filters today before the bound using the displayed local day in %s',
    async (timezone, now, due, day, from, to) => {
      jest.setSystemTime(new Date(now));
      const f = fixture(timezone);
      f.prisma.operationalWorkItem.findMany.mockResolvedValue([
        { ...task, dueAt: new Date(due) },
      ]);
      const result = await f.read({ status: 'all', period: 'today' });
      expect(result.as_of_date).toBe(day);
      expect(result.tasks[0]).toMatchObject({
        due_at: new Date(due).toISOString(),
        due_date: day,
      });
      expect(f.prisma.operationalWorkItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: actor.tenantId,
            assigneeUserId: actor.userId,
            kind: 'task',
            status: { in: ['OPEN', 'COMPLETED'] },
            dueAt: { gte: new Date(from), lte: new Date(to) },
          },
          take: 101,
        }),
      );
    },
  );

  it('filters overdue at the same local-day boundary before take, excluding undated rows in the database', async () => {
    const f = fixture();
    await f.read({ status: 'active', period: 'overdue' });
    expect(f.prisma.operationalWorkItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          assigneeUserId: actor.userId,
          kind: 'task',
          status: 'OPEN',
          dueAt: { lt: new Date('2026-10-08T21:00:00Z') },
        },
        take: 101,
      }),
    );
  });

  it('keeps NULL-linked history readable without claiming current state or inventing work bindings', async () => {
    const f = fixture();
    f.prisma.inboxItem.findMany.mockResolvedValue([historical]);
    const result = await f.read();
    expect(result.historical_tasks).toEqual([
      expect.objectContaining({
        id: 'old-inbox',
        canonical: false,
        read_only: true,
        status: 'unverified',
        recorded_status: 'active',
        due_date: '2026-10-08',
      }),
    ]);
    expect(result.historical_scope).toBe('unfiltered_retained_history');
    expect(f.prisma.inboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          type: 'maya_task',
          operationalWorkItemId: null,
          deletedAt: null,
        },
        take: 101,
      }),
    );
    expect(result.tasks[0].id).toBeNull();
    for (const effect of Object.values(f.effects))
      expect(effect).not.toHaveBeenCalled();
  });

  it('bounds both collections and qualifies overflow without publishing a total', async () => {
    const f = fixture();
    f.prisma.operationalWorkItem.findMany.mockResolvedValue(
      Array.from({ length: 101 }, () => task),
    );
    f.prisma.inboxItem.findMany.mockResolvedValue(
      Array.from({ length: 101 }, () => historical),
    );
    const result = await f.read();
    expect(result).toMatchObject({
      count: 100,
      historical_count: 100,
      truncated: true,
      canonical_truncated: true,
      historical_truncated: true,
    });
    expect(result.tasks).toHaveLength(100);
    expect(result.historical_tasks).toHaveLength(100);
  });

  it.each([
    { ...actor, tenantId: 'foreign' },
    { ...actor, userId: 'colleague' },
  ])(
    'rejects mismatched request identity before source reads: %j',
    async (user) => {
      const f = fixture();
      await expect(f.read(undefined, user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(f.prisma.operationalWorkItem.findMany).not.toHaveBeenCalled();
      expect(f.prisma.inboxItem.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { ...member, role: 'client' },
    { ...member, status: 'suspended' },
    { ...member, user: { status: 'suspended' } },
    { ...member, tenant: { status: 'suspended' } },
  ])(
    'refuses unavailable current staff before disclosure',
    async (membership) => {
      const f = fixture();
      f.prisma.membership.findUnique.mockResolvedValue(membership);
      await expect(f.read()).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.prisma.operationalWorkItem.findMany).not.toHaveBeenCalled();
    },
  );

  it('does not return source results after membership revocation during the read', async () => {
    const f = fixture();
    f.prisma.membership.findUnique
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce({ ...member, status: 'suspended' });
    await expect(f.read()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.operationalWorkItem.findMany).toHaveBeenCalledTimes(1);
    for (const effect of Object.values(f.effects))
      expect(effect).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid/timezone'])(
    'refuses unknown timezone instead of silently applying UTC: %s',
    async (timezone) => {
      const f = fixture(timezone);
      await expect(
        f.read({ status: 'active', period: 'today' }),
      ).rejects.toThrow('Task timezone unavailable');
      expect(f.prisma.operationalWorkItem.findMany).not.toHaveBeenCalled();
    },
  );

  it('refuses open-ended filter values before touching data', async () => {
    const f = fixture();
    await expect(
      f.read({ status: 'completed', period: 'all' }),
    ).rejects.toThrow('Invalid own task filters');
    expect(f.prisma.membership.findUnique).not.toHaveBeenCalled();
  });
});
