import { Injectable } from '@nestjs/common';
import { C9Agents } from './c9.agents';
import { C9Allowance } from './c9.allowance';
import { C9ContextService } from './c9.context';
import { C9Store } from './c9.store';
import { C9WorkLease, C9WorkService } from './c9.work';
import { c9Capability } from './c9.registry';
import {
  C9Domain,
  C9Object,
  C9_DOMAINS,
  C9_ROUTES,
  c9Deny,
  c9Hash,
  c9Object,
} from './c9.contract';

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
  ) {}
  requestIdentity(channelProof?: string) {
    return this.store.event(channelProof);
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
    return {
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
