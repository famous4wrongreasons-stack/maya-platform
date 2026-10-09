import { TimelineStore } from './timeline.store';
import { encodeChatReply } from './chat-reply-codec';

describe('retained conversation context window', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const scope = {
    tenantId: 'tenant-a',
    conversationId: 'conversation-a',
    principalProofHash: 'principal-a',
  };
  const cipher = {
    encrypt: (text: string) => text,
    decrypt: jest.fn((text: string) => text),
  };
  const context = {
    version: 'maya.chat-semantic-context/1',
    savedAt: now.toISOString(),
    plan: { tasks: [{ intent: 'booking.reschedule_own' }] },
  };
  const retained = {
    ...scope,
    channel: 'pwa',
    erasedAt: null,
    retentionUntil: new Date('2026-10-09T12:00:00Z'),
  };
  const parent = (id: string, turnIndex: number) => ({
    ...retained,
    id,
    role: 'user',
    turnIndex,
  });
  const completion = (
    parentId: string,
    turnIndex: number,
    semanticContext: unknown = context,
  ) => ({
    ...retained,
    turnIndex,
    textContent: encodeChatReply(
      cipher,
      'Private historical prose',
      'a'.repeat(64),
      parentId,
      semanticContext,
    ),
  });
  const row = completion('parent', 19);
  const current = parent('current', 20);
  function fixture(
    rows = [row],
    parents = [parent('parent', 18)],
    currentTurn: unknown = current,
  ) {
    cipher.decrypt.mockClear();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      widgetTimelineTurn: {
        findFirst: jest.fn(
          ({ where }: { where: { id?: string; turnIndex?: { lt: number } } }) =>
            Promise.resolve(
              where.id === 'current'
                ? currentTurn
                : where.id
                  ? (parents.find((value) => value.id === where.id) ?? null)
                  : (parents
                      .filter(
                        (value) => value.turnIndex < (where.turnIndex?.lt ?? 0),
                      )
                      .sort((a, b) => b.turnIndex - a.turnIndex)[0] ?? null),
            ),
        ),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const read = () =>
      TimelineStore.readChatContext(
        tx as never,
        scope.tenantId,
        scope.principalProofHash,
        scope.conversationId,
        now,
        cipher,
        'current',
        { precedingCompletions: true },
      );
    return { tx, read };
  }
  const window = (contexts: unknown[]) => ({
    version: 'maya.chat-context-window/1',
    contexts,
  });

  it('projects bounded exact-scope context and leaves ordinary widget user turns outside the completion projection', async () => {
    const f = fixture();
    expect(await f.read()).toEqual(window([context]));
    expect(f.tx.widgetTimelineTurn.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: scope.tenantId,
        conversationId: scope.conversationId,
        turnIndex: { lt: 20 },
        role: 'assistant',
      },
      orderBy: { turnIndex: 'desc' },
      take: 8,
      select: {
        turnIndex: true,
        textContent: true,
        channel: true,
        principalProofHash: true,
        erasedAt: true,
        retentionUntil: true,
      },
    });
    expect(f.tx.widgetTimelineTurn.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { tenantId: scope.tenantId, id: 'parent' },
      }),
    );
  });

  it('keeps an ordinary READ completion after its empty same-request assistant execution row', async () => {
    const f = fixture(
      [
        completion('read', 3),
        {
          ...completion('tool-row', 2),
          textContent: null,
        } as unknown as typeof row,
      ],
      [parent('read', 1)],
    );
    expect(await f.read()).toEqual(window([context, null]));
  });
  it('keeps a later malformed completion ahead of an older valid sibling', async () => {
    const f = fixture(
      [
        { ...completion('bad', 4), textContent: 'maya.chat-reply/1:malformed' },
        completion('read', 3),
      ],
      [parent('read', 1)],
    );
    expect(await f.read()).toEqual(window([null]));
  });
  it('anchors an erased STOP at its user turn even when an older request completes later', async () => {
    const f = fixture(
      [
        completion('old', 6),
        {
          ...completion('stop', 4),
          textContent: null,
          erasedAt: now,
        } as unknown as typeof row,
      ],
      [parent('old', 1), parent('stop', 3)],
    );
    expect(await f.read()).toEqual(window([null]));
  });
  it('keeps STOP before a late completion of an older request, without rewriting either outcome', async () => {
    const rows = [completion('old', 5), completion('stop', 4, null)];
    const f = fixture(rows, [parent('old', 1), parent('stop', 3)]);
    expect(await f.read()).toEqual(window([null]));
    expect(rows[0].textContent).toContain('booking.reschedule_own');
  });

  it('keeps a fresh plan newer than STOP even when the old request finishes last', async () => {
    const fresh = {
      ...context,
      plan: { tasks: [{ intent: 'booking.create' }] },
    };
    const f = fixture(
      [
        completion('old', 8),
        completion('fresh', 7, fresh),
        completion('stop', 4, null),
      ],
      [parent('old', 1), parent('stop', 3), parent('fresh', 6)],
    );
    expect(await f.read()).toEqual(window([fresh, null]));
  });

  it('fails closed when eight late revisions evict STOP from the bounded window', async () => {
    const f = fixture(
      Array.from({ length: 8 }, (_, i) => completion('old', 18 - i)),
      [parent('old', 1)],
    );
    expect(await f.read()).toEqual(window([null]));
    expect(f.tx.widgetTimelineTurn.findMany).toHaveBeenCalledTimes(1);
    expect(f.tx.widgetTimelineTurn.findFirst).toHaveBeenCalledTimes(3);
  });

  it('does not revive an older revision of a stopped parent', async () => {
    const f = fixture(
      [completion('parent', 19, null), completion('parent', 17)],
      [parent('parent', 16)],
    );
    expect(await f.read()).toEqual(window([null]));
  });

  it.each([
    { erasedAt: now },
    { retentionUntil: now },
    { principalProofHash: 'foreign' },
    { channel: 'telegram' },
    { textContent: null },
    { textContent: 'terminal action' },
    { textContent: 'maya.chat-reply/1:malformed' },
  ])(
    'does not recover an older late parent across an unavailable completion: %j',
    async (barrier) => {
      const f = fixture(
        [
          completion('old', 19),
          { ...completion('stop', 17, null), ...barrier } as typeof row,
        ],
        [parent('old', 1), parent('stop', 16)],
      );
      expect(await f.read()).toEqual(window([null]));
    },
  );

  it('preserves a newer valid context before an older unavailable completion', async () => {
    const f = fixture(
      [row, { ...completion('old', 17), erasedAt: now }],
      [parent('parent', 18)],
    );
    expect(await f.read()).toEqual(window([context, null]));
  });

  it.each([
    { principalProofHash: 'foreign' },
    { conversationId: 'foreign' },
    { erasedAt: now },
    { retentionUntil: now },
    { role: 'assistant' },
    { channel: 'telegram' },
    { turnIndex: 19 },
  ])('treats invalid parent lineage as a barrier: %j', async (invalid) => {
    const f = fixture([row], [{ ...parent('parent', 18), ...invalid }]);
    expect(await f.read()).toEqual(window([null]));
  });

  it('treats a missing parent as a barrier', async () => {
    expect(await fixture([row], []).read()).toEqual(window([null]));
  });

  it.each([
    null,
    { ...current, principalProofHash: 'foreign' },
    { ...current, conversationId: 'foreign' },
    { ...current, erasedAt: now },
    { ...current, retentionUntil: now },
  ])(
    'rejects unavailable current turn before loading prior contexts',
    async (turn) => {
      const f = fixture([row], [], turn);
      expect(await f.read()).toBeNull();
      expect(f.tx.widgetTimelineTurn.findMany).not.toHaveBeenCalled();
      expect(cipher.decrypt).not.toHaveBeenCalled();
    },
  );
});
