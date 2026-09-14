import { c8AssertOpportunityBranch } from '../valuation/c8.opportunity.contract';
import { createHash } from 'node:crypto';

import {
  ACTION_INTENT_CONTRACT,
  AGENT_TASK_CONTRACT,
  OPPORTUNITY_CONTRACT,
  OPPORTUNITY_TYPE,
  type ActionIntentV1,
  type AgentDomain,
  type AgentTaskV1,
  type OpportunityEvidenceV1,
  type OpportunityProjectionV1,
  type OpportunityType,
  type OpportunityV1,
} from './opportunity.contract';
import type {
  BusinessMetricAttentionPolicyV1,
  CriticalBusinessInputPolicyV1,
  OpportunityPolicySetV1,
  ReactivationOpportunityPolicyV1,
} from './opportunity.policy';
import {
  isCanonicalRemovedEvent,
  type AppointmentRemovedCapacitySignalV1,
  type BusinessFactChangeSignalV1,
  type ClientRecencySignalV1,
  type CriticalBusinessInputSignalV1,
  type IncomingCustomerRequestSignalV1,
  type OpportunitySignalV1,
} from './opportunity.signal';

export interface OpportunityProjectionInputV1 {
  signals: OpportunitySignalV1[];
  policies: OpportunityPolicySetV1[];
  /** Explicit projection clock. The engine never reads the system clock. */
  asOf: string;
}

type OpportunityWithoutIntent = Omit<OpportunityV1, 'proposedActionIntent'>;

interface RouteDefinition {
  domain: AgentDomain;
  objectiveKey: string;
  objective: string;
  allowedReadCapabilities: string[];
  allowedActionClasses: string[];
  allowedNextCapabilities: string[];
}

const ROUTES: Record<OpportunityType, RouteDefinition> = {
  [OPPORTUNITY_TYPE.clientReactivationCandidate]: {
    domain: 'client_lifecycle',
    objectiveKey: 'review_reactivation_candidate',
    objective:
      'Review the referenced recency evidence and prepare a safe reactivation assessment.',
    allowedReadCapabilities: [
      'client-lifecycle.recency.read',
      'client-lifecycle.eligibility.read',
    ],
    allowedActionClasses: ['prepare_reactivation_review'],
    allowedNextCapabilities: [
      'client-lifecycle.recency.read',
      'client-lifecycle.eligibility.read',
      'client-lifecycle.reactivation-review.prepare',
    ],
  },
  [OPPORTUNITY_TYPE.appointmentCancellationRecovery]: {
    domain: 'occupancy',
    objectiveKey: 'review_released_capacity',
    objective:
      'Review the proven released capacity and prepare recovery options without contacting anyone.',
    allowedReadCapabilities: [
      'occupancy.capacity.read',
      'occupancy.recovery-options.read',
    ],
    allowedActionClasses: ['prepare_recovery_options'],
    allowedNextCapabilities: [
      'occupancy.capacity.read',
      'occupancy.recovery-options.read',
      'occupancy.recovery-options.prepare',
    ],
  },
  [OPPORTUNITY_TYPE.businessMetricChange]: {
    domain: 'business_intelligence',
    objectiveKey: 'explain_canonical_metric_change',
    objective:
      'Explain the referenced canonical business fact change without recalculating it.',
    allowedReadCapabilities: ['business-state.fact.read'],
    allowedActionClasses: [],
    allowedNextCapabilities: ['business-state.fact.read'],
  },
  [OPPORTUNITY_TYPE.missingBusinessInput]: {
    domain: 'business_intelligence',
    objectiveKey: 'explain_missing_business_input',
    objective:
      'Explain the policy-critical missing or incomplete business input and its limitations.',
    allowedReadCapabilities: ['business-state.fact.read'],
    allowedActionClasses: [],
    allowedNextCapabilities: ['business-state.fact.read'],
  },
  [OPPORTUNITY_TYPE.incomingCustomerRequest]: {
    domain: 'admin',
    objectiveKey: 'prepare_customer_response_draft',
    objective:
      'Review the referenced untrusted customer request and prepare a response draft.',
    allowedReadCapabilities: ['admin.request.read'],
    allowedActionClasses: ['prepare_response_draft'],
    allowedNextCapabilities: [
      'admin.request.read',
      'admin.response-draft.prepare',
    ],
  },
};

