import { C9Orchestrator, type C9ConversationReads } from './c9.orchestrator';
import type { C9Store } from './c9.store';
import type { C9WorkService } from './c9.work';
import type { C9ContextService } from './c9.context';
import type { C9Agents } from './c9.agents';
import type { C9Allowance } from './c9.allowance';

function fixture() {
  const turn: C9ConversationReads = {
    turn: { turnId: 'turn-1', conversationId: 'conversation-1' },
    intentHash: 'a'.repeat(64),
  };
  const store = {
    conversationReadRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
    conversationReadReceipt: jest
      .fn()
      .mockResolvedValue({ executionId: 'source-1' }),
    finishConversationReads: jest.fn().mockResolvedValue('COMPLETED'),
  };
  const work = {
    reserve: jest.fn().mockResolvedValue({ id: 'work-1', state: 'RESERVED' }),
    claim: jest.fn().mockResolvedValue({
      runId: 'run-1',
      workId: 'work-1',
      token: 'fence',
      generation: 1,
    }),
    settle: jest.fn().mockResolvedValue({ state: 'SETTLED' }),
    hold: jest.fn().mockResolvedValue({ state: 'HELD_UNKNOWN' }),
    reconcileConversationRead: jest
      .fn()
      .mockRejectedValue(new Error('c9_source_read_receipt')),
  };
  const context = { build: jest.fn() };
  const agents = { answer: jest.fn() };
  const coordinator = new C9Orchestrator(
    store as unknown as C9Store,
    context as unknown as C9ContextService,
    work as unknown as C9WorkService,
    agents as unknown as C9Agents,
    {} as C9Allowance,
  );
  return { turn, store, work, context, agents, coordinator };
}

describe('C9 delegates deterministic conversation reads to their existing owner', () => {
  it('reconciles a completed source when persistence outlives its coordination lease', async () => {
    const f = fixture();
    const result = {
      status: 'completed',
      execution_id: 'source-1',
      result: { verified: true },
    };
    f.work.settle.mockRejectedValue(new Error('c9_work_fenced'));
    f.work.reconcileConversationRead.mockResolvedValue({
      state: 'SETTLED',
      resultJson: { executionId: 'source-1' },
    });
    const source = jest.fn().mockResolvedValue(result);
    await expect(
      f.coordinator.conversationRead(
        f.turn,
        'catalog.services.read',
        'call-1',
        'b'.repeat(64),
        source,
      ),
    ).resolves.toBe(result);
    expect(source).toHaveBeenCalledTimes(1);
    expect(f.work.hold).not.toHaveBeenCalled();
  });
  it('returns the exact live authoritative result without inventing snapshot evidence', async () => {
    const f = fixture();
    const result = {
      status: 'completed',
      execution_id: 'source-1',
      result: {
        measurement: { mode: 'live', revisionId: null, revenue: 1500 },
      },
    };
    const read = jest.fn().mockResolvedValue(result);
    await expect(
      f.coordinator.conversationRead(
        f.turn,
        'analytics.business.query',
        'call-1',
        'b'.repeat(64),
        read,
      ),
    ).resolves.toBe(result);
    expect(f.context.build).not.toHaveBeenCalled();
    expect(f.agents.answer).not.toHaveBeenCalled();
    expect(f.work.settle).toHaveBeenCalledWith(
      expect.anything(),
      { executionId: 'source-1' },
      expect.anything(),
    );
    expect(f.store.conversationReadReceipt).toHaveBeenCalledWith(
      'run-1',
      'analytics.business.query',
      'call-1',
      'source-1',
      false,
    );
  });

  it.each(['DISPATCHED', 'HELD_UNKNOWN'])(
    'does not redispatch %s work',
    async (state) => {
      const f = fixture();
      f.work.reserve.mockResolvedValue({ id: 'work-1', state });
      const read = jest.fn();
      await expect(
        f.coordinator.conversationRead(
          f.turn,
          'catalog.services.read',
          'call-1',
          'b'.repeat(64),
          read,
        ),
      ).rejects.toThrow(
        state === 'HELD_UNKNOWN'
          ? 'c9_source_read_receipt'
          : 'c9_read_work_in_progress_or_unknown',
      );
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('holds a source exception and never claims business success', async () => {
    const f = fixture();
    const unknown = new Error('synthetic lost response');
    const read = jest.fn().mockRejectedValue(unknown);
    await expect(
      f.coordinator.conversationRead(
        f.turn,
        'catalog.services.read',
        'call-1',
        'b'.repeat(64),
        read,
      ),
    ).rejects.toBe(unknown);
    expect(f.work.hold).toHaveBeenCalledTimes(1);
    expect(f.work.settle).not.toHaveBeenCalled();
    expect(f.turn.failed).toBe(true);
  });

  it('budget rejection happens before source dispatch and cannot create another run', async () => {
    const f = fixture();
    f.work.reserve.mockRejectedValue(new Error('c9_call_budget_exhausted'));
    const read = jest.fn();
    await expect(
      f.coordinator.conversationRead(
        f.turn,
        'catalog.services.read',
        'call-1',
        'b'.repeat(64),
        read,
      ),
    ).rejects.toThrow('c9_call_budget_exhausted');
    expect(read).not.toHaveBeenCalled();
    expect(f.store.conversationReadRun).toHaveBeenCalledTimes(1);
  });

  it('rejects mutations before admission or source dispatch', async () => {
    const f = fixture();
    const read = jest.fn();
    await expect(
      f.coordinator.conversationRead(
        f.turn,
        'appointments.own.create',
        'call-1',
        'b'.repeat(64),
        read,
      ),
    ).rejects.toThrow('c9_conversation_read_only');
    expect(f.store.conversationReadRun).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('settled replay must return the same source receipt', async () => {
    const f = fixture();
    f.work.reserve.mockResolvedValue({
      id: 'work-1',
      state: 'SETTLED',
      resultJson: { executionId: 'source-1' },
    });
    const read = jest
      .fn()
      .mockResolvedValue({ status: 'completed', execution_id: 'source-2' });
    await expect(
      f.coordinator.conversationRead(
        f.turn,
        'catalog.services.read',
        'call-1',
        'b'.repeat(64),
        jest.fn(),
        read,
      ),
    ).rejects.toThrow('c9_source_read_replay_changed');
    expect(f.work.claim).not.toHaveBeenCalled();
    expect(f.work.settle).not.toHaveBeenCalled();
  });
});
