import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ForbiddenException } from '@nestjs/common';
import type { C8ResultRevision } from '@prisma/client';
import { C8ReadService } from './c8.read';
// Existing reader/explanation; synthetic persistence/viewer. No provider, model or writes.
function fixture() {
  const row = {
    id: 'result-one',
    tenantId: 'tenant-a',
    subjectKind: 'tenant',
    subjectId: 'tenant-a',
    kind: 'OBSERVED_VALUE',
    state: 'PUBLISHED',
    qualification: 'VERIFIED',
    completeness: 'PARTIAL',
    basis: 'observed_attended_count',
    currency: null,
    ruleKey: 'c8.value/count',
    ruleVersion: 1,
    policyRevisionId: 'private-policy',
    scopeJson: { branchIds: [], serviceScope: [] },
    t0: new Date('2026-10-14T08:00:00.000Z'),
    periodFrom: new Date('2026-10-01T00:00:00.000Z'),
    periodTo: new Date('2026-10-14T08:00:00.000Z'),
    timezone: 'Europe/Moscow',
    expiresAt: new Date('2099-10-15T08:00:00.000Z'),
    snapshotHash: 'a'.repeat(64),
    revision: 1,
    rankingJson: null,
    valuesJson: { values: [{ key: 'count', value: '3' }] },
    reasonsJson: [],
    horizonEnd: null,
    modelVersionId: null,
  } as unknown as C8ResultRevision;
  let rows = [row],
    active = true;
  const member = { role: 'tenant_owner', branchId: null as string | null };
  const viewer = {
    viewer: jest.fn(async (tenant: string, user: string) => {
      expect(tenant).toBe('tenant-a');
      expect(user).toBe('user-a');
      if (!active) throw new ForbiddenException('revoked');
      return member;
    }),
  };
  const findMany = jest.fn(
    async (q: {
      where: { tenantId: string; expiresAt: { gt: Date } };
      take: number;
    }) => {
      expect(q.where.tenantId).toBe('tenant-a');
      expect(q.take).toBe(26);
      return rows.filter((r) => r.expiresAt > q.where.expiresAt.gt);
    },
  );
  const tx = {
    c8ResultRevision: {
      findFirst: jest.fn().mockResolvedValue({ id: row.id }),
    },
  };
  const store = {
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    refsCurrent: jest.fn().mockResolvedValue(true),
  };
  const write = jest.fn(() => {
    throw Error('read cannot compute or mutate');
  });
  const reader = new C8ReadService(
    { c8ResultRevision: { findMany } } as never,
    {
      get: () => member,
      runAsSystemTenant: (tenant: string, fn: () => unknown) => {
        expect(tenant).toBe('tenant-a');
        return fn();
      },
    } as never,
    viewer as never,
    store as never,
    { policy: write } as never,
    { compute: write } as never,
    { compute: write } as never,
  );
  return {
    row,
    member,
    store,
    tx,
    findMany,
    viewer,
    write,
    rows: (v: C8ResultRevision[]) => {
      rows = v;
    },
    revoke: () => {
      active = false;
    },
    read: () => reader.list('tenant-a', 'user-a'),
  };
}
describe('Companion Ideas existing C8 list source', () => {
  it('passes the actual C8 list through the shipped runtime projector without exposing subjects or values', async () => {
    const list = await fixture().read();
    const moduleUrl = pathToFileURL(
      resolve(__dirname, '../../../maya-chat-shell/src/net/ideas.ts'),
    ).href;
    const projected = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--input-type=module',
          '-e',
          `import fs from 'node:fs'; import { projectIdeas } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(projectIdeas(JSON.parse(fs.readFileSync(0,'utf8')))));`,
        ],
        {
          input: JSON.stringify(list),
          encoding: 'utf8',
          timeout: 10000,
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
        },
      ),
    );
    expect(projected).not.toBeNull();
    expect(projected.rows[0]).toMatchObject({
      key: 'result-one',
      scope: 'tenant',
      coverage: 'PARTIAL',
      available: true,
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /private-policy|tenant-a|subjectId|values|boundaries/,
    );
  });

  it('returns canonical explanation metadata and authority boundaries without computing', async () => {
    const f = fixture(),
      list = await f.read();
    expect(list).toMatchObject({
      contract: 'c8.valuation.list/1',
      numericPredictionsAvailable: false,
      nextCursor: null,
    });
    expect(list.items[0]).toMatchObject({
      contract: 'c8.valuation.read/1',
      version: 1,
      mode: 'immutable_snapshot',
      id: f.row.id,
      revision: 1,
      snapshotHash: f.row.snapshotHash,
      current: true,
      available: true,
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      numericPrediction: null,
      activation: 'DISABLED',
      period: { timezone: 'Europe/Moscow' },
      boundaries: {
        factIsPrediction: false,
        predictionIsPolicy: false,
        valueImpliesConsent: false,
        rankingImpliesContactPermission: false,
        rankingImpliesActionAuthority: false,
        opportunityImpliesExecution: false,
      },
    });
    expect(f.findMany).toHaveBeenCalledTimes(1);
    expect(f.viewer.viewer.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('filters foreign tenant rows even if persistence returns them', async () => {
    const f = fixture();
    f.row.tenantId = 'tenant-b';
    expect((await f.read()).items).toEqual([]);
  });
  it('filters branch scope mismatch', async () => {
    const f = fixture();
    f.member.branchId = 'branch-a';
    expect((await f.read()).items).toEqual([]);
  });
  it('does not expose superseded or stale published results', async () => {
    const f = fixture();
    f.store.refsCurrent.mockResolvedValue(false);
    expect((await f.read()).items).toEqual([]);
    f.store.refsCurrent.mockResolvedValue(true);
    f.tx.c8ResultRevision.findFirst.mockResolvedValue({ id: 'new-result' });
    expect((await f.read()).items).toEqual([]);
  });
  it('preserves unavailable and prediction limitations', async () => {
    const f = fixture();
    f.row.state = 'UNAVAILABLE';
    f.store.refsCurrent.mockResolvedValue(false);
    let x = (await f.read()).items[0];
    expect(x.available).toBe(false);
    expect(x.values).toEqual([]);
    f.row.kind = 'PREDICTION';
    f.row.state = 'PUBLISHED';
    f.store.refsCurrent.mockResolvedValue(true);
    x = (await f.read()).items[0];
    expect(x.available).toBe(false);
    expect(x.numericPrediction).toBeNull();
    expect(x.reasons).toContain(
      'qualified_model_and_approved_activation_evidence_required',
    );
  });
  it('rechecks authority after dependency resolution and before list exposure', async () => {
    const f = fixture();
    f.store.refsCurrent.mockImplementation(async () => {
      f.revoke();
      return true;
    });
    await expect(f.read()).rejects.toThrow('revoked');
  });
  it('queries expiry and omits expired rows', async () => {
    const f = fixture();
    f.row.expiresAt = new Date('2000-01-01T00:00:00.000Z');
    expect((await f.read()).items).toEqual([]);
  });
  it('discloses pre-filter cap even when first page is inaccessible', async () => {
    const f = fixture();
    f.rows(
      Array.from({ length: 26 }, (_, i) => ({
        ...f.row,
        id: 'result-' + i,
        tenantId: 'tenant-b',
      })),
    );
    expect(await f.read()).toMatchObject({
      items: [],
      nextCursor: 'result-24',
    });
  });
});
