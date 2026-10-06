import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  C9OccupancySource,
  type OccupancyProjection,
} from './c9.occupancy-source';
import { C9Strategy } from './c9.strategy';
import {
  occupancyStatement,
  occupancyLocalDate,
} from './c9.occupancy-presentation';
import { C9Agents } from './c9.agents';
import { C9Allowance } from './c9.allowance';
import { C9ContextService } from './c9.context';
import { C9Store } from './c9.store';
import { C9WorkLease, C9WorkService } from './c9.work';
import { C9_CAPABILITIES, c9Capability } from './c9.registry';
import {
  C9Domain,
  C9Object,
  C9_DOMAINS,
  C9_ROUTES,
  c9Deny,
  c9Hash,
  c9Object,
} from './c9.contract';
import {
  C9_WIDGET_TRIGGER,
  type C9WidgetTriggerPort,
} from './c9-widget-trigger.port';

export { C9_ROUTES };

const READERS: Readonly<Record<string, string>> = Object.freeze({
  MeasurementRevision: 'c7.measurement.read',
  C8ResultRevision: 'c8.result.read',
});

export type C9Answer = {
  contract: 'maya.c9-response/1';
  runId: string;
  objectiveKey: string;
  domains: readonly C9Domain[];
  answers: readonly C9Object[];
  completeness: { status: string; reasonCodes: readonly string[] };
  limitations: readonly string[];
  reasoning: { paid: boolean; reason: string };
  budget: C9Object;
  boundaries: {
    factIsPrediction: false;
    strategyIsApproval: false;
    resultIsConsent: false;
    memoryIsPolicy: false;
    unknownIsFailure: false;
  };
};

/** Invocation-local state; it carries no source data or authority. */
export type C9ConversationReads = {
  turn: { turnId: string; conversationId: string };
  intentHash: string;
  runId?: string;
  failed?: boolean;
};

/**
 * One Orchestrator. It admits a request, routes it to at most two registered domains,
 * delegates bounded read work through reserved receipts and composes one grounded answer.
 *
 * It is not an action engine, not a provider owner and not a business-fact owner: every
 * fact it repeats comes from a qualified source projection, and no agent may call another.
 * Delegation is serialized by the shared run fence, so a domain answer can never overtake
 * the budget that admitted it.
 */
@Injectable()
export class C9Orchestrator {
  constructor(
    private readonly store: C9Store,
    private readonly context: C9ContextService,
    private readonly work: C9WorkService,
    private readonly agents: C9Agents,
    private readonly allowance: C9Allowance,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly occupancy?: C9OccupancySource,
    @Optional() private readonly strategy?: C9Strategy,
  ) {}
  requestIdentity(channelProof?: string) {
    return this.store.event(channelProof);
  }

