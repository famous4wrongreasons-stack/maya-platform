import type { RequestTx } from '../authority/principal-view';
import {
  readUserTurnBinding,
  userTurnId,
  writeUserTurnBinding,
} from './user-turn-binding';
import { TimelineStore } from './timeline.store';

const correlation = {
  kind: 'chat' as const,
  requestId: 'request',
  actorUserId: 'actor',
};
const proof = 'a'.repeat(64);
const binding = {
  contract: 'maya.user-turn-binding/1' as const,
  turnId: userTurnId('tenant', correlation),
  conversationId: '00000000-0000-4000-8000-000000000001',
  principalProofHash: proof,
  intentTokenHash: null,
};
const tx = {} as RequestTx;
const audit = (rows: readonly unknown[] = [binding]) => ({
  read: jest.fn().mockResolvedValue(rows),
  append: jest.fn().mockResolvedValue(undefined),
});

describe('Canonical user turn correlation', () => {
  it('TURN-CORRELATION binds tenant, actual actor, ingress kind and exact untruncated request id', () => {
    const id = userTurnId('tenant', correlation);
    expect(id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    expect(userTurnId('tenant', { ...correlation })).toBe(id);
    for (const [tenant, value] of [
      ['foreign', correlation],
      ['tenant', { ...correlation, actorUserId: 'other' }],
      ['tenant', { ...correlation, kind: 'widget' as const }],
      ['tenant', { ...correlation, requestId: 'request2' }],
    ] as const)
      expect(userTurnId(tenant, value)).not.toBe(id);
    expect(
      userTurnId('tenant', {
        ...correlation,
        requestId: 'a'.repeat(128) + '1',
      }),
    ).not.toBe(
      userTurnId('tenant', {
        ...correlation,
        requestId: 'a'.repeat(128) + '2',
      }),
    );
  });

  it('TURN-AUDIT accepts only one exact immutable binding and never includes transcript data', async () => {
    const port = audit();
    await expect(
      readUserTurnBinding(tx, 'tenant', correlation, proof, port),
    ).resolves.toEqual(binding);
    expect(port.read).toHaveBeenCalledWith(
      'tenant',
      'actor',
      binding.turnId,
      tx,
    );
    await writeUserTurnBinding(port, tx, 'tenant', correlation, binding);
    expect(port.append).toHaveBeenCalledWith(
      {
        tenantId: 'tenant',
        userId: 'actor',
        action: 'chat.user_turn_bound',
        entityType: 'WidgetTimelineTurn',
        entityId: binding.turnId,
        metadata: binding,
      },
      tx,
    );
    await expect(
      readUserTurnBinding(tx, 'tenant', correlation, proof, audit([])),
    ).resolves.toBeNull();
    for (const rows of [
      [binding, binding],
      [null],
      [[]],
      [{ ...binding, contract: 'other' }],
      [{ ...binding, turnId: 'other' }],
      [{ ...binding, principalProofHash: 'b'.repeat(64) }],
      [{ ...binding, conversationId: null }],
      [{ ...binding, intentTokenHash: 'invalid' }],
      [{ ...binding, text: 'must not enter immutable evidence' }],
    ])
      await expect(
        readUserTurnBinding(tx, 'tenant', correlation, proof, audit(rows)),
      ).rejects.toThrow('user_turn_binding_conflict');
  });
});

describe('Canonical USER writer replay', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');
  const input = {
    tenantId: 'tenant',
    conversationId: binding.conversationId,
    principalProofHash: proof,
    channel: 'pwa',
    textContent: 'exact text',
    id: binding.turnId,
  };
  const row = {
    ...input,
    role: 'user',
    turnIndex: 7,
    spokenTranscript: null,
    erasedAt: null,
    retentionUntil: new Date('2027-01-01T00:00:00.000Z'),
  };
  it('TURN-REPLAY returns the existing identity without any write or index allocation', async () => {
    const delegate = {
      findFirst: jest.fn().mockResolvedValue(row),
      create: jest.fn(),
      aggregate: jest.fn(),
    };
    await expect(
      TimelineStore.appendUserTurn(
        input,
        { widgetTimelineTurn: delegate } as unknown as RequestTx,
        now,
      ),
    ).resolves.toEqual({ id: row.id, turnIndex: 7 });
    expect(delegate.create).not.toHaveBeenCalled();
    expect(delegate.aggregate).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'assistant' },
    { conversationId: 'other' },
    { principalProofHash: 'other' },
    { channel: 'other' },
    { textContent: 'other' },
    { spokenTranscript: 'other' },
    { erasedAt: now },
    { retentionUntil: now },
  ])(
    'TURN-REPLAY-REFUSE refuses every mismatched or unavailable retained identity: %j',
    async (change) => {
      const delegate = {
        findFirst: jest.fn().mockResolvedValue({ ...row, ...change }),
        create: jest.fn(),
        aggregate: jest.fn(),
      };
      await expect(
        TimelineStore.appendUserTurn(
          input,
          { widgetTimelineTurn: delegate } as unknown as RequestTx,
          now,
        ),
      ).rejects.toThrow('user_turn_replay_conflict');
      expect(delegate.create).not.toHaveBeenCalled();
    },
  );
});
