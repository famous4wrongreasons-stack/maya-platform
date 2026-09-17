// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     kinds
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { CapabilityRef } from './capability-ref';
import { DraftClass } from './confirmation-guard';
import { Cell, Measure, Narrative, Phrase } from './envelope';
import { EffectClass } from './intent';

// --- section 2.1 (contract line 2658) ---
export type WidgetKind =
  // the seventeen named in the approved brief
  | 'CHOICE'
  | 'SERVICE_SELECTOR'
  | 'STAFF_SELECTOR'
  | 'TIME_SLOT_SELECTOR'
  | 'BOOKING_CONFIRMATION'
  | 'SCHEDULE'
  | 'CLIENT_LIST'
  | 'METRIC'
  | 'CHART'
  | 'REPORT'
  | 'STRATEGY_OPTIONS'
  | 'APPROVAL'
  | 'PROGRESS'
  | 'LIMITATION'
  | 'SOURCE_STATUS'
  | 'SETTINGS_DRAFT'
  | 'FORM'
  // the five the evidence demanded
  | 'CONSENT_STATE'
  | 'IDENTITY_BINDING'
  | 'PAYMENT_HANDOFF'
  | 'MEDIA_PREVIEW'
  | 'ARTIFACT';

// --- section 2.2 (contract line 2684) ---
export interface KindRule {
  kind: WidgetKind;
  body_schema_ref: string; // JSON-Schema id for the body in §2.6
  body_version: number;

  permitted_effects: readonly EffectClass[]; // the CLOSED set of effect classes mintable onto this kind
  commit_allowed: boolean; // DERIVED: permitted_effects includes 'COMMIT'
  max_commit_intents: 0 | 1 | 2; // 2 for APPROVAL alone (K13)
  input_allowed: 'none' | 'closed_domain' | 'open_domain';

  owner_class: OwnerClass; // §2.4; resolves to a set of registry keys at REGISTRY LOAD
  emittable: boolean; // DERIVED at REGISTRY LOAD, never authored (K20)

  fullscreen:
    'FORBIDDEN' | 'OPTIONAL' | 'REQUIRED' | 'REQUIRED_ABOVE_DENSITY_CAP';
  fullscreen_reasons: readonly FullscreenReason[];
  density_cap: { path: string; max: number } | null;

  role_hint: RoleHint | RoleHintRule; // §2.5 — the ONLY authored role_hint in the contract
  interactive_paths: readonly string[]; // body paths that contribute to a11y.reading_order
  allowed_target_classes: readonly ('w' | 'i' | 'c' | 's' | 'detail')[]; // §2.3.4
  text_shape: KindTextShape; // §2.3.5

  pii_ceiling:
    'none' | 'business_aggregate' | 'client_identified' | 'inherited';
  retention_sec: number; // DERIVED from the resolved pii class (K19)
  expires_at_ceiling_s: number | 'source_bound'; // DERIVED from the lifecycle ceiling table (K25)
}

export type FullscreenReason =
  | 'exceeds_chat_density'
  | 'exact_configuration'
  | 'audit'
  | 'accessibility'
  | 'correction'
  | 'non_textual_medium'
  | 'file_delivery';

// --- section 2.3.3 (contract line 2762) ---
export type IntentRef = string; // envelope-local ('i1'); structural; never rendered

export interface OptionItem {
  option_id: string; // opaque; meaningful only inside this envelope's domain
  label: Cell<string>;
  sublabel: Cell<string> | null;
  badges: Phrase[]; // ≤3
  measures: Measure[];
  media: { kind: 'image' | 'icon'; ref: string; alt: Phrase } | null; // alt non-empty, server-authored
  intent_ref: IntentRef;
  enabled: Cell<boolean>; // a disabled control explains itself as an unknown, never as an error
}

