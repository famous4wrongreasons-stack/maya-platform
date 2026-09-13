export const OPPORTUNITY_CONTRACT = 'maya.opportunity/1' as const;
export const AGENT_TASK_CONTRACT = 'maya.agent-task/1' as const;
export const ACTION_INTENT_CONTRACT = 'maya.action-intent/1' as const;

export const OPPORTUNITY_TYPE = {
  clientReactivationCandidate: 'client_reactivation_candidate',
  appointmentCancellationRecovery: 'appointment_cancellation_recovery',
  businessMetricChange: 'business_metric_change',
  missingBusinessInput: 'missing_business_input',
  incomingCustomerRequest: 'incoming_customer_request',
} as const;

export type OpportunityType =
  (typeof OPPORTUNITY_TYPE)[keyof typeof OPPORTUNITY_TYPE];

export type AgentDomain =
  'admin' | 'client_lifecycle' | 'occupancy' | 'business_intelligence';

export type OpportunityOutcome =
  'inform_only' | 'investigation_required' | 'action_candidate';

export type OpportunityEntityKind =
  'client' | 'appointment' | 'staff' | 'service' | 'branch' | 'tenant';

export interface OpportunityEntityRef {
  kind: OpportunityEntityKind;
  /** Opaque tenant-scoped reference. Never a name, phone, email, or token. */
  ref: string;
}

export interface OpportunityEvidenceV1 {
  owner:
    | 'business_state_fact'
    | 'business_state_change'
    | 'watch_domain_event'
    | 'occupancy_capacity'
    | 'admin_request'
    | 'c8_result';
  capability: string;
  factRef?: string;
  version: number;
  observedAt: string;
  asOf?: string;
  completeness: 'complete' | 'partial' | 'unknown';
  basis: string;
}

export interface ActionIntentV1 {
  contract: typeof ACTION_INTENT_CONTRACT;
  tenantId: string;
  source: {
    agentDomain: AgentDomain;
    taskId: string;
    opportunityRefs: string[];
  };
  actionClass: string;
  capability: string;
  targetRef?: string;
  arguments: Record<string, unknown>;
  rationale: string;
  evidenceRefs: string[];
  expiresAt?: string;
  dryRun: true;
  state: 'proposed';
}

export interface OpportunityV1 {
  contract: typeof OPPORTUNITY_CONTRACT;
  identityVersion: 1;
  semanticKey: string;
  identityFingerprint: string;
  evidenceFingerprint: string;
  policyKey: string;
  policyVersion: number;
  outcome: OpportunityOutcome;
  /** Compatibility alias for Phase B consumers. Equal to identityFingerprint. */
  opportunityKey: string;
  tenantId: string;
  type: OpportunityType;
  affectedEntity?: OpportunityEntityRef;
  evidence: OpportunityEvidenceV1[];
  observedAt: string;
  expiresAt: string;
  recommendedAgentDomain: AgentDomain;
  allowedNextCapabilities: string[];
  proposedActionIntent?: ActionIntentV1;
  limitations: string[];
}

export interface AgentTaskV1 {
  contract: typeof AGENT_TASK_CONTRACT;
  taskId: string;
  tenantId: string;
  agentDomain: AgentDomain;
  semanticKey: string;
  taskFingerprint: string;
  opportunityRefs: string[];
  objectiveKey: string;
  objective: string;
  evidenceRefs: string[];
  allowedReadCapabilities: string[];
  allowedActionClasses: string[];
  autonomy: 'L2_5_SHADOW';
  constraints: {
    noSideEffects: true;
    noDirectAgentCalls: true;
    noTruthOwnership: true;
    noCanonicalMetricCalculation: true;
  };
  requestedAt: string;
  expiresAt: string;
}

export interface OpportunityProjectionV1 {
  contract: 'maya.opportunity-projection/1';
  opportunities: OpportunityV1[];
  agentTasks: AgentTaskV1[];
  actionIntents: ActionIntentV1[];
  metrics: {
    signalsRead: number;
    detected: number;
    deduplicated: number;
    routedByDomain: Record<AgentDomain, number>;
    actionIntentsProposed: number;
    executed: 0;
  };
}
