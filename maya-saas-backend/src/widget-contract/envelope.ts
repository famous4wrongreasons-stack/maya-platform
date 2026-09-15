// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     envelope
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { stableActionJson } from './ambient';
import { CorrelationRefs, IntentProposal, WidgetBody } from './derived-shapes';
import { AuthorityEnvelope, Origin, Presentation } from './envelope-roots';
import { WidgetIntent } from './intent';
import { WidgetKind } from './kinds';
import { Lifecycle, RenderReceipt } from './lifecycle';

// --- section 1.1.1 (contract line 1793) ---
export interface WidgetEnvelope {
  contract: 'maya.widget.envelope/1'; // literal
  widget_id: string; // ULID, 26 chars, unique per EMISSION
  kind: WidgetKind; // closed union, declared in §2
  body_version: number; // integer 1..999, per kind, bumped independently
  tenant_id: string; // uuid v4, root only

  correlation: Correlation; // §1.1.4
  source: WidgetSource; // §1.1.5
  origin: Origin; // declared in §0.5 F17
  authority: AuthorityEnvelope; // declared in §0.5 F17; carries `verification_level` (§1.7)
  body: WidgetBody; // declared in §2 — read model, no writable field
  intents: WidgetIntent[]; // declared in §3; 0..12 (E7)
  provenance: Provenance; // §1.6
  limitations: Limitation[]; // §1.6.7, 0..20, REQUIRED (may be empty)
  lifecycle: Lifecycle; // declared in §4
  presentation: Presentation; // declared in §0.5 F17; carries `text_equivalent`
  render: RenderReceipt; // declared in §4
  integrity: Integrity; // §1.9
}

// --- section 1.1.2 (contract line 1850) ---
export interface WidgetComposerInput {
  // the ONLY type a projector may hand the minter
  kind_proposal: WidgetKind; // E — validated against allowedKinds(capability)
  capability: string; // E — must resolve in the capability canon
  capability_version: string; // E — must equal the canon's current version digest
  source: WidgetSource; // E
  correlation_refs: CorrelationRefs; // E — run/turn/message/parent ids only
  origin: Origin; // E
  facts: FactUsed[]; // C — copied whole from the source (§1.6.3)
  facts_origin: Array<'copied' | 'synthesised'>; // E — parallel to `facts`, same length
  slots: Record<string, SlotBinding>; // E — each names a fact index or a phrase key
  limitation_codes: string[]; // C — reason codes, 0..20
  intent_proposals: IntentProposal[]; // E — capability (or handoff_capability_ref),
  //     argument handles, role. No token. No floor.
  locale: string; // E — BCP-47, must be in the shipped catalogue set
}

export type SlotBinding =
  | { from: 'fact'; fact_index: number; measure_key?: string }
  | {
      from: 'phrase';
      phrase_key: string;
      params?: Record<string, number /* fact_index */>;
    };

// --- section 1.1.4 (contract line 1882) ---
export interface Correlation {
  run_id: string | null; // E — C9 run id when the orchestrator minted it; NULLABLE BY DESIGN
  turn_id: string | null; // E
  message_id: string | null; // E — durable chat message this envelope is anchored to
  agent_id:
    'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' | 'BUSINESS_INTELLIGENCE' | null; // D
  parent_widget_id: string | null; // E — ULID of the preceding step in a chain
  step_index: number | null; // E — int 1..12
  step_total: number | null; // E — int 1..12, ≥ step_index
  trace_id: string; // M — the request trace
}

// --- section 1.1.5 (contract line 1901) ---
export type WidgetSource =
  | {
      from: 'capability_envelope';
      capability: string;
      capability_version: string;
      fact_index: number;
    }
  | {
      from: 'agent_result';
      run_id: string;
      result_seq: number;
      path: AgentResultPath;
    }
  | {
      from: 'action_intent';
      run_id: string;
      result_seq: number;
      intent_index: number;
    }
  | { from: 'action_execution'; execution_id: string }
  | {
      from: 'orchestrator_state';
      run_id: string;
      field:
        'runStatus' | 'revisions' | 'execution' | 'budget' | 'stepBindings';
    };

export type AgentResultPath =
  | `/findings/${number}`
  | `/findings/${number}/statement`
  | `/facts_used/${number}`
  | `/facts_used/${number}/${'status' | 'as_of' | 'capability'}`
  | `/proposed_action_intents/${number}`
  | `/limitations/${number}`
  | '/confidence';

