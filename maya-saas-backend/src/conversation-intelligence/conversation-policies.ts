import type {
  ConversationPlannerContract,
  ConversationPolicyContract,
} from './conversation-intelligence.types';

export const MAYA_CONVERSATION_PIPELINE = [
  'intent',
  'entities',
  'context',
  'permission',
  'tool',
  'reasoning',
  'response',
] as const satisfies ConversationPlannerContract['pipeline'];

/**
 * One versioned policy source for the runtime planner, generated artefacts and
 * independent evaluation. Product behavior must not be redefined in prompts.
 */
export const MAYA_CONVERSATION_POLICY_CONTRACT = {
  version: 'maya-ci-policy/1',
  data_classes: {
    A: {
      label: 'general_knowledge',
      tool_requirement: 'not_required',
      behavior: 'General model knowledge; no invented tenant facts.',
    },
    B: {
      label: 'tenant_context',
      tool_requirement: 'tenant_context',
      behavior: 'Use only runtime-supplied sanitized tenant context.',
    },
    C: {
      label: 'verified_business_data',
      tool_requirement: 'verified_tool',
      behavior: 'Business facts require verified tenant-scoped tool results.',
    },
    D: {
      label: 'verified_calculation',
      tool_requirement: 'verified_calculation',
      behavior:
        'Calculate only from verified inputs; name missing inputs, never guess.',
    },
    E: {
      label: 'external_action',
      tool_requirement: 'confirmed_action',
      behavior:
        'Preview consequences; execution requires runtime approval policy.',
    },
    F: {
      label: 'permission_denied',
      tool_requirement: 'forbidden',
      behavior:
        'Refuse protected requests; no rerouting to other intents or tools.',
    },
  },
  context: [
    {
      id: 'carry_relevant_slots',
      rule: 'Carry only relevant confirmed prior-turn slots.',
    },
    {
      id: 'replace_explicit_corrections',
      rule: 'Explicit corrections replace slots, not add competing values.',
    },
    {
      id: 'suspend_on_topic_switch',
      rule: 'Topic switches suspend prior action state; return restores only confirmed slots.',
    },
    {
      id: 'resolve_nearest_compatible_reference',
      rule: 'Resolve pronouns to the nearest compatible entity; clarify multiple candidates.',
    },
  ],
  clarification: [
    {
      id: 'no_questionnaire',
      rule: 'Never turn dialogue into a questionnaire.',
    },
    {
      id: 'reasonable_low_risk_default',
      rule: 'Use reasonable low-risk defaults only with unambiguous context.',
    },
    {
      id: 'one_material_question',
      rule: 'Ask one concise question if ambiguity materially changes data scope or action.',
    },
    {
      id: 'never_guess_tenant_entity',
      rule: 'Never guess among same-named people, branches, appointments or services.',
    },
  ],
  confirmation: [
    {
      id: 'read_analyze_without_confirmation',
      rule: 'READ/ANALYZE: no confirmation.',
    },
    {
      id: 'preview_has_no_side_effect',
      rule: 'PREVIEW has no external side effect and grants no execution permission.',
    },
    {
      id: 'runtime_approval_for_mutation',
      rule: 'WRITE/EXECUTE: immutable runtime approval policy before side effects.',
    },
    {
      id: 'confirmation_scope_is_exact',
      rule: 'Approval covers only previewed action, audience, cost and current dialogue state.',
    },
  ],
  risk_levels: {
    low: {
      confirmation: 'not_required',
      behavior: 'Return permitted information without extra confirmation.',
    },
    medium: {
      confirmation: 'preview_only',
      behavior: 'Draft or preview only; no external side effects.',
    },
    high: {
      confirmation: 'required_before_side_effect',
      behavior:
        'Show material consequences; require explicit runtime approval immediately before execution.',
    },
  },
  routing: [
    {
      id: 'canonical_intent_only',
      rule: 'Each task: exactly one canonical taxonomy intent.',
    },
    {
      id: 'permission_before_tool',
      rule: 'Check tenant membership and role permission before tool selection.',
    },
    {
      id: 'available_tool_only',
      rule: 'Select only ready tools declared by the permitted canonical intent.',
    },
    {
      id: 'understood_but_unavailable',
      rule: 'Keep canonical intent if its tool is unavailable; never relabel as small talk.',
    },
    {
      id: 'compound_dependency_order',
      rule: 'Execute compound tasks in dependency order; select at most one next tool call.',
    },
  ],
  grounding: [
    {
      id: 'class_a_general_reasoning',
      rule: 'Class A permits general model knowledge.',
    },
    {
      id: 'classes_b_to_e_are_grounded',
      rule: 'Classes B-E need tenant context, verified tool data, calculation or approved action.',
    },
    {
      id: 'class_f_has_no_workaround',
      rule: 'Class F denies permission; no other-tool workaround.',
    },
    {
      id: 'no_absent_business_fact',
      rule: 'Never infer tenant business facts absent from sanitized verified inputs.',
    },
  ],
  privacy: [
    {
      id: 'no_raw_pii_in_model_context',
      rule: 'Never send raw phones, emails, credentials or direct client identifiers to the model.',
    },
    {
      id: 'tenant_scoped_resolution',
      rule: 'Resolve people and business entities within the authenticated tenant.',
    },
    {
      id: 'minimum_necessary_data',
      rule: 'Expose only minimum sanitized fields required for the permitted task.',
    },
  ],
} as const satisfies ConversationPolicyContract;