export interface TableSpec {
  caption: Phrase; // REQUIRED — WCAG 1.3.1
  columns: Array<{
    key: string;
    label: Phrase;
    type: 'text' | 'measure' | 'datetime' | 'ref';
    sensitivity: 'public' | 'internal' | 'pii';
    is_row_header: boolean; // exactly one column MUST be true
    align?: 'start' | 'end';
  }>;
  rows: Array<{
    row_key: string;
    cells: Record<string, Cell<string> | Measure | null>;
  }>;
  row_intents: Record<string, IntentRef> | null; // row_key → intent_ref
  group_by: { key: string; group_labels: Record<string, Phrase> } | null; // ONE level only
}

export interface FieldBound {
  // a server-side bound, echoed for rendering only
  bound_ref: string; // registry key, e.g. 'expenses.create#amount'
  min: Measure | null;
  max: Measure | null;
  max_abs_delta: Measure | null;
  basis: Phrase; // why the bound is what it is
}

// --- section 2.3.5 (contract line 2809) ---
export interface KindTextShape {
  headline_path: string; // body path minted into text_equivalent.headline
  itemized_path: string | null; // body array minted into text_equivalent.itemized, in body order
  sentence_order: readonly TextSentence[]; // the EXACT order renderTextEquivalent emits
  parity: 'full' | 'recipe_only' | 'file_facts_only';
}

export type TextSentence =
  | 'lead'
  | 'items'
  | 'totals'
  | 'policy'
  | 'audience'
  | 'risk_reversibility'
  | 'step_progress'
  | 'recipe'
  | 'file_facts'
  | 'as_of'
  | 'completeness'
  | 'unknowns'
  | 'masking'
  | 'gap'
  | 'expiry'
  | 'readback'
  | 'options'
  | 'handoff';

// --- section 2.4 (contract line 2838) ---
export type OwnerClass =
  // read owners
  | 'CATALOG_READ'
  | 'AVAILABILITY_READ'
  | 'SCHEDULE_READ'
  | 'CLIENT_READ'
  | 'MEASUREMENT_READ'
  | 'RESULT_READ'
  | 'ANALYTICS_READ'
  | 'INTEGRATION_STATUS'
  // act owners
  | 'BOOKING_OWNER'
  | 'BULK_AUDIENCE_OWNER'
  | 'ORCHESTRATION_RUN'
  | 'ACTION_EXECUTION'
  | 'CONSENT_REGISTER'
  | 'IDENTITY_BINDING_OWNER'
  | 'COMMERCE_OWNER'
  | 'MEDIA_GENERATION_OWNER'
  | 'ARTIFACT_OWNER'
  // the six SETTINGS_DRAFT draft owners, declared with their keys in §0.14 F79
  | 'SETTINGS_OWNER'
  | 'NOTIFICATION_PREF_OWNER'
  | 'SCHEDULE_RULE_OWNER'
  | 'TENANT_CONFIG_OWNER'
  | 'TASK_OWNER'
  | 'AUDIENCE_OWNER'
  // the two non-owners
  | 'INHERITED' // the owner is named by the intent's own capability (FORM)
  | 'NONE'; // the kind cites no owner at all (LIMITATION)

export declare function ownerClassKeys(
  kind: WidgetKind,
): ReadonlySet<CapabilityRef>;
// the registry keys KIND_REGISTRY[kind].owner_class resolves to, at EP-REGISTRY-LOAD.
// Total over WidgetKind: 'NONE' resolves to the empty set and 'INHERITED' to the keys
// the intent's own capability names, so neither is a partial branch.

export declare function allowedKinds(
  capability: CapabilityRef,
): ReadonlySet<WidgetKind>;
// the inverse of ownerClassKeys: { kind ∈ WidgetKind : capability ∈ ownerClassKeys(kind) },
// derived at EP-REGISTRY-LOAD.

// --- section 2.5 (contract line 2935) ---
export type RoleHint =
  | 'group'
  | 'radiogroup'
  | 'listbox'
  | 'table'
  | 'grid'
  | 'document'
  | 'status'
  | 'progressbar'
  | 'form'
  | 'region'
  | 'img'
  | 'link'; // twelve, closed

export type RoleHintRule = {
  derive_from: string;
  map: Record<string, RoleHint>;
};

