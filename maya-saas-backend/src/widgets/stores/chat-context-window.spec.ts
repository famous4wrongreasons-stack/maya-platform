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
    plan: { tasks: [] },
  };
  const row = {
    ...scope,
    channel: 'pwa',
    erasedAt: null,
    retentionUntil: new Date('2026-10-09T12:00:00Z'),
    textContent: encodeChatReply(
      cipher,
      'Private historical prose',
      'a'.repeat(64),
      'parent',
      context,
    ),
  };
  const current = { ...row, id: 'current', role: 'user', turnIndex: 20 };
  function fixture(rows = [row], currentTurn: unknown = current) {
    cipher.decrypt.mockClear();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      widgetTimelineTurn: {
        findFirst: jest.fn().mockResolvedValue(currentTurn),
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

  it('projects only bounded context with exact tenant/conversation order, preserving barriers in the query', async () => {
    const f = fixture();
    expect(await f.read()).toEqual({
      version: 'maya.chat-context-window/1',
      contexts: [context],
    });
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
        textContent: true,
        channel: true,
        principalProofHash: true,
        erasedAt: true,
        retentionUntil: true,
      },
    });
    expect(cipher.decrypt).toHaveBeenCalledTimes(1);
  });

  it.each([
    { erasedAt: now },
    { retentionUntil: now },
    { principalProofHash: 'foreign' },
    { channel: 'telegram' },
    { textContent: null },
    { textContent: 'terminal action' },
  ])(
    'stops before decrypting an unavailable completion and anything older: %j',
    async (barrier) => {
      const f = fixture([row, { ...row, ...barrier } as typeof row, row]);
      expect(await f.read()).toEqual({
        version: 'maya.chat-context-window/1',
        contexts: [context, null],
      });
      expect(cipher.decrypt).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'maya.chat-reply/1:malformed',
    encodeChatReply(
      cipher,
      'Action has completed',
      'b'.repeat(64),
      'action-parent',
      null,
    ),
  ])('does not skip malformed or action completions', async (textContent) => {
    const f = fixture([{ ...row, textContent }, row]);
    expect(await f.read()).toEqual({
      version: 'maya.chat-context-window/1',
      contexts: [null],
    });
    expect(cipher.decrypt).toHaveBeenCalledTimes(1);
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
      const f = fixture([row], turn);
      expect(await f.read()).toBeNull();
      expect(f.tx.widgetTimelineTurn.findMany).not.toHaveBeenCalled();
      expect(cipher.decrypt).not.toHaveBeenCalled();
    },
  );
});
