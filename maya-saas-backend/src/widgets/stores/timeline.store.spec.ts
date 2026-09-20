import type { RequestTx } from '../authority/principal-view';
import { TimelineStore, timelineLockKey } from './timeline.store';

const INPUT = Object.freeze({
  tenantId: 'tenant-a',
  intentTokenHash: 'a'.repeat(64),
  conversationId: '00000000-0000-4000-8000-000000000009',
  principalProofHash: 'b'.repeat(64),
  channel: 'pwa',
  renderedUtterance: 'Покажи показатели' as never,
});
const NOW = new Date('2026-09-20T00:00:00.000Z');

const transaction = (count = 1, max: number | null = 4) => {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    widgetIntentRecord: {
      updateMany: jest.fn().mockResolvedValue({ count }),
    },
    widgetTimelineTurn: {
      aggregate: jest.fn().mockResolvedValue({ _max: { turnIndex: max } }),
      create: jest.fn().mockResolvedValue({ id: 'turn-new' }),
    },
  };
  return tx;
};

describe('TimelineStore.lowerToUserTurn — Gate 9 transaction writer', () => {
  it('T9-WRITE-1 uses the exact transaction, lock identity, source fence and USER transcript', async () => {
    const tx = transaction();

    await expect(
      TimelineStore.lowerToUserTurn(INPUT, tx as unknown as RequestTx, NOW),
    ).resolves.toEqual({ id: 'turn-new', turnIndex: 5 });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const lockCalls = tx.$executeRaw.mock.calls as unknown as readonly [
      readonly unknown[],
      string,
    ][];
    expect(lockCalls[0]?.[1]).toBe(
      timelineLockKey(INPUT.tenantId, INPUT.conversationId),
    );
    expect(tx.widgetIntentRecord.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: INPUT.tenantId,
        intentTokenHash: INPUT.intentTokenHash,
        erasedAt: null,
      },
      data: { renderedUtterance: INPUT.renderedUtterance },
    });
    expect(tx.widgetTimelineTurn.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: INPUT.tenantId,
        conversationId: INPUT.conversationId,
      },
      _max: { turnIndex: true },
    });
    expect(tx.widgetTimelineTurn.create).toHaveBeenCalledWith({
      data: {
        tenantId: INPUT.tenantId,
        conversationId: INPUT.conversationId,
        turnIndex: 5,
        role: 'user',
        principalProofHash: INPUT.principalProofHash,
        channel: INPUT.channel,
        createdAt: NOW,
        retentionUntil: new Date('2027-03-19T00:00:00.000Z'),
        textContent: INPUT.renderedUtterance,
        spokenTranscript: null,
      },
      select: { id: true },
    });
  });

  it('T9-WRITE-STALE returns null before allocation when the exact source fence loses', async () => {
    const tx = transaction(0);
    await expect(
      TimelineStore.lowerToUserTurn(INPUT, tx as unknown as RequestTx, NOW),
    ).resolves.toBeNull();
    expect(tx.widgetTimelineTurn.aggregate).not.toHaveBeenCalled();
    expect(tx.widgetTimelineTurn.create).not.toHaveBeenCalled();
  });

  it('T9-WRITE-INDEX starts at zero when the conversation has no prior turn', async () => {
    const tx = transaction(1, null);
    await expect(
      TimelineStore.lowerToUserTurn(INPUT, tx as unknown as RequestTx, NOW),
    ).resolves.toEqual({ id: 'turn-new', turnIndex: 0 });
    const calls = tx.widgetTimelineTurn.create.mock
      .calls as unknown as readonly [{ data: { turnIndex: number } }][];
    expect(calls[0]?.[0].data.turnIndex).toBe(0);
  });

  it('T9-CONC-3 length-prefixes adversarial tuples so concatenation cannot collide', () => {
    expect(timelineLockKey('ab', 'c')).not.toBe(timelineLockKey('a', 'bc'));
    expect(timelineLockKey('', 'abc')).not.toBe(timelineLockKey('a', 'bc'));
  });

  it('T9-BYTE-1 persists the lowered utterance byte-identically in record and USER turn', async () => {
    const tx = transaction();
    const renderedUtterance = '  Цена: $& $1 $$ 👩🏽‍💻\n' as never;
    await TimelineStore.lowerToUserTurn(
      { ...INPUT, renderedUtterance },
      tx as unknown as RequestTx,
      NOW,
    );
    const recordCalls = tx.widgetIntentRecord.updateMany.mock
      .calls as unknown as readonly [{ data: { renderedUtterance: string } }][];
    const turnCalls = tx.widgetTimelineTurn.create.mock
      .calls as unknown as readonly [{ data: { textContent: string } }][];
    expect(recordCalls[0]?.[0].data.renderedUtterance).toBe(renderedUtterance);
    expect(turnCalls[0]?.[0].data.textContent).toBe(renderedUtterance);
  });
});
