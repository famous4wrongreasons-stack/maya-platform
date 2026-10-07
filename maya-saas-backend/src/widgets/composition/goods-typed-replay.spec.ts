import { TypedStep0Service } from './typed-step0';
import { userTurnId } from '../stores/user-turn-binding';
import { encodeChatReply } from '../stores/chat-reply-codec';

const now = new Date('2026-10-07T10:00:00Z');
const cipher = { encrypt: (s: string) => s, decrypt: (s: string) => s };
const actor = {
  tenantId: 'tenant',
  userId: 'owner',
  role: 'TENANT_OWNER',
} as never;
const request = {
  actor,
  surface: 'web' as const,
  requestId: 'goods_retry',
  utterance: 'Подтвердить приход',
  conversationId: 'conversation',
};
const turnId = userTurnId('tenant', {
  kind: 'chat',
  requestId: request.requestId,
  actorUserId: 'owner',
});
const binding = {
  contract: 'maya.user-turn-binding/1',
  turnId,
  conversationId: 'conversation',
  principalProofHash: 'b'.repeat(64),
  intentTokenHash: 'a'.repeat(64),
};
function harness(reply: string | null, parentOverride = {}) {
  const parent = {
    id: turnId,
    conversationId: 'conversation',
    principalProofHash: binding.principalProofHash,
    role: 'user',
    channel: 'pwa',
    erasedAt: null,
    retentionUntil: new Date('2027-01-01'),
    turnIndex: 1,
    textContent: request.utterance,
    ...parentOverride,
  };
  const findMany = jest.fn().mockResolvedValue(
    reply === null
      ? []
      : [
          {
            textContent: encodeChatReply(
              cipher,
              'different turn',
              'f'.repeat(64),
              'foreign-parent',
            ),
          },
          {
            textContent: encodeChatReply(cipher, reply, 'e'.repeat(64), turnId),
          },
          {
            textContent: encodeChatReply(
              cipher,
              'prior UNKNOWN',
              'd'.repeat(64),
              turnId,
            ),
          },
        ],
  );
  const candidates = jest.fn().mockResolvedValue([]);
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ now }]),
    widgetTimelineTurn: {
      findFirst: jest.fn().mockResolvedValue(parent),
      findMany,
    },
    widgetIntentRecord: { findMany: candidates },
  };
  const submit = jest.fn();
  const service = new TypedStep0Service(
    { $transaction: (fn: (v: unknown) => unknown) => fn(tx) } as never,
    { submit } as never,
    {
      resolve: jest.fn().mockResolvedValue({
        authority: { tenantId: 'tenant', userId: 'owner' },
        proofHash: binding.principalProofHash,
      }),
    },
    { read: jest.fn().mockResolvedValue([binding]), append: jest.fn() },
    cipher,
  );
  return { service, submit, candidates, findMany };
}
describe('Goods typed retry reads existing history only', () => {
  it.each([
    'confirmed exact facts',
    'rejected exact facts',
    'UNKNOWN exact facts',
  ])(
    'replays latest exact parent even without a retained intent: %s',
    async (reply) => {
      const h = harness(reply);
      await expect(
        h.service.routeTypedUtterance(request),
      ).resolves.toMatchObject({
        reply,
        userTurn: { turnId, conversationId: 'conversation' },
      });
      expect(h.submit).not.toHaveBeenCalled();
      expect(h.candidates).not.toHaveBeenCalled();
      expect(h.findMany.mock.calls[0]).toEqual([
        {
          where: {
            tenantId: 'tenant',
            principalProofHash: binding.principalProofHash,
            conversationId: 'conversation',
            role: 'assistant',
            channel: 'pwa',
            erasedAt: null,
            retentionUntil: { gt: now },
            textContent: { not: null },
            turnIndex: { gt: 1 },
          },
          orderBy: { turnIndex: 'desc' },
          take: 51,
          select: { textContent: true },
        },
      ]);
    },
  );
  it('missing or out-of-window history cannot create a new fallback completion', async () => {
    const h = harness(null);
    await expect(h.service.routeTypedUtterance(request)).rejects.toThrow(
      'goods_receipt_history_unavailable',
    );
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.candidates).not.toHaveBeenCalled();
  });
  it.each([
    { erasedAt: now },
    { retentionUntil: now },
    { principalProofHash: 'foreign' },
    { conversationId: 'foreign' },
    { textContent: 'Отклонить приход' },
  ])('refuses a changed retained binding: %j', async (override) => {
    const h = harness('confirmed', override);
    await expect(h.service.routeTypedUtterance(request)).rejects.toThrow(
      'user_turn_replay_conflict',
    );
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
  });
});