/**
 * The only Chapter 5 owner of deterministic opportunity detection.
 *
 * This class is deliberately not a Nest provider. It has no database, queue,
 * network, CRM, messaging, or execution dependency. Callers provide canonical
 * evidence and an explicit clock, and receive an ephemeral shadow projection.
 */
export class CanonicalOpportunityEngine {
  project(input: OpportunityProjectionInputV1): OpportunityProjectionV1 {
    const asOf = parseInstant(input.asOf, 'projection asOf');
    const policies = indexPolicies(input.policies);
    const lifecycleBlocked = new Set(
      input.signals
        .filter((signal) => signal.evidenceLifecycle !== 'active')
        .map((signal) => signalIdentity(signal)),
    );

    const detected = input.signals.flatMap((signal) => {
      if (signal.evidenceLifecycle !== 'active') return [];
      if (lifecycleBlocked.has(signalIdentity(signal))) return [];
      if (isExpired(signal.expiresAt, asOf)) return [];
      const policy = policies.get(signal.tenantId);
      const opportunity = this.detect(signal, policy);
      return opportunity ? [opportunity] : [];
    });

    const unique = deduplicateOpportunities(detected);
    const opportunities: OpportunityV1[] = [];
    const agentTasks: AgentTaskV1[] = [];
    const actionIntents: ActionIntentV1[] = [];

    for (const base of unique) {
      const task = routeTask(base);
      const intent = task ? proposeActionIntent(base, task) : null;
      const opportunity: OpportunityV1 = intent
        ? { ...base, proposedActionIntent: intent }
        : base;

      assertCanonicalOpportunity(opportunity);
      if (task) assertCanonicalAgentTask(task);
      if (intent) {
        assertActionIntent(intent);
        actionIntents.push(intent);
      }
      opportunities.push(opportunity);
      if (task) agentTasks.push(task);
    }

    const routedByDomain: Record<AgentDomain, number> = {
      admin: 0,
      client_lifecycle: 0,
      occupancy: 0,
      business_intelligence: 0,
    };
    for (const task of agentTasks) routedByDomain[task.agentDomain] += 1;

    return {
      contract: 'maya.opportunity-projection/1',
      opportunities,
      agentTasks,
      actionIntents,
      metrics: {
        signalsRead: input.signals.length,
        detected: detected.length,
        deduplicated: detected.length - unique.length,
        routedByDomain,
        actionIntentsProposed: actionIntents.length,
        executed: 0,
      },
    };
  }

  private detect(
    signal: OpportunitySignalV1,
    policy: OpportunityPolicySetV1 | undefined,
  ): OpportunityWithoutIntent | null {
    assertSignal(signal);

    switch (signal.kind) {
      case 'client_recency':
        return detectClientRecency(signal, policy?.reactivation);
      case 'appointment_removed_capacity':
        return detectReleasedCapacity(signal);
      case 'business_fact_change':
        return detectBusinessFactChange(
          signal,
          policy?.businessMetricAttention ?? [],
        );
      case 'critical_business_input':
        return detectCriticalBusinessInput(
          signal,
          policy?.criticalBusinessInputs ?? [],
        );
      case 'incoming_customer_request':
        return detectIncomingRequest(signal);
    }
  }
}