// --- section 2.6.1 (contract line 2983) ---
export interface ChoiceBody {
  prompt: Phrase | Narrative;
  select: 'single' | 'multi';
  min_select: number;
  max_select: number; // 1 ≤ min ≤ max ≤ options.length
  options: OptionItem[]; // ≥2
  shown_count: number;
  total_count: number | null;
  more_intent: IntentRef | null; // REFINE
}

// --- section 2.6.2 (contract line 3003) ---
export interface ServiceSelectorBody {
  prompt: Phrase;
  category_path: Phrase[];
  select: 'single' | 'multi';
  options: Array<
    OptionItem & {
      service_ref: string; // frozen noun handle, never a price or an id
      duration: Measure; // unit 'minutes'
      price: Measure; // unit 'RUB'
      requires_consultation: Cell<boolean>;
      combinable_with: string[]; // service_refs
    }
  >;
  total_preview: Measure | null;
  shown_count: number;
  total_count: number | null;
  more_intent: IntentRef | null; // REFINE
}

// --- section 2.6.3 (contract line 3030) ---
export interface StaffSelectorBody {
  prompt: Phrase;
  for_service_refs: string[];
  options: Array<
    OptionItem & {
      staff_ref: string;
      role_label: Cell<string>;
      nearest_availability: Measure; // unit 'datetime'
      rating: Measure | null;
    }
  >;
  any_staff_option: OptionItem | null;
  shown_count: number;
  total_count: number | null;
  more_intent: IntentRef | null;
}

// --- section 2.6.4 (contract line 3054) ---
export interface TimeSlotSelectorBody {
  prompt: Phrase;
  timezone: string; // IANA
  window: { from: string; to: string };
  grouping: 'by_day' | 'by_part_of_day' | 'flat';
  groups: Array<{
    group_id: string;
    label: Phrase;
    slots: Array<{
      slot_ref: string; // frozen noun handle
      start: Measure; // unit 'datetime'
      duration: Measure;
      staff_ref: string | null;
      price: Measure | null;
      availability: Cell<'FREE' | 'TAKEN'>;
      intent_ref: IntentRef;
    }>;
  }>;
  shown_count: number;
  total_count: number | null;
  more_intent: IntentRef | null; // REFINE
  widen_window_intent: IntentRef | null; // REFINE
  none_fit_intent: IntentRef; // REFINE — always present, never droppable
}

// --- section 2.6.5 (contract line 3086) ---
export interface BookingConfirmationBody {
  confirmation_subject: 'create' | 'reschedule' | 'cancel';
  draft_ref: string | null; // non-null iff subject === 'create'
  appointment_ref: string | null; // non-null iff subject ∈ {'reschedule','cancel'} — a frozen noun
  lines: Array<{ label: Phrase; detail: Cell<string>; measures: Measure[] }>;
  when: Measure; // unit 'datetime' — the resulting time
  when_previous: Measure | null; // non-null iff subject === 'reschedule'
  staff_label: Cell<string>;
  duration_total: Measure;
  price_total: Measure;
  price_delta: Measure | null; // non-null iff subject === 'reschedule' and the price differs
  refund_preview: Measure | null; // non-null iff subject === 'cancel' and money was taken
  loyalty_applied: Measure | null;
  policy_notices: Phrase[]; // cancellation window, no-show policy, consultation requirement
  commit_intent: IntentRef; // EXACTLY ONE COMMIT
  amend_intents: IntentRef[]; // REFINE — back to a selector
  dismiss_intent: IntentRef; // escape, priority 0 — abandons this confirmation, never the appointment
}

// --- section 2.6.6 (contract line 3123) ---
export interface ScheduleBody {
  range: { from: string; to: string };
  timezone: string;
  lanes: Array<{
    lane_id: string;
    label: Cell<string>;
    staff_ref: string | null;
  }>;
  buckets: Array<{ bucket_id: string; start: string; end: string }>; // the CLOSED column domain
  entries: Array<{
    entry_ref: string;
    lane_id: string;
    bucket_span: [string, string]; // bucket_ids, inclusive
    title: Cell<string>;
    subtitle: Cell<string> | null;
    state: Cell<'BOOKED' | 'BLOCKED' | 'FREE'>;
    pii_masked: boolean;
    detail_intent: IntentRef | null; // REFINE / NAVIGATE
    move_intent: IntentRef | null; // REFINE
    move_targets: string[] | null; // CLOSED set of bucket_ids; the move_intent's selection_domain
  }>;
  gaps: Array<{
    lane_id: string;
    bucket_span: [string, string];
    recoverable: Measure;
  }>;
  detail_intent: IntentRef;
}

