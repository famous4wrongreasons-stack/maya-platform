import { ForbiddenException } from '@nestjs/common';
import { C9BiSource, BI_REPORT_CALL } from './c9.bi-source';
import { c9Hash } from './c9.contract';

function fixture() {
  const now = new Date('2035-05-10T08:30:00Z');
  const root = { admittedAt: new Date('2035-05-10T08:00:00Z') };
  const principal = {
    tenantId: 'tenant',
    userId: 'owner',
    membershipId: 'member',
    branchRefs: [],
  };
  const member = { role: 'tenant_owner', branchId: null as string | null };
  const row = {
    id: 'source',
    tenantId: 'tenant',
    identityHash: 'a'.repeat(64),
    intentHash: 'b'.repeat(64),
    publishedAt: new Date('2035-05-10T07:00:00Z'),
    expiresAt: new Date('2035-05-11T00:00:00Z'),
    completeness: 'PARTIAL',
    periodFrom: new Date('2035-05-01T00:00:00Z'),
    periodTo: new Date('2035-06-01T00:00:00Z'),
    timezone: 'UTC',
  };
  const tx = {
    membership: { findFirst: jest.fn().mockResolvedValue(member) },
    c9WorkReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
    measurementRevision: {
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([row]),
    },
  };
  const store = {
    lock: jest.fn().mockResolvedValue(root),
    transaction: jest.fn(
      (_: unknown, f: (tx: unknown, p: unknown, now: Date) => unknown) =>
        f(tx, principal, now),
    ),
  };
  const measurement = { viewer: jest.fn().mockResolvedValue(member) };
  const policy = { assertCanExecute: jest.fn().mockResolvedValue(undefined) };
  const registry = {
    get: jest.fn(() => ({ name: 'analytics.business.profit' })),
  };
  const source = new C9BiSource(
    store as never,
    measurement as never,
    policy as never,
    registry as never,
  );
  return {
    source,
    store,
    tx,
    principal,
    member,
    row,
    root,
    now,
    measurement,
    policy,
    registry,
  };
}

