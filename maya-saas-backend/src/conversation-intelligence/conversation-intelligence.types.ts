import type { UserRole } from '../common/domain.enums';

export const CONVERSATION_DOMAINS = [
  'booking',
  'schedule',
  'clients',
  'employees',
  'services',
  'finance',
  'payments',
  'sales',
  'products',
  'inventory',
  'analytics',
  'kpi',
  'retention',
  'churn',
  'marketing',
  'messaging',
  'reviews',
  'loyalty',
  'bonuses',
  'certificates',
  'subscriptions',
  'referrals',
  'branches',
  'company',
  'settings',
  'notifications',
  'tasks',
  'reports',
  'forecasting',
  'recommendations',
  'general_business_questions',
  'support',
  'small_talk',
] as const;

export type ConversationDomain = (typeof CONVERSATION_DOMAINS)[number];

export type ConversationAction =
  'answer' | 'read' | 'analyze' | 'preview' | 'write' | 'execute';

export type ConversationDataClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type ConversationRisk = 'low' | 'medium' | 'high';
export type ConversationCapabilityReadiness = 'ready' | 'partial' | 'planned';
export type ConversationPermissionStatus =
  'allowed' | 'denied' | 'not_applicable';
export type ConversationToolStatus = 'ready' | 'not_available' | 'not_needed';

export type ConversationEntityValue =
  string | number | boolean | null | string[] | number[];

export type ConversationEntities = Record<string, ConversationEntityValue>;

export interface ConversationIntentDefinition {
  id: string;
  domain: ConversationDomain;
  subIntent: string;
  description: string;
  action: ConversationAction;
  dataClass: ConversationDataClass;
  risk: ConversationRisk;
  readiness: ConversationCapabilityReadiness;
  readinessNote: string | null;
  permission: string | null;
  allowedRoles: readonly UserRole[];
  toolCandidates: readonly string[];
  requiredSlots: readonly string[];
  optionalSlots: readonly string[];
  clarificationRule: string;
  responseRule: string;
  synonyms: readonly string[];
  examples: readonly string[];
}

export interface ConversationSemanticTask {
  id: string;
  domain: ConversationDomain;
  intent: string;
  sub_intent: string;
  action: ConversationAction;
  data_class: ConversationDataClass;
  risk: ConversationRisk;
  capability: {
    readiness: ConversationCapabilityReadiness;
    note: string | null;
  };
  response_rule: string;
  entities: ConversationEntities;
  depends_on: string[];
  permission: {
    required: string | null;
    status: ConversationPermissionStatus;
  };
  tool: {
    name: string | null;
    alternatives: string[];
    status: ConversationToolStatus;
  };
  confidence: number;
  requires_clarification: boolean;
  clarification_question: string | null;
  requires_confirmation: boolean;
}

export interface ConversationSemanticPlan {
  version: 'maya-ci/1';
  parent_request: string;
  language: string;
  dialogue_act: string;
  tasks: ConversationSemanticTask[];
  context: {
    carried_slots: string[];
    replaced_slots: string[];
    unresolved_references: string[];
  };
}

export interface ConversationPlannerIntent {
  intent: string;
  domain: ConversationDomain;
  description: string;
  action: ConversationAction;
  data_class: ConversationDataClass;
  readiness: ConversationCapabilityReadiness;
  readiness_note: string | null;
  allowed_for_role: boolean;
  ready_tools: string[];
  required_slots: readonly string[];
  optional_slots: readonly string[];
  language_hints: readonly string[];
}

export interface ConversationTemporalNormalizationRule {
  canonical: string;
  examples: readonly string[];
  resolution: string;
}

export interface ConversationNumberNormalizationRule {
  kind: 'amount' | 'count' | 'time' | 'duration';
  examples: readonly string[];
  resolution: string;
}

export interface ConversationLanguageContract {
  locale: 'ru-RU';
  business_timezone: string;
  timezone_policy: string;
  domain_terms: Record<ConversationDomain, readonly string[]>;
  entity_terms: Record<string, readonly string[]>;
  temporal_rules: readonly ConversationTemporalNormalizationRule[];
  number_rules: readonly ConversationNumberNormalizationRule[];
  noisy_input_rules: readonly string[];
  elliptical_follow_ups: readonly string[];
}

export interface ConversationPolicyRule {
  readonly id: string;
  readonly rule: string;
}

export interface ConversationDataClassPolicy {
  readonly label: string;
  readonly tool_requirement:
    | 'not_required'
    | 'tenant_context'
    | 'verified_tool'
    | 'verified_calculation'
    | 'confirmed_action'
    | 'forbidden';
  readonly behavior: string;
}

export interface ConversationRiskPolicy {
  readonly confirmation:
    'not_required' | 'preview_only' | 'required_before_side_effect';
  readonly behavior: string;
}

export interface ConversationPolicyContract {
  readonly version: 'maya-ci-policy/1';
  readonly data_classes: {
    readonly [dataClass in ConversationDataClass]: ConversationDataClassPolicy;
  };
  readonly context: readonly ConversationPolicyRule[];
  readonly clarification: readonly ConversationPolicyRule[];
  readonly confirmation: readonly ConversationPolicyRule[];
  readonly risk_levels: {
    readonly [risk in ConversationRisk]: ConversationRiskPolicy;
  };
  readonly routing: readonly ConversationPolicyRule[];
  readonly grounding: readonly ConversationPolicyRule[];
  readonly privacy: readonly ConversationPolicyRule[];
}

export interface ConversationPlannerContract {
  version: 'maya-ci/1';
  principal_role: UserRole;
  pipeline: readonly [
    'intent',
    'entities',
    'context',
    'permission',
    'tool',
    'reasoning',
    'response',
  ];
  intents: ConversationPlannerIntent[];
  language: ConversationLanguageContract;
  policies: ConversationPolicyContract;
}

export interface ConversationPlanCandidateTask {
  id?: unknown;
  intent?: unknown;
  entities?: unknown;
  depends_on?: unknown;
  confidence?: unknown;
  requires_clarification?: unknown;
  clarification_question?: unknown;
}

export interface ConversationPlanCandidate {
  parent_request?: unknown;
  language?: unknown;
  dialogue_act?: unknown;
  tasks?: unknown;
  context?: unknown;
}

export interface ConversationToolCall {
  name: string;
  arguments: Record<string, unknown>;
}
