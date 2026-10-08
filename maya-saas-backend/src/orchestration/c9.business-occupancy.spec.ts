import { C9Orchestrator } from './c9.orchestrator';
import { C9Agents } from './c9.agents';
import { C9Strategy } from './c9.strategy';
import { c9DefaultBudget } from './c9.budget';
import { c9Hash, type C9Object } from './c9.contract';
import type { C9Proposal } from './c9.store';
import type { C9WorkDraft } from './c9.work';
import type { OccupancyProjection } from './c9.occupancy-source';

function fixture() {
  const turn = {
    turn: { turnId: 'turn', conversationId: 'conversation' },
    intentHash: 'a'.repeat(64),
  };
  const root = {
    id: 'run',
    state: 'DRAFT',
    authorityHash: 'b'.repeat(64),
    budgetManifestHash: 'c'.repeat(64),
    budgetManifestJson: c9DefaultBudget(),
    validUntil: new Date('2035-05-11T00:00:00.000Z'),
  };
  const ref = {
    sourceType: 'MeasurementRevision',
    id: 'report',
    tenantId: 'tenant',
    subjectKind: 'business_period',
    subjectRef: 'report',
    contractVersion: 1,
    identityHash: 'd'.repeat(64),
    inputHash: 'e'.repeat(64),
    observedAt: '2035-05-10T08:00:00.000Z',
    validUntil: '2035-05-11T00:00:00.000Z',
    retentionUntil: '2035-05-11T00:00:00.000Z',
    status: 'VERIFIED',
    completeness: 'PARTIAL',
    unavailableReason: null,
  };
  let refs: C9Object[] = [ref];
  const facts: C9Object[] = [
    {
      capability: 'c7.measurement.read',
      evidenceHandle: 'h_' + 'f'.repeat(64),
      sourceContract: 'c7.measurement.read/1',
      mode: 'as_reported',
      revision: 2,
      kind: 'business_period',
      asOf: '2035-05-10T08:00:00.000Z',
      period: {
        from: '2035-05-01T00:00:00.000Z',
        toExclusive: '2035-05-10T08:00:00.000Z',
        timezone: 'UTC',
      },
      rule: { key: 'c7.business-period', version: 1 },
      completeness: 'PARTIAL',
      qualification: 'VERIFIED',
      attribution: 'NOT_APPLICABLE',
      metrics: [],
      limitations: ['cash_unavailable'],
    },
  ];
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
      start: '2035-05-10T09:00:00.000Z',
      end: '2035-05-10T10:00:00.000Z',
      timezone: 'Europe/Moscow',
      branchRef: 'branch-hash',
    },
  };
  const receipts = new Map<
    string,
    { id: string; state: string; resultJson: unknown; input: C9WorkDraft }
  >();
  let revision: {
    id: string;
    revision: number;
    alternativesJson: unknown;
  } | null = null;
  const store = {
    transaction: jest.fn(
      (
        _proof: unknown,
        work: (tx: never, principal: never, now: Date) => Promise<unknown>,
      ) => work({} as never, {} as never, new Date('2035-05-10T08:30:00.000Z')),
    ),
    lock: jest.fn().mockResolvedValue(root),
    validateRefs: jest.fn().mockResolvedValue([]),
    conversationReadRun: jest.fn().mockResolvedValue(root),
    snapshot: jest.fn(() =>
      Promise.resolve({ run: root, revisions: revision ? [revision] : [] }),
    ),
    revision: jest.fn((_id: string, _key: string, proposal: C9Proposal) => {
      revision ??= {
        id: 'revision',
        revision: 1,
        alternativesJson: proposal.alternatives,
      };
      return Promise.resolve(revision);
    }),
  };
  const work = {
    reserve: jest.fn((id: string, input: C9WorkDraft) => {
      expect(id).toBe(root.id);
      expect(input.kind).toBe('TOOL_READ');
      if (!receipts.has(input.callKey))
        receipts.set(input.callKey, {
          id: input.callKey,
          state: 'RESERVED',
          resultJson: null,
          input,
        });
      return Promise.resolve({ ...receipts.get(input.callKey)! });
    }),
    claim: jest.fn((runId: string, workId: string) => {
      const r = receipts.get(workId)!;
      if (r.state !== 'RESERVED') return Promise.resolve(null);
      r.state = 'DISPATCHED';
      return Promise.resolve({ runId, workId, generation: 1, token: 'lease' });
    }),
    settle: jest.fn((lease: { workId: string }, result: unknown) => {
      const r = receipts.get(lease.workId)!;
      r.state = 'SETTLED';
      r.resultJson = result;
      return Promise.resolve({ ...r });
    }),
    hold: jest.fn((lease: { workId: string }) => {
      receipts.get(lease.workId)!.state = 'HELD_UNKNOWN';
      return Promise.resolve();
    }),
  };
  const bi = {
    authorize: jest.fn().mockResolvedValue({}),
    select: jest.fn(() => Promise.resolve(refs)),
  };
  const verify = jest.fn().mockResolvedValue(true);
  const occupancy = {
    authorize: jest.fn().mockResolvedValue({}),
    readForExposure: jest.fn(() =>
      Promise.resolve({
        projection: structuredClone(projection),
        revalidate: verify,
      }),
    ),
  };
  const context = {
    build: jest.fn(
      (
        runId: string,
        domain: string,
        sourceRefs: unknown[],
        question: string,
      ) => {
        expect(runId).toBe(root.id);
        expect(domain).toBe('BUSINESS_INTELLIGENCE');
        expect(sourceRefs).toEqual(refs);
        expect(question).toBe('Объясни опубликованный финансовый снимок');
        return Promise.resolve({
          context: {
            trusted: {
              domain: 'BUSINESS_INTELLIGENCE',
              scopeHash: root.authorityHash,
            },
            facts: refs.length ? facts : [],
          },
          handles: {
            keys: () =>
              new Set(
                refs.length ? facts.map((f) => String(f.evidenceHandle)) : [],
              ),
          },
        });
      },
    ),
  };
  const agents = new C9Agents();
  const answer = jest.spyOn(agents, 'answer');
  const create = () =>
    new C9Orchestrator(
      store as never,
      context as never,
      work as never,
      agents,
      {} as never,
      undefined,
      occupancy as never,
      new C9Strategy(),
      undefined,
      bi as never,
    );
  return {
    turn,
    root,
    ref,
    projection,
    receipts,
    store,
    work,
    bi,
    occupancy,
    verify,
    context,
    answer,
    create,
    noReport: () => {
      refs = [];
    },
  };
}

