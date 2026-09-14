import { Injectable } from '@nestjs/common';
import { C9Proposal, C9StepDraft } from './c9.store';
import { C9Capability, c9Capability } from './c9.registry';
import { C9Domain, C9Object, c9Deny, c9Hash, c9Object } from './c9.contract';

const ZERO_EXPOSURE = {
  maxActions: 0,
  maxRecipients: 0,
  maxMessages: 0,
  providerCost: null,
  verifiedZeroCost: null,
  offerRef: null,
  maxDiscountMinorUnits: null,
  maxDiscountBps: null,
};

export type C9Feasible = {
  optionKey: string;
  title: string;
  domain: C9Domain;
  capability: string;
  intentContract: string;
  intent: C9Object | null;
  /** Bounded exposure from the source quote. A missing quote makes the option ineligible. */
  exposure?: C9Object;
  evidenceRefs?: unknown[];
  approvalAdapters?: readonly string[];
};

/**
 * P04 strategy construction. An option exists only because a registered capability
 * resolved for this domain and its exposure is bounded — never to fill the allowance of
 * three. What the agent could not establish is carried as an explicit unknown, and a
 * ranking or a value is never presented as a permission to act.
 */
@Injectable()
export class C9Strategy {
  /**
   * Keep only options whose capability is registered for the domain and whose paid
   * components are bounded. Returns at most three, in the order given; padding is refused
   * rather than generated.
   */
  feasible(candidates: readonly C9Feasible[]): C9Feasible[] {
    const kept: C9Feasible[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.optionKey)) c9Deny('duplicate_option');
      seen.add(candidate.optionKey);
      let definition: C9Capability;
      try {
        definition = c9Capability(candidate.capability, candidate.domain);
      } catch {
        continue; // Unavailable capability is not an option; it is an omission with a reason.
      }
      // A paid component without a bound cannot be proposed at all.
      const exposure = candidate.exposure ?? ZERO_EXPOSURE;
      if (
        exposure.providerCost === null &&
        exposure.verifiedZeroCost === null &&
        ((exposure.maxMessages as number) > 0 ||
          (exposure.maxRecipients as number) > 0)
      )
        continue;
      if (definition.mode === 'READ' && (exposure.maxActions as number) > 0)
        c9Deny('read_capability_exposure');
      kept.push(candidate);
      if (kept.length === 3) break;
    }
    return kept;
  }

  /**
   * Build the reviewable proposal. Every alternative states what is known, what is not,
   * and which existing approval adapters its steps would need. The `NO_ACTION` option is
   * a real coordination node, not an empty promise, and it creates no effect.
   */
  propose(input: {
    objectiveKey: string;
    safeDescription: string;
    budgetManifestHash: string;
    validUntil: string;
    scopeRefs?: unknown[];
    sourcePolicyRefs?: unknown[];
    unknowns?: readonly string[];
    options: readonly C9Feasible[];
    recommendedOptionKey?: string | null;
  }): C9Proposal {
    const options = this.feasible(input.options);
    const unknowns = [...(input.unknowns ?? [])].slice(0, 20);
    const scopeHash = c9Hash('strategy-scope/1', [
      input.objectiveKey,
      input.scopeRefs ?? [],
    ]);
    const alternatives: C9Object[] = options.map((option) => ({
      key: option.optionKey,
      title: option.title,
      kind: 'ACTION_PLAN',
      why: option.title,
      evidenceRefs: option.evidenceRefs ?? [],
      scopeHash,
      knownBenefit: {
        // A benefit is a reference to a qualified fact, never a generated number.
        factRefs: option.evidenceRefs ?? [],
        proposalText: '',
      },
      unknowns,
      risks: [],
      costSummary: {
        reservationRefs: [],
        sourceQuoteRefs: [],
        unavailableReasons: unknowns,
      },
      approvalAdapterRefs: [...(option.approvalAdapters ?? [])],
      recommended: option.optionKey === input.recommendedOptionKey,
    }));
    // Doing nothing is always an honest option and is always representable.
    alternatives.push({
      key: 'c9.no_action',
      title: 'Ничего не делать',
      kind: 'NO_ACTION',
      why: 'Явное решение не предпринимать действий.',
      evidenceRefs: [],
      scopeHash,
      knownBenefit: { factRefs: [], proposalText: '' },
      unknowns,
      risks: [],
      costSummary: {
        reservationRefs: [],
        sourceQuoteRefs: [],
        unavailableReasons: unknowns,
      },
      approvalAdapterRefs: [],
      recommended: !input.recommendedOptionKey,
    });
    if (alternatives.length > 3) alternatives.length = 3;
    if (alternatives.filter((a) => a.recommended).length > 1)
      c9Deny('single_recommendation');
    const steps: C9StepDraft[] = [];
    for (const option of options.slice(0, alternatives.length)) {
      if (!alternatives.some((a) => a.key === option.optionKey)) continue;
      const definition = c9Capability(option.capability, option.domain);
      steps.push({
        optionKey: option.optionKey,
        stepKey: `${option.optionKey}:1`,
        ordinal: 1,
        domain: option.domain,
        kind:
          definition.mode === 'READ'
            ? 'READ'
            : definition.mode === 'OWNER_HANDOFF'
              ? 'OWNER_HANDOFF'
              : 'PROPOSE',
        capability: option.capability,
        intentContract: option.intentContract,
        intent: option.intent,
        dependencies: [],
        evidenceRefs: option.evidenceRefs ?? [],
        budgetSlice: {
          callReservationKey: null,
          exposure: option.exposure ?? ZERO_EXPOSURE,
          sourcePreviewRefs: [],
        },
        validUntil: input.validUntil,
      });
    }
    if (alternatives.some((a) => a.key === 'c9.no_action'))
      steps.push({
        optionKey: 'c9.no_action',
        stepKey: 'c9.no_action:1',
        ordinal: 1,
        domain: options[0]?.domain ?? 'ADMIN',
        kind: 'NO_ACTION',
        capability: 'c9.no_action',
        intentContract: 'c9.no_action:input/1',
        intent: null,
        dependencies: [],
        evidenceRefs: [],
        budgetSlice: {
          callReservationKey: null,
          exposure: ZERO_EXPOSURE,
          sourcePreviewRefs: [],
        },
        validUntil: input.validUntil,
      });
    return {
      objective: {
        key: input.objectiveKey,
        safeDescription: input.safeDescription,
        subjectScopeHash: scopeHash,
        // A target is owner policy. C7 owns the measured outcome; C9 proposes neither.
        successCriteria: [],
      },
      constraints: {
        scopeRefs: input.scopeRefs ?? [],
        oneOff: {
          discounts: 'forbidden',
          branchRefs: [],
          serviceRefs: [],
          requestedPeriod: null,
        },
        sourcePolicyRefs: input.sourcePolicyRefs ?? [],
        budgetManifestHash: input.budgetManifestHash,
        exposure: ZERO_EXPOSURE,
        requiredApprovalAdapters: [
          ...new Set(options.flatMap((o) => [...(o.approvalAdapters ?? [])])),
        ].slice(0, 12),
      },
      alternatives,
      evidenceRefs: options.flatMap((o) => o.evidenceRefs ?? []).slice(0, 100),
      skills: [],
      validUntil: input.validUntil,
      steps,
    };
  }
  /** A material change of what was reviewed, not a cosmetic re-render. */
  materialHash(proposal: C9Proposal): string {
    return c9Hash('strategy-material/1', [
      c9Object(proposal.objective).key,
      proposal.constraints,
      (proposal.alternatives as C9Object[]).map((a) => [
        a.key,
        a.kind,
        a.approvalAdapterRefs,
        a.scopeHash,
      ]),
      proposal.steps.map((s) => [
        s.optionKey,
        s.stepKey,
        s.ordinal,
        s.domain,
        s.kind,
        s.capability,
        s.intentContract,
        s.budgetSlice,
      ]),
    ]);
  }
}