function detectClientRecency(
  signal: ClientRecencySignalV1,
  policy: ReactivationOpportunityPolicyV1 | undefined,
): OpportunityWithoutIntent | null {
  if (!policy?.enabled) return null;
  assertReactivationPolicy(policy);
  if (signal.distance.state !== 'measured') return null;
  if (!signal.attendanceProven) return null;
  if (signal.basis !== 'provider_visit_history_canonical_attendance') {
    return null;
  }
  if (signal.distance.days === null) return null;
  if (signal.distance.days < policy.minimumDays) return null;

  const type = OPPORTUNITY_TYPE.clientReactivationCandidate;
  const affectedEntity = { kind: 'client', ref: signal.clientRef } as const;
  const evidence: OpportunityEvidenceV1[] = [
    {
      owner: 'business_state_fact',
      capability: 'client-recency-facts.read',
      factRef: signal.factRef,
      version: 1,
      observedAt: signal.observedAt,
      asOf: signal.asOf,
      completeness: 'complete',
      basis: signal.basis,
    },
  ];

  return opportunityBase({
    signal,
    type,
    affectedEntity,
    evidence,
    semanticParts: [signal.clientRef],
    policyKey: policy.policyRef,
    policyVersion: policy.version,
    outcome: 'action_candidate',
    limitations: [],
  });
}

function detectReleasedCapacity(
  signal: AppointmentRemovedCapacitySignalV1,
): OpportunityWithoutIntent | null {
  if (!isCanonicalRemovedEvent(signal)) return null;
  if (signal.ingestionMethod === 'bootstrap') return null;
  if (signal.observationOrigin !== 'after_watch_started') return null;
  if (
    parseInstant(signal.occurredAt, 'event occurredAt').getTime() <
    parseInstant(signal.cutoverAt, 'WATCH cutoverAt').getTime()
  ) {
    return null;
  }
  if (signal.capacity.state !== 'measured') return null;
  if (
    signal.capacity.availability !== 'available' ||
    signal.capacity.completeness !== 'complete' ||
    signal.capacity.durationMinutes === null ||
    signal.capacity.durationMinutes <= 0 ||
    !signal.capacity.intervalRef ||
    !signal.capacity.scheduleRef
  ) {
    return null;
  }

  const type = OPPORTUNITY_TYPE.appointmentCancellationRecovery;
  const affectedEntity = {
    kind: 'appointment',
    ref: signal.appointmentRef,
  } as const;
  const evidence: OpportunityEvidenceV1[] = [
    {
      owner: 'watch_domain_event',
      capability: 'watch.domain-event.read',
      factRef: signal.eventRef,
      version: 1,
      observedAt: signal.observedAt,
      asOf: signal.occurredAt,
      completeness: 'complete',
      basis: 'canonical_appointment_removed_after_watch_cutover',
    },
    {
      owner: 'occupancy_capacity',
      capability: 'occupancy.capacity.read',
      factRef: signal.capacity.intervalRef,
      version: 1,
      observedAt: signal.observedAt,
      asOf: signal.occurredAt,
      completeness: 'complete',
      basis: signal.capacity.basis,
    },
    {
      owner: 'occupancy_capacity',
      capability: 'occupancy.schedule.read',
      factRef: signal.capacity.scheduleRef,
      version: 1,
      observedAt: signal.observedAt,
      asOf: signal.occurredAt,
      completeness: 'complete',
      basis: signal.capacity.basis,
    },
  ];

  return opportunityBase({
    signal,
    type,
    affectedEntity,
    evidence,
    semanticParts: [signal.appointmentRef],
    policyKey: 'occupancy.released_capacity',
    policyVersion: 1,
    outcome: 'action_candidate',
    limitations: ['removal_actor_and_reason_not_proven'],
  });
}

