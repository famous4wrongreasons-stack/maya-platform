// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     intent
/* eslint-disable @typescript-eslint/no-unused-vars */
import { C9Domain } from './ambient';
import { KIND_FLOOR } from './tables';
import { CapabilityRef } from './capability-ref';
import {
  Cell,
  Correlation,
  Measure,
  ReasonCode,
  VerificationLevel,
} from './envelope';
import { FormJustification, WidgetKind } from './kinds';
import { Lifecycle } from './lifecycle';
import {
  FLOOR_EXEMPT,
  IntentSubject,
  verificationFloor,
} from './verification-floor';

// --- section 3.1 (contract line 3379) ---
export interface WidgetIntent {
  // --- identity ---
  intent_ref: string; // envelope-local, e.g. 'i1'. The only value any
  // *_intent / next_intent_ref field may hold. Not a token.
  intent_token: string | null; // OPAQUE, server-minted, principal-bound, expiring,
  // ≤34 bytes. NULL IFF effect === 'NONE' (§3.2).

  // --- presentation ---
  role:
    | 'primary'
    | 'secondary'
    | 'destructive'
    | 'escape'
    | 'more'
    | 'handoff'
    | 'remedy'
    | 'control';
  label: string; // server-minted; never client-composed
  utterance_preview: string; // ≤240 chars. The sentence this tap is equivalent to,
  // rendered server-side with the intent's DEFAULT
  // selection. It is a PREVIEW: the sentence actually
  // written to the conversation is re-rendered at
  // Gate 9 from validated canonical labels (§3.9).
  speech_aliases: string[]; // ≥1; deterministic voice matching BEFORE any LLM
  ordinal: number | null; // spoken "первое", push action index, keyboard order
  priority: number; // 0 = NEVER droppable by degradation, and the first
  // term of FLOOR_EXEMPT (§3.4)

  // --- effect ---
  effect: EffectClass; // §3.2, closed
  capability: CapabilityRef | null; // non-null iff effect ∈
  // {REFINE, CONTROL, DRAFT, REQUEST_APPROVAL, COMMIT}
  handoff_capability_ref: CapabilityRef | null; // NON-NULL IFF effect === 'HANDOFF'.
  // Names the act the user is being carried toward.
  // It is never invoked (§3.5 R3.5.3, §3.9 Gate 13).
  target: IntentTarget | null; // §3.3; non-null iff effect ∈ {NAVIGATE, HANDOFF}
  input_schema: InputSchema | null; // §3.6; null = no client-supplied input at all

  // --- authority ---
  verification_floor: VerificationLevel; // REQUIRED on EVERY intent of EVERY effect
  // class. Never null. Never authored by the
  // emitter: derived by §3.4.
  confirmation: ConfirmationRequirement | null; // non-null iff effect ∈
  // {REQUEST_APPROVAL, COMMIT}
  authority_hint: AuthorityHint; // RENDERING HINT ONLY. Never read by any
  // server decision (§0.16 F89, FR-3).

  // --- state ---
  enabled: Cell<boolean>; // a disabled intent still carries a real floor
  expires_at: string; // RFC3339; ≤ envelope expires_at
  single_use: boolean;
}

// --- section 3.1 (contract line 3430) ---
export interface AuthorityHint {
  // RENDERING ONLY. Never read by any server decision (FR-3).
  emphasis: 'primary' | 'secondary' | 'muted';
  disabled_because: ReasonCode | null; // see R3.1.0 — the equality is a rule, not a comment
}

// --- section 3.2 (contract line 3491) ---
export type EffectClass =
  | 'NONE' // no gateway submission exists at all
  | 'NAVIGATE' // resolve a typed target; no business effect
  | 'REFINE' // narrow or re-query a read model; emits a NEW envelope
  | 'CONTROL' // a SERVER state change that is not a business effect
  | 'DRAFT' // create/modify a SERVER-OWNED draft
  | 'REQUEST_APPROVAL' // move an approval object to PENDING
  | 'COMMIT' // the ONLY class that may cause a business or external effect
  | 'HANDOFF'; // carry the user to a surface that may act
// There is no 'MUTATE' and no 'EXECUTE'.