describe('C9 BI exact published financial snapshot selection', () => {
  const month = { kind: 'calendar_month', year: 2035, month: 5 } as const;
  it('selects the requested source-local month without a tenant-timezone substitution or a live read', async () => {
    const f = fixture();
    f.row.periodFrom = new Date('2035-04-30T17:00:00Z');
    f.row.periodTo = new Date('2035-05-31T17:00:00Z');
    f.row.timezone = 'Asia/Novosibirsk';
    expect(await f.source.select('run', month)).toMatchObject([
      { id: 'source' },
    ]);
    expect(f.tx.measurementRevision.findFirst).not.toHaveBeenCalled();
    expect(f.tx.measurementRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant',
          state: 'PUBLISHED',
          branchId: null,
          scopeJson: { path: ['branchIds'], equals: [] },
          publishedAt: { lte: f.root.admittedAt },
          expiresAt: { gt: f.root.admittedAt },
          periodFrom: {
            gte: new Date('2035-04-30T00:00:00Z'),
            lte: new Date('2035-05-02T00:00:00Z'),
          },
          periodTo: {
            gte: new Date('2035-05-31T00:00:00Z'),
            lte: new Date('2035-06-02T00:00:00Z'),
          },
        }) as unknown,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 51,
      }),
    );
  });
  it('does not accept UTC endpoints relabelled into a non-UTC month and chooses the newest exact match only', async () => {
    const f = fixture();
    f.tx.measurementRevision.findMany.mockResolvedValue([
      { ...f.row, id: 'wrong-boundaries', timezone: 'Asia/Novosibirsk' },
      { ...f.row, id: 'exact-month' },
      { ...f.row, id: 'older-exact-month' },
    ]);
    expect(await f.source.select('run', month)).toMatchObject([
      { id: 'exact-month' },
    ]);
  });
  it('returns a qualified empty search when no exact month exists', async () => {
    const f = fixture();
    f.row.periodTo = new Date('2035-05-10T00:00:00Z');
    await expect(f.source.select('run', month)).resolves.toEqual([]);
    expect(f.tx.measurementRevision.findFirst).not.toHaveBeenCalled();
  });
  it.each(['missing', 'invalid', 'bounded'])(
    'refuses %s metadata instead of declaring the requested month absent',
    async (kind) => {
      const f = fixture();
      if (kind === 'bounded') {
        f.tx.measurementRevision.findMany.mockResolvedValue(
          Array.from({ length: 51 }, () => ({
            ...f.row,
            periodFrom: new Date('2035-05-01T00:01:00Z'),
          })),
        );
      } else f.row.timezone = kind === 'missing' ? '' : 'Invalid/Timezone';
      await expect(f.source.select('run', month)).rejects.toThrow(
        kind === 'bounded'
          ? 'c9_array_bounds'
          : 'c9_context_fact_source_unavailable',
      );
    },
  );
  it('does not fall back to an older exact month after the selected one expires', async () => {
    const f = fixture();
    f.tx.measurementRevision.findMany.mockResolvedValue([
      { ...f.row, expiresAt: f.now },
      { ...f.row, id: 'older' },
    ]);
    await expect(f.source.select('run', month)).rejects.toThrow(
      'c9_source_expired',
    );
  });
  it('replays the saved month address without reselecting and rejects a foreign tenant receipt', async () => {
    const f = fixture();
    const refs = await f.source.select('run', month);
    f.tx.measurementRevision.findMany.mockClear();
    f.tx.c9WorkReceipt.findFirst.mockResolvedValue({
      retentionUntil: f.row.expiresAt,
      inputEvidenceRefsJson: refs,
    });
    expect(await f.source.select('run', month)).toEqual(refs);
    expect(f.tx.measurementRevision.findMany).not.toHaveBeenCalled();
    f.tx.c9WorkReceipt.findFirst.mockResolvedValue({
      retentionUntil: f.row.expiresAt,
      inputEvidenceRefsJson: [{ ...refs[0], tenantId: 'foreign' }],
    });
    await expect(f.source.select('run', month)).rejects.toThrow(
      'c9_source_read_receipt',
    );
  });
  it.each([0, 13, 1.5])(
    'rejects invalid month %s before source selection',
    async (value) => {
      const f = fixture();
      await expect(
        f.source.select('run', { ...month, month: value }),
      ).rejects.toThrow('c9_source_read_receipt');
      expect(f.tx.measurementRevision.findMany).not.toHaveBeenCalled();
    },
  );
  it('selects one qualified tenant-wide address using the immutable first-admission cutoff', async () => {
    const f = fixture();
    const refs = await f.source.select('run');
    expect(f.measurement.viewer).toHaveBeenCalledWith(
      'tenant',
      'owner',
      'business_period',
    );
    expect(f.registry.get).toHaveBeenCalledWith('analytics.business.profit');
    expect(f.tx.measurementRevision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant',
          kind: 'business_period',
          state: 'PUBLISHED',
          publishedAt: { lte: f.root.admittedAt },
          expiresAt: { gt: f.root.admittedAt },
          branchId: null,
          clientId: null,
          staffId: null,
          appointmentId: null,
          configurationUserId: null,
          scopeJson: { path: ['branchIds'], equals: [] },
        }) as unknown,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(refs).toMatchObject([
      {
        sourceType: 'MeasurementRevision',
        id: 'source',
        subjectRef: 'source',
        identityHash: f.row.identityHash,
        inputHash: f.row.intentHash,
        validUntil: f.row.expiresAt.toISOString(),
        retentionUntil: f.row.expiresAt.toISOString(),
      },
    ]);
  });
  it('returns no report rather than synthesizing a live C7 reference', async () => {
    const f = fixture();
    f.tx.measurementRevision.findFirst.mockResolvedValue(null);
    await expect(f.source.select('run')).resolves.toEqual([]);
    expect(f.measurement.viewer).toHaveBeenCalledTimes(1);
  });
  it.each(['finance', 'tool', 'branch', 'actor', 'cancelled'])(
    'refuses %s authority before any source lookup',
    async (denial) => {
      const f = fixture();
      if (denial === 'finance')
        f.measurement.viewer.mockRejectedValue(
          new ForbiddenException('denied'),
        );
      if (denial === 'tool')
        f.policy.assertCanExecute.mockRejectedValue(
          new ForbiddenException('denied'),
        );
      if (denial === 'branch') f.member.branchId = 'branch';
      if (denial === 'actor') f.member.role = 'manager';
      if (denial === 'cancelled')
        f.store.lock.mockRejectedValue(new Error('cancelled'));
      await expect(f.source.select('run')).rejects.toThrow();
      expect(f.tx.measurementRevision.findFirst).not.toHaveBeenCalled();
    },
  );
  it('replays exact saved refs, including an empty selection, instead of choosing a newer publication', async () => {
    const f = fixture();
    const refs = await f.source.select('run');
    f.tx.measurementRevision.findFirst.mockClear();
    for (const selected of [refs, []]) {
      f.tx.c9WorkReceipt.findFirst.mockResolvedValue({
        inputEvidenceRefsJson: selected,
        retentionUntil: f.row.expiresAt,
      });
      await expect(f.source.select('run')).resolves.toEqual(selected);
    }
    expect(f.tx.measurementRevision.findFirst).not.toHaveBeenCalled();
    expect(f.tx.c9WorkReceipt.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant',
        runId: 'run',
        callKeyHash: c9Hash('call-key/1', ['tenant', 'run', BI_REPORT_CALL]),
      },
    });
  });
  it.each(['source', 'receipt'])(
    'expiry of %s stops without replacing the selected source',
    async (kind) => {
      const f = fixture();
      if (kind === 'source') f.row.expiresAt = f.now;
      else
        f.tx.c9WorkReceipt.findFirst.mockResolvedValue({
          retentionUntil: f.now,
          inputEvidenceRefsJson: [],
        });
      await expect(f.source.select('run')).rejects.toThrow('c9_source_expired');
      expect(f.tx.measurementRevision.findFirst).toHaveBeenCalledTimes(
        kind === 'source' ? 1 : 0,
      );
    },
  );
});