// --- section 2.6.7 (contract line 3159) ---
export interface ClientListBody {
  segment_label: Phrase;
  segment_ref: string;
  table: TableSpec;
  pii_masked: boolean;
  bulk_intents: Array<{
    intent_ref: IntentRef;
    label: Phrase;
    audience_size: Measure;
  }>;
  page: { cursor_ref: string | null; has_more: boolean };
}

// --- section 2.6.8 (contract line 3180) ---
export interface MetricBody {
  period_label: Phrase;
  metrics: Measure[]; // 1..5
  headline_metric_key: string; // must name a member of metrics
  compare_intent: IntentRef | null; // REFINE — change the comparison baseline
  drill_intent: IntentRef | null; // REFINE / NAVIGATE
}

// --- section 2.6.9 (contract line 3201) ---
export interface ChartBody {
  chart_kind: 'line' | 'bar' | 'stacked_bar' | 'area' | 'scatter';
  dataset_ref: string; // canonical C7/C8 handle
  projection_ref: string; // which projection of that dataset these series are
  rows_digest: string; // digest of the dataset rows, returned by the read facade
  series_digest: string; // digest of the emitted series, returned by the read facade
  axes: {
    x: {
      label: Phrase;
      type: 'category' | 'time' | 'quantity';
      buckets: Array<Cell<string> | Measure> | null;
    }; // the read facade's bucketing, echoed
    y: { label: Phrase; unit: Measure['unit'] };
  };
  series: Array<{
    series_id: string;
    label: Cell<string>;
    points: Array<{ x: Cell<string> | Measure; y: Measure }>;
  }>;
  table_equivalent: TableSpec; // REQUIRED
  gap_policy: 'RENDER_GAP'; // literal, single value
  drill_intent: IntentRef | null; // REFINE
  export_intent: IntentRef | null; // REFINE → returns an ARTIFACT
}

// --- section 2.6.10 (contract line 3238) ---
export interface ReportBody {
  title: Phrase;
  period_label: Phrase;
  top_summary: Measure[]; // ≤3
  sections: Array<{
    section_id: string;
    heading: Phrase;
    depth: 1 | 2;
    narrative: Narrative;
    table: TableSpec | null;
    metrics: Measure[];
  }>;
  fullscreen_intent: IntentRef; // REQUIRED — NAVIGATE
  export_intent: IntentRef | null; // REFINE → returns an ARTIFACT
}

// --- section 2.6.11 (contract line 3262) ---
export interface StrategyOptionsBody {
  revision_ref: string;
  question: Narrative;
  alternatives: Array<{
    option_id: string;
    title: Cell<string>;
    reasoning: Narrative;
    expected_effect: Measure | null;
    risk_tier: Cell<
      'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted'
    >; // a rendered datum, so a Cell (§1.2 V1)
    reversible: Cell<boolean>;
    audience_size: Measure | null;
    select_intent: IntentRef;
  }>; // ≤3
  no_action_option: {
    title: Phrase;
    consequence: Narrative;
    select_intent: IntentRef;
  }; // REQUIRED
  review_state: 'draft' | 'reviewed' | 'not_an_approval';
  review_disclaimer: Phrase;
}

// --- section 2.6.12 (contract line 3292) ---
export interface ApprovalBody {
  approval_ref: string;
  subject: Cell<string>;
  effect_preview: Array<{ label: Phrase; value: Cell<string> | Measure }>;
  audience_size: Measure | null; // REQUIRED non-null for any communication-class approval
  risk_tier: Cell<
    'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted'
  >; // a rendered datum, so a Cell (§1.2 V1)
  reversible: Cell<boolean>;
  state: Cell<'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'EXPIRED'>;
  requested_by_label: Cell<string>;
  expires_at: string;
  approve_intent: IntentRef | null;
  reject_intent: IntentRef | null;
  blocked_reason: Phrase | null; // non-null iff both decision intents are null
  detail_intent: IntentRef; // NAVIGATE to the effect detail
}

