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

describe('TimelineStore.ensureAssistantExecutionTurn — conversation index', () => {
  it('TURN-ASSISTANT-INDEX ignores larger indices in another tenant or conversation', async () => {
    const parent = {
      id: 'parent-user',
      tenantId: INPUT.tenantId,
      conversationId: INPUT.conversationId,
      turnIndex: 4,
      role: 'user',
      principalProofHash: INPUT.principalProofHash,
      channel: 'pwa',
      textContent: 'Покажи показатели',
      spokenTranscript: null,
      erasedAt: null,
      retentionUntil: new Date('2027-03-19T00:00:00.000Z'),
    };
    const rows = [
      parent,
      {
        ...parent,
        id: 'other-conversation',
        conversationId: 'other',
        turnIndex: 100,
      },
      { ...parent, id: 'other-tenant', tenantId: 'tenant-b', turnIndex: 200 },
    ];
    type Where = { tenantId?: string; conversationId?: string; id?: string };
    const matching = (where: Where) =>
      rows.filter((row) =>
        Object.entries(where).every(
          ([key, value]) => row[key as keyof Where] === value,
        ),
      );
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      widgetTimelineTurn: {
        findFirst: jest.fn(({ where }: { where: Where }) =>
          Promise.resolve(matching(where)[0] ?? null),
        ),
        aggregate: jest.fn(({ where }: { where: Where }) =>
          Promise.resolve({
            _max: {
              turnIndex: Math.max(
                ...matching(where).map((row) => row.turnIndex),
              ),
            },
          }),
        ),
        create: jest.fn(({ data }: { data: typeof parent }) =>
          Promise.resolve({
            id: data.id,
            principalProofHash: data.principalProofHash,
          }),
        ),
      },
    };
    await TimelineStore.ensureAssistantExecutionTurn(
      tx as unknown as RequestTx,
      {
        tenantId: INPUT.tenantId,
        conversationId: INPUT.conversationId,
        parentUserTurnId: parent.id,
        principalProofHash: INPUT.principalProofHash,
        channel: 'pwa',
        executionId: 'execution-own',
      },
      NOW,
    );
    expect(tx.widgetTimelineTurn.create).toHaveBeenCalledTimes(1);
    const written = tx.widgetTimelineTurn.create.mock.calls[0]?.[0].data;
    expect(written).toMatchObject({
      tenantId: INPUT.tenantId,
      conversationId: INPUT.conversationId,
      turnIndex: 5,
      role: 'assistant',
      principalProofHash: INPUT.principalProofHash,
    });
  });
});

describe('semantic context byte bound before persistence', () => {
  const persist = (semanticContext: unknown, lock: jest.Mock) =>
    TimelineStore.persistChatReply(
      { $executeRaw: lock } as never,
      {
        tenantId: 'proof-tenant',
        principalProofHash: 'proof-principal',
        userTurn: {
          turnId: 'proof-turn',
          conversationId: 'proof-conversation',
        },
        reply: 'Synthetic reply',
        completionHash: 'a'.repeat(64),
        semanticContext,
      },
      new Date('2026-10-05T12:00:00Z'),
      undefined as never,
    );

  it.each([
    ['absent context', undefined],
    ['exactly 16 KiB of UTF-8 JSON', { employee: 'я'.repeat(8184) + 'a' }],
  ])('admits %s to the existing conversation lock', async (_label, context) => {
    const stop = new Error('stop-before-persistence');
    const lock = jest.fn().mockRejectedValue(stop);
    await expect(persist(context, lock)).rejects.toBe(stop);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('refuses a context one UTF-8 byte over the bound before any database call', async () => {
    const lock = jest.fn();
    await expect(
      persist({ employee: 'я'.repeat(8184) + 'aa' }, lock),
    ).rejects.toThrow('conversation_context_too_large');
    expect(lock).not.toHaveBeenCalled();
  });
});

describe('TimelineStore authoritative clock', () => {
  it('reads only the current transaction clock, retaining the database instant under app-clock skew', async () => {
    const now = new Date('2001-01-01T00:00:00Z');
    const query = jest.fn().mockResolvedValue([{ now }]);
    expect(
      await TimelineStore.readDatabaseClock({ $queryRaw: query } as never),
    ).toBe(now);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(['SELECT clock_timestamp() AS now']);
  });
});
