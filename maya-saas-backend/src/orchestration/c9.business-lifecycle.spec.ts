import { ForbiddenException } from '@nestjs/common';
import { AiCoreService } from '../ai-tools/ai-core.service';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';
import { C9Agents } from './c9.agents';
import { BI_REPORT_CALL } from './c9.bi-source';
import { c9DefaultBudget } from './c9.budget';
import { C9Handles } from './c9.context';
import {
  c9Alternative,
  c9Constraints,
  c9Hash,
  c9Objective,
  type C9Object,
} from './c9.contract';
import { c9OwnerDraft } from './c9.inputs';
import type { LifecycleSelection } from './c9.lifecycle-source';
import { C9Orchestrator, type C9ConversationReads } from './c9.orchestrator';
import { c9Capability } from './c9.registry';
import type { C9Proposal } from './c9.store';
import { C9Strategy } from './c9.strategy';
import type { C9WorkDraft, C9WorkLease } from './c9.work';

const LIFECYCLE_CALL = 'explicit-client-return';
const NOW = '2035-05-10T08:30:00.000Z';
type FixtureDeadlines = {
  rootValidUntil: string;
  financialValidUntil: string;
  financialRetentionUntil: string;
  clientValidUntil: string;
  clientRetentionUntil: string;
};

/** Durable JSON columns round-trip into this Jest realm's plain objects. */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Synthetic durable ports only. Orchestration, both domain agents, strategy and
 * proposal validators are real. This is not HTTP, database, model or C8/C7 owner
 * acceptance; the maps model saved receipts/revisions across service instances. */