// --- section 1.2 (contract line 1940) ---
export interface CellIndex {
  // artefact of buildCellIndex; recorded in the emission fixture
  schema_digest: string; // sha256 over the kind's leaf schema at this body_version
  entries: CellIndexEntry[]; // 1..400, ordered by `path`
}
export interface CellIndexEntry {
  path: string; // JSON Pointer into `body`, ≤ 200 chars
  class: 'datum' | 'phrase' | 'structural';
  fact_ref: number | null; // non-null iff class === 'datum' and state ∈ {KNOWN, PARTIAL}
  phrase_key: string | null; // non-null iff class === 'phrase' and the leaf is a Phrase
}

// --- section 1.2 (contract line 1957) ---
export interface Phrase {
  phrase_key: string; // E — key in `WIDGET_PHRASES@<catalogue_version>`
  params?: Record<string, CellPointer>; // E — every interpolation slot names a Cell in THIS body
  rendered: string; // M — the only user-visible bytes; ≤ 400 chars
}
export type CellPointer = string; // JSON Pointer into `body`, must resolve to a Cell/Measure

// --- section 1.3 (contract line 1974) ---
export type CellState =
  'KNOWN' | 'PARTIAL' | 'NOT_MEASURED' | 'UNAVAILABLE' | 'PENDING';

export interface Cell<T> {
  state: CellState; // D
  value: T | null; // C — copied from the fact; never computed in the widget layer
  label: string; // M — ≤ 160 chars, always a human sentence fragment
  reason_code: ReasonCode | null; // D — non-null iff state !== 'KNOWN'
  fact_ref: number | null; // D — index into provenance.facts_used
  as_of: string | null; // C — exactly `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC), copied from the fact
  evidence_refs: EvidenceRef[]; // C — 0..8, ⊆ provenance.facts_used[fact_ref].evidence_refs
  next_intent_ref: string | null; // D — an intent in THIS envelope that could resolve the unknown
}

export type ReasonCode =
  | 'SOURCE_UNLINKED'
  | 'PERIOD_NOT_CLOSED'
  | 'NOT_COLLECTED'
  | 'OUT_OF_SCOPE'
  | 'PERMISSION'
  | 'PROVIDER_SILENT'
  | 'NO_OWNER'
  | 'SUPERSEDED'
  | 'IN_PROGRESS';

// --- section 1.4 (contract line 2019) ---
export interface Measure extends Cell<number | string> {
  key: string; // E — stable id, e.g. 'revenue.net', 'slot.duration_min'; ≤ 64 chars
  unit: 'RUB' | 'minutes' | 'count' | 'percent' | 'ratio' | 'datetime' | 'none'; // C
  basis_key: string | null; // C — copied from facts_used[fact_ref].basis (c9Id, ≤128 chars)
  basis: string; // M — renderBasis(basis_key, capability, locale); ≤ 200 chars
  currency: string | null; // C — /^[A-Z]{3}$/ or null, copied from the fact
  formatted: string; // M — formatMeasure(value, unit, currency, locale)
  comparison: {
    // D — present only when a canonical baseline exists
    baseline_label: Phrase;
    baseline: Measure | null; // a Measure in its own right; NOT a free number
    delta: number | null;
    direction: 'up' | 'down' | 'flat' | 'unknown';
  } | null;
}

// --- section 1.6 (contract line 2060) ---
export interface Provenance {
  source_capability: string; // E — must resolve in the capability canon
  capability_version: string; // E — §1.1.3
  projector_id: string; // M — registered projector that built `body`
  source_kind:
    | 'agent_result'
    | 'capability_read'
    | 'orchestrator_state'
    | 'action_execution'; // E

  facts_used: FactUsed[]; // C — 0..100, byte-copies (§1.6.3)
  facts_origin: Array<'copied' | 'synthesised'>; // E — same length, index-aligned (§1.6.4)
  facts_digest: string; // M — sha256 over the copied elements (§1.6.3)

  completeness: Completeness; // C — the FULL envelope object (§1.6.2)
  completeness_envelope_hash: string; // M — sha256(stableActionJson(completeness))

  evidence_refs: EvidenceRef[]; // C — 0..100, envelope-level
  confidence: 'high' | 'medium' | 'low'; // C — grounding, NOT probability

  authorship: Authorship; // D — §1.6.5
}

// --- section 1.6.1 (contract line 2083) ---
export interface FactUsed {
  // element-for-element identical to AgentResult@1.facts_used[i]
  capability: string; // c9Id, ≤ 128 chars
  status: 'measured' | 'measured_incomplete' | 'not_measured' | 'unavailable';
  as_of: string; // c9Instant: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, UTC only
  evidence_refs: string[]; // REQUIRED, 0..100, each /^h_[a-f0-9]{32,64}$/
  completeness: Completeness; // REQUIRED, the full object — never a number
  basis?: string; // optional, c9Id
  currency?: string | null; // optional, /^[A-Z]{3}$/ or null
}