function detectBusinessFactChange(
  signal: BusinessFactChangeSignalV1,
  policies: BusinessMetricAttentionPolicyV1[],
): OpportunityWithoutIntent | null {
  if (
    signal.currentState !== 'measured' ||
    signal.previousState !== 'measured'
  ) {
    return null;
  }
  const policy = policies.find(
    (candidate) =>
      candidate.enabled &&
      candidate.metricKey === signal.metricKey &&
      candidate.directions.includes(signal.direction),
  );
  if (!policy) return null;
  assertBusinessMetricAttentionPolicy(policy);

  const type = OPPORTUNITY_TYPE.businessMetricChange;
  const evidence: OpportunityEvidenceV1[] = [
    {
      owner: 'business_state_fact',
      capability: 'business-state.fact.read',
      factRef: signal.previousFactRef,
      version: 1,
      observedAt: signal.observedAt,
      completeness: 'complete',
      basis: signal.basis,
    },
    {
      owner: 'business_state_fact',
      capability: 'business-state.fact.read',
      factRef: signal.currentFactRef,
      version: 1,
      observedAt: signal.observedAt,
      completeness: 'complete',
      basis: signal.basis,
    },
    {
      owner: 'business_state_change',
      capability: 'business-state.change.read',
      factRef: signal.changeRef,
      version: 1,
      observedAt: signal.observedAt,
      completeness: 'complete',
      basis: signal.basis,
    },
  ];

  return opportunityBase({
    signal,
    type,
    affectedEntity: signal.affectedEntity,
    evidence,
    semanticParts: [signal.metricKey],
    policyKey: policy.policyRef,
    policyVersion: policy.version,
    outcome: policy.outcome,
    limitations: ['canonical_change_has_no_valuation_model'],
  });
}

function detectCriticalBusinessInput(
  signal: CriticalBusinessInputSignalV1,
  policies: CriticalBusinessInputPolicyV1[],
): OpportunityWithoutIntent | null {
  if (signal.state === 'measured') return null;
  const policy = policies.find(
    (candidate) => candidate.enabled && candidate.factKey === signal.factKey,
  );
  if (!policy) return null;
  assertCriticalInputPolicy(policy);

  const type = OPPORTUNITY_TYPE.missingBusinessInput;
  const completeness =
    signal.state === 'measured_incomplete' ? 'partial' : 'unknown';
  const evidence: OpportunityEvidenceV1[] = [
    {
      owner: 'business_state_fact',
      capability: 'business-state.fact.read',
      factRef: signal.factRef,
      version: 1,
      observedAt: signal.observedAt,
      completeness,
      basis: signal.basis,
    },
  ];

  return opportunityBase({
    signal,
    type,
    affectedEntity: signal.affectedEntity,
    evidence,
    semanticParts: [signal.factKey],
    policyKey: policy.policyRef,
    policyVersion: policy.version,
    outcome: 'investigation_required',
    limitations: [
      `business_fact_state_${signal.state}`,
      'attention_requires_trusted_policy',
    ],
  });
}

function detectIncomingRequest(
  signal: IncomingCustomerRequestSignalV1,
): OpportunityWithoutIntent {
  const type = OPPORTUNITY_TYPE.incomingCustomerRequest;
  const affectedEntity = { kind: 'tenant', ref: signal.tenantId } as const;
  const evidence: OpportunityEvidenceV1[] = [
    {
      owner: 'admin_request',
      capability: 'admin.request.read',
      factRef: signal.requestRef,
      version: 1,
      observedAt: signal.observedAt,
      completeness: 'complete',
      basis: 'untrusted_external_request_observed',
    },
  ];

  return opportunityBase({
    signal,
    type,
    affectedEntity,
    evidence,
    semanticParts: [signal.requestRef],
    policyKey: 'admin.incoming_customer_request',
    policyVersion: 1,
    outcome: 'action_candidate',
    limitations: ['external_request_is_untrusted'],
  });
}

