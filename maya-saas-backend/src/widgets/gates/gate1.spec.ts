import type { SealCheck } from '../emission/seal-verifier.service';
import { ctx as baseCtx, rec } from './gate-fixtures.spec-helper.spec';
import { gate1 } from './gate1';

const verifier = (ok = true): SealCheck & { verify: jest.Mock } => ({
  verify: jest.fn().mockResolvedValue({
    ok,
    reason: ok ? 'verified' : 'seal_mismatch',
  }),
});

const ctx = (record = rec(), over: Parameters<typeof baseCtx>[1] = {}) =>
  baseCtx(record, {
    ...over,
    submission: {
      intent_token: 'tok',
      widget_id: record.widgetId,
      ...(over.submission ?? {}),
    },
  });

describe('P-G15a Gate 1 — seal, binding and lifecycle in V1.1 order', () => {
  it('G15-1 refuses an unverifiable seal as the code-less EXPIRED outcome', async () => {
    const v = await gate1(ctx(), verifier(false));
    expect(v).toEqual({ outcome: 'expired' });
  });

  it('G15-3 compares the submitted widget id to the stored id and refuses a mismatch', async () => {
    const record = rec();
    const v = await gate1(
      ctx(record, { submission: { intent_token: 'tok', widget_id: 'other' } }),
      verifier(),
    );
    expect(v).toEqual({ outcome: 'expired' });
  });

  it('expired and consumed single-use records answer EXPIRED', async () => {
    const expired = rec({ expiresAt: new Date('2020-01-01T00:00:00.000Z') });
    expect(await gate1(ctx(expired), verifier())).toEqual({
      outcome: 'expired',
    });
    const consumed = rec({ consumedAt: new Date('2026-01-01T00:00:00.000Z') });
    expect(await gate1(ctx(consumed), verifier())).toEqual({
      outcome: 'expired',
    });
  });

  it('a reusable consumed record is not rejected as a single-use replay', async () => {
    const record = rec({
      singleUse: false,
      consumedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(await gate1(ctx(record), verifier())).toEqual({ outcome: 'pass' });
  });

  it('a replaced envelope answers the code-less SUPERSEDED outcome', async () => {
    const record = rec({ supersededByWidgetId: 'replacement' });
    expect(await gate1(ctx(record), verifier())).toEqual({
      outcome: 'superseded',
    });
  });

  it('admits a verified, matching, live and unconsumed record', async () => {
    const seal = verifier();
    const record = rec();
    expect(await gate1(ctx(record), seal)).toEqual({ outcome: 'pass' });
    expect(seal.verify.mock.calls).toEqual([
      [record.intentTokenHash, { tenantId: record.tenantId }],
    ]);
  });
});
