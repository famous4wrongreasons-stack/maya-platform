import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { C9WorkService, type C9WorkDraft } from './c9.work';
import { C9Orchestrator } from './c9.orchestrator';
import { C9Agents } from './c9.agents';
import { C9Strategy } from './c9.strategy';
import { C9ContextService, C9Handles } from './c9.context';
import {
  c9Alternative,
  c9Constraints,
  c9Objective,
  C9Object,
  c9Hash,
} from './c9.contract';
import { C9Proposal } from './c9.store';
import { c9OwnerDraft } from './c9.inputs';
import { c9Capability } from './c9.registry';
import {
  isExplicitClientReturnRequest,
  lifecycleStatement,
} from './c9.lifecycle-presentation';
import { LifecycleSelection } from './c9.lifecycle-source';

function fixture(exact = false) {
  const request = { period: 'more_than_two_months' } as const;
  const parameters = {
    elapsed: { unit: 'calendar_month', count: 2 },
    comparison: 'gt',
    evidence: 'proven_attendance',
    minimumCoverage: 'PARTIAL',
    serviceScope: { restricted: false, count: 0 },
    timezone: 'Europe/Moscow',
  };
  const turn = {
    turn: { turnId: 'turn', conversationId: 'conversation' },
    intentHash: 'a'.repeat(64),
  };
  const root = {
    id: 'run',
    authorityHash: 'b'.repeat(64),
    budgetManifestHash: 'c'.repeat(64),
    validUntil: new Date('2035-05-11T00:00:00Z'),
  };
  const ref = {
    sourceType: 'C8ResultRevision',
    id: 'source',
    tenantId: 'tenant',
    subjectKind: 'client',
    subjectRef: 'private-client',
    contractVersion: 1,
    identityHash: 'd'.repeat(64),
    inputHash: 'e'.repeat(64),
    observedAt: '2035-05-10T08:00:00.000Z',
    validUntil: '2035-05-11T00:00:00.000Z',
    retentionUntil: null,
    status: 'VERIFIED',
    completeness: 'PARTIAL',
    unavailableReason: null,
  };
  const selection: LifecycleSelection = {
    ...(exact ? { request } : {}),
    contract: 'maya.c9-lifecycle-selection/1',
    asOf: '2035-05-10T08:30:00.000Z',
    configured: true,
    hasMore: true,
    withheld: false,
    refs: [ref],
  };
  let revision: {
    id: string;
    revision: number;
    alternativesJson: unknown;
    evidenceRefsJson: unknown;
  } | null = null;
  const receipt: { id: string; state: string; resultJson: unknown } = {
    id: 'work',
    state: 'RESERVED',
    resultJson: null,
  };
  const store = {
    transaction: jest.fn(
      (
        _: unknown,
        fn: (
          tx: unknown,
          principal: { tenantId: string; userId: string },
          now: Date,
        ) => unknown,
      ) => fn({}, { tenantId: 'tenant', userId: 'owner' }, new Date()),
    ),
    lock: jest.fn().mockResolvedValue(root),
    validateRefs: jest.fn().mockResolvedValue([]),
    conversationReadRun: jest.fn().mockResolvedValue(root),
    snapshot: jest.fn(() =>
      Promise.resolve({ run: root, revisions: revision ? [revision] : [] }),
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
      revision = {
        id: 'revision',
        revision: 1,
        alternativesJson: proposal.alternatives,
        evidenceRefsJson: proposal.evidenceRefs,
      };
      return Promise.resolve(revision);
    }),
  };
  const work = {
    reserve: jest.fn((run: string, draft: C9WorkDraft) => {
      expect(run).toBe(root.id);
      expect(draft.taskKey).toBe('clients.dormant.list');
      return Promise.resolve({ ...receipt });
    }),
    claim: jest.fn(() => {
      receipt.state = 'DISPATCHED';
      return Promise.resolve({ runId: root.id, workId: receipt.id });
    }),
    settle: jest.fn((_: unknown, result: unknown) => {
      receipt.state = 'SETTLED';
      receipt.resultJson = JSON.parse(JSON.stringify(result));
      return Promise.resolve();
    }),
    hold: jest.fn(() => {
      receipt.state = 'HELD_UNKNOWN';
      return Promise.resolve();
    }),
  };
  const source = {
    authorize: jest.fn().mockResolvedValue({}),
    assertCurrent: jest.fn().mockResolvedValue(undefined),
    select: jest.fn(() =>
      Promise.resolve(JSON.parse(JSON.stringify(selection))),
    ),
  };
  let current = true;
  const context = {
    build: jest.fn((_run: string, _domain: string, refs: C9Object[]) => {
      const handles = new C9Handles(root.id);
      const facts = refs.map((r) => ({
        capability: 'c8.result.read',
        evidenceHandle: handles.add(r),
        kind: 'POLICY_SIGNAL',
        current,
        available: current,
        qualification: 'VERIFIED',
        completeness: 'PARTIAL',
        asOf: '2035-05-09T08:00:00.000Z',
        rule: {
          key: 'c8.dormancy/cadence',
          version: 1,
          ...(exact ? { parameters } : {}),
        },
        values: [{ key: 'cadence', value: true }],
        reasons: [],
      }));
      return Promise.resolve({
        handles,
        context: {
          trusted: {
            domain: 'CLIENT_LIFECYCLE',
            scopeHash: root.authorityHash,
          },
          facts,
        },
      });
    }),
  };
  const agents = new C9Agents();
  const answer = jest.spyOn(agents, 'answer');
  const create = () =>
    new C9Orchestrator(
      store as never,
      context as unknown as C9ContextService,
      work as never,
      agents,
      {} as never,
      undefined,
      undefined,
      new C9Strategy(),
      source as never,
    );
  return {
    request,
    parameters,
    turn,
    selection,
    store,
    work,
    source,
    receipt,
    context,
    create,
    answer,
    stale: () => {
      current = false;
    },
  };
}

