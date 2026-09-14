import { Injectable } from '@nestjs/common';
import {
  C9Domain,
  C9Object,
  C9_DOMAINS,
  c9AgentResult,
  c9Deny,
  c9Hash,
  c9Object,
} from './c9.contract';

/** Every projected fact carries its own source verdict; C9 never upgrades one. */
function factStatus(
  fact: C9Object,
): 'measured' | 'measured_incomplete' | 'not_measured' | 'unavailable' {
  const completeness = fact.completeness as string | undefined,
    qualification = fact.qualification as string | undefined;
  if (fact.available === false || completeness === 'UNAVAILABLE')
    return 'unavailable';
  if (completeness === 'NOT_MEASURED') return 'not_measured';
  if (completeness === 'COMPLETE' && qualification === 'VERIFIED')
    return 'measured';
  return 'measured_incomplete';
}
/** Source reason codes are reported verbatim; absence is never presented as a zero. */
function factReasons(fact: C9Object): string[] {
  const reasons = Array.isArray(fact.reasons)
    ? (fact.reasons as unknown[])
    : Array.isArray(fact.limitations)
      ? (fact.limitations as unknown[])
      : [];
  return reasons
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
    .slice(0, 20);
}
function factLabel(fact: C9Object): string {
  const kind = typeof fact.kind === 'string' ? fact.kind : 'result';
  const rule = c9Object(fact.rule ?? {}).key;
  return typeof rule === 'string' && rule.length ? rule : kind;
}

export type C9AgentAnswer = {
  result: C9Object;
  evidenceHandles: readonly string[];
};

/**
 * The four canonical domains. They read qualified projections and speak only about them:
 * no source mutation, no model-invented number, and no claim that an absent probability
 * is a value.
 *
 * BUSINESS_INTELLIGENCE is read-only by contract and proposes nothing — enforced here, by
 * the registry, and by a database CHECK. ADMIN, CLIENT_LIFECYCLE and OCCUPANCY may propose
 * typed intents for capabilities that actually resolved for this invocation; a proposal is
 * a request for an owner decision, never an authority to act.
 */
@Injectable()
export class C9Agents {
  /** Every canonical domain reasons; only BI is forbidden to propose. */
  executable(domain: C9Domain): boolean {
    return C9_DOMAINS.includes(domain);
  }
  proposes(domain: C9Domain): boolean {
    return domain !== 'BUSINESS_INTELLIGENCE';
  }
  answer(
    domain: C9Domain,
    intent: string,
    context: C9Object,
    permittedCapabilities: ReadonlySet<string>,
    permittedEvidence: ReadonlySet<string>,
    proposedIntents: readonly C9Object[] = [],
  ): C9AgentAnswer {
    const trusted = c9Object(context.trusted),
      facts = (context.facts ?? []) as C9Object[];
    if (trusted.domain !== domain) c9Deny('agent_context_domain');
    const requestedScopeHash = c9Hash('agent-scope/1', [
      domain,
      intent,
      trusted.scopeHash,
      facts.map((f) => f.evidenceHandle),
    ]);
    if (!this.executable(domain))
      return {
        result: c9AgentResult(
          {
            contract: 'AgentResult@1',
            agent_id: domain,
            intent,
            findings: [],
            facts_used: [],
            confidence: 'low',
            limitations: ['domain_capability_not_activated'],
            proposed_action_intents: [],
            completeness: {
              status: 'UNAVAILABLE',
              requestedScopeHash,
              returnedCount: 0,
              totalCount: null,
              hasMore: false,
              cursorRef: null,
              truncated: false,
              reasonCodes: ['domain_capability_not_activated'],
            },
            evidence_refs: [],
          },
          permittedEvidence,
          permittedCapabilities,
        ),
        evidenceHandles: [],
      };
    const used: C9Object[] = [],
      findings: C9Object[] = [],
      reasonCodes = new Set<string>();
    let incomplete = false;
    for (const fact of facts) {
      const handle = fact.evidenceHandle as string,
        status = factStatus(fact),
        reasons = factReasons(fact);
      if (status !== 'measured') incomplete = true;
      for (const reason of reasons) reasonCodes.add(reason);
      used.push({
        capability: fact.capability,
        status,
        as_of: fact.asOf,
        evidence_refs: status === 'unavailable' ? [] : [handle],
        completeness: {
          status:
            status === 'measured'
              ? 'COMPLETE'
              : status === 'unavailable'
                ? 'UNAVAILABLE'
                : 'PARTIAL',
          requestedScopeHash,
          returnedCount: status === 'unavailable' ? 0 : 1,
          totalCount: 1,
          hasMore: false,
          cursorRef: null,
          truncated: false,
          reasonCodes: reasons,
        },
        ...(typeof fact.basis === 'string' && fact.basis
          ? { basis: fact.basis }
          : {}),
        ...(typeof fact.currency === 'string'
          ? { currency: fact.currency }
          : {}),
      });
      if (status === 'unavailable') {
        reasonCodes.add('source_result_unavailable');
        continue;
      }
      // A finding restates what the source already qualified. It adds no arithmetic.
      findings.push({
        statement: `${factLabel(fact)}: ${status} as of ${String(fact.asOf)}`,
        evidence_refs: [handle],
      });
    }
    const handles = used.flatMap((u) => u.evidence_refs as string[]);
    // Nothing usable is UNAVAILABLE, not a partial answer: a request whose only evidence
    // the source withheld has not been partly answered.
    const status =
      !facts.length || used.every((u) => u.status === 'unavailable')
        ? 'UNAVAILABLE'
        : incomplete
          ? 'PARTIAL'
          : 'COMPLETE';
    if (!facts.length) reasonCodes.add('no_permitted_qualified_evidence');
    const limitations = [...reasonCodes].slice(0, 20);
    return {
      result: c9AgentResult(
        {
          contract: 'AgentResult@1',
          agent_id: domain,
          intent,
          findings,
          facts_used: used,
          // Grounding of this answer, never a probability about the business.
          confidence: status === 'COMPLETE' ? 'high' : 'low',
          limitations:
            status === 'COMPLETE' && !limitations.length ? [] : limitations,
          // BI is read-only: an intent here is denied by the result contract itself.
          proposed_action_intents: this.proposes(domain)
            ? proposedIntents.slice(0, 12)
            : [],
          completeness: {
            status,
            requestedScopeHash,
            returnedCount: handles.length,
            totalCount: facts.length,
            hasMore: false,
            cursorRef: null,
            truncated: false,
            reasonCodes: [...reasonCodes].slice(0, 20),
          },
          evidence_refs: handles,
        },
        permittedEvidence,
        permittedCapabilities,
      ),
      evidenceHandles: handles,
    };
  }
}
