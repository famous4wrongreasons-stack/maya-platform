import {
  TenantAuditReadService,
  TENANT_AUDIT_EVENTS,
} from './tenant-audit-read.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';

function fixture() {
  const ctx = new TenantContextService();
  const member = {
    id: 'm',
    role: 'tenant_owner',
    status: 'active',
    user: { status: 'active' },
    tenant: { status: 'active' },
  };
  const db = {
    membership: { findUnique: jest.fn(() => Promise.resolve(member)) },
    auditLog: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            id: 'event-a',
            createdAt: new Date('2026-09-11Z'),
            action: 'appointment.created',
            entityType: 'appointment',
          },
        ]),
      ),
      create: jest.fn(),
    },
  };
  Object.assign(db, {
    $transaction: (work: (tx: unknown) => unknown) => Promise.resolve(work(db)),
    $executeRaw: jest.fn(),
  });
  const reader = new TenantAuditReadService(
    db as unknown as PrismaService,
    ctx,
  );
  const now = new Date('2026-09-12Z');
  const run = <T>(f: () => T) =>
    ctx.run('test', () => {
      ctx.setResolvedTenant({
        tenantId: 'tenant-a',
        userId: 'actor',
        membershipId: 'm',
        role: member.role,
        source: 'membership',
      });
      return f();
    });
  return { db, member, reader, now, run };
}
describe('C7 Q21 bounded tenant audit', () => {
  it('owner reads allowlisted tenant events, no platform or raw metadata and no writes', async () => {
    const f = fixture();
    const result = await f.run(() =>
      f.reader.read('tenant-a', 'actor', {}, f.now),
    );
    expect(result.items).toHaveLength(1);
    const arg = f.db.auditLog.findMany.mock.calls[0][0] as {
      where: unknown;
      take: number;
      select: unknown;
    };
    expect(arg.where).toMatchObject({
      scope: 'tenant',
      tenantId: 'tenant-a',
      OR: Object.entries(TENANT_AUDIT_EVENTS).map(([action, entityType]) => ({
        action,
        entityType,
      })),
    });
    expect(arg.select).toEqual({
      id: true,
      createdAt: true,
      action: true,
      entityType: true,
    });
    expect(arg.take).toBe(51);
    expect(f.db.auditLog.create).not.toHaveBeenCalled();
    expect(f.db.membership.findUnique).toHaveBeenCalledTimes(2);
  });
  it.each([
    'manager',
    'tenant_admin',
    'administrator',
    'accountant',
    'staff',
    'platform_owner',
  ])('%s has no owner tenant audit entitlement', async (role) => {
    const f = fixture();
    f.member.role = role;
    await expect(
      f.run(() => f.reader.read('tenant-a', 'actor', {}, f.now)),
    ).rejects.toThrow('tenant_audit_owner_required');
    expect(f.db.auditLog.findMany).not.toHaveBeenCalled();
  });
  it.each([
    { limit: '101' },
    { limit: '0' },
    { limit: '1.2' },
    { from: '2026-01-01Z' },
    { to: '2099-01-01Z' },
    { cursor: 'invalid' },
  ])('rejects unbounded/invalid input %j', async (query) => {
    const f = fixture();
    await expect(
      f.run(() => f.reader.read('tenant-a', 'actor', query, f.now)),
    ).rejects.toThrow();
    expect(f.db.auditLog.findMany).not.toHaveBeenCalled();
  });
  it('rejects another tenant/principal without a query', async () => {
    const f = fixture();
    await expect(
      f.run(() => f.reader.read('tenant-b', 'actor', {}, f.now)),
    ).rejects.toThrow('tenant_audit_principal_required');
    await expect(
      f.run(() => f.reader.read('tenant-a', 'other', {}, f.now)),
    ).rejects.toThrow('tenant_audit_principal_required');
    expect(f.db.auditLog.findMany).not.toHaveBeenCalled();
  });
  it('rechecks revocation before disclosing rows', async () => {
    const f = fixture();
    f.db.auditLog.findMany.mockImplementation(() => {
      f.member.status = 'revoked';
      return Promise.resolve([]);
    });
    await expect(
      f.run(() => f.reader.read('tenant-a', 'actor', {}, f.now)),
    ).rejects.toThrow('tenant_audit_owner_required');
  });
  it('keyset cursor binds exact tenant/window and breaks time ties by ID', async () => {
    const f = fixture();
    f.db.auditLog.findMany.mockResolvedValue([
      {
        id: 'b',
        createdAt: new Date('2026-09-11Z'),
        action: 'appointment.created',
        entityType: 'appointment',
      },
      {
        id: 'a',
        createdAt: new Date('2026-09-11Z'),
        action: 'appointment.created',
        entityType: 'appointment',
      },
    ]);
    const first = await f.run(() =>
      f.reader.read('tenant-a', 'actor', { limit: '1' }, f.now),
    );
    const query = { ...first.window, limit: '1', cursor: first.nextCursor! };
    await f.run(() => f.reader.read('tenant-a', 'actor', query, f.now));
    expect(f.db.auditLog.findMany.mock.calls[1][0]).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: {
        AND: [
          {
            OR: [
              { createdAt: { lt: new Date('2026-09-11Z') } },
              { createdAt: new Date('2026-09-11Z'), id: { lt: 'b' } },
            ],
          },
        ],
      },
    });
    await expect(
      f.run(() =>
        f.reader.read(
          'tenant-a',
          'actor',
          { ...query, from: '2026-09-01Z' },
          f.now,
        ),
      ),
    ).rejects.toThrow('tenant_audit_cursor_invalid');
  });
});