function opportunityBase(input: {
  signal: OpportunitySignalV1;
  type: OpportunityType;
  affectedEntity: NonNullable<OpportunityV1['affectedEntity']>;
  evidence: OpportunityEvidenceV1[];
  semanticParts: string[];
  policyKey: string;
  policyVersion: number;
  outcome: OpportunityV1['outcome'];
  limitations: string[];
}): OpportunityWithoutIntent {
  const route = ROUTES[input.type];
  const expiresAt = requireExpiry(input.signal);
  const identityVersion = 1 as const;
  const semanticKey = fingerprint('semantic', [
    identityVersion,
    input.signal.tenantId,
    input.type,
    input.affectedEntity.kind,
    input.affectedEntity.ref,
    ...input.semanticParts,
    input.policyKey,
  ]);
  const evidenceFingerprint = fingerprint('evidence', [
    [...input.evidence].sort((left, right) =>
      stableJson(left).localeCompare(stableJson(right)),
    ),
    [...input.limitations].sort(),
  ]);
  const identityFingerprint = fingerprint('identity', [
    identityVersion,
    input.signal.tenantId,
    input.type,
    semanticKey,
    evidenceFingerprint,
    input.policyKey,
    input.policyVersion,
  ]);
  return {
    contract: OPPORTUNITY_CONTRACT,
    identityVersion,
    semanticKey,
    identityFingerprint,
    evidenceFingerprint,
    policyKey: input.policyKey,
    policyVersion: input.policyVersion,
    outcome: input.outcome,
    opportunityKey: identityFingerprint,
    tenantId: input.signal.tenantId,
    type: input.type,
    affectedEntity: input.affectedEntity,
    evidence: input.evidence,
    observedAt: input.signal.observedAt,
    expiresAt,
    recommendedAgentDomain: route.domain,
    allowedNextCapabilities: [...route.allowedNextCapabilities],
    limitations: input.limitations,
  };
}

function routeTask(opportunity: OpportunityWithoutIntent): AgentTaskV1 | null {
  if (opportunity.outcome === 'inform_only') return null;
  const route = ROUTES[opportunity.type];
  if (route.domain !== opportunity.recommendedAgentDomain) {
    throw new Error('Opportunity domain does not match the canonical route.');
  }
  const evidenceRefs = evidenceRefsOf(opportunity);
  const taskFingerprint = fingerprint('task', [
    opportunity.tenantId,
    route.domain,
    opportunity.semanticKey,
    opportunity.identityFingerprint,
    route.objectiveKey,
  ]);

  return {
    contract: AGENT_TASK_CONTRACT,
    taskId: taskFingerprint,
    tenantId: opportunity.tenantId,
    agentDomain: route.domain,
    semanticKey: opportunity.semanticKey,
    taskFingerprint,
    opportunityRefs: [opportunity.identityFingerprint],
    objectiveKey: route.objectiveKey,
    objective: route.objective,
    evidenceRefs,
    allowedReadCapabilities: [...route.allowedReadCapabilities],
    allowedActionClasses: [...route.allowedActionClasses],
    autonomy: 'L2_5_SHADOW',
    constraints: {
      noSideEffects: true,
      noDirectAgentCalls: true,
      noTruthOwnership: true,
      noCanonicalMetricCalculation: true,
    },
    requestedAt: opportunity.observedAt,
    expiresAt: opportunity.expiresAt,
  };
}

function proposeActionIntent(
  opportunity: OpportunityWithoutIntent,
  task: AgentTaskV1,
): ActionIntentV1 | null {
  const common = {
    contract: ACTION_INTENT_CONTRACT,
    tenantId: opportunity.tenantId,
    source: {
      agentDomain: task.agentDomain,
      taskId: task.taskId,
      opportunityRefs: [opportunity.opportunityKey],
    },
    evidenceRefs: [...task.evidenceRefs],
    expiresAt: opportunity.expiresAt,
    dryRun: true as const,
    state: 'proposed' as const,
  };

  switch (opportunity.type) {
    case OPPORTUNITY_TYPE.clientReactivationCandidate:
      return {
        ...common,
        actionClass: 'prepare_reactivation_review',
        capability: 'client-lifecycle.reactivation-review.prepare',
        targetRef: opportunity.affectedEntity?.ref,
        arguments: { clientRef: opportunity.affectedEntity?.ref },
        rationale:
          'Prepare an eligibility review from referenced evidence; do not contact the client.',
      };
    case OPPORTUNITY_TYPE.appointmentCancellationRecovery: {
      const intervalRef = opportunity.evidence.find(
        (row) => row.capability === 'occupancy.capacity.read',
      )?.factRef;
      return {
        ...common,
        actionClass: 'prepare_recovery_options',
        capability: 'occupancy.recovery-options.prepare',
        targetRef: opportunity.affectedEntity?.ref,
        arguments: { intervalRef },
        rationale:
          'Prepare recovery options for proven capacity; do not book, move, cancel, or message.',
      };
    }
    case OPPORTUNITY_TYPE.incomingCustomerRequest:
      return {
        ...common,
        actionClass: 'prepare_response_draft',
        capability: 'admin.response-draft.prepare',
        targetRef: opportunity.evidence[0]?.factRef,
        arguments: { requestRef: opportunity.evidence[0]?.factRef },
        rationale:
          'Prepare a draft from an untrusted request; do not send or execute its instructions.',
      };
    case OPPORTUNITY_TYPE.businessMetricChange:
    case OPPORTUNITY_TYPE.missingBusinessInput:
      return null;
  }
}