// --- section 1.6.2 (contract line 2097) ---
export interface Completeness {
  // c9.contract.ts:314-323
  status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; // PRESENT. The first edition omitted it.
  requestedScopeHash: string; // 64 lowercase hex
  returnedCount: number; // int 0..1_000_000_000
  totalCount: number | null;
  hasMore: boolean;
  cursorRef: string | null;
  truncated: boolean;
  reasonCodes: string[]; // 0..20, each ≤ 128 chars
}

// --- section 1.6.5 (contract line 2128) ---
export interface Authorship {
  body_values: 'server_formatter'; // literal — every datum leaf; §1.2–§1.4
  body_phrases: 'server_catalogue'; // literal — every phrase leaf; §1.2
  narrative: 'server_template' | 'none'; // which of the two produced any prose leaf
  narrative_template_id: string | null; // non-null iff narrative === 'server_template'
  narrative_template_version: number | null; // non-null under the same condition
  model_contribution: 'none' | 'template_selection'; // D
  model_contribution_ref: string | null; // the projector-input field the model wrote, if any
}

// --- section 1.6.5 (contract line 2142) ---
export interface Narrative {
  // a phrase-class leaf with typed slots
  narrative_template_id: string; // E — a registered template id
  narrative_template_version: number; // E — the version this body was composed against
  slots: Record<string, CellPointer>; // E — each names a Cell, Measure or Phrase in THIS body
  rendered: string; // M — renderNarrative(id, version, slots, locale)
}

export interface NarrativeTemplate {
  narrative_template_id: string;
  version: number;
  locale_bodies: Readonly<Record<string, string>>; // locale → template text
  slot_keys: readonly string[]; // every interpolation slot the text names
}

// Keyed by `${narrative_template_id}@${version}`, never by id alone: Authorship references a
// template by (id, version) and §4.2 replays FROZEN receipts, so a single-version map could not
// resolve the older version a stored receipt names.
export declare const NARRATIVE_TEMPLATES: Readonly<
  Record<`${string}@${number}`, NarrativeTemplate>
>;

// --- section 1.6.6 (contract line 2171) ---
export interface EvidenceRef {
  ref: string; // C — verbatim; 'h_<32..64 hex>' for a C9 handle
  class: 'c9_invocation_handle' | 'source_receipt'; // D
  dereferenceable_until: string | null; // D — c9Instant; null ⇒ already an audit label
}

// --- section 1.6.7 (contract line 2183) ---
export interface Limitation {
  code: string; // C — a canonical reason code, ≤ 128 chars
  text: Phrase; // M — from the reason-code phrase table
  severity: 'info' | 'limitation' | 'risk' | 'blocking'; // D — from the reason-code table
  affects: string[]; // D — JSON Pointers into body, [] when the projector cannot know
  capability_gap_ref: string | null; // D — non-null iff no canonical owner exists for the remedy
}

// --- section 1.6.7 (contract line 2195) ---
export interface LimitationReason {
  reason_code: string; // the closed key
  severity: 'limitation' | 'caveat'; // NEVER 'error' — there is no error severity (§2.1)
  text_key: string; // a Phrase key; the rendered text is minted, never authored
}
export declare const LIMITATION_REASON_TABLE: Readonly<
  Record<string, LimitationReason>
>;

// --- section 1.6.7 (contract line 2209) ---
export interface DenialProjection {
  cell_state: CellState; // never a failure state
  reason_code: string; // a LIMITATION_REASON_TABLE key
  limitation_severity: LimitationReason['severity']; // 'limitation' | 'caveat' — never 'error'
}
export declare const C9_DENIAL_PROJECTION: Readonly<
  Record<string, DenialProjection>
>;

// --- section 1.7 (contract line 2228) ---
export type VerificationLevel =
  | 'ANONYMOUS' // rank 0
  | 'CHANNEL_IDENTITY' // rank 1 — IDENTIFIED, NOT VERIFIED
  | 'BOUND_CLIENT' // rank 2
  | 'SESSION_VERIFIED' // rank 3
  | 'STEP_UP_VERIFIED'; // rank 4

export declare const VERIFICATION_RANK: Record<
  VerificationLevel,
  0 | 1 | 2 | 3 | 4
>;

// --- section 1.9 (contract line 2281) ---
export interface Integrity {
  body_hash: string; // M — 64 lowercase hex
  cell_index_digest: string; // M — §1.2 V2
  envelope_seal: string; // M — keyed HMAC-SHA256
  seal_key_version: number; // M — int ≥ 1
  principal_proof_hash: string; // M — c9PrincipalHash(principal), §1.7 K3
  approval_echo: {
    // M — present iff the body carries an approval decision
    owner: 'ai_approval_request' | 'action_execution';
    hash: string; // the hash THAT owner verifies
  } | null;
  policy_context_echo: string | null; // M — ActionExecution.policyContextHash when one exists
}
