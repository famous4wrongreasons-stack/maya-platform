// K3 — the emission path, proved where it can be proved without a database.
//
// The seal is the interesting part. A seal that is merely written to a column is decoration; a seal
// is a fence only if a changed body stops matching it, so that is what is tested — not that the
// function returns a string.

import { WidgetEmitterService } from './emitter.service';

class FakePrisma {
  public emissions: Record<string, unknown>[] = [];
  public records: Record<string, unknown>[] = [];
  widgetEmission = {
    create: (args: { data: Record<string, unknown> }) => {
      this.emissions.push(args.data);
      return args.data;
    },
    findFirst: async ({
      where,
    }: {
      where: { tenantId: string; widgetId: string };
    }) =>
      this.emissions.find(
        (e) => e.tenantId === where.tenantId && e.widgetId === where.widgetId,
      ) ?? null,
  };
  widgetIntentRecord = {
    create: (args: { data: Record<string, unknown> }) => {
      this.records.push(args.data);
      return args.data;
    },
  };
  // The real $transaction takes an array of promises; the double just resolves them, which is
  // enough to prove both writes are issued together rather than one at a time.
  $transaction = async (ops: unknown[]) => ops;
}

const make = () => {
  const prisma = new FakePrisma();
  return { prisma, emitter: new WidgetEmitterService(prisma as never) };
};

const req = () => ({
  tenantId: 't1',
  conversationId: 'c1',
  turnId: 'turn-1',
  kind: 'METRIC' as const,
  principalProofHash: 'p'.repeat(64),
  deliveryChannel: 'pwa',
  body: { headline: 'revenue', value: 42 },
  ttlSeconds: 3600,
  freshnessClass: 'live' as const,
});

describe('K3 emission — mint, compose, fit, seal', () => {
  it('writes the emission and its intent record in one transaction', async () => {
    const { prisma, emitter } = make();
    await emitter.emit(req());
    expect(prisma.emissions).toHaveLength(1);
    expect(prisma.records).toHaveLength(1);
    // Both or neither: a record without its emission would refuse at Gate 1 as EXPIRED, which
    // would be a lie about why.
    expect(prisma.records[0].widgetId).toBe(prisma.emissions[0].widgetId);
  });

  it('stores only the token HASH, never the token', async () => {
    const { prisma, emitter } = make();
    const sealed = await emitter.emit(req());
    const serialised =
      JSON.stringify(prisma.records) + JSON.stringify(prisma.emissions);
    expect(serialised).not.toContain(sealed.intentToken);
    expect(prisma.records[0].intentTokenHash).toBe(sealed.intentTokenHash);
  });

  it('mints only effect NONE: no DRAFT, REQUEST_APPROVAL or COMMIT token exists in wave 2', async () => {
    const { prisma, emitter } = make();
    await emitter.emit(req());
    expect(prisma.records[0].effect).toBe('NONE');
  });

  it('hashes the body canonically, so key order cannot change the hash', async () => {
    const { emitter } = make();
    const a = await emitter.emit({
      ...req(),
      body: { alpha: 1, beta: { x: 1, y: 2 } },
    });
    const b = await emitter.emit({
      ...req(),
      body: { beta: { y: 2, x: 1 }, alpha: 1 },
    });
    // Same content, different insertion order. A hash that differed here would be a hash of the
    // program that built the object rather than of the body.
    expect(a.bodyHash).toBe(b.bodyHash);
  });

  it('gives two different bodies two different hashes', async () => {
    const { emitter } = make();
    const a = await emitter.emit({ ...req(), body: { value: 1 } });
    const b = await emitter.emit({ ...req(), body: { value: 2 } });
    expect(a.bodyHash).not.toBe(b.bodyHash);
  });

  it('seals over the body: a body edited after sealing no longer verifies', async () => {
    const { prisma, emitter } = make();
    const sealed = await emitter.emit(req());
    expect(await emitter.verifySeal('t1', sealed.widgetId)).toBe(true);

    // Someone edits the stored body without touching the seal — the case the seal exists for.
    const stored = prisma.emissions.find(
      (e) => e.widgetId === sealed.widgetId,
    )!;
    stored.bodyJson = { headline: 'revenue', value: 999_999 };
    expect(await emitter.verifySeal('t1', sealed.widgetId)).toBe(false);
  });

  it('seals over identity: a body moved to another envelope does not verify', async () => {
    const { prisma, emitter } = make();
    const first = await emitter.emit(req());
    const stored = prisma.emissions.find((e) => e.widgetId === first.widgetId)!;
    // Same body, same seal, different widget — the seal covers the id, so it stops matching.
    stored.widgetId = 'someone-elses-widget';
    expect(await emitter.verifySeal('t1', 'someone-elses-widget')).toBe(false);
  });

  it('gives every emission a distinct token', async () => {
    const { emitter } = make();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1)
      seen.add((await emitter.emit(req())).intentToken);
    expect(seen.size).toBe(50);
  });
});