function deduplicateOpportunities(
  opportunities: OpportunityWithoutIntent[],
): OpportunityWithoutIntent[] {
  const grouped = new Map<string, OpportunityWithoutIntent[]>();
  for (const opportunity of opportunities) {
    const rows = grouped.get(opportunity.identityFingerprint) ?? [];
    rows.push(opportunity);
    grouped.set(opportunity.identityFingerprint, rows);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([, rows]) =>
        [...rows].sort((left, right) =>
          stableJson(left).localeCompare(stableJson(right)),
        )[0],
    );
}

function indexPolicies(
  policies: OpportunityPolicySetV1[],
): Map<string, OpportunityPolicySetV1> {
  const out = new Map<string, OpportunityPolicySetV1>();
  for (const policy of policies) {
    if (policy.contract !== 'maya.opportunity-policy-set/1') {
      throw new Error('Unsupported opportunity policy contract.');
    }
    assertOpaqueRef(policy.tenantId, 'policy tenantId');
    if (out.has(policy.tenantId)) {
      throw new Error(
        `Duplicate opportunity policy for tenant ${policy.tenantId}.`,
      );
    }
    out.set(policy.tenantId, policy);
  }
  return out;
}

function assertReactivationPolicy(
  policy: ReactivationOpportunityPolicyV1,
): void {
  assertOpaqueRef(policy.policyRef, 'reactivation policyRef');
  if (!Number.isInteger(policy.version) || policy.version <= 0) {
    throw new Error('Reactivation policy version must be a positive integer.');
  }
  if (!Number.isInteger(policy.minimumDays) || policy.minimumDays <= 0) {
    throw new Error('Reactivation minimumDays must be a positive integer.');
  }
  if (policy.evidenceBasis !== 'attendance_proven') {
    throw new Error('Reactivation policy requires proven attendance evidence.');
  }
  if (/churn/i.test(policy.policyRef)) {
    throw new Error('Recency policy cannot claim predictive churn semantics.');
  }
}

function assertCriticalInputPolicy(
  policy: CriticalBusinessInputPolicyV1,
): void {
  assertOpaqueRef(policy.policyRef, 'critical input policyRef');
  if (!Number.isInteger(policy.version) || policy.version <= 0) {
    throw new Error(
      'Critical input policy version must be a positive integer.',
    );
  }
  if (!policy.factKey.trim()) {
    throw new Error('Critical input policy factKey is required.');
  }
  if (policy.recommendedAgentDomain !== 'business_intelligence') {
    throw new Error('Critical business inputs route only to BI in Chapter 5.');
  }
}

function assertBusinessMetricAttentionPolicy(
  policy: BusinessMetricAttentionPolicyV1,
): void {
  assertOpaqueRef(policy.policyRef, 'business metric policyRef');
  if (!Number.isInteger(policy.version) || policy.version <= 0) {
    throw new Error(
      'Business metric attention policy version must be a positive integer.',
    );
  }
  if (!policy.metricKey.trim() || policy.directions.length === 0) {
    throw new Error(
      'Business metric attention policy requires a metric and direction.',
    );
  }
  if (policy.outcome !== 'inform_only') {
    throw new Error('Business metric attention is inform-only in Chapter 5.');
  }
}