describe('explicit C9 Lifecycle (synthetic durable adapter)', () => {
  it('binds the finite request to run, receipt and exact source fences across restart without rediscovery', async () => {
    const f = fixture(true);
    const first = await f.create().checkClientReturn(f.turn, f.request);
    const scopeHash = c9Hash('lifecycle-request-scope/1', [
      f.turn.intentHash,
      f.request,
    ]);
    expect(f.store.conversationReadRun).toHaveBeenCalledWith(
      f.turn.turn,
      scopeHash,
      'lifecycle',
    );
    expect(f.work.reserve.mock.calls[0][1].inputHash).toBe(
      c9Hash('lifecycle-request/1', [scopeHash]),
    );
    expect(f.receipt.resultJson).toMatchObject({ request: f.request });
    expect(JSON.stringify(f.receipt.resultJson)).not.toContain(
      'private-client',
    );
    expect(first.recommendation.request).toEqual(f.request);
    expect(first.recommendation.outcome).toBe('PARTIAL');
    expect(first.reply).toContain('строго больше двух календарных месяцев');
    const repeated = await f.create().checkClientReturn(f.turn, f.request);
    expect(repeated.coordination.revision_id).toBe(
      first.coordination.revision_id,
    );
    expect(repeated.recommendation.outcome).toBe('HISTORICAL');
    expect(f.source.select).toHaveBeenCalledTimes(1);
    expect(f.source.select).toHaveBeenCalledWith('run', f.request);
    expect(f.source.assertCurrent).toHaveBeenLastCalledWith(
      'tenant',
      'owner',
      f.selection.refs,
      f.request,
    );
    expect(f.store.revision).toHaveBeenCalledTimes(1);
  });
  it('rejects a replay with a missing or changed saved request even if persistence were to return the wrong receipt', async () => {
    const f = fixture(true);
    await f.create().checkClientReturn(f.turn, f.request);
    const receipt = f.receipt.resultJson as C9Object;
    delete receipt.request;
    await expect(
      f.create().checkClientReturn(f.turn, f.request),
    ).rejects.toThrow('source_read_receipt');
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });
  it('copies the request before the first await and rejects extra authority before reading storage', async () => {
    const f = fixture(true);
    const request = { period: 'more_than_two_months' } as const;
    const result = f.create().checkClientReturn(f.turn, request);
    Object.assign(request, { period: 'sixty_days', branch: 'foreign' });
    await result;
    expect(f.source.select).toHaveBeenCalledWith('run', f.request);
    const invalid = fixture(true);
    await expect(
      invalid.create().checkClientReturn(invalid.turn, request),
    ).rejects.toThrow('lifecycle_request');
    expect(invalid.store.conversationReadRun).not.toHaveBeenCalled();
  });
  it('does not expose a replay whose exact current rule has drifted into a 60-day rule', async () => {
    const f = fixture(true);
    await f.create().checkClientReturn(f.turn, f.request);
    f.parameters.elapsed = { unit: 'day', count: 60 };
    const result = await f.create().checkClientReturn(f.turn, f.request);
    expect(result.recommendation.outcome).toBe('STALE');
    expect(result.recommendation.agent.findings).toEqual([]);
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });
  it('uses actual refs, one bounded read, agent, saved READ/NO_ACTION proposal, unknown population and no identifiers in response', async () => {
    const f = fixture();
    const response = await f.create().checkClientReturn(f.turn);
    expect(response.reply).toContain('По оценке на 09.05.2035, 08:00 (UTC)');
    expect(response.reply).not.toContain('c8.dormancy/');
    expect(response.reply).toContain('\n\n');
    expect(response.reply).toContain('не список уникальных клиентов');
    expect(response.recommendation.agent).toMatchObject({
      agent_id: 'CLIENT_LIFECYCLE',
      completeness: {
        status: 'PARTIAL',
        totalCount: null,
        hasMore: true,
        truncated: true,
      },
    });
    expect(response.recommendation).toMatchObject({
      canContact: false,
      noSideEffects: true,
      executionAuthority: false,
    });
    expect(JSON.stringify(response)).not.toMatch(
      /private-client|subjectRef|subjectId|phone|email/,
    );
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(
      f.store.revision.mock.calls[0][2].steps.every((s) =>
        ['READ', 'NO_ACTION'].includes(s.kind),
      ),
    ).toBe(true);
    expect(f.context.build).toHaveBeenCalledTimes(2);
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });
  it('the actual work admission accepts the registry-derived zero-cost proof', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    const tx = {
      c9WorkReceipt: {
        findFirst: jest.fn(() => {
          throw new Error('validated-before-db');
        }),
      },
    };
    const work = new C9WorkService({
      transaction: (
        _: unknown,
        fn: (
          transaction: typeof tx,
          principal: { tenantId: string },
          now: Date,
        ) => unknown,
      ) => fn(tx, { tenantId: 'tenant' }, new Date()),
      lock: () => Promise.resolve({ budgetManifestJson: {} }),
    } as never);
    const draft = f.work.reserve.mock.calls[0][1];
    await expect(work.reserve('run', draft)).rejects.toThrow(
      'validated-before-db',
    );
    expect(tx.c9WorkReceipt.findFirst).toHaveBeenCalledTimes(1);
    await expect(
      work.reserve('run', {
        ...draft,
        reservation: {
          ...(draft.reservation as object),
          zeroCostEvidenceRef: 'local:C8ReadService:no-provider-charge',
        },
      }),
    ).rejects.toThrow('unverified_cost_basis');
    expect(tx.c9WorkReceipt.findFirst).toHaveBeenCalledTimes(1);
  });

  it('restart reuses the version, reauthorizes exact saved refs and never rediscovers', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    const second = await f.create().checkClientReturn({ ...f.turn });
    expect(second.coordination).toMatchObject({
      revision: 1,
      replayed: true,
      current: false,
    });
    expect(f.source.select).toHaveBeenCalledTimes(1);
    expect(f.work.claim).toHaveBeenCalledTimes(1);
    expect(f.context.build).toHaveBeenCalledTimes(3);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
  });
  it('policy/dependency change before exposure withholds prior findings without rewriting evidence', async () => {
    const f = fixture();
    f.store.snapshot.mockImplementation(() => {
      f.stale();
      return Promise.resolve({
        run: {} as never,
        revisions: [
          {
            id: 'revision',
            revision: 1,
            alternativesJson: [],
            evidenceRefsJson: f.selection.refs,
          },
        ],
      });
    });
    const response = await f.create().checkClientReturn(f.turn);
    expect(response.recommendation).toMatchObject({
      outcome: 'STALE',
      agent: { findings: [] },
    });
    expect(response.reply).not.toContain('условие c8.dormancy/cadence');
    expect(f.selection.refs).toHaveLength(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
  });
  it('receipt keeps no subject refs and replay selects its exact version, never the newest', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    expect(JSON.stringify(f.receipt.resultJson)).not.toMatch(
      /private-client|subjectRef|identityHash/,
    );
    const original = f.store.snapshot.getMockImplementation()!;
    f.store.snapshot.mockImplementation(async () => {
      const snapshot = await original();
      return {
        ...snapshot,
        revisions: [
          ...snapshot.revisions,
          {
            id: 'new-revision',
            revision: 2,
            alternativesJson: [{ key: 'new', title: 'Different owner edit' }],
            evidenceRefsJson: [],
          },
        ],
      };
    });
    const replay = await f.create().checkClientReturn(f.turn);
    expect(replay.coordination.revision).toBe(1);
    expect(replay.reply).not.toContain('Different owner edit');
  });
  it('refuses late policy drift after findings were built without replacing saved work', async () => {
    const f = fixture();
    f.source.assertCurrent.mockRejectedValue(
      new BadRequestException('c9_source_changed'),
    );
    await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
      'c9_source_changed',
    );
    expect(f.answer).toHaveBeenCalledTimes(1);
    expect(f.context.build).toHaveBeenCalledTimes(2);
    expect(f.source.assertCurrent).toHaveBeenCalledWith(
      'tenant',
      'owner',
      f.selection.refs,
    );
    expect(f.store.validateRefs).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: 'tenant', userId: 'owner' },
      f.selection.refs,
      expect.any(Date),
    );
    expect(f.receipt.state).toBe('SETTLED');
    expect(f.work.claim).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.work.hold).not.toHaveBeenCalled();
  });
  it('rechecks authority after projection and refuses revocation without another dispatch', async () => {
    const f = fixture();
    const build = f.context.build.getMockImplementation()!;
    f.context.build.mockImplementation(async (...args) => {
      const result = await build(...args);
      if (f.receipt.state === 'SETTLED')
        f.source.authorize.mockRejectedValue(
          new ForbiddenException('membership revoked'),
        );
      return result;
    });
    await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
      'membership revoked',
    );
    expect(f.answer).toHaveBeenCalledTimes(1);
    expect(f.source.assertCurrent).not.toHaveBeenCalled();
    expect(f.work.claim).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
  });
  it('cleanup of the exact revision cannot trigger newest fallback or discovery', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    f.store.snapshot.mockResolvedValue({ run: {} as never, revisions: [] });
    await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
      'source_read_receipt',
    );
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });

  it('a stale source at restart never exposes the saved boolean', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    f.stale();
    const response = await f.create().checkClientReturn(f.turn);
    expect(response.recommendation.outcome).toBe('STALE');
    expect(response.recommendation.agent.findings).toEqual([]);
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });
  it.each(['HELD_UNKNOWN', 'DISPATCHED'])(
    'does not loop or redispatch %s',
    async (state) => {
      const f = fixture();
      f.receipt.state = state;
      await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
        'read_work_in_progress_or_unknown',
      );
      expect(f.source.select).not.toHaveBeenCalled();
      expect(f.work.claim).not.toHaveBeenCalled();
    },
  );
  it('holds an interrupted source and requires a new explicit request', async () => {
    const f = fixture();
    f.source.select.mockRejectedValue(new Error('source unavailable'));
    await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
      'source unavailable',
    );
    await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
      'read_work_in_progress_or_unknown',
    );
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });
  it('revocation and cancellation cannot be bypassed with a saved version', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    for (const error of [
      new ForbiddenException('membership revoked'),
      new BadRequestException('c9_run_cancelled'),
    ]) {
      f.source.authorize.mockRejectedValue(error);
      await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
        error.message,
      );
    }
    expect(f.source.select).toHaveBeenCalledTimes(1);
  });
  it('subject scope denial is not converted into historical success', async () => {
    const f = fixture();
    await f.create().checkClientReturn(f.turn);
    f.context.build.mockRejectedValue(
      new ForbiddenException('c8_branch_scope_denied'),
    );
    await expect(f.create().checkClientReturn(f.turn)).rejects.toThrow(
      'c8_branch_scope_denied',
    );
  });
  it.each([true, false])(
    'empty configured=%s stays unavailable; empty is not an active base',
    async (configured) => {
      const f = fixture();
      f.selection.refs = [];
      f.selection.configured = configured;
      const response = await f.create().checkClientReturn(f.turn);
      expect(response.recommendation.agent).toMatchObject({
        findings: [],
        completeness: { status: 'UNAVAILABLE', totalCount: null },
      });
      expect(response.recommendation.options).toEqual([
        { key: 'c9.no_action', title: 'Ничего не делать' },
      ]);
    },
  );
  it('false signal is not a claim that the Client is active', () => {
    const text = lifecycleStatement({
      kind: 'POLICY_SIGNAL',
      current: true,
      available: true,
      qualification: 'VERIFIED',
      completeness: 'PARTIAL',
      asOf: '2035-05-09T00:00:00Z',
      rule: { key: 'c8.dormancy/cadence', version: 1 },
      values: [{ key: 'cadence', value: false }],
    });
    expect(text).toContain('не выполнено');
    expect(text).toContain('Исходные данные неполные');
    expect(text).not.toContain('активен');
  });
  it('accepts only the bounded explicit request and never a compound send instruction', () => {
    expect(isExplicitClientReturnRequest('Кого пора вернуть?')).toBe(true);
    expect(isExplicitClientReturnRequest('Проверь спящих клиентов')).toBe(true);
    for (const text of [
      'Каждый день проверяй спящих клиентов',
      'Кого пора вернуть? Отправь им скидку',
      'Кого пора вернуть в филиале 2?',
      'Верни клиентов',
    ])
      expect(isExplicitClientReturnRequest(text)).toBe(false);
  });
});