  /**
   * Coordinate a deterministic read selected by natural conversation. The source
   * runtime still checks current permissions and owns its result and idempotency.
   * No live answer is converted to a published C7/C8 revision or an agent finding.
   */
  async conversationRead<T>(
    turn: C9ConversationReads,
    capability: string,
    callKey: string,
    inputHash: string,
    read: () => Promise<T>,
    replay: (executionId: string) => Promise<T> = () =>
      c9Deny('source_replay_owner_required'),
  ): Promise<T> {
    try {
      const registered = C9_CAPABILITIES.find(
        (c) => c.capabilityKey === capability,
      );
      if (!registered || registered.mode !== 'READ')
        c9Deny('conversation_read_only');
      const domain = registered.domains[0];
      const cap = c9Capability(capability, domain);
      if (!turn.runId)
        turn.runId = (
          await this.store.conversationReadRun(turn.turn, turn.intentHash)
        ).id;
      let receipt = await this.work.reserve(turn.runId, {
        callKey,
        domain,
        kind: 'TOOL_READ',
        taskKey: capability,
        inputHash,
        evidenceRefs: [],
        reservation: {
          contract: 'maya.c9-reservation/1',
          toolCalls: 1,
          modelCalls: 0,
          domain,
          inputTokens: 0,
          outputTokens: 0,
          costMicros: '0',
          priceHash: null,
          zeroCostEvidenceRef: `local:${cap.toolOrInterface}:no-provider-charge`,
          stepRef: null,
        },
      });
      // A settled read may replay only through the same current-authorized source
      // runtime key; every other in-flight/uncertain state refuses redispatch.
      if (
        receipt.state === 'HELD_UNKNOWN' ||
        (receipt.state === 'DISPATCHED' &&
          receipt.leaseUntil &&
          receipt.leaseUntil <= new Date())
      )
        receipt = await this.work.reconcileConversationRead(
          turn.runId,
          receipt.id,
          callKey,
        );
      if (receipt.state === 'SETTLED') {
        const previous = c9Object(receipt.resultJson);
        const result = await replay(previous.executionId as string);
        const source = c9Object(result);
        if (
          source.status !== 'completed' ||
          source.execution_id !== previous.executionId ||
          (source.stale === true) !== (previous.stale === true)
        )
          c9Deny('source_read_replay_changed');
        return result;
      }
      if (receipt.state !== 'RESERVED')
        c9Deny('read_work_in_progress_or_unknown');
      const lease = await this.work.claim(turn.runId, receipt.id);
      if (!lease) c9Deny('read_work_in_progress_or_unknown');
      try {
        const result = await read();
        const source = c9Object(result);
        if (
          source.status !== 'completed' ||
          typeof source.execution_id !== 'string'
        )
          c9Deny('source_read_unconfirmed');
        const evidence = await this.store.conversationReadReceipt(
          turn.runId,
          capability,
          callKey,
          source.execution_id,
          source.stale === true,
        );
        try {
          await this.work.settle(lease, evidence, {
            contract: 'maya.c9-usage/1',
            usageReceiptRef: lease.workId,
            verifiedAt: new Date().toISOString(),
            inputTokens: 0,
            outputTokens: 0,
            costMicros: '0',
            priceHash: null,
            completionKind: 'CONFIRMED',
          });
        } catch (error) {
          // Source persistence/widget projection can finish just after the
          // owner's timeout lease. Recover only exact durable fresh evidence;
          // do not ask the provider again or extend the original budget/age.
          if (
            !(error instanceof Error) ||
            error.message !== 'c9_work_fenced' ||
            source.stale === true
          )
            throw error;
          const recovered = await this.work.reconcileConversationRead(
            turn.runId,
            receipt.id,
            callKey,
          );
          if (
            c9Object(recovered.resultJson).executionId !== source.execution_id
          )
            c9Deny('source_read_replay_changed');
        }
        return result;
      } catch (error) {
        // Hold retains the budget on uncertainty and never retries the source.
        await this.work.hold(lease).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      turn.failed = true;
      throw error;
    }
  }

  /** One explicit web turn, one finite source read, one derived strategy version. */
  async checkCancellationWindows(turn: C9ConversationReads) {
    if (!this.occupancy || !this.strategy)
      c9Deny('context_fact_source_unavailable');
    const root = await this.store.conversationReadRun(
      turn.turn,
      turn.intentHash,
      'occupancy',
    );
    await this.occupancy.authorize(root.id);
    const cap = c9Capability('booking.availability.read', 'OCCUPANCY');
    const receipt = await this.work.reserve(root.id, {
      callKey: 'explicit-cancellation-window',
      domain: 'OCCUPANCY',
      kind: 'TOOL_READ',
      taskKey: cap.capabilityKey,
      inputHash: c9Hash('occupancy-request/1', [turn.intentHash]),
      evidenceRefs: [],
      reservation: {
        contract: 'maya.c9-reservation/1',
        toolCalls: 1,
        modelCalls: 0,
        domain: 'OCCUPANCY',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: '0',
        priceHash: null,
        zeroCostEvidenceRef: `local:${cap.toolOrInterface}:no-provider-charge`,
        stepRef: null,
      },
    });
    const replayed = receipt.state === 'SETTLED';
    let projection: OccupancyProjection;
    if (replayed) {
      projection = receipt.resultJson as unknown as OccupancyProjection;
      if (projection.contract !== 'maya.c9-occupancy-read/1')
        c9Deny('source_read_receipt');
    } else {
      if (receipt.state !== 'RESERVED')
        c9Deny('read_work_in_progress_or_unknown');
      const lease = await this.work.claim(root.id, receipt.id);
      if (!lease) c9Deny('read_work_in_progress_or_unknown');
      try {
        projection = await this.occupancy.read(root.id);
        // Save the exact proposal before settlement. SETTLED therefore always
        // has one immutable version; a concurrent replay cannot win a different
        // no-action proposal. Interrupted DISPATCHED work stays held, never retried.
        await this.saveOccupancyProposal(root, projection);
        await this.work.settle(
          lease,
          {
            ...projection,
            window: null,
            sourceDigest: c9Hash('occupancy-source/1', [projection]),
          },
          {
            contract: 'maya.c9-usage/1',
            usageReceiptRef: lease.workId,
            verifiedAt: projection.asOf,
            inputTokens: 0,
            outputTokens: 0,
            costMicros: '0',
            priceHash: null,
            completionKind: 'CONFIRMED',
          },
        );
      } catch (error) {
        await this.work.hold(lease).catch(() => undefined);
        throw error;
      }
    }
    // Restart never redispatches a settled read or turns its historical evidence
    // into current availability. A new user turn is required for another check.
    const snapshot = await this.store.snapshot(root.id);
    const revision = snapshot.revisions.at(-1);
    if (!revision) c9Deny('source_read_receipt');
    await this.occupancy.authorize(root.id);
    const handle =
      'h_' + c9Hash('occupancy-evidence/1', [root.id, receipt.id, projection]);
    const answer = this.agents.answer(
      'OCCUPANCY',
      'c9.cancellation_windows',
      {
        trusted: { domain: 'OCCUPANCY', scopeHash: root.authorityHash },
        facts: [
          {
            kind: 'cancellation_window',
            capability: cap.capabilityKey,
            evidenceHandle: handle,
            asOf: projection.asOf,
            completeness:
              replayed ||
              projection.hasMore ||
              !['AVAILABLE', 'OCCUPIED', 'EXPIRED', 'CLOSED'].includes(
                projection.outcome,
              )
                ? 'PARTIAL'
                : 'COMPLETE',
            qualification: 'VERIFIED',
            available: projection.outcome !== 'UNAVAILABLE',
            reasons: [
              projection.reason,
              ...(projection.hasMore ? ['candidate_scan_bounded'] : []),
              ...(replayed ? ['historical_read_not_revalidated'] : []),
            ],
            occupancy: projection,
            historical: replayed,
          },
        ],
      },
      new Set([cap.capabilityKey]),
      new Set([handle]),
    );
    const alternatives = revision.alternativesJson as unknown as C9Object[];
    return {
      reply: [
        occupancyStatement(projection, replayed),
        projection.hasMore
          ? 'Это ограниченная проверка одного окна; другие сохранённые возможности не проверены.'
          : '',
        'Причина и автор отмены не установлены. Спрос, доход и вероятность заполнения не оценивались.',
        'Варианты: ' +
          alternatives.map((a) => String(a.title)).join('; ') +
          '.',
        `Предложение сохранено, версия ${revision.revision}. Записи и цены не менялись, сообщения клиентам не отправлялись.`,
      ]
        .filter(Boolean)
        .join(' '),
      coordination: {
        run_id: root.id,
        scope: 'explicit_occupancy' as const,
        state: 'PROPOSED',
        revision_id: revision.id,
        revision: revision.revision,
        replayed,
        current: !replayed && projection.outcome === 'AVAILABLE',
      },
      recommendation: {
        contract: 'maya.c9-occupancy-response/1',
        outcome: projection.outcome,
        agent: answer.result,
        evidence: {
          workReceiptId: receipt.id,
          asOf: projection.asOf,
          opportunityRefs: projection.evidenceRefs,
          scheduleRef: projection.scheduleRef,
        },
        options: alternatives.map((a) => ({ key: a.key, title: a.title })),
        noSideEffects: true,
        executionAuthority: false,
        reasoning: 'deterministic',
      },
    };
  }

  private saveOccupancyProposal(
    root: { id: string; budgetManifestHash: string; validUntil: Date },
    projection: OccupancyProjection,
  ) {
    const available = projection.outcome === 'AVAILABLE';
    const proposal = this.strategy!.propose({
      objectiveKey: 'c9.cancellation_windows',
      safeDescription: 'Проверка окна после отмены по явному запросу владельца',
      budgetManifestHash: root.budgetManifestHash,
      validUntil: new Date(
        Math.min(
          root.validUntil.getTime(),
          projection.window ? Date.parse(projection.window.start) : Infinity,
        ),
      ).toISOString(),
      unknowns: [
        'Причина и автор отмены не установлены.',
        'Спрос, вероятность заполнения и доход не оценивались.',
        'Перед любым действием требуется новая проверка доступности.',
      ],
      options:
        available && projection.window
          ? [
              {
                optionKey: 'check_date',
                title:
                  'По новому запросу проверить доступное время на эту дату',
                domain: 'OCCUPANCY',
                capability: 'booking.availability.read',
                intentContract: 'booking.availability.read:input/1',
                intent: { date: occupancyLocalDate(projection.window) },
                evidenceRefs: projection.evidenceRefs,
              },
            ]
          : [],
      recommendedOptionKey: available ? 'check_date' : null,
    });
    return this.store.revision(
      root.id,
      'explicit-cancellation-proposal',
      proposal,
    );
  }

  conversationDigest(value: unknown) {
    return this.store.conversationDigest(value);
  }

  async finishConversationReads(turn: C9ConversationReads) {
    if (!turn.runId) return null;
    return {
      run_id: turn.runId,
      scope: 'deterministic_reads' as const,
      state: await this.store.finishConversationReads(turn.runId, turn.failed),
    };
  }
  /** Deterministic and bounded; an unmapped objective delegates to nothing at all. */
  route(objectiveKey: string, manifest: C9Object): readonly C9Domain[] {
    const routed = C9_ROUTES[objectiveKey] ?? [];
    const domains = routed.filter((d) => C9_DOMAINS.includes(d));
    if (domains.length > (manifest.domainsMax as number))
      c9Deny('route_domain_budget');
    return domains;
  }
  async coordinate(
    eventToken: string,
    request: unknown,
    channelProof?: string,
  ): Promise<C9Answer> {
    const root = await this.store.admit(eventToken, request, channelProof);
    const intent = c9Object(root.requestIntentJson),
      manifest = c9Object(root.budgetManifestJson);
    const objectiveKey = intent.objectiveKey as string,
      question = intent.safeQuestion as string,
      refs = (intent.subjectRefs ?? []) as C9Object[];
    const domains = this.route(objectiveKey, manifest);
    const answers: C9Object[] = [];
    const reasonCodes = new Set<string>();
    for (const domain of domains) {
      const domainRefs = refs.filter((r) =>
        Object.hasOwn(READERS, r.sourceType as string),
      );
      const leases = await this.delegate(
        root.id,
        domain,
        domainRefs,
        channelProof,
      );
      if (leases.exhausted) reasonCodes.add('delegation_budget_exhausted');
      const admitted = domainRefs.slice(0, leases.leases.length);
      const { context, handles } = await this.context.build(
        root.id,
        domain,
        admitted,
        question,
        [],
        channelProof,
      );
      const capabilities = new Set(
        admitted.map((r) => READERS[r.sourceType as string]),
      );
      for (const key of capabilities) c9Capability(key, domain);
      const answer = this.agents.answer(
        domain,
        objectiveKey,
        context,
        capabilities,
        handles.keys(),
      );
      await this.settleAll(
        leases.leases,
        (context as C9Object).facts as C9Object[],
        channelProof,
      );
      for (const code of (c9Object(answer.result.completeness).reasonCodes ??
        []) as string[])
        reasonCodes.add(code);
      answers.push(answer.result);
    }
    if (!domains.length) reasonCodes.add('no_delegated_domain_required');
    const paid = this.allowance.released(new Date()) !== null;
    if (!paid) reasonCodes.add('deterministic_reasoning_only');
    const snapshot = await this.store.snapshot(root.id, channelProof);
    const statuses = answers.map(
      (a) => c9Object(a.completeness).status as string,
    );
    const answer: C9Answer = {
      contract: 'maya.c9-response/1',
      runId: root.id,
      objectiveKey,
      domains,
      answers,
      completeness: {
        status: !answers.length
          ? 'UNAVAILABLE'
          : statuses.every((s) => s === 'COMPLETE')
            ? 'COMPLETE'
            : statuses.every((s) => s === 'UNAVAILABLE')
              ? 'UNAVAILABLE'
              : 'PARTIAL',
        reasonCodes: [...reasonCodes].slice(0, 20),
      },
      limitations: [
        ...new Set(answers.flatMap((a) => a.limitations as string[])),
      ].slice(0, 20),
      reasoning: {
        paid,
        reason: paid ? 'released_price_basis' : 'paid_capability_not_activated',
      },
      budget: snapshot.run.budgetStateJson as C9Object,
      boundaries: {
        factIsPrediction: false,
        strategyIsApproval: false,
        resultIsConsent: false,
        memoryIsPolicy: false,
        unknownIsFailure: false,
      },
    };
    const revision = snapshot.revisions.at(-1);
    const domain = domains[0];
    if (revision && domain) {
      const trigger = this.moduleRef?.get<C9WidgetTriggerPort>(
        C9_WIDGET_TRIGGER,
        { strict: false },
      );
      await trigger?.afterRun({
        runId: root.id,
        revisionId: revision.id,
        domain,
        state: root.state === 'CANCELLED' ? 'cancelled' : 'done',
      });
    }
    return answer;
  }
  /** One reserved, fenced receipt per delegated read. An exhausted budget stops, never truncates silently. */
  private async delegate(
    runId: string,
    domain: C9Domain,
    refs: readonly C9Object[],
    channelProof?: string,
  ): Promise<{ leases: C9WorkLease[]; exhausted: boolean }> {
    const leases: C9WorkLease[] = [];
    for (const [index, ref] of refs.entries()) {
      const capability = READERS[ref.sourceType as string];
      const cap = c9Capability(capability, domain);
      const receipt = await this.work.reserve(
        runId,
        {
          callKey: `${domain}:${capability}:${index}`,
          domain,
          kind: 'TOOL_READ',
          taskKey: capability,
          inputHash: c9Hash('delegated-read/1', [domain, capability, ref]),
          evidenceRefs: [ref],
          reservation: {
            contract: 'maya.c9-reservation/1',
            toolCalls: 1,
            modelCalls: 0,
            domain,
            inputTokens: 0,
            outputTokens: 0,
            costMicros: '0',
            priceHash: null,
            zeroCostEvidenceRef: `local:${cap.toolOrInterface}:no-provider-charge`,
            stepRef: null,
          },
        },
        channelProof,
      );
      if (receipt.state !== 'RESERVED') continue;
      const lease = await this.work.claim(runId, receipt.id, channelProof);
      if (!lease) return { leases, exhausted: true };
      leases.push(lease);
    }
    return { leases, exhausted: false };
  }
  private async settleAll(
    leases: readonly C9WorkLease[],
    facts: readonly C9Object[],
    channelProof?: string,
  ): Promise<void> {
    for (const [index, lease] of leases.entries()) {
      const fact = facts[index];
      await this.work.settle(
        lease,
        {
          contract: 'maya.c9-read-result/1',
          evidenceRefs: fact ? [fact.evidenceHandle] : [],
          completeness: fact?.completeness ?? 'UNAVAILABLE',
          safeData: { capability: fact?.capability ?? null },
        },
        {
          contract: 'maya.c9-usage/1',
          usageReceiptRef: lease.workId,
          verifiedAt: new Date().toISOString(),
          inputTokens: 0,
          outputTokens: 0,
          costMicros: '0',
          priceHash: null,
          completionKind: 'CONFIRMED',
        },
        channelProof,
      );
    }
  }
}