function assertSignal(signal: OpportunitySignalV1): void {
  assertOpaqueRef(signal.tenantId, 'signal tenantId');
  parseInstant(signal.observedAt, 'signal observedAt');
  if (signal.expiresAt) parseInstant(signal.expiresAt, 'signal expiresAt');

  for (const ref of signalRefs(signal)) assertOpaqueRef(ref, 'evidence ref');
  if ('affectedEntity' in signal) {
    assertOpaqueRef(signal.affectedEntity.ref, 'affected entity ref');
  }
}

export function assertCanonicalOpportunity(opportunity: OpportunityV1): void {
  if (opportunity.contract !== OPPORTUNITY_CONTRACT) {
    throw new Error('Unsupported Opportunity contract.');
  }
  if (opportunity.identityVersion !== 1) {
    throw new Error('Unsupported Opportunity identity version.');
  }
  assertOpaqueRef(opportunity.semanticKey, 'semanticKey');
  assertOpaqueRef(opportunity.identityFingerprint, 'identityFingerprint');
  assertOpaqueRef(opportunity.evidenceFingerprint, 'evidenceFingerprint');
  assertOpaqueRef(opportunity.policyKey, 'policyKey');
  if (
    !Number.isInteger(opportunity.policyVersion) ||
    opportunity.policyVersion <= 0
  ) {
    throw new Error('Opportunity policyVersion must be a positive integer.');
  }
  if (opportunity.opportunityKey !== opportunity.identityFingerprint) {
    throw new Error(
      'Opportunity compatibility key must equal identityFingerprint.',
    );
  }
  assertOpaqueRef(opportunity.opportunityKey, 'opportunityKey');
  assertOpaqueRef(opportunity.tenantId, 'opportunity tenantId');
  if (opportunity.affectedEntity) {
    assertOpaqueRef(opportunity.affectedEntity.ref, 'affected entity ref');
  }
  if (opportunity.evidence.length === 0) {
    throw new Error('Opportunity requires evidence.');
  }
  for (const evidence of opportunity.evidence) {
    if (evidence.factRef) assertOpaqueRef(evidence.factRef, 'factRef');
    if (!Number.isInteger(evidence.version) || evidence.version <= 0) {
      throw new Error('Evidence version must be a positive integer.');
    }
    parseInstant(evidence.observedAt, 'evidence observedAt');
  }
  const observedAt = parseInstant(
    opportunity.observedAt,
    'opportunity observedAt',
  );
  const expiresAt = parseInstant(
    opportunity.expiresAt,
    'opportunity expiresAt',
  );
  if (expiresAt.getTime() <= observedAt.getTime()) {
    throw new Error('Opportunity expiry must be after its observation.');
  }
  c8AssertOpportunityBranch(opportunity);
  assertNoInventedValuation(opportunity);
}

export function assertCanonicalAgentTask(task: AgentTaskV1): void {
  if (task.contract !== AGENT_TASK_CONTRACT) {
    throw new Error('Unsupported AgentTask contract.');
  }
  if (task.autonomy !== 'L2_5_SHADOW' || !task.constraints.noSideEffects) {
    throw new Error('Chapter 5 tasks must remain L2.5 Shadow.');
  }
  if (task.opportunityRefs.length !== 1) {
    throw new Error('Chapter 5 routes one minimal opportunity per task.');
  }
  assertOpaqueRef(task.semanticKey, 'task semanticKey');
  assertOpaqueRef(task.taskFingerprint, 'taskFingerprint');
  assertOpaqueRef(task.objectiveKey, 'task objectiveKey');
  const requestedAt = parseInstant(task.requestedAt, 'task requestedAt');
  const expiresAt = parseInstant(task.expiresAt, 'task expiresAt');
  if (expiresAt.getTime() <= requestedAt.getTime()) {
    throw new Error('AgentTask expiry must be after its request.');
  }
  assertNoInventedValuation(task);
}