describe('explicit C9 business + cancellation review (deterministic mechanics)', () => {
  it('admits once, uses two existing domains/receipts and saves one Occupancy proposal with real financial scope refs', async () => {
    const f = fixture();
    const result = await f
      .create()
      .reviewBusinessAndCancellationWindows(f.turn);
    expect(f.store.conversationReadRun).toHaveBeenCalledTimes(1);
    expect(f.store.conversationReadRun).toHaveBeenCalledWith(
      f.turn.turn,
      f.turn.intentHash,
      'occupancy_review',
    );
    expect(f.work.reserve).toHaveBeenCalledTimes(2);
    expect(f.answer.mock.calls.map((c) => c[0])).toEqual([
      'BUSINESS_INTELLIGENCE',
      'OCCUPANCY',
    ]);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    const proposal = f.store.revision.mock.calls[0][2];
    expect(proposal.objective).toMatchObject({
      key: 'c9.occupancy_review',
    });
    expect(JSON.stringify(proposal)).toContain('MeasurementRevision');
    expect(result.coordination).toMatchObject({
      run_id: 'run',
      revision_id: 'revision',
      scope: 'explicit_business_occupancy',
      current: false,
    });
    expect(result.analysis.agent.agent_id).toBe('BUSINESS_INTELLIGENCE');
    expect(result.recommendation.agent.agent_id).toBe('OCCUPANCY');
    expect(result.analysis.agent.proposed_action_intents).toEqual([]);
    expect(result.reply).toContain('разные периоды');
    expect(result.reply).toContain('Практический следующий шаг');
    expect(result.reply).toContain(
      'Спрос, доход и вероятность заполнения не оценивались',
    );
    expect(result.recommendation.executionAuthority).toBe(false);
    expect(
      JSON.stringify([...f.receipts.values()].map((r) => r.resultJson)),
    ).not.toContain('metrics');
    expect(
      f.context.build.mock.calls.every((c) => c[1] === 'BUSINESS_INTELLIGENCE'),
    ).toBe(true);
  });
  it.each([{ domainsMax: 1 }, { toolCallsMax: 1 }])(
    'refuses a tightened finite budget before any source read: %j',
    async (patch) => {
      const f = fixture();
      Object.assign(f.root.budgetManifestJson, patch);
      await expect(
        f.create().reviewBusinessAndCancellationWindows(f.turn),
      ).rejects.toThrow(/c9_route_.*budget/);
      expect(f.bi.select).not.toHaveBeenCalled();
      expect(f.occupancy.readForExposure).not.toHaveBeenCalled();
      expect(f.work.reserve).not.toHaveBeenCalled();
    },
  );
  it('exposes honest partial scope when report and saved opportunity are missing', async () => {
    const f = fixture();
    f.noReport();
    Object.assign(f.projection, {
      outcome: 'NONE',
      window: null,
      reason: 'no_saved_cancellation_opportunity',
    });
    const result = await f
      .create()
      .reviewBusinessAndCancellationWindows(f.turn);
    expect(result.reply).toContain('финансовая часть обзора неполна');
    expect(result.reply).toContain('не доказывает отсутствие отмен');
    expect(result.reply).not.toContain('Практический следующий шаг');
    expect(result.recommendation.options).toEqual([
      { key: 'c9.no_action', title: 'Ничего не делать' },
    ]);
  });
  it('replays exact settled evidence/version after service recreation without another CRM read', async () => {
    const f = fixture();
    const first = await f.create().reviewBusinessAndCancellationWindows(f.turn);
    const second = await f
      .create()
      .reviewBusinessAndCancellationWindows(f.turn);
    expect(second.coordination).toMatchObject({
      run_id: first.coordination.run_id,
      revision_id: first.coordination.revision_id,
      replayed: true,
      current: false,
    });
    expect(f.occupancy.readForExposure).toHaveBeenCalledTimes(1);
    expect(f.work.claim).toHaveBeenCalledTimes(2);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(second.reply).toContain('сохранённый результат предыдущей проверки');
    expect(second.reply).not.toContain('Практический следующий шаг');
  });
  it('shares the existing work leases across simultaneous copies of one request', async () => {
    const f = fixture();
    const results = await Promise.allSettled([
      f.create().reviewBusinessAndCancellationWindows({ ...f.turn }),
      f.create().reviewBusinessAndCancellationWindows({ ...f.turn }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(f.occupancy.readForExposure).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect([...f.receipts.values()].map((receipt) => receipt.state)).toEqual([
      'SETTLED',
      'SETTLED',
    ]);
  });
  it('does not redispatch held Occupancy after BI already settled', async () => {
    const f = fixture();
    f.occupancy.readForExposure.mockRejectedValueOnce(
      new Error('source_transport_lost'),
    );
    await expect(
      f.create().reviewBusinessAndCancellationWindows(f.turn),
    ).rejects.toThrow('source_transport_lost');
    expect(f.receipts.get('explicit-published-financial-report')?.state).toBe(
      'SETTLED',
    );
    expect(f.receipts.get('explicit-cancellation-window')?.state).toBe(
      'HELD_UNKNOWN',
    );
    await expect(
      f.create().reviewBusinessAndCancellationWindows(f.turn),
    ).rejects.toThrow('c9_read_work_in_progress_or_unknown');
    expect(f.occupancy.readForExposure).toHaveBeenCalledTimes(1);
    expect(f.store.revision).not.toHaveBeenCalled();
    expect(f.turn).toMatchObject({ runId: 'run', failed: true });
  });
  it('checks the transient window witness after preparation and suppresses the current recommendation on drift', async () => {
    const f = fixture();
    f.verify.mockResolvedValue(false);
    const result = await f
      .create()
      .reviewBusinessAndCancellationWindows(f.turn);
    expect(result.recommendation.outcome).toBe('STALE');
    expect(result.reply).toContain('Исходные данные изменились');
    expect(result.reply).not.toContain('Практический следующий шаг');
    expect(f.verify).toHaveBeenCalledTimes(1);
  });
  it('refuses final exposure if BI authority is revoked during the other domain read', async () => {
    const f = fixture();
    f.bi.authorize
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('c9_source_reader_authority'));
    await expect(
      f.create().reviewBusinessAndCancellationWindows(f.turn),
    ).rejects.toThrow('c9_source_reader_authority');
    expect(f.work.settle).toHaveBeenCalledTimes(2);
  });
  it('rechecks immutable published source before composition and refuses source drift', async () => {
    const f = fixture();
    f.context.build
      .mockImplementationOnce(() =>
        Promise.resolve({
          context: {
            trusted: {
              domain: 'BUSINESS_INTELLIGENCE',
              scopeHash: f.root.authorityHash,
            },
            facts: [],
          },
          handles: { keys: () => new Set<string>() },
        }),
      )
      .mockRejectedValueOnce(new Error('c9_source_changed'));
    await expect(
      f.create().reviewBusinessAndCancellationWindows(f.turn),
    ).rejects.toThrow('c9_source_changed');
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect(f.answer).not.toHaveBeenCalled();
  });
  it('rejects C7 withdrawal after its facts were read while the window witness is checked', async () => {
    const f = fixture();
    f.verify.mockImplementation(() => {
      f.store.validateRefs.mockRejectedValueOnce(
        new Error('c9_source_expired'),
      );
      return Promise.resolve(true);
    });
    await expect(
      f.create().reviewBusinessAndCancellationWindows(f.turn),
    ).rejects.toThrow('c9_source_expired');
    expect(f.answer).toHaveBeenCalledTimes(2);
    expect(f.store.validateRefs).toHaveBeenCalledWith(
      {},
      {},
      [f.ref],
      new Date('2035-05-10T08:30:00.000Z'),
    );
    expect(f.turn).toMatchObject({ runId: 'run', failed: true });
  });
  it('caps the proposal by the selected report validity and retention instead of extending its lifetime', async () => {
    const f = fixture();
    f.ref.validUntil = '2035-05-10T08:50:00.000Z';
    f.ref.retentionUntil = '2035-05-10T08:45:00.000Z';
    await f.create().reviewBusinessAndCancellationWindows(f.turn);
    expect(f.store.revision.mock.calls[0][2].validUntil).toBe(
      '2035-05-10T08:45:00.000Z',
    );
  });
  it('does not erase C7 evidence identity when it is pinned by the BI receipt', async () => {
    const f = fixture();
    await f.create().reviewBusinessAndCancellationWindows(f.turn);
    const bi = f.receipts.get('explicit-published-financial-report')!;
    expect(bi.input.evidenceRefs).toEqual([f.ref]);
    expect(bi.resultJson).toMatchObject({
      sourceDigest: c9Hash('bi-report-source/1', [[f.ref]]),
    });
  });
});
