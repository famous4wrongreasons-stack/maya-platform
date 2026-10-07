import { C9Orchestrator, type C9ConversationReads } from './c9.orchestrator';
import { C9Agents } from './c9.agents';
import { C9Strategy } from './c9.strategy';
import { C9Store, type C9Proposal } from './c9.store';
import { C9WorkService, type C9WorkDraft } from './c9.work';
import { C9ContextService } from './c9.context';
import { C9Allowance } from './c9.allowance';
import {
  C9OccupancySource,
  type OccupancyProjection,
} from './c9.occupancy-source';
import {
  c9Alternative,
  c9Constraints,
  c9Objective,
  c9Object,
} from './c9.contract';
import { c9OwnerDraft } from './c9.inputs';
import { c9Capability } from './c9.registry';

function fixture() {
  const turn: C9ConversationReads = {
    turn: { turnId: 'turn', conversationId: 'conversation' },
    intentHash: 'a'.repeat(64),
  };
  const root = {
    id: 'run',
    authorityHash: 'b'.repeat(64),
    budgetManifestHash: 'c'.repeat(64),
    validUntil: new Date('2035-05-11T00:00:00Z'),
  };
  let saved: {
    id: string;
    revision: number;
    alternativesJson: unknown;
  } | null = null;
  const receipt: { id: string; state: string; resultJson: unknown } = {
    id: 'work',
    state: 'RESERVED',
    resultJson: null,
  };
  const projection: OccupancyProjection = {
    contract: 'maya.c9-occupancy-read/1',
    outcome: 'AVAILABLE',
    asOf: '2035-05-10T08:30:00.000Z',
    reason: 'provider_schedule_and_available_slot_confirmed',
    hasMore: false,
    evidenceRefs: [],
    opportunityRef: 'op-hash',
    scheduleRef: 'schedule-hash',
    window: {
      start: '2035-05-10T09:00:00Z',
      end: '2035-05-10T10:00:00Z',
      timezone: 'Europe/Moscow',
      branchRef: 'branch-hash',
    },
  };
  const store = {
    conversationReadRun: jest.fn().mockResolvedValue(root),
    snapshot: jest.fn(() =>
      Promise.resolve({ run: root, revisions: saved ? [saved] : [] }),
    ),
    revision: jest.fn((_: string, __: string, proposal: C9Proposal) => {
      c9Objective(proposal.objective);
      c9Constraints(proposal.constraints);
      (proposal.alternatives as unknown[]).forEach(c9Alternative);
      proposal.steps.forEach((step) =>
        c9OwnerDraft(
          c9Capability(step.capability, step.domain),
          step.intentContract,
          step.intent,
        ),
      );
      saved = {
        id: 'revision',
        revision: 1,
        alternativesJson: proposal.alternatives,
      };
      return Promise.resolve(saved);
    }),
  };
  const work = {
    reserve: jest.fn((run: string, draft: C9WorkDraft) => {
      expect(run).toBe(root.id);
      expect(draft.kind).toBe('TOOL_READ');
      return Promise.resolve({ ...receipt });
    }),
    claim: jest.fn(() => {
      if (receipt.state !== 'RESERVED') return Promise.resolve(null);
      receipt.state = 'DISPATCHED';
      return Promise.resolve({
        runId: 'run',
        workId: 'work',
        generation: 1,
        token: 'token',
      });
    }),
    settle: jest.fn((_: unknown, result: unknown) => {
      receipt.state = 'SETTLED';
      receipt.resultJson = result;
      return Promise.resolve(receipt);
    }),
    hold: jest.fn(() => {
      receipt.state = 'HELD_UNKNOWN';
      return Promise.resolve();
    }),
  };
  const revalidate = jest.fn().mockResolvedValue(true);
  const read = jest.fn(() => Promise.resolve(structuredClone(projection)));
  const source = {
    authorize: jest.fn().mockResolvedValue({}),
    read,
    revalidate,
    readForExposure: jest.fn(async () => ({
      projection: await read(),
      revalidate,
    })),
  };
  const agents = new C9Agents();
  const answer = jest.spyOn(agents, 'answer');
  const strategy = new C9Strategy();
  const propose = jest.spyOn(strategy, 'propose');
  const create = () =>
    new C9Orchestrator(
      store as unknown as C9Store,
      {} as C9ContextService,
      work as unknown as C9WorkService,
      agents,
      {} as C9Allowance,
      undefined,
      source as unknown as C9OccupancySource,
      strategy,
    );
  return {
    turn,
    root,
    receipt,
    projection,
    store,
    work,
    source,
    create,
    answer,
    propose,
  };
}

