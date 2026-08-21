import type { AgentDomain } from './opportunity.contract';

export const OPPORTUNITY_POLICY_CONTRACT =
  'maya.opportunity-policy-set/1' as const;

export interface ReactivationOpportunityPolicyV1 {
  enabled: boolean;
  policyRef: string;
  version: number;
  minimumDays: number;
  /** Recency is actionable only when canonical attendance is proven. */
  evidenceBasis: 'attendance_proven';
}

export interface CriticalBusinessInputPolicyV1 {
  enabled: boolean;
  policyRef: string;
  version: number;
  factKey: string;
  recommendedAgentDomain: Extract<AgentDomain, 'business_intelligence'>;
}

export interface BusinessMetricAttentionPolicyV1 {
  enabled: boolean;
  policyRef: string;
  version: number;
  metricKey: string;
  directions: Array<'increased' | 'decreased' | 'changed'>;
  outcome: 'inform_only';
}

/**
 * Policies are trusted tenant configuration, not model output and not external
 * request text. No default recency threshold is invented by Chapter 5.
 */
export interface OpportunityPolicySetV1 {
  contract: typeof OPPORTUNITY_POLICY_CONTRACT;
  tenantId: string;
  reactivation?: ReactivationOpportunityPolicyV1;
  businessMetricAttention: BusinessMetricAttentionPolicyV1[];
  criticalBusinessInputs: CriticalBusinessInputPolicyV1[];
}