// --- section 2.6.13 (contract line 3321) ---
export interface ProgressBody {
  run_ref: string;
  headline: Cell<string>;
  steps: Array<{
    step_id: string;
    label: Phrase;
    state: Cell<'PENDING' | 'RUNNING' | 'DONE' | 'SKIPPED'>;
    //  a non-KNOWN state carries the Cell's own reason_code, label and
    //  next_intent_ref — there is no separate `unknown` member
    receipt_ref: string | null;
  }>;
  step_index: number;
  step_total: number;
  budget_note: Phrase | null;
  poll_after_ms: number;
  stream_ref: string | null;
  cancel_intent: IntentRef | null; // CONTROL, capability 'control.run.cancel'
}

// --- section 2.6.14 (contract line 3350) ---
export interface LimitationBody {
  severity: 'info' | 'limitation' | 'risk' | 'blocking';
  headline: Phrase;
  detail: Phrase | Narrative;
  source_limitation_codes: string[]; // non-empty
  capability_gap_ref: string | null;
  remedy_intents: IntentRef[]; // MUST be empty when capability_gap_ref !== null
}

// --- section 2.6.15 (contract line 3371) ---
export interface SourceStatusBody {
  sources: Array<{
    source_id: string;
    label: Cell<string>;
    state: Cell<'CONNECTED' | 'DEGRADED' | 'UNLINKED'>;
    as_of: Cell<string>;
    impact_text: Phrase;
    reconnect_intent: IntentRef | null;
  }>; // HANDOFF, target class 's'
  overall: Cell<'OK' | 'PARTIAL' | 'BLOCKED'>;
}

// --- section 2.6.16 (contract line 3392) ---
export interface SettingsDraftBody {
  draft_ref: string; // server-owned; minted by the canonical draft owner
  draft_class: DraftClass; // the five-member union declared in §0.14 F79.
  // 'expense' and 'loyalty_adjustment' are NOT members:
  // expenses.create and loyalty.internal.adjust are
  // gap-keyed, so neither can reach a COMMIT body.
  scope_label: Cell<string>;
  diff: Array<{
    path: string;
    label: Phrase;
    from: Cell<string | number | boolean>; // NOT_MEASURED when there was no prior value
    to: Cell<string | number | boolean>;
    effect_text: Phrase;
    reversible: Cell<boolean>;
    bound_ref: string | null;
  }>; // non-null for every numeric/financial row
  apply_intent: IntentRef; // the ONE COMMIT
  discard_intent: IntentRef; // escape, priority 0
  editor_handoff_intent: IntentRef; // REQUIRED, never droppable
}

// --- section 2.6.17 (contract line 3426) ---
export interface FormBody {
  form_ref: string;
  justification: FormJustification;
  schema_ref: string;
  fields: FormField[]; // ≤12
  submit_intent: IntentRef; // effect DRAFT — ALWAYS
  discard_intent: IntentRef; // escape, priority 0
  editor_handoff_intent: IntentRef; // REQUIRED, never droppable
  partial_save: false; // literal
}

export type FormJustification =
  | 'LEGAL_EXACTNESS'
  | 'MULTI_FIELD_ATOMIC'
  | 'ACCESSIBILITY_REQUEST'
  | 'CORRECTION_OF_RECORD'
  | 'AUDIT_EXACT_INPUT';

export interface FormField {
  field_key: string;
  label: Phrase;
  control: 'text' | 'number' | 'date' | 'time' | 'select' | 'toggle' | 'phone';
  required: boolean;
  help: Phrase | null;
  max_len: number | null;
  pattern: string | null;
  options: OptionItem[] | null; // REQUIRED non-null iff control === 'select'
  current: Cell<string | number | boolean>;
  bound: FieldBound | null; // REQUIRED non-null iff control === 'number'
  //   or the field is financial (unit 'RUB')
  sensitivity: 'public' | 'internal' | 'pii' | 'SECURE_SURFACE_ONLY';
}