function fixture(deadlines: Partial<FixtureDeadlines> = {}) {
  const turn: C9ConversationReads = {
    turn: { turnId: 'turn', conversationId: 'conversation' },
    intentHash: 'a'.repeat(64),
  };
  const root = {
    id: 'run',
    state: 'DRAFT',
    authorityHash: 'b'.repeat(64),
    budgetManifestHash: 'c'.repeat(64),
    budgetManifestJson: c9DefaultBudget(),
    validUntil: new Date(
      deadlines.rootValidUntil ?? '2035-05-11T00:00:00.000Z',
    ),
  };
  const financialRef = {
    sourceType: 'MeasurementRevision',
    id: 'financial-source',
    tenantId: 'tenant',
    subjectKind: 'business_period',
    subjectRef: 'financial-subject-not-for-output',
    contractVersion: 1,
    identityHash: 'd'.repeat(64),
    inputHash: 'e'.repeat(64),
    observedAt: '2035-05-10T08:00:00.000Z',
    validUntil: deadlines.financialValidUntil ?? '2035-05-10T08:40:00.000Z',
    retentionUntil:
      deadlines.financialRetentionUntil ?? '2035-05-10T08:40:00.000Z',
    status: 'VERIFIED',
    completeness: 'PARTIAL',
    unavailableReason: null,
  };
  const clientRef = {
    ...financialRef,
    sourceType: 'C8ResultRevision',
    id: 'lifecycle-source',
    subjectKind: 'client',
    subjectRef: 'private-client-not-for-output',
    identityHash: 'f'.repeat(64),
    inputHash: '1'.repeat(64),
    validUntil: deadlines.clientValidUntil ?? '2035-05-10T09:00:00.000Z',
    retentionUntil:
      deadlines.clientRetentionUntil ?? '2035-05-10T08:50:00.000Z',
  };
  const selection: LifecycleSelection = {
    contract: 'maya.c9-lifecycle-selection/1',
    asOf: NOW,
    configured: true,
    hasMore: true,
    withheld: false,
    refs: [clientRef],
  };
  const events: string[] = [];
  const invalidatedRefs = new Set<string>();
  const controls: {
    financialRefs: C9Object[];
    lifecycleCurrent: boolean;
    finalLifecycleCurrent: boolean;
    afterBuild?: (domain: string, refs: C9Object[]) => void;
  } = {
    financialRefs: [financialRef],
    lifecycleCurrent: true,
    finalLifecycleCurrent: true,
  };
  type Receipt = {
    id: string;
    state: string;
    resultJson: unknown;
    input: C9WorkDraft;
  };
  type Revision = {
    id: string;
    revision: number;
    alternativesJson: unknown;
    evidenceRefsJson: unknown;
  };
  const receipts = new Map<string, Receipt>();
  const revisions: Revision[] = [];
  const store = {
    conversationReadRun: jest.fn(() => {
      events.push('admit');
      return Promise.resolve(root);
    }),
    transaction: jest.fn(
      (
        _proof: unknown,
        work: (tx: never, principal: never, now: Date) => Promise<unknown>,
      ) =>
        work(
          {} as never,
          { tenantId: 'tenant', userId: 'owner' } as never,
          new Date(NOW),
        ),
    ),
    lock: jest.fn(() => {
      events.push('lock');
      return Promise.resolve(root);
    }),
    validateRefs: jest.fn(
      (_tx: unknown, _principal: unknown, refs: C9Object[]) => {
        events.push('validate:' + refs.map((ref) => ref.id).join(','));
        if (refs.some((ref) => invalidatedRefs.has(String(ref.id))))
          return Promise.reject(new Error('c9_source_expired'));
        return Promise.resolve([]);
      },
    ),
    snapshot: jest.fn(() => {
      events.push('snapshot');
      return Promise.resolve({
        run: root,
        revisions: jsonClone(revisions),
      });
    }),
    revision: jest.fn((_id: string, _key: string, proposal: C9Proposal) => {
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
      events.push('revision');
      const saved = {
        id: 'revision',
        revision: 1,
        alternativesJson: jsonClone(proposal.alternatives),
        evidenceRefsJson: jsonClone(proposal.evidenceRefs),
      };
      revisions.push(saved);
      return Promise.resolve(jsonClone(saved));
    }),
  };
  const work = {
    reserve: jest.fn((runId: string, input: C9WorkDraft) => {
      expect(runId).toBe(root.id);
      expect(input.kind).toBe('TOOL_READ');
      const previous = receipts.get(input.callKey);
      if (previous) expect(previous.input.inputHash).toBe(input.inputHash);
      else
        receipts.set(input.callKey, {
          id: input.callKey,
          state: 'RESERVED',
          resultJson: null,
          input: jsonClone(input),
        });
      return Promise.resolve(jsonClone(receipts.get(input.callKey)!));
    }),
    claim: jest.fn((runId: string, workId: string) => {
      const receipt = receipts.get(workId)!;
      if (receipt.state !== 'RESERVED') return Promise.resolve(null);
      receipt.state = 'DISPATCHED';
      return Promise.resolve({ runId, workId, generation: 1, token: 'lease' });
    }),
    settle: jest.fn((lease: C9WorkLease, result: unknown) => {
      const receipt = receipts.get(lease.workId)!;
      receipt.state = 'SETTLED';
      receipt.resultJson = jsonClone(result);
      events.push('settle:' + lease.workId);
      return Promise.resolve(jsonClone(receipt));
    }),
    hold: jest.fn((lease: C9WorkLease) => {
      receipts.get(lease.workId)!.state = 'HELD_UNKNOWN';
      return Promise.resolve();
    }),
  };
  const discoverFinancial = jest.fn(() => jsonClone(controls.financialRefs));
  const bi = {
    authorize: jest.fn(() => {
      events.push('authorize:BI');
      return Promise.resolve({});
    }),
    select: jest.fn(() => {
      events.push('select:BI');
      const saved = receipts.get(BI_REPORT_CALL);
      return Promise.resolve(
        saved ? jsonClone(saved.input.evidenceRefs) : discoverFinancial(),
      );
    }),
  };
  const lifecycle = {
    authorize: jest.fn(() => {
      events.push('authorize:Lifecycle');
      return Promise.resolve({});
    }),
    select: jest.fn(() => {
      events.push('select:Lifecycle');
      return Promise.resolve(jsonClone(selection));
    }),
    assertCurrent: jest.fn(
      (tenantId: string, userId: string, refs: readonly C9Object[]) => {
        expect(tenantId).toBe('tenant');
        expect(userId).toBe('owner');
        expect(refs.every((ref) => ref.sourceType === 'C8ResultRevision')).toBe(
          true,
        );
        events.push('current:' + refs.map((ref) => ref.id).join(','));
        if (refs.length && !controls.finalLifecycleCurrent)
          return Promise.reject(new Error('c9_source_changed'));
        return Promise.resolve();
      },
    ),
  };
  const context = {
    build: jest.fn((runId: string, domain: string, refs: C9Object[]) => {
      expect(runId).toBe(root.id);
      const handles = new C9Handles(root.id);
      events.push('context:' + domain);
      const facts = refs.map((ref): C9Object => {
        const evidenceHandle = handles.add(ref);
        if (domain === 'BUSINESS_INTELLIGENCE') {
          expect(ref.sourceType).toBe('MeasurementRevision');
          return {
            capability: 'c7.measurement.read',
            evidenceHandle,
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
          };
        }
        expect(domain).toBe('CLIENT_LIFECYCLE');
        expect(ref.sourceType).toBe('C8ResultRevision');
        return {
          capability: 'c8.result.read',
          evidenceHandle,
          kind: 'POLICY_SIGNAL',
          current: controls.lifecycleCurrent,
          available: controls.lifecycleCurrent,
          qualification: 'VERIFIED',
          completeness: 'PARTIAL',
          asOf: '2035-05-09T08:00:00.000Z',
          rule: { key: 'c8.dormancy/cadence', version: 1 },
          values: [{ key: 'cadence', value: true }],
          reasons: [],
        };
      });
      controls.afterBuild?.(domain, refs);
      return Promise.resolve({
        handles,
        context: {
          trusted: { domain, scopeHash: root.authorityHash },
          facts,
        },
      });
    }),
  };
  const agents = new C9Agents();
  const actualAnswer = agents.answer.bind(agents);
  const answer = jest.spyOn(agents, 'answer').mockImplementation((...args) => {
    events.push('answer:' + args[0]);
    return actualAnswer(...args);
  });
  const create = () =>
    new C9Orchestrator(
      store as never,
      context as never,
      work as never,
      agents,
      {} as never,
      undefined,
      undefined,
      new C9Strategy(),
      lifecycle as never,
      bi as never,
    );
  return {
    turn,
    root,
    financialRef,
    clientRef,
    selection,
    controls,
    invalidatedRefs,
    receipts,
    revisions,
    store,
    work,
    bi,
    lifecycle,
    context,
    answer,
    events,
    discoverFinancial,
    create,
  };
}