describe('one C9 explicit Occupancy vertical (in-memory durable adapter proof)', () => {
  it('calls canonical agent and strategy, saves one non-executing version and minimizes durable receipt', async () => {
    const f = fixture();
    const response = await f.create().checkCancellationWindows(f.turn);
    expect(response.reply).toContain('12:00');
    expect(response.reply).toContain('13:00');
    expect(response.recommendation.options).toHaveLength(2);
    expect(response.coordination).toMatchObject({ revision: 1, current: true });
    expect(response.recommendation).toMatchObject({
      noSideEffects: true,
      executionAuthority: false,
      reasoning: 'deterministic',
    });
    expect(f.store.conversationReadRun).toHaveBeenCalledWith(
      f.turn.turn,
      f.turn.intentHash,
      'occupancy',
    );
    expect(f.answer).toHaveBeenCalledTimes(1);
    expect(f.propose).toHaveBeenCalledTimes(1);
    expect(f.work.reserve.mock.calls[0][1].reservation).toMatchObject({
      toolCalls: 1,
      modelCalls: 0,
    });
    expect(f.receipt.resultJson).toMatchObject({
      window: null,
    });
    expect(c9Object(f.receipt.resultJson).sourceDigest).toMatch(
      /^[a-f0-9]{64}$/,
    );
    const proposal = f.store.revision.mock.calls[0][2];
    expect(
      proposal.steps.every((s) => ['READ', 'NO_ACTION'].includes(s.kind)),
    ).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(
      /discount|clientIds|probability|revenue|MeasurementRevision/,
    );
  });
  it('persists salon-local date across UTC midnight', async () => {
    const f = fixture();
    f.projection.window!.start = '2035-05-10T21:30:00Z';
    f.projection.window!.end = '2035-05-10T22:00:00Z';
    const response = await f.create().checkCancellationWindows(f.turn);
    expect(response.reply).toContain('11.05.2035');
    expect(f.store.revision.mock.calls[0][2].steps[0].intent).toEqual({
      date: '2035-05-11',
    });
  });
  it('restarts with the same saved version, zero redispatch and explicitly historical answer', async () => {
    const f = fixture();
    await f.create().checkCancellationWindows(f.turn);
    const response = await f.create().checkCancellationWindows({ ...f.turn });
    expect(response.coordination).toMatchObject({
      revision: 1,
      replayed: true,
      current: false,
    });
    expect(response.reply).toContain('сохранённый результат');
    expect(f.source.read).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(response.reply).not.toContain('CRM подтвердила');
  });
  it('saves proposal before settlement, so a racing replay cannot replace the recommendation', async () => {
    const f = fixture();
    let replay:
      | Awaited<ReturnType<C9Orchestrator['checkCancellationWindows']>>
      | undefined;
    f.work.settle.mockImplementation(async (_: unknown, result: unknown) => {
      expect(f.store.revision).toHaveBeenCalledTimes(1);
      f.receipt.state = 'SETTLED';
      f.receipt.resultJson = result;
      replay = await f.create().checkCancellationWindows({ ...f.turn });
      return f.receipt;
    });
    const response = await f.create().checkCancellationWindows(f.turn);
    expect(replay!.coordination.revision_id).toBe(
      response.coordination.revision_id,
    );
    expect(replay!.recommendation.options).toEqual(
      response.recommendation.options,
    );
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.source.read).toHaveBeenCalledTimes(1);
  });
  it.each(['DISPATCHED', 'HELD_UNKNOWN'])(
    'does not redispatch interrupted %s work',
    async (state) => {
      const f = fixture();
      f.receipt.state = state;
      await expect(f.create().checkCancellationWindows(f.turn)).rejects.toThrow(
        'read_work_in_progress_or_unknown',
      );
      expect(f.source.read).not.toHaveBeenCalled();
      expect(f.store.revision).not.toHaveBeenCalled();
    },
  );
  it('holds an interrupted settlement without repeating reads or creating another version', async () => {
    const f = fixture();
    f.work.settle.mockRejectedValue(new Error('synthetic persistence loss'));
    await expect(f.create().checkCancellationWindows(f.turn)).rejects.toThrow(
      'synthetic persistence loss',
    );
    await expect(f.create().checkCancellationWindows(f.turn)).rejects.toThrow(
      'read_work_in_progress_or_unknown',
    );
    expect(f.source.read).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
  });
  it('refuses cancelled/revoked run even when a previous version exists', async () => {
    const f = fixture();
    await f.create().checkCancellationWindows(f.turn);
    f.source.authorize.mockRejectedValue(
      new Error('c9_run_expired_or_terminal'),
    );
    await expect(f.create().checkCancellationWindows(f.turn)).rejects.toThrow(
      'run_expired_or_terminal',
    );
    expect(f.source.read).toHaveBeenCalledTimes(1);
  });
  it.each([
    'OCCUPIED',
    'EXPIRED',
    'CLOSED',
    'STALE',
    'INCOMPLETE',
    'UNAVAILABLE',
    'NONE',
  ] as const)('returns %s with only no-action', async (outcome) => {
    const f = fixture();
    f.projection.outcome = outcome;
    f.projection.window = null;
    const response = await f.create().checkCancellationWindows(f.turn);
    expect(response.recommendation.options).toEqual([
      { key: 'c9.no_action', title: 'Ничего не делать' },
    ]);
    expect(response.coordination.current).toBe(false);
    if (outcome === 'UNAVAILABLE') {
      expect(response.recommendation.agent.completeness).toMatchObject({
        status: 'UNAVAILABLE',
      });
      expect(
        c9Object((response.recommendation.agent.facts_used as unknown[])[0])
          .status,
      ).toBe('unavailable');
      expect(response.recommendation.agent.evidence_refs).toEqual([]);
    }
  });
});