// --- section 3.3 (contract line 3615) ---
export type IntentTarget =
  | { class: 'w'; ref: string } // widget_id — re-resolve an emission
  | { class: 'i'; ref: string } // intent_token — a carrier
  | { class: 'c'; ref: CapabilityRef; scope_ref: string | null } // a C9 capability key
  | { class: 's'; ref: ShellRoute } // a first-party shell destination
  | { class: 'detail'; ref: DetailRouteKey }; // the emitting envelope's own detail

export type ShellRoute =
  | {
      route:
        | 'shell.root'
        | 'shell.account'
        | 'shell.connections'
        | 'shell.privacy'
        | 'shell.notifications';
      param: null;
    }
  | { route: 'shell.pay'; param: string } // session_ref, opaque, server-minted
  | { route: 'shell.file'; param: string }; // artifact_ref, opaque, server-minted

export type DetailRouteKey = string; // must equal presentation.fullscreen_detail.route_key
// of the SAME envelope (R3.3.4)

// --- section 3.5 (contract line 3828) ---
export function subjectCapability(i: IntentSubject): CapabilityRef | null {
  if (i.capability !== null) return i.capability; // REFINE/CONTROL/DRAFT/
  // REQUEST_APPROVAL/COMMIT
  if (i.handoff_capability_ref !== null) return i.handoff_capability_ref; // HANDOFF
  if (i.target?.class === 'c') return i.target.ref; // capability NAVIGATE
  return null; // NONE, and w/i/s/detail
  // NAVIGATE
}

// --- section 3.5 (contract line 3844) ---
export const NEVER_CHAT_ACTUATED = [
  'consent.pd.grant',
  'consent.pd.withdraw',
  'consent.marketing.grant',
  'consent.marketing.revoke',
  'identity.staff.telegram.unbind',
  'identity.client.channel.unbind',
  'consent.register.export',
  'conversation.history.erase',
] as const;

// --- section 3.6 (contract line 3903) ---
export interface ConfirmationRequirement {
  // non-null iff effect ∈ {REQUEST_APPROVAL, COMMIT}
  risk_tier:
    'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
  // NOT a Cell: this is an intent-side member, never a
  // body leaf, so §1.2 V1 does not reach it, and
  // §4.4.3 classifies it AUDIT_RETAINED — a Cell's
  // minted label would be conversation content on an
  // authority-side field.
  reversible: Cell<boolean>; // SOURCE-DEFINED. Non-KNOWN is normal.
  audience_size: Measure | null; // REQUIRED for any communication capability
  requires_explicit_confirm_step: true; // literal, single value (R3.6.3)
  requires_readback: boolean; // server-set at EP-FIT/EP-MINT from
  // Lifecycle.delivery_channel: true iff
  // effect === 'COMMIT' on a SPOKEN tier.
  // Sealed inside body_hash.
  readback_ref: string | null; // server-minted; NON-NULL IFF requires_readback
  readback_text: string | null; // server-minted, sealed inside body_hash;
  // NON-NULL IFF requires_readback. Mint class M —
  // an author cannot write it.
  idempotency_key: string; // MINTED SERVER-SIDE
  approval_policy: 'none' | 'actor' | 'owner'; // copied from the tool definition
  consent_scope?: string;
}

// --- section 3.6 (contract line 3949) ---
export interface InputSchema {
  fields: InputField[];
  max_total_bytes: number; // hard cap; oversize submissions are REFUSED, never truncated
  free_input_justification: FormJustification | null; // REQUIRED iff any field is non-closed
}

export type InputField =
  | {
      name: string;
      required: boolean;
      kind: 'enum' | 'ref';
      domain_ref: string; // server-declared CLOSED set; the client may echo
      selection_min: number;
      selection_max: number;
    }
  | {
      name: string;
      required: boolean;
      kind: 'integer' | 'decimal';
      bounds: {
        min: number;
        max: number;
        step: number | null;
        unit_ref: string;
        bounds_source: string;
      };
    }
  | {
      name: string;
      required: boolean;
      kind: 'date' | 'time' | 'datetime';
      window: {
        earliest: string;
        latest: string;
        granularity_s: number;
        calendar_ref: string;
        bounds_source: string;
      };
    }
  | {
      name: string;
      required: boolean;
      kind: 'text';
      max_len: number;
      normalizer_ref: string;
    }
  | {
      name: string;
      required: boolean;
      kind: 'phone';
      normalizer_ref: 'canonical_msisdn';
    }
  | { name: string; required: boolean; kind: 'boolean' };

