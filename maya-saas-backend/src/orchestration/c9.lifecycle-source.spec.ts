import { ForbiddenException } from '@nestjs/common';
import { C9LifecycleSource } from './c9.lifecycle-source';

function fixture() {
  const now = new Date('2035-05-10T08:30:00Z');
  const principal = {
    tenantId: 'tenant',
    userId: 'owner',
    membershipId: 'member',
    branchRefs: [],
  };
  const member = { role: 'tenant_owner', branchId: null as string | null };
  const item = {
    id: 'source',
    revision: 1,
    snapshotHash: 'f'.repeat(64),
    subject: { kind: 'client', id: 'client' },
    kind: 'POLICY_SIGNAL',
    current: true,
    available: true,
    qualification: 'VERIFIED',
    completeness: 'PARTIAL',
    asOf: '2035-05-09T00:00:00.000Z',
    rule: { key: 'c8.dormancy/cadence', version: 1 },
    values: [{ key: 'cadence', value: true }],
  };
  const row = {
    id: item.id,
    revision: 1,
    snapshotHash: item.snapshotHash,
    tenantId: principal.tenantId,
    subjectKind: 'client',
    subjectId: 'client',
    identityHash: 'a'.repeat(64),
    intentHash: 'b'.repeat(64),
    admittedAt: now,
    expiresAt: new Date('2035-05-11T00:00:00Z'),
    completeness: 'PARTIAL',
  };
  const tx = {
    membership: { findFirst: jest.fn(() => Promise.resolve(member)) },
    c8ResultRevision: { findFirst: jest.fn(() => Promise.resolve(row)) },
  };
  const store = {
    lock: jest.fn().mockResolvedValue({}),
    transaction: jest.fn(
      (_: unknown, fn: (tx: unknown, p: unknown, now: Date) => unknown) =>
        fn(tx, principal, now),
    ),
  };
  const valuation = {
    readiness: jest.fn().mockResolvedValue({ configured: true }),
    list: jest.fn().mockResolvedValue({ items: [item], nextCursor: null }),
  };
  const policy = { assertCanExecute: jest.fn().mockResolvedValue(undefined) };
  const registry = { get: jest.fn(() => ({ name: 'clients.dormant.list' })) };
  const source = new C9LifecycleSource(
    store as never,
    valuation as never,
    policy as never,
    registry as never,
  );
  return {
    source,
    principal,
    member,
    item,
    row,
    tx,
    store,
    valuation,
    policy,
    registry,
  };
}

describe('C9 Lifecycle exact published C8 source selection', () => {
  it('keeps existing tool and C8 authority, bounded list and exact actual revision metadata', async () => {
    const f = fixture();
    const selected = await f.source.select('run');
    expect(f.registry.get).toHaveBeenCalledWith('clients.dormant.list');
    expect(f.policy.assertCanExecute).toHaveBeenCalledTimes(2);
    expect(f.valuation.list).toHaveBeenCalledWith('tenant', 'owner', {
      kind: 'POLICY_SIGNAL',
      subjectKind: 'client',
      limit: '3',
    });
    expect(selected.refs).toMatchObject([
      {
        sourceType: 'C8ResultRevision',
        id: 'source',
        tenantId: 'tenant',
        subjectRef: 'client',
        identityHash: f.row.identityHash,
        inputHash: f.row.intentHash,
        retentionUntil: f.row.expiresAt.toISOString(),
      },
    ]);
    expect(f.tx.c8ResultRevision.findFirst.mock.calls).toMatchObject([
      [
        {
          where: {
            tenantId: 'tenant',
            id: 'source',
            state: 'PUBLISHED',
            kind: 'POLICY_SIGNAL',
            subjectKind: 'client',
          },
        },
      ],
    ]);
  });
  it.each(['tool', 'valuation'])(
    'a revoked %s entitlement denies before selection',
    async (owner) => {
      const f = fixture();
      const denied = new ForbiddenException('entitlement revoked');
      if (owner === 'tool') f.policy.assertCanExecute.mockRejectedValue(denied);
      else f.valuation.readiness.mockRejectedValue(denied);
      await expect(f.source.select('run')).rejects.toThrow(
        'entitlement revoked',
      );
      expect(f.valuation.list).not.toHaveBeenCalled();
    },
  );
  it('rejects a branch-scoped actor, even with an owner role', async () => {
    const f = fixture();
    f.member.branchId = 'branch';
    await expect(f.source.select('run')).rejects.toThrow(
      'source_reader_authority',
    );
  });
  it('rejects foreign tenant metadata rather than fabricating a ref', async () => {
    const f = fixture();
    f.row.tenantId = 'foreign';
    await expect(f.source.select('run')).rejects.toThrow(
      'source_qualification',
    );
  });
  it.each(['hash', 'revision', 'stale', 'boolean'])(
    'withholds %s inconsistency',
    async (change) => {
      const f = fixture();
      if (change === 'hash') f.row.snapshotHash = 'c'.repeat(64);
      if (change === 'revision') f.row.revision = 2;
      if (change === 'stale') f.item.current = false;
      if (change === 'boolean') f.item.values = [];
      await expect(f.source.select('run')).resolves.toMatchObject({
        refs: [],
        withheld: true,
      });
    },
  );
  it('empty filtered page with a cursor still has unknown omitted results', async () => {
    const f = fixture();
    f.valuation.list.mockResolvedValue({ items: [], nextCursor: 'next' });
    await expect(f.source.select('run')).resolves.toMatchObject({
      refs: [],
      hasMore: true,
    });
  });
  it('revocation during the bounded read denies exposure', async () => {
    const f = fixture();
    f.valuation.list.mockImplementation(() => {
      f.policy.assertCanExecute.mockRejectedValue(
        new ForbiddenException('revoked during read'),
      );
      return Promise.resolve({ items: [f.item], nextCursor: null });
    });
    await expect(f.source.select('run')).rejects.toThrow('revoked during read');
  });
});