it('replays the exact saved revision even after a newer owner revision exists', async () => {
  const f = fixture();
  await f.create().checkCancellationWindows(f.turn);
  const original = await f.store.snapshot();
  f.store.snapshot.mockResolvedValue({
    ...original,
    revisions: [
      ...original.revisions,
      {
        id: 'newer',
        revision: 2,
        alternativesJson: [{ key: 'wrong', title: 'Wrong version' }],
      },
    ],
  });
  const replay = await f.create().checkCancellationWindows(f.turn);
  expect(replay.coordination).toMatchObject({
    revision_id: 'revision',
    revision: 1,
    replayed: true,
    current: false,
  });
  expect(replay.reply).not.toContain('Wrong version');
  expect(f.source.read).toHaveBeenCalledTimes(1);
});
it('denies an old or missing exact-version receipt without falling back to latest', async () => {
  const f = fixture();
  await f.create().checkCancellationWindows(f.turn);
  delete (f.receipt.resultJson as Record<string, unknown>).revisionId;
  await expect(f.create().checkCancellationWindows(f.turn)).rejects.toThrow(
    'source_read_receipt',
  );
  expect(f.source.read).toHaveBeenCalledTimes(1);
});
it('withholds current availability when source changes after settlement without changing saved version', async () => {
  const f = fixture();
  f.source.revalidate.mockResolvedValue(false);
  const reply = await f.create().checkCancellationWindows(f.turn);
  expect(reply.coordination.current).toBe(false);
  expect(reply.recommendation.outcome).toBe('STALE');
  expect(reply.reply).not.toContain('CRM подтвердила');
  expect(f.receipt.resultJson).toMatchObject({
    outcome: 'AVAILABLE',
    revisionId: 'revision',
  });
  expect(f.store.revision).toHaveBeenCalledTimes(1);
  expect(f.source.read).toHaveBeenCalledTimes(1);
});

it('rechecks authority after the final metadata verifier', async () => {
  const f = fixture();
  f.source.revalidate.mockImplementation(() => {
    f.source.authorize.mockRejectedValue(new Error('revoked'));
    return Promise.resolve(true);
  });
  await expect(f.create().checkCancellationWindows(f.turn)).rejects.toThrow(
    'revoked',
  );
  expect(f.answer).not.toHaveBeenCalled();
});