// --- section 3.7 (contract line 4008) ---
export interface IntentRecord {
  // --- authority and audit: AUDIT_RETAINED through conversation erasure ---
  intent_token_hash: string;
  widget_id: string;
  tenant_id: string;
  principal_proof_hash: string;
  widget_kind: WidgetKind; // Gate 5 evaluates KIND_FLOOR[kind] as one of
  // verificationFloor's four terms, and Gate 7
  // enforces the kind rule over this record.
  effect: EffectClass;
  priority: number; // FLOOR_EXEMPT reads it; without it Gate 5's
  // recompute cannot reproduce the exempt branch
  // and every exempt intent would diverge.
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
  target: IntentTarget | null;
  verification_floor: VerificationLevel;
  confirmation: ConfirmationRequirement | null;
  input_schema_hash: string | null;
  requested_scope_hash: string;
  body_hash: string; // written at mint from the sealed emission;
  // read by Gate 8-R and the SUPERSEDED comparison
  selection_domain: string; // the closed domain this token may select from;
  // read by the SUPERSEDED comparison. The domain's
  // LABELS are conversation content and live below.
  c9_domain: C9Domain | null; // the orchestrator's own published union
  // ('ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' |
  //  'BUSINESS_INTELLIGENCE'), imported, never
  // redeclared. NON-NULL IFF BOTH
  // subjectCapability(record).space === 'C9' AND
  // correlation.run_id !== null. Derived at mint
  // from Correlation.agent_id — NEVER from the
  // subject capability's own `domains`, which
  // would compare a value with itself.
  run_ref: { run_id: string; revision_id: string | null } | null;
  approval_of_intent_ref: string | null; // §3.11
  confirmation_of_ref: {
    kind: 'draft' | 'record' | 'approval';
    ref: string;
  } | null;
  // NON-NULL IFF effect === 'COMMIT' (§3.10)
  produced_by_intent_token_hash: string | null; // §3.10.2's guard
  issued_at: string;
  expires_at: string;
  single_use: boolean;
  consumed_at: string | null;
  action_receipt_ref: string | null;
  frozen_nouns: Record<string, string>; // handles: WHAT, never how much or when.
  // AUDIT_RETAINED (§0.4 F14, §4.4.3): it is the
  // noun resolver's input on the path to Gate 11
  // and Gate 14, and F15's build-time reachability
  // test fails on a non-AUDIT_RETAINED read there.
  // Erasing it would leave a PENDING approval
  // undecidable — which is the case F15 exists for.

  // --- conversation content: ERASED with conversation history ---
  utterance_template: string; // '{{selection}}' is the only slot
  rendered_utterance: string | null; // what was written to the transcript
  selected_labels: string[] | null; // canonical labels, server-resolved
  spoken_transcript: string | null; // voice turns only; authority NONE
}

// --- section 3.8 (contract line 4115) ---
export interface WidgetIntentSubmission {
  // "maya.widget.intent.submission/1"
  contract: 'maya.widget.intent.submission/1';
  widget_id: string;
  intent_token: string; // REQUIRED, non-null
  inputs: Record<string, string | number | boolean | string[]> | null;
  client_nonce: string;
  profile_id: string; // ADVISORY (R3.8.3)
  spoken_transcript?: string; // voice only, for audit; authority NONE
  client_emitted_at?: string; // advisory; never business time
  readback_ack?: ReadbackAck; // REQUIRED iff Gate 8-R applies; refused otherwise
}

export interface ReadbackAck {
  readback_ref: string; // echoes confirmation.readback_ref        — AUDIT_RETAINED
  body_hash: string; // echoes the emission's body_hash          — AUDIT_RETAINED
  affirmation: string; // the caller's affirmative utterance, verbatim
  // — CONVERSATION_CONTENT: it is a word the data subject said,
  // erased with the conversation, and compared against the closed
  // affirmation vocabulary at submission time only.
}