// --- section 2.6.18 (contract line 3474) ---
export interface ConsentStateBody {
  consent_kind:
    'PD_BASE' | 'MARKETING' | 'CHANNEL_DELIVERY' | 'HISTORY_RETENTION';
  subject_label: Cell<string>; // masked unless subject_is_principal
  decision: Cell<'GRANTED' | 'DECLINED' | 'WITHDRAWN' | 'NEVER_ASKED'>;
  recorded_at: Cell<string>;
  recorded_via: Cell<string>; // which surface recorded it — audit, not a link
  scope_text: Phrase[]; // what the current decision permits
  change_effect_text: Phrase[]; // what changing it would do
  register_ref: string | null; // append-only consent-register handle
  change_handoff_intent: IntentRef | null; // HANDOFF only; target class 's'
  capability_gap_ref: string | null; // when set, change_handoff_intent MUST be null
}

// --- section 2.6.19 (contract line 3504) ---
export interface IdentityBindingBody {
  subject_label: Cell<string>;
  bindings: Array<{
    binding_id: string;
    channel: 'telegram' | 'push' | 'email' | 'phone' | 'native' | 'crm';
    label: Cell<string>;
    state: Cell<'LINKED' | 'UNLINKED' | 'PENDING'>;
    since: Cell<string>;
    unlocks_text: Phrase[];
    loss_on_unbind_text: Phrase[];
    manage_handoff_intent: IntentRef | null;
  }>; // HANDOFF only; target class 's'
  capability_gap_ref: string | null;
}

// --- section 2.6.20 (contract line 3528) ---
export interface PaymentHandoffBody {
  order_ref: string | null; // server-owned draft handle; null in gap state
  subject:
    | 'gift_certificate'
    | 'membership'
    | 'tips'
    | 'loyalty_redemption'
    | 'service_prepayment';
  lines: Array<{ label: Phrase; amount: Measure }>;
  amount_total: Measure; // SERVER-FIXED, unit 'RUB'
  beneficiary_label: Cell<string>;
  acquirer_label: Cell<string>; // display only — never a target, never a URL
  returns_text: Phrase; // what the payer gets back, and where
  policy_notices: Phrase[];
  session: {
    session_ref: string;
    expires_at: string;
    resume_widget_id: string;
  } | null;
  commit_intent: IntentRef | null; // the ONE COMMIT; null in gap state
  continue_intent: IntentRef | null; // NAVIGATE, target { class: 's', ref: { route: 'shell.pay', param: session_ref } }
  dismiss_intent: IntentRef; // escape, priority 0
  capability_gap_ref: string | null; // when set: commit_intent AND continue_intent MUST be null
}

// --- section 2.6.21 (contract line 3560) ---
export interface MediaPreviewBody {
  media_ref: string; // opaque; resolves only through a signed first-party asset route
  alt: Phrase; // server-authored, non-empty
  recipe: {
    requested: Cell<string>;
    parameters: Array<{ label: Phrase; value: Cell<string> }>;
    produced_at: Cell<string>;
    producer_label: Cell<string>;
  };
  subject_is_principal: boolean;
  expires_at: string;
  regenerate_intent: IntentRef | null; // REFINE
  fullscreen_intent: IntentRef; // REQUIRED — NAVIGATE
}

// --- section 2.6.22 (contract line 3586) ---
export interface ArtifactBody {
  artifact_ref: string; // opaque; resolves only through a signed first-party delivery route
  filename: Cell<string>;
  format: Cell<'pdf' | 'csv' | 'xlsx' | 'json' | 'png'>;
  size_bytes: Measure; // unit 'count'
  contains_text: Phrase; // what it contains, one sentence
  contains_pii: Cell<boolean>;
  produced_at: Cell<string>;
  expires_at: string;
  fetch_intent: IntentRef; // NAVIGATE, target { class: 's', ref: { route: 'shell.file', param: artifact_ref } }
  regenerate_intent: IntentRef | null; // REFINE
}