describe('explicit C9 business + Client Lifecycle (synthetic durable ports)', () => {
  it('admits one client_value run, shares two reads and exposes both domains only after saved work', async () => {
    const f = fixture();
    const response = await f.create().reviewBusinessAndClientReturn(f.turn);
    expect(f.store.conversationReadRun).toHaveBeenCalledTimes(1);
    expect(f.store.conversationReadRun).toHaveBeenCalledWith(
      f.turn.turn,
      f.turn.intentHash,
      'client_value',
    );
    expect(f.work.reserve).toHaveBeenCalledTimes(2);
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect(f.answer.mock.calls.map((call) => call[0])).toEqual([
      'BUSINESS_INTELLIGENCE',
      'CLIENT_LIFECYCLE',
    ]);
    const firstSource = Math.min(
      f.events.indexOf('select:BI'),
      f.events.indexOf('select:Lifecycle'),
    );
    expect(f.events.indexOf('authorize:BI')).toBeLessThan(firstSource);
    expect(f.events.indexOf('authorize:Lifecycle')).toBeLessThan(firstSource);
    expect(f.events.indexOf('settle:' + LIFECYCLE_CALL)).toBeLessThan(
      f.events.indexOf('answer:BUSINESS_INTELLIGENCE'),
    );
    expect(response.coordination).toMatchObject({
      run_id: 'run',
      revision_id: 'revision',
      revision: 1,
      scope: 'explicit_business_lifecycle',
      current: false,
      replayed: false,
      domains: ['BUSINESS_INTELLIGENCE', 'CLIENT_LIFECYCLE'],
    });
    expect(response.analysis.agent.agent_id).toBe('BUSINESS_INTELLIGENCE');
    expect(response.analysis.agent.proposed_action_intents).toEqual([]);
    expect(response.recommendation).toMatchObject({
      agent: { agent_id: 'CLIENT_LIFECYCLE' },
      noSideEffects: true,
      executionAuthority: false,
      canContact: false,
    });
    expect(response.reply).toContain('не список уникальных клиентов');
    expect(response.reply).toContain('разрешения на контакт нет');
    expect(f.turn.runId).toBe('run');
    expect(f.events.at(-1)).toBe('current:lifecycle-source');
    expect(f.events.at(-2)).toBe('validate:financial-source,lifecycle-source');
    expect(f.lifecycle.assertCurrent).toHaveBeenCalledWith('tenant', 'owner', [
      f.clientRef,
    ]);
    expect(f.store.transaction).toHaveBeenCalledTimes(1);
    const validated = f.store.validateRefs.mock.calls.flatMap(
      (call) => call[2],
    );
    expect(validated).toEqual([f.financialRef, f.clientRef]);
  });

  it('retains financial evidence only in its read receipt and source-caps the single C8-only proposal', async () => {
    const f = fixture();
    await f.create().reviewBusinessAndClientReturn(f.turn);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    const proposal = f.store.revision.mock.calls[0][2];
    expect(proposal.evidenceRefs).toEqual([f.clientRef]);
    expect(proposal.validUntil).toBe(f.clientRef.retentionUntil);
    expect(JSON.stringify(proposal)).not.toContain('MeasurementRevision');
    expect(
      proposal.steps.every((step) => ['READ', 'NO_ACTION'].includes(step.kind)),
    ).toBe(true);
    expect(f.receipts.get(BI_REPORT_CALL)?.input.evidenceRefs).toEqual([
      f.financialRef,
    ]);
    expect(f.receipts.get(BI_REPORT_CALL)?.resultJson).toMatchObject({
      sourceDigest: c9Hash('bi-report-source/1', [[f.financialRef]]),
    });
    expect(
      f.work.reserve.mock.calls.map((call) => call[1].reservation),
    ).toEqual([
      expect.objectContaining({ toolCalls: 1, modelCalls: 0, costMicros: '0' }),
      expect.objectContaining({ toolCalls: 1, modelCalls: 0, costMicros: '0' }),
    ]);
  });

  it('never serializes private Client identity or raw financial facts into work results or response', async () => {
    const f = fixture();
    const response = await f.create().reviewBusinessAndClientReturn(f.turn);
    expect(JSON.stringify(response)).not.toMatch(
      /private-client|financial-subject|subjectRef|phone|email/,
    );
    const results = JSON.stringify(
      [...f.receipts.values()].map((receipt) => receipt.resultJson),
    );
    expect(results).not.toMatch(/private-client|subjectRef|metrics|cadence/);
    expect(f.receipts.get(LIFECYCLE_CALL)?.resultJson).toMatchObject({
      contract: 'maya.c9-lifecycle-receipt/1',
      revisionId: 'revision',
    });
  });

  it.each([{ domainsMax: 1 }, { toolCallsMax: 1 }])(
    'refuses insufficient shared budget before selecting either source: %j',
    async (patch) => {
      const f = fixture();
      Object.assign(f.root.budgetManifestJson, patch);
      await expect(
        f.create().reviewBusinessAndClientReturn(f.turn),
      ).rejects.toThrow('c9_route_domain_budget');
      expect(f.bi.select).not.toHaveBeenCalled();
      expect(f.lifecycle.select).not.toHaveBeenCalled();
      expect(f.work.reserve).not.toHaveBeenCalled();
      expect(f.turn).toMatchObject({ runId: 'run', failed: true });
    },
  );

  it.each(['bi', 'lifecycle'] as const)(
    'requires current %s permission before either domain reads',
    async (domain) => {
      const f = fixture();
      f[domain].authorize.mockRejectedValue(
        new ForbiddenException('source authority revoked'),
      );
      await expect(
        f.create().reviewBusinessAndClientReturn(f.turn),
      ).rejects.toThrow('source authority revoked');
      expect(f.bi.select).not.toHaveBeenCalled();
      expect(f.lifecycle.select).not.toHaveBeenCalled();
      expect(f.work.reserve).not.toHaveBeenCalled();
      expect(f.answer).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'keeps empty configured=%s sources unknown, never zero finance or an active client base',
    async (configured) => {
      const f = fixture();
      f.controls.financialRefs = [];
      f.selection.refs = [];
      f.selection.configured = configured;
      const response = await f.create().reviewBusinessAndClientReturn(f.turn);
      expect(response.analysis.agent.findings).toEqual([]);
      expect(response.recommendation.agent.findings).toEqual([]);
      expect(response.recommendation.outcome).toBe(
        configured ? 'UNAVAILABLE' : 'UNCONFIGURED',
      );
      expect(response.recommendation.options).toEqual([
        { key: 'c9.no_action', title: 'Ничего не делать' },
      ]);
      expect(response.reply).toContain('не означает нулевую выручку');
      expect(response.reply).toContain(
        'не означает, что гости активны или спят',
      );
      expect(f.store.revision).toHaveBeenCalledTimes(1);
      expect(f.store.revision.mock.calls[0][2].evidenceRefs).toEqual([]);
      expect(f.lifecycle.assertCurrent).toHaveBeenCalledWith(
        'tenant',
        'owner',
        [],
      );
      expect(response.coordination.current).toBe(false);
    },
  );

  it('replays exact saved refs and version after recreation without fresh source discovery or work dispatch', async () => {
    const f = fixture();
    const first = await f.create().reviewBusinessAndClientReturn(f.turn);
    const saved = jsonClone([...f.receipts.values()]);
    f.controls.financialRefs = [
      { ...f.financialRef, id: 'newer-financial-source' },
    ];
    f.selection.refs = [{ ...f.clientRef, id: 'newer-lifecycle-source' }];
    f.revisions.push({
      id: 'owner-later-version',
      revision: 2,
      alternativesJson: [],
      evidenceRefsJson: [],
    });
    const replay = await f
      .create()
      .reviewBusinessAndClientReturn({ ...f.turn });
    expect(replay.coordination).toMatchObject({
      run_id: first.coordination.run_id,
      revision_id: first.coordination.revision_id,
      revision: 1,
      current: false,
      replayed: true,
    });
    expect(replay.recommendation.outcome).toBe('HISTORICAL');
    expect(f.discoverFinancial).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.select).toHaveBeenCalledTimes(1);
    expect(f.work.claim).toHaveBeenCalledTimes(2);
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect([...f.receipts.values()]).toEqual(saved);
    expect(f.store.validateRefs.mock.calls.at(-1)?.[2]).toEqual([
      f.financialRef,
      f.clientRef,
    ]);
    expect(f.lifecycle.assertCurrent).toHaveBeenLastCalledWith(
      'tenant',
      'owner',
      [f.clientRef],
    );
  });

  it.each(['bi', 'lifecycle'] as const)(
    'rechecks current %s authority on saved replay before returning old facts',
    async (domain) => {
      const f = fixture();
      await f.create().reviewBusinessAndClientReturn(f.turn);
      f[domain].authorize.mockRejectedValue(
        new ForbiddenException('membership revoked'),
      );
      await expect(
        f.create().reviewBusinessAndClientReturn({ ...f.turn }),
      ).rejects.toThrow('membership revoked');
      expect(f.discoverFinancial).toHaveBeenCalledTimes(1);
      expect(f.lifecycle.select).toHaveBeenCalledTimes(1);
      expect(f.work.settle).toHaveBeenCalledTimes(2);
    },
  );

  it('withholds stale C8 findings after preparation without rewriting the saved version', async () => {
    const f = fixture();
    f.store.snapshot.mockImplementation(() => {
      f.controls.lifecycleCurrent = false;
      return Promise.resolve({
        run: f.root,
        revisions: jsonClone(f.revisions),
      });
    });
    const response = await f.create().reviewBusinessAndClientReturn(f.turn);
    expect(response.recommendation.outcome).toBe('STALE');
    expect(response.recommendation.agent.findings).toEqual([]);
    expect(response.coordination.current).toBe(false);
    expect(f.revisions[0].evidenceRefsJson).toEqual([f.clientRef]);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.store.validateRefs.mock.calls.at(-1)?.[2]).toEqual([
      f.financialRef,
    ]);
    expect(f.lifecycle.assertCurrent).toHaveBeenCalledWith(
      'tenant',
      'owner',
      [],
    );
  });

  it('refuses a late C8 currentness change even when publication metadata and built findings still look valid', async () => {
    const f = fixture();
    let lifecycleBuilds = 0;
    f.controls.afterBuild = (domain) => {
      if (domain === 'CLIENT_LIFECYCLE' && ++lifecycleBuilds === 2)
        f.controls.finalLifecycleCurrent = false;
    };
    await expect(
      f.create().reviewBusinessAndClientReturn(f.turn),
    ).rejects.toThrow('c9_source_changed');
    expect(f.store.validateRefs.mock.calls.at(-1)?.[2]).toEqual([
      f.financialRef,
      f.clientRef,
    ]);
    expect(f.lifecycle.assertCurrent).toHaveBeenCalledWith('tenant', 'owner', [
      f.clientRef,
    ]);
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.turn).toMatchObject({ runId: 'run', failed: true });
  });

  it.each(['bi', 'lifecycle'] as const)(
    'reauthorizes %s after both facts were built and refuses late revocation',
    async (domain) => {
      const f = fixture();
      let lifecycleBuilds = 0;
      f.controls.afterBuild = (builtDomain) => {
        if (builtDomain === 'CLIENT_LIFECYCLE' && ++lifecycleBuilds === 2)
          f[domain].authorize.mockRejectedValue(
            new ForbiddenException('late membership revocation'),
          );
      };
      await expect(
        f.create().reviewBusinessAndClientReturn(f.turn),
      ).rejects.toThrow('late membership revocation');
      expect(f.work.settle).toHaveBeenCalledTimes(2);
      expect(f.store.validateRefs).not.toHaveBeenCalled();
      expect(f.lifecycle.assertCurrent).not.toHaveBeenCalled();
      expect(f.turn).toMatchObject({ runId: 'run', failed: true });
    },
  );

  it.each(['financialRef', 'clientRef'] as const)(
    'refuses coherent exposure when %s expires after both facts were built',
    async (field) => {
      const f = fixture();
      let lifecycleBuilds = 0;
      f.controls.afterBuild = (domain) => {
        if (domain === 'CLIENT_LIFECYCLE' && ++lifecycleBuilds === 2)
          f.invalidatedRefs.add(f[field].id);
      };
      await expect(
        f.create().reviewBusinessAndClientReturn(f.turn),
      ).rejects.toThrow('c9_source_expired');
      expect(f.work.settle).toHaveBeenCalledTimes(2);
      expect(f.store.validateRefs.mock.calls.at(-1)?.[2]).toEqual([
        f.financialRef,
        f.clientRef,
      ]);
      expect(f.turn).toMatchObject({ runId: 'run', failed: true });
    },
  );

  it.each(
    (
      [
        'rootValidUntil',
        'financialValidUntil',
        'financialRetentionUntil',
        'clientValidUntil',
        'clientRetentionUntil',
      ] as const
    ).flatMap((field) => [-1, 0].map((offsetMs) => ({ field, offsetMs }))),
  )(
    'isolates $field at expiry offset $offsetMs ms after awaited qualification (component clock only)',
    async ({ field, offsetMs }) => {
      const expiresAt = Date.parse('2035-05-10T08:40:00.000Z');
      const later = '2035-05-11T00:00:00.000Z';
      const deadlines: FixtureDeadlines = {
        rootValidUntil: later,
        financialValidUntil: later,
        financialRetentionUntil: later,
        clientValidUntil: later,
        clientRetentionUntil: later,
      };
      deadlines[field] = new Date(expiresAt).toISOString();
      // Isolate each component guard. These synthetic ports do not qualify a
      // database-admissible C7/C8 deadline shape or naturally elapsed HTTP time.
      const f = fixture(deadlines);
      const original = jsonClone({
        rootValidUntil: f.root.validUntil.toISOString(),
        financialRef: f.financialRef,
        clientRef: f.clientRef,
      });
      const readAt = expiresAt + offsetMs;
      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(NOW));
      const current = f.lifecycle.assertCurrent.getMockImplementation()!;
      f.lifecycle.assertCurrent.mockImplementationOnce(async (...args) => {
        await current(...args);
        clock.mockReturnValue(readAt);
      });
      try {
        expect(
          Object.entries(deadlines)
            .filter(([, value]) => Date.parse(value) <= readAt)
            .map(([key]) => key),
        ).toEqual(offsetMs < 0 ? [] : [field]);
        if (offsetMs < 0) {
          const response = await f
            .create()
            .reviewBusinessAndClientReturn(f.turn);
          expect(response.coordination).toMatchObject({
            run_id: 'run',
            revision_id: 'revision',
            scope: 'explicit_business_lifecycle',
            current: false,
          });
          expect(f.turn.failed).toBeUndefined();
        } else {
          await expect(
            f.create().reviewBusinessAndClientReturn(f.turn),
          ).rejects.toThrow('c9_source_expired');
          expect(f.turn).toMatchObject({ runId: 'run', failed: true });
        }
        expect(f.work.settle).toHaveBeenCalledTimes(2);
        expect(f.store.revision).toHaveBeenCalledTimes(1);
        expect(f.lifecycle.assertCurrent).toHaveBeenCalledTimes(1);
        expect(f.store.validateRefs).toHaveBeenCalledTimes(1);
        expect(f.events.at(-2)).toBe(
          'validate:financial-source,lifecycle-source',
        );
        expect(f.events.at(-1)).toBe('current:lifecycle-source');
        expect({
          rootValidUntil: f.root.validUntil.toISOString(),
          financialRef: f.financialRef,
          clientRef: f.clientRef,
        }).toEqual(original);
      } finally {
        clock.mockRestore();
      }
    },
  );

  it('does not redispatch held Lifecycle work after BI settled', async () => {
    const f = fixture();
    f.lifecycle.select.mockRejectedValueOnce(
      new Error('source_transport_lost'),
    );
    await expect(
      f.create().reviewBusinessAndClientReturn(f.turn),
    ).rejects.toThrow('source_transport_lost');
    expect(f.receipts.get(BI_REPORT_CALL)?.state).toBe('SETTLED');
    expect(f.receipts.get(LIFECYCLE_CALL)?.state).toBe('HELD_UNKNOWN');
    await expect(
      f.create().reviewBusinessAndClientReturn({ ...f.turn }),
    ).rejects.toThrow('c9_read_work_in_progress_or_unknown');
    expect(f.lifecycle.select).toHaveBeenCalledTimes(1);
    expect(f.work.claim).toHaveBeenCalledTimes(2);
    expect(f.store.revision).not.toHaveBeenCalled();
    expect(f.answer).not.toHaveBeenCalled();
    expect(f.turn).toMatchObject({ runId: 'run', failed: true });
  });

  it('does not replace an erased exact lifecycle revision with a newer revision on replay', async () => {
    const f = fixture();
    await f.create().reviewBusinessAndClientReturn(f.turn);
    f.revisions.splice(0, 1, {
      id: 'different-version',
      revision: 2,
      alternativesJson: [],
      evidenceRefsJson: [],
    });
    await expect(
      f.create().reviewBusinessAndClientReturn({ ...f.turn }),
    ).rejects.toThrow('c9_source_read_receipt');
    expect(f.lifecycle.select).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
  });

  it('shares saved work leases across concurrent copies with one Lifecycle discovery and proposal', async () => {
    const f = fixture();
    const results = await Promise.allSettled([
      f.create().reviewBusinessAndClientReturn({ ...f.turn }),
      f.create().reviewBusinessAndClientReturn({ ...f.turn }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(f.lifecycle.select).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect([...f.receipts.values()].map((receipt) => receipt.state)).toEqual([
      'SETTLED',
      'SETTLED',
    ]);
  });

  it('traverses actual AiCore chat and real C9 into one persisted compound reply with scripted planning only', async () => {
    const f = fixture();
    const user: AuthenticatedUser = {
      userId: 'owner',
      sessionId: 'session',
      tenantId: 'tenant',
      role: UserRole.TENANT_OWNER,
      email: 'synthetic@example.test',
      branchId: null,
      membershipId: 'member',
      membershipStatus: 'active',
    };
    const text =
      'Объясни последний опубликованный финансовый отчёт и проверь оценки давности визитов гостей';
    const ci = new ConversationIntelligenceService();
    const semanticPlan = ci.validatePlan(
      {
        parent_request: text,
        tasks: [
          {
            id: 'summary',
            intent: 'analytics.business_summary',
            entities: {},
            confidence: 0.99,
          },
          {
            id: 'return',
            intent: 'clients.dormant_list',
            entities: {},
            confidence: 0.99,
          },
        ],
      },
      user.role,
      ['analytics.business.query', 'clients.dormant.list'],
    );
    const model = {
      decide: jest.fn().mockResolvedValue({
        provider: 'safe',
        model: 'SCRIPTED_SYNTHETIC',
        reply: null,
        toolCall: null,
        semanticPlan,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }),
    };
    const runtime = {
      listTools: jest.fn().mockResolvedValue({
        tools: ['analytics.business.query', 'clients.dormant.list'].map(
          (name) => ({
            name,
            risk_tier: 'read',
            approval_policy: 'none',
            input_schema: {},
          }),
        ),
      }),
      execute: jest.fn(),
    };
    const timeline = {
      readConversationContext: jest.fn().mockResolvedValue(null),
      routeTypedUtterance: jest.fn().mockResolvedValue(null),
      persistTypedTurn: jest.fn().mockResolvedValue(f.turn.turn),
      persistAssistantReply: jest.fn().mockResolvedValue(undefined),
    };
    const orchestration = f.create();
    // The test's durable store has no key owner. Only this local digest seam is
    // substituted; both preparation/exposure paths and domain agents are real.
    jest
      .spyOn(orchestration, 'conversationDigest')
      .mockReturnValue(f.turn.intentHash);
    const service = new AiCoreService(
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { assertTenantId: jest.fn((tenantId: string) => tenantId) } as never,
      { assertTenant: jest.fn().mockResolvedValue(undefined) } as never,
      runtime as never,
      model as never,
      {
        log: jest.fn().mockResolvedValue(undefined),
        tryLog: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        getAssistant: jest.fn().mockResolvedValue({
          config: { enabled_capabilities: ['business_analytics'] },
        }),
      } as never,
      { tryHandle: jest.fn().mockResolvedValue(null) } as never,
      new MayaBrainRouterService(),
      orchestration,
      undefined,
      ci,
      undefined,
      { get: jest.fn().mockReturnValue(timeline) } as never,
    );
    const response = await service.chat(user, {
      surface: 'web',
      requestId: 'request_business_lifecycle',
      messages: [{ role: 'user', content: text }],
    });
    expect(response).toMatchObject({
      action: null,
      coordination: {
        run_id: 'run',
        revision_id: 'revision',
        scope: 'explicit_business_lifecycle',
        revision: 1,
        current: false,
      },
      analysis: {
        agent: {
          agent_id: 'BUSINESS_INTELLIGENCE',
          findings: expect.arrayContaining([
            expect.objectContaining({
              statement: expect.any(String) as unknown,
            }),
          ]) as unknown,
        },
      },
      recommendation: {
        agent: {
          agent_id: 'CLIENT_LIFECYCLE',
          findings: expect.arrayContaining([
            expect.objectContaining({
              statement: expect.any(String) as unknown,
            }),
          ]) as unknown,
        },
        canContact: false,
        noSideEffects: true,
        executionAuthority: false,
      },
    });
    expect(f.store.conversationReadRun).toHaveBeenCalledTimes(1);
    expect(f.store.revision).toHaveBeenCalledTimes(1);
    expect(f.work.settle).toHaveBeenCalledTimes(2);
    expect(model.decide).toHaveBeenCalledTimes(1);
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(timeline.persistTypedTurn).toHaveBeenCalledTimes(1);
    expect(timeline.persistAssistantReply).toHaveBeenCalledTimes(1);
    expect(timeline.persistAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({ reply: response.reply }),
    );
    expect(JSON.stringify(model.decide.mock.calls)).not.toMatch(
      /private-client-not-for-output|financial-subject-not-for-output/,
    );
  });
});