function assertActionIntent(intent: ActionIntentV1): void {
  if (intent.contract !== ACTION_INTENT_CONTRACT) {
    throw new Error('Unsupported ActionIntent contract.');
  }
  if (intent.dryRun !== true || intent.state !== 'proposed') {
    throw new Error(
      'Chapter 5 ActionIntent can only be proposed dry-run output.',
    );
  }
  const forbiddenArgumentKeys =
    /phone|email|name|token|secret|message|text|payload|permission|autonomy|domain|capability/i;
  for (const key of Object.keys(intent.arguments)) {
    if (forbiddenArgumentKeys.test(key)) {
      throw new Error(`ActionIntent argument ${key} is not allowed.`);
    }
  }
  assertNoInventedValuation(intent);
}

function assertNoInventedValuation(value: unknown): void {
  const forbidden =
    /lost.?revenue|recovered.?revenue|expected.?recovery|customer.?lifetime.?value|campaign.?value|valuation.?amount|churn.?probability/i;
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(
      item as Record<string, unknown>,
    )) {
      if (forbidden.test(key)) {
        throw new Error(`Invented valuation field ${key} is forbidden.`);
      }
      visit(nested);
    }
  };
  visit(value);
}

function evidenceRefsOf(opportunity: OpportunityWithoutIntent): string[] {
  return opportunity.evidence
    .flatMap((row) => (row.factRef ? [row.factRef] : []))
    .sort((left, right) => left.localeCompare(right));
}

function signalRefs(signal: OpportunitySignalV1): string[] {
  switch (signal.kind) {
    case 'client_recency':
      return [signal.clientRef, signal.factRef];
    case 'appointment_removed_capacity':
      return [
        signal.eventRef,
        signal.appointmentRef,
        ...(signal.capacity.intervalRef ? [signal.capacity.intervalRef] : []),
        ...(signal.capacity.scheduleRef ? [signal.capacity.scheduleRef] : []),
      ];
    case 'business_fact_change':
      return [signal.changeRef, signal.currentFactRef, signal.previousFactRef];
    case 'critical_business_input':
      return [signal.factRef];
    case 'incoming_customer_request':
      return [signal.requestRef];
  }
}

function signalIdentity(signal: OpportunitySignalV1): string {
  return fingerprint('evidence', [
    signal.tenantId,
    signal.kind,
    ...signalRefs(signal),
  ]);
}

function assertOpaqueRef(ref: string, label: string): void {
  if (!ref || ref !== ref.trim() || /\s|@/.test(ref) || ref.startsWith('+')) {
    throw new Error(`${label} must be an opaque reference.`);
  }
}

function parseInstant(value: string, label: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO instant.`);
  }
  return parsed;
}

function isExpired(expiresAt: string | undefined, asOf: Date): boolean {
  return expiresAt
    ? parseInstant(expiresAt, 'expiresAt').getTime() <= asOf.getTime()
    : false;
}

function requireExpiry(signal: OpportunitySignalV1): string {
  if (!signal.expiresAt) {
    throw new Error(
      `Opportunity family ${signal.kind} requires an explicit family expiry.`,
    );
  }
  const observedAt = parseInstant(signal.observedAt, 'signal observedAt');
  const expiresAt = parseInstant(signal.expiresAt, 'signal expiresAt');
  if (expiresAt.getTime() <= observedAt.getTime()) {
    throw new Error(
      `Opportunity family ${signal.kind} expiry must be after observedAt.`,
    );
  }
  return expiresAt.toISOString();
}

export function canonicalFingerprint(
  prefix: string,
  values: unknown[],
): string {
  const digest = createHash('sha256')
    .update(stableCanonicalJson(values), 'utf8')
    .digest('hex');
  return `${prefix}_${digest}`;
}

function fingerprint(prefix: string, values: unknown[]): string {
  return canonicalFingerprint(prefix, values);
}

export function stableCanonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableJson(value: unknown): string {
  return stableCanonicalJson(value);
}

function stableValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nested]) => [key, stableValue(nested)] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}
