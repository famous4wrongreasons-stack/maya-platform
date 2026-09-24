import { rec } from '../gates/gate-fixtures.spec-helper.spec';
import { C9CancelAdapter } from './c9-cancel.adapter';

describe('U13b C9 cancellation owner adapter', () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const revisionId = '22222222-2222-4222-8222-222222222222';
  const principalProofHash = 'p'.repeat(64);
  const store = { cancel: jest.fn().mockResolvedValue({ state: 'CANCELLED' }) };
  const adapter = new C9CancelAdapter(store as never);
  const input = {
    record: rec({
      tenantId: 't1',
      principalProofHash,
      runId,
      revisionId,
    }),
    tenantId: 't1',
    principalProofHash,
    answeringChannel: 'pwa' as const,
    now: new Date('2026-09-24T00:00:00.000Z'),
  };

  beforeEach(() => store.cancel.mockClear());

  it('calls the canonical owner once with a deterministic incident identity', async () => {
    await expect(adapter.cancel(input)).resolves.toBe(true);
    const calls = store.cancel.mock.calls as unknown as Array<[string, string]>;
    const first = calls[0];
    if (first === undefined) throw new Error('expected one cancel call');
    await expect(adapter.cancel(input)).resolves.toBe(true);
    const finalCalls = store.cancel.mock.calls as unknown as Array<
      [string, string]
    >;
    expect(finalCalls).toEqual([
      [runId, first[1]],
      [runId, first[1]],
    ]);
  });

  it.each([
    {
      record: rec({
        tenantId: 'foreign',
        principalProofHash,
        runId,
        revisionId,
      }),
    },
    {
      record: rec({
        tenantId: 't1',
        principalProofHash: 'x'.repeat(64),
        runId,
        revisionId,
      }),
    },
    {
      record: rec({
        tenantId: 't1',
        principalProofHash,
        runId: null,
        revisionId,
      }),
    },
    {
      record: rec({
        tenantId: 't1',
        principalProofHash,
        runId,
        revisionId: null,
      }),
    },
  ])(
    'refuses foreign or incomplete run identity with zero owner calls',
    async (patch) => {
      await expect(adapter.cancel({ ...input, ...patch })).resolves.toBe(false);
      expect(store.cancel).not.toHaveBeenCalled();
    },
  );
});
