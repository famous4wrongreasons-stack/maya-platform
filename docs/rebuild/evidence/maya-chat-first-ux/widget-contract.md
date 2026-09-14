# MAYA Widget Contract — synthesized design (first edition) + mandatory corrections

**STATUS: NOT APPROVED FOR IMPLEMENTATION AS WRITTEN.**

This file preserves the first edition of the synthesized Widget Contract exactly as
the judged design panel produced it, so the adversarial review remains auditable
against the text it reviewed.

Adversarial review of this text found **64 violations (35 structural)** and
**55 unproven claims**. Five were structural safety defects. They are listed with
their mandatory corrections in §9.3 of
[MAYA-CHAT-FIRST-UX-ARCHITECTURE.md](../../MAYA-CHAT-FIRST-UX-ARCHITECTURE.md),
and the full finding lists are in `review-safety-violations.json` and
`review-scope-and-claims.json` beside this file.

Do not implement from this file. Implement from the architecture document's §9,
which carries the corrections, and treat everything below as the reviewed source
text rather than as a specification.

Two headline claims made below are known to be FALSE as written and are corrected
in §9.3:

1. "A channel-identity tap physically cannot actuate a 152-FZ decision" — the
   consent split is unrepresentable in this edition's own type system.
2. "A COMMIT token for a booking does not exist ... enforced by non-existence
   rather than by a check" — it is enforced by a check, and the check was scoped
   to a single capability name.

---

# MAYA Widget Contract — `maya.widget.envelope/1`

**Base:** PORTABLE WIDGET ENVELOPE (PWE@1). **Grafts:** Cell<T>, handles-as-nouns, minted text equivalent, parity/erasure CI gates and SECURE_SURFACE_ONLY from *The Glass Pane*; the forbidden-key validator, the `source` pointer with zero new business endpoints, `theme_scope: 'in_tree'`, verbatim completeness, the sixth display fence and NEVER_CHAT_ACTUATED from *WidgetProjection@1*.

---

## 0. Scope of this cycle (normative)

This document is **architecture only**. Runtime changes: 0. Schema changes: 0. Migrations: 0. Production mutations: 0. Chapter 10 is not started. Nothing here authorises deleting a tab, a screen, a route or a command. The only mechanism in this contract that may ever authorise a deletion is **INV-16 (capability parity)**, and it authorises nothing until it is green.

Verified against the repository at `maya-saas-backend/src/orchestration/`: `c9.controller.ts` exposes `@Controller('orchestration')` with `request-identity`, `runs`, `runs/:id`, `runs/:id/revisions`, `runs/:id/review`, `runs/:id/execution`, `runs/:id/cancel`, `runs/:id/continue`, `tenant-context`, `tenant-context/draft`. `c9.contract.ts` defines `AgentResult@1` with `facts_used`, `proposed_action_intents`, `presentation_hint`, `requestedScopeHash` and the `c9SafeText` / `c9Enum` validator family. `c9.registry.ts` derives capability keys from `MAYA_AI_TOOL_CATALOG` (`catalog.services.read`, `booking.availability.read`, `clients.dormant.list`, `appointments.own.create`, `staff.schedule.read`, `operations.journal.read`, `expenses.read`, `analytics.*`). The contract below cites those identifiers, it does not invent parallel ones.

---

## 1. The one-sentence rule

> A widget is a **signed, expiring, server-authored projection of a canonical capability, plus a closed set of server-minted typed intents, whose canonical rendering is text.**

Three consequences carry the whole design and everything else is machinery for them:

1. **Text is canonical, richness is decoration.** Every envelope must be fully expressible as prose (Rule R1). A channel can therefore only ever *lose presentation*, never *gain authority*.
2. **The client returns a token it did not author.** A submission carries an opaque `intent_token` plus values drawn from a closed, server-declared domain. It cannot name a provider, an endpoint, a table, a record id or a price. `WIDGET STATE == BUSINESS STATE` is not a discipline anyone must remember; it has no field on the wire.
3. **A COMMIT token does not exist until a canonical draft exists.** Not checked — *non-existent* (Rule I2).

---

## 2. Envelope root

```ts
interface WidgetEnvelope {                    // "maya.widget.envelope/1"
  contract: 'maya.widget.envelope/1';
  widget_id: string;              // ULID, unique per EMISSION. Addressing only.
                                  // Never a business identifier; never an FK target (INV-15).
  kind: WidgetKind;               // §5, closed
  body_version: number;           // per-kind payload version, bumped independently
  tenant_id: string;

  correlation: Correlation;       // §2.1
  source: WidgetSource;           // §2.2  [graft: WidgetProjection@1]
  origin: Origin;                 // §2.3
  authority: AuthorityEnvelope;   // §3
  body: WidgetBody;               // §5 — READ MODEL ONLY, no writable field
  intents: WidgetIntent[];        // §6 — the ONLY interactive affordance, 0..12
  provenance: Provenance;         // §4.3
  limitations: Limitation[];      // REQUIRED, may be []
  lifecycle: Lifecycle;           // §8
  presentation: Presentation;     // §7 — includes the mandatory text equivalent
  render: RenderReceipt;          // §9.2 — what degradation the server already applied
  integrity: Integrity;           // §2.4
}
```

**Forbidden keys (INV-1, graft: WidgetProjection@1 W1).** No key named `arguments`, `payload`, `state`, `role`, `permissions`, `token`, `tenant_id` *(outside the root)*, `client_id`, `staff_id`, `record_id`, `is_staff`, `is_owner`, `__meRole`, `__meIsStaff`, `__meIsFounder` may appear at **any depth** of `WidgetEnvelope` or `WidgetIntentSubmission`. A validator rejects them structurally. This exists because the live defect in this codebase is a third authority path (`localStorage.me_is_staff` routing before any server call); a widget layer able to carry an identity key would become a fourth.

### 2.1 Correlation

```ts
interface Correlation {
  run_id: string | null;          // C9 run, when the orchestrator minted it. NULLABLE BY DESIGN.
  turn_id: string | null;
  message_id: string | null;      // durable chat message this envelope is anchored to
  agent_id: 'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' | 'BUSINESS_INTELLIGENCE' | null;
  parent_widget_id: string | null;  // step chains: SERVICE → STAFF → SLOT → CONFIRMATION
  step_index: number | null;        // "2 из 4" in every renderer, including text
  step_total: number | null;
  trace_id: string;
}
```

`run_id` is nullable deliberately. Most of the 795 inventoried surfaces are direct capability reads with no agent in the loop; forcing a C9 run to render today's schedule would put a 12-model-call / 120-second budget in the path of drawing a calendar and would let *presentation* exhaust *reasoning* budget. When `run_id` is present the envelope is a projection of a run; when it is absent it is a projection of a registered capability read. The safety properties below hold identically in both cases.

### 2.2 `WidgetSource` — the pointer *(graft: WidgetProjection@1 §2)*

```ts
type WidgetSource =
  | { from: 'capability_envelope'; capability: string; capability_version: string;
      evidence_handle: string; fact_index: number }
  | { from: 'agent_result'; run_id: string; result_seq: number; path: AgentResultPath }
  | { from: 'action_intent'; run_id: string; result_seq: number; intent_index: number }
  | { from: 'action_execution'; execution_id: string }
  | { from: 'orchestrator_state'; run_id: string;
      field: 'runStatus' | 'revisions' | 'execution' | 'budget' | 'stepBindings' };

type AgentResultPath =
  | `/findings/${number}` | `/findings/${number}/statement`
  | `/facts_used/${number}` | `/facts_used/${number}/${'status'|'as_of'|'capability'}`
  | `/proposed_action_intents/${number}` | `/limitations/${number}`
  | '/confidence' | '/presentation_hint';
```

A closed prefix set. There is no `/raw`, no `/tool_results`, no escape hatch. `capability` MUST be a key present in the C9 capability registry (INV-10).

### 2.3 Origin

```ts
interface Origin {
  trigger: 'user_request' | 'contextual' | 'proactive';
  entry: 'nl' | 'command' | 'tap' | 'voice' | 'push_open' | 'scheduler' | 'deep_link';
  // REQUIRED when trigger === 'proactive':
  moment?: ProactiveMoment;          // closed enum of the 12 canonical outbound moments
  dedupe_key?: string;               // one signal, one delivery, across push ↔ chat ↔ tg mirror
  once_per?: 'event' | 'day' | 'visit' | 'payment' | 'shift' | 'birthday' | 'never_repeat';
  notify_pref_key?: string;          // the channel-consent key that gated this emission
  quiet_hours_applied?: boolean;
  authority_basis?: 'pre_authorized_presentation';  // literal, single legal value
}

type ProactiveMoment =
  | 'appointment_reminder' | 'shift_reminder' | 'daily_report' | 'morning_brief'
  | 'growth_plan' | 'hanging_lead' | 'owner_alert' | 'birthday_alert'
  | 'review_alert' | 'marketing_broadcast' | 'native_feedback_invitation'
  | 'weekly_expense_reminder';
```

`authority_basis` has exactly one legal value. A proactive envelope can only **present already-authorized information**; autonomously initiating new business strategy is not expressible (INV-11) and requires a C10 run, which is out of scope this cycle.

### 2.4 Integrity

```ts
interface Integrity {
  body_hash: string;        // sha256 over stableActionJson([contract, kind, body,
                            //   intents stripped of intent_token, presentation])
                            // NOTE: presentation IS covered — the text equivalent cannot drift.
  envelope_seal: string;    // HMAC-SHA256(body_hash ‖ widget_id ‖ tenant_id ‖
                            //   principal_proof_hash ‖ issued_at ‖ expires_at), keyed
  seal_key_version: number;
  principal_proof_hash: string;   // [graft: Glass Pane] opaque proof of the principal this
                                  // envelope was minted for. NOT a role, user id or token.
                                  // A relink/unlink cycle changes it, which retroactively
                                  // invalidates every outstanding envelope on every device.
  approval_binding_echo?: string; // iff kind === 'APPROVAL': echo of ActionExecution.approvalBindingHash
  policy_context_echo?: string;   // echo of ActionExecution.policyContextHash
}
```

Echoes are **echoes**. The server re-derives and compares; it never accepts them as input. The hashing discipline deliberately reuses `stableActionJson` and the `approvalBindingHash` / `policyContextHash` pattern rather than introducing a second scheme.

---

## 3. Authority — read-only, never inferred from the channel

```ts
interface AuthorityEnvelope {
  principal_ref: string;                  // opaque; the envelope is MINTED FOR this principal
  presentation_mode: 'platform' | 'owner' | 'staff' | 'client';  // PRESENTATION ONLY
  declared_only: true;                    // literal, single value
  authority_snapshot_ref: string;         // server snapshot used to build body + intents
  verification_level: VerificationLevel;  // SERVER-DERIVED FROM THE SESSION. Never client-asserted.
  pii_class: 'none' | 'business_aggregate' | 'client_identified';
  subject_is_principal?: boolean;         // true iff the identified client IS the viewer
  data_scope: {
    pii_visible: boolean;
    preview_downgrade_reason?: 'channel_unlinked' | 'no_crm_binding' | 'entitlement' | 'policy';
    masked_fields: string[];              // dotted paths inside body that were masked, for honesty
  };
  legacy_globals_used: never;             // type-level ban
}

type VerificationLevel =
  | 'ANONYMOUS'          // public web, guest chat
  | 'CHANNEL_IDENTITY'   // "this Telegram account", "this push subscription" — IDENTIFIED, NOT VERIFIED
  | 'BOUND_CLIENT'       // channel identity bound to a verified Client record
  | 'SESSION_VERIFIED'   // first-party authenticated session (PWA / native shell / Mini App initData)
  | 'STEP_UP_VERIFIED';  // re-verified within N minutes, for high-risk acts
```

**A1.** `presentation_mode` may reorder, relabel and hide. It may never *enable* an intent. It mirrors the existing `app_access` header verbatim: *presentation context only; endpoint auth still uses JWT + membership; never infer a stronger mode from role, phone, CRM token or screen name.*

**A2.** A renderer may declare **presentation** capabilities (§9). It may **not** declare `verification_level`. A lying channel profile can only make a widget uglier, never more powerful.

**A3 — inputs that are not accepted, anywhere, by any renderer.** `window.__meRole`, `__meIsStaff`, `__meIsMaster`, `__meIsFounder`, `__panelInfo.permissions`, `localStorage.me_is_staff`, the current screen name, and which widget the user happens to be looking at. These are the two legacy authority generations and the localStorage pre-routing cache; none is an input to this contract.

**A4 — the sixth display fence** *(graft: WidgetProjection@1 W11)*. `pii_class === 'client_identified'` combined with `presentation_mode === 'client'` is rejected unless `subject_is_principal === true`. This is an **addition**. It does not replace and must not be allowed to collapse the five existing client-preview enforcement points (downgrade when the channel is unlinked; cabinet data wipe; cabinet body replacement; loyalty/history request refusal; hydrator CRM-PII refusal). Any refactor that consolidates them fails review.

**A5.** No intent's `capability` may vary by `presentation_mode`. *One Maya, different authority* means one intent set; the server decides what the intent returns.

---

## 4. Values, provenance, gaps

### 4.1 `Cell<T>` — the universal displayed datum *(graft: Glass Pane)*

Every displayed datum in every body is a `Cell`. There is no bare `number`, `string`, `boolean` or date in any body field that reaches a user's eyes.

```ts
type CellState = 'KNOWN' | 'PARTIAL' | 'NOT_MEASURED' | 'UNAVAILABLE' | 'PENDING';

interface Cell<T> {
  state: CellState;
  value: T | null;              // non-null iff state ∈ {KNOWN, PARTIAL}
  label: string;                // ALWAYS a human sentence fragment.
                                // Never '', 'null', '—', 'N/A', 'error', '0-as-placeholder'.
  reason_code: ReasonCode | null;   // REQUIRED iff state !== 'KNOWN'
  as_of: string | null;             // RFC3339; REQUIRED iff state ∈ {KNOWN, PARTIAL}
  evidence_refs: string[];          // REQUIRED non-empty iff state === 'KNOWN'
  next_intent_ref: string | null;   // an intent in THIS envelope that could resolve the unknown
}

type ReasonCode =
  | 'SOURCE_UNLINKED' | 'PERIOD_NOT_CLOSED' | 'NOT_COLLECTED' | 'OUT_OF_SCOPE'
  | 'PERMISSION' | 'PROVIDER_SILENT' | 'NO_OWNER' | 'SUPERSEDED' | 'IN_PROGRESS';
```

### 4.2 `Measure` — the numeric specialisation

```ts
interface Measure extends Cell<number | string> {
  key: string;                  // stable id, e.g. 'revenue.net', 'slot.duration_min'
  unit: 'RUB' | 'minutes' | 'count' | 'percent' | 'ratio' | 'datetime' | 'none';
  basis: string;                // human-readable, e.g. 'закрытые визиты, касса 1016537'
  currency_scope?: string;
  comparison?: { baseline_label: string; delta: number | null;
                 direction: 'up' | 'down' | 'flat' | 'unknown' };
}
```

**M1 — UNKNOWN is a statement, not a failure (lint, CI-enforced).** `Cell.label` must not match `/ошибк|error|fail|сбо[йя]|недоступн.*попроб/i`. No renderer may bind a non-`KNOWN` state to a `danger` / `destructive` / `alert` theme token, an error icon, an error ARIA role, or an automatic retry. The permitted rendering is neutral-dim plus the `next_intent_ref` affordance. A non-`KNOWN` Cell blocks only its dependents (a REPORT section, a CHART series, one row), never the envelope.

**M2 — renderer conformance.** A renderer with fewer than five branches per Cell fails the conformance suite.

### 4.3 Provenance, completeness, limitations

Mirrors `AgentResult@1` field-for-field so the composer **copies rather than re-derives**.

```ts
interface Provenance {
  source_capability: string;       // MUST exist in the C9 capability registry
  projector_id: string;            // the server projector that built `body` from it
  facts_used: Array<{ capability: string;
    status: 'measured' | 'measured_incomplete' | 'not_measured' | 'unavailable';
    as_of: string; completeness?: number; basis?: string; currency?: string }>;
  evidence_refs: string[];         // opaque per-run evidence handles
  confidence: 'high' | 'medium' | 'low';   // grounding, NOT probability
  completeness: {
    requestedScopeHash: string; returnedCount: number; totalCount: number | null;
    hasMore: boolean; cursorRef: string | null; truncated: boolean; reasonCodes: string[];
  };
  completeness_envelope_hash: string;  // [graft: WidgetProjection@1 W9]
  generated_by: 'canonical';           // literal. No body field is LLM-authored.
}

interface Limitation {
  code: string;
  text: string;
  severity: 'info' | 'limitation' | 'risk' | 'blocking';
  affects: string[];               // dotted paths inside body
  capability_gap_ref?: string;     // set when NO canonical owner exists for the remedy
}
```

**P1 — no second backend contract per widget.** `body` fields must be a subset of the response projection of `provenance.source_capability`. A widget kind may not introduce a field its source capability cannot produce.

**P2 — the /unsubscribe clause.** If a remedy has **no canonical owner**, the envelope MUST carry a `Limitation` with a `capability_gap_ref` and MUST NOT carry an intent that promises it. Fail closed, say so in text. No renderer may synthesise a button for a capability absent from the registry.

**P3 — completeness is copied, never recomputed** *(graft)*. `completeness_envelope_hash` must equal a re-hash of the source envelope. There is no arithmetic in the widget layer — the same prohibition the agents operate under.

### 4.4 The capability-gap ledger (normative, versioned with this contract)

`capability_gap_ref` values in force at the time of writing. Each names a capability with **no route in any channel today**; each is a build, not a re-presentation:

| ref | capability | why it is load-bearing |
|---|---|---|
| `GAP-CONSENT-MKT-CHANGE` | change a recorded marketing-consent decision (revoke or grant after declining) | two live surfaces still PROMISE revocation via `/unsubscribe`, which hands off to a surface that does not exist — active 152-FZ exposure |
| `GAP-CONSENT-PD-WITHDRAW` | withdraw base 152-FZ personal-data consent in-product | exists only as a phone number and an email in bot copy |
| `GAP-IDENTITY-TG-UNBIND` | permanently detach a staff member's Telegram at offboarding | the link can be created, never destroyed |
| `GAP-COMMERCE-GIFT` | gift-certificate purchase / activation / redemption | severed while the AI chat still offers it and the shop UI is live |
| `GAP-LOYALTY-REDEEM` | spend loyalty points at booking | accrual keeps running, redemption is dark — an unredeemable liability grows |
| `GAP-CONSENT-REGISTER-EXPORT` | 152-FZ consent register export (Roskomnadzor journal) | audit obligation with no surface |
| `GAP-ATTRIBUTION-FIRST-TOUCH` | first-touch acquisition attribution report | two-level hierarchy over 10 categories |
| `GAP-HISTORY-ERASE` | delete conversation history / right to erasure over conversation content | buildable only because of INV-15 |

---

## 5. Kinds and bodies

```ts
type WidgetKind =
  | 'CHOICE' | 'SERVICE_SELECTOR' | 'STAFF_SELECTOR' | 'TIME_SLOT_SELECTOR'
  | 'BOOKING_CONFIRMATION' | 'SCHEDULE' | 'CLIENT_LIST' | 'METRIC' | 'CHART'
  | 'REPORT' | 'STRATEGY_OPTIONS' | 'APPROVAL' | 'PROGRESS' | 'LIMITATION'
  | 'SOURCE_STATUS' | 'SETTINGS_DRAFT' | 'FORM';
```

Closed. Adding a kind is a contract version bump reviewed like a schema change. There is **no `ERROR` kind and no `error` severity anywhere in this contract.**

### 5.1 Shared substrata

```ts
interface OptionItem {
  option_id: string;                 // opaque; meaningful only inside this envelope's domain
  label: string;
  sublabel?: string;
  badges?: string[];                 // ≤ 3
  measures?: Measure[];
  media?: { kind: 'image' | 'icon'; ref: string; alt: string };   // alt REQUIRED (INV-9)
  intent_token: string;              // selecting this option = this intent
  enabled: Cell<boolean>;            // a disabled control explains itself as an unknown, not an error
}

interface TableSpec {
  columns: Array<{ key: string; label: string;
    type: 'text' | 'measure' | 'datetime' | 'ref';
    sensitivity: 'public' | 'internal' | 'pii';
    align?: 'start' | 'end' }>;
  rows: Array<Record<string, Cell<string> | Measure | null>>;
  row_intents?: Record<string, string>;   // row key → intent_token
  group_by?: string;                      // ONE level of grouping ⇒ two-level hierarchical tables
}
```

### 5.2 Bodies

| kind | `body` | effect ceiling | mandatory extras |
|---|---|---|---|
| `CHOICE` | `{ prompt; select:'single'\|'multi'; min_select; max_select; options:OptionItem[]; allow_free_text; free_text_hint? }` | REFINE | ≥2 options |
| `SERVICE_SELECTOR` | `{ prompt; category_path:string[]; options:(OptionItem & { service_ref; duration:Measure; price:Measure; requires_consultation:boolean; combinable_with:string[] })[]; select; total_preview:Measure\|null; more_intent? }` | REFINE / DRAFT | source `catalog.services.read` |
| `STAFF_SELECTOR` | `{ prompt; for_service_refs:string[]; options:(OptionItem & { staff_ref; role_label; nearest_availability:Measure; rating?:Measure })[]; any_staff_option:OptionItem\|null }` | REFINE / DRAFT | source `catalog.staff.read` |
| `TIME_SLOT_SELECTOR` | `{ prompt; timezone; window:{from;to}; grouping:'by_day'\|'by_part_of_day'\|'flat'; groups:{ group_id; label; slots:{ slot_ref; start; duration:Measure; staff_ref\|null; price:Measure\|null; intent_token; availability:Cell<'FREE'\|'HELD'\|'TAKEN'> }[] }[]; shown_count; total_count\|null; more_intent?; widen_window_intent?; none_fit_intent }` | **DRAFT max — never COMMIT** | `freshness_class:'live'`; source `booking.availability.read` |
| `BOOKING_CONFIRMATION` | `{ draft_ref; lines:{label;detail;measures:Measure[]}[]; when:Measure; staff_label:Cell<string>; duration_total:Measure; price_total:Measure; loyalty_applied:Measure\|null; policy_notices:string[]; commit_intent; amend_intents:string[]; cancel_intent }` | COMMIT | **exactly one** COMMIT intent; nothing in the body is input |
| `SCHEDULE` | `{ range; timezone; lanes:{lane_id;label;staff_ref\|null}[]; entries:{entry_ref;lane_id;start;end;title:Cell<string>;subtitle?;state:'booked'\|'held'\|'blocked'\|'free'\|'unknown';pii_masked:boolean;intent_token?}[]; gaps:{lane_id;start;end;recoverable:Measure}[]; detail_intent }` | REFINE / NAVIGATE | escalation when rows exceed density cap |
| `CLIENT_LIST` | `{ table:TableSpec; pii_masked:boolean; segment_label; segment_ref; bulk_intents:string[]; page:{cursorRef\|null;hasMore} }` | REFINE / REQUEST_APPROVAL | `pii_class:'client_identified'`; every bulk intent carries `audience_size` |
| `METRIC` | `{ period_label; metrics:Measure[]; headline_metric_key; drill_intent? }` | NAVIGATE only | every number a `Measure` |
| `CHART` | `{ chart_kind; dataset_ref; rows_digest; axes:{x:{label;type};y:{label;unit}}; series:{series_id;label;points:{x;y:Measure}[]}[]; table_equivalent:TableSpec; gap_policy:'RENDER_GAP'; export_intent? }` | NAVIGATE only | `dataset_ref` is a canonical C7/C8 handle; `table_equivalent` REQUIRED |
| `REPORT` | `{ title; period_label; sections:{section_id;heading;narrative;table?:TableSpec;metrics?:Measure[];depth:1\|2}[]; top_summary:Measure[]; fullscreen_intent; export_intent? }` | NAVIGATE only | `top_summary` ≤3 and `fullscreen_intent` REQUIRED — hierarchical tables never live in a bubble |
| `STRATEGY_OPTIONS` | `{ revision_ref; question; alternatives:{option_id;title;reasoning;expected_effect:Measure;risk_tier;reversible;audience_size:Measure\|null;select_intent}[] /* ≤3 */; no_action_option:{title;consequence;select_intent} /* REQUIRED */; review_state:'draft'\|'reviewed'\|'not_an_approval'; review_disclaimer }` | REQUEST_APPROVAL max | reuses `c9Alternative` verbatim; NO_ACTION must be selectable (INV-13) |
| `APPROVAL` | `{ approval_ref; subject; effect_preview; audience_size:Measure\|null; risk_tier; reversible; state:'PENDING'\|'APPROVED'\|'REJECTED'\|'COMPLETED'\|'EXPIRED'; requested_by_label; expires_at; approve_intent\|null; reject_intent\|null; detail_intent }` | COMMIT (approval decision) | `integrity.approval_binding_echo`; consent-aware audience maths shown **before** the irreversible tap |
| `PROGRESS` | `{ run_ref; headline; steps:{step_id;label;state:'pending'\|'running'\|'blocked_unknown'\|'done'\|'skipped'\|'failed';blocked_by?;receipt_ref?}[]; budget_note:string\|null; poll_after_ms; stream_ref\|null; cancel_intent\|null }` | NONE + cancel | `budget_note` states paid-reasoning-disabled rather than hiding it |
| `LIMITATION` | `{ severity:'info'\|'limitation'\|'risk'\|'blocking'; headline; detail; source_limitation_codes:string[]; remedy_intents:string[] }` | NAVIGATE / HANDOFF | non-empty `source_limitation_codes` |
| `SOURCE_STATUS` | `{ sources:{source_id;label;state:'connected'\|'degraded'\|'unlinked'\|'unknown';as_of:Cell<string>;impact_text;reconnect_intent\|null}[]; overall:'ok'\|'partial'\|'blocked' }` | HANDOFF | `reconnect_intent` is HANDOFF below `SESSION_VERIFIED` |
| `SETTINGS_DRAFT` | `{ draft_ref; scope_label; diff:{path;label;from;to;effect_text;reversible}[]; apply_intent; discard_intent; editor_handoff_intent }` | COMMIT (apply) | `editor_handoff_intent` REQUIRED — the mandated non-chat fallback editor |
| `FORM` | `{ form_ref; justification: FormJustification; schema_ref; fields:FormField[]; submit_intent; cancel_intent; partial_save:false }` | DRAFT / COMMIT | `justification` from the closed set; rationed (§6.6) |

```ts
type FormJustification =
  | 'LEGAL_EXACTNESS' | 'MULTI_FIELD_ATOMIC' | 'ACCESSIBILITY_REQUEST'
  | 'CORRECTION_OF_RECORD' | 'AUDIT_EXACT_INPUT';

interface FormField {
  field_key: string; label: string;
  control: 'text' | 'number' | 'date' | 'time' | 'select' | 'toggle' | 'phone';
  required: boolean; help?: string; max_len?: number; pattern?: string;
  options?: OptionItem[];
  current: Cell<string | number | boolean>;
  sensitivity: 'public' | 'internal' | 'pii' | 'SECURE_SURFACE_ONLY';  // [graft: Glass Pane]
}
```

**B1 — never a system of record.** `body` is a read model. There is no writable field in any body. The server **ignores any `body` echoed by a client**. Widget-local UI state (open accordion, highlighted chip, scroll offset, half-typed field) is `ephemeral_ui`: it lives only in the renderer, is wiped on remount, is never transmitted, never persisted, never read back.

**B2 — FORM is rationed.** `justification` is required from the closed set and the emitter refuses without one. FORM is the only kind accepting free-form input and is therefore the designed leak; its emissions are counted per tenant per week and surfaced in widget telemetry. *This is a social control, not a technical one, and is recorded as such in §17.*

**B3 — `SECURE_SURFACE_ONLY`** *(graft: Glass Pane)*. Such a field **must not be rendered in chat at all**. The only legal intent touching it is `HANDOFF` to a verified channel. This is the field-level expression of the consent split, held even when the capability-level classification is wrong.

---

## 6. Intents — the entire interactive surface

```ts
interface WidgetIntent {
  intent_token: string;          // OPAQUE, server-minted, principal-bound, expiring, ≤34 bytes
  role: 'primary' | 'secondary' | 'destructive' | 'escape' | 'more' | 'handoff' | 'remedy';
  label: string;
  utterance: string;             // ≤240 chars. The EXACT sentence this tap is equivalent to.
  speech_aliases: string[];      // ≥1; deterministic voice matching BEFORE any LLM
  ordinal: number | null;        // spoken "первое", push action index, keyboard order
  priority: number;              // 0 = NEVER droppable (escape / sole COMMIT / sole HANDOFF)
  effect: EffectClass;
  capability: string | null;     // registry key. MUST be null iff effect ∈ {NONE, NAVIGATE, HANDOFF}
  input_schema: InputSchema | null;     // null = no client-supplied input at all
  requires: ConfirmationRequirement | null;   // non-null iff effect ∈ {REQUEST_APPROVAL, COMMIT}
  authority_hint: AuthorityHint;        // RENDERING HINT ONLY — the server never reads it
  enabled: Cell<boolean>;
  expires_at: string;
  single_use: boolean;
}

type EffectClass =
  | 'NONE'             // dismiss, expand, local
  | 'NAVIGATE'         // open a fullscreen detail / deep link. No business effect, no state.
  | 'REFINE'           // narrow or re-query a read model. Emits a NEW envelope. No business effect.
  | 'DRAFT'            // create/modify a SERVER-OWNED draft (booking, settings, audience)
  | 'REQUEST_APPROVAL' // move an approval object to PENDING
  | 'COMMIT'           // the ONLY class that may cause an external/business side effect
  | 'HANDOFF';         // this channel may not do it; carry the user to one that may
// There is no 'MUTATE' and no 'EXECUTE'. A widget cannot express a direct business mutation.
```

### 6.1 `ConfirmationRequirement`, `AuthorityHint`, `InputSchema`

```ts
interface ConfirmationRequirement {
  risk_tier: 'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';  // AiToolRiskTier
  reversible: boolean;
  audience_size: number | null;              // REQUIRED for any communication capability
  required_verification: VerificationLevel;
  requires_explicit_confirm_step: boolean;   // true ⇒ token may exist only on a confirmation body
  requires_readback: boolean;                // voice/push: server text read back before commit
  four_eyes: boolean;                        // approver ≠ initiator on execute-class autonomy
  idempotency_key: string;                   // MINTED SERVER-SIDE, not by the client
  consent_scope?: string;
}

interface AuthorityHint {                    // display only; identical shape, zero authority
  required_authority: 'NONE' | 'VERIFIED_CLIENT' | 'STAFF' | 'OWNER' | 'PLATFORM';
  approval: 'none' | 'actor' | 'owner';
  risk: ConfirmationRequirement['risk_tier'];
  reversibility: 'SOURCE_DEFINED';
  audience_size: number | null;
  second_channel: 'NONE' | 'REQUIRED';
}

interface InputSchema {
  fields: Array<{ name: string;
    type: 'enum' | 'ref' | 'string' | 'integer' | 'date' | 'time' | 'phone' | 'boolean';
    enum_values?: string[];     // for 'enum' and 'ref': the CLOSED set the client may echo
    max_len?: number; required: boolean;
    sensitivity: 'public' | 'internal' | 'pii' | 'SECURE_SURFACE_ONLY' }>;
  max_total_bytes: number;      // hard cap; oversize submissions are REFUSED, never truncated
}
```

`risk_tier`, `reversible` and `audience_size` are **copied** from `proposed_action_intents[i]` when the source is an agent result; they are never computed by the widget layer. `AuthorityHint` exists so a renderer can grey a control without a round trip; the server re-derives everything from Membership, Client binding, Staff, EntitlementsService, AiToolPolicyService and the registry at emission time and **never reads this field**. A hint that disagrees with the server's derivation causes the **widget** to be re-issued; the server's derivation never bends.

### 6.2 I1 — unforgeability

`intent_token` is minted by the IntentGateway and stored as:

```ts
interface IntentRecord {
  intent_token_hash: string;
  widget_id: string; tenant_id: string; principal_proof_hash: string;
  capability: string | null; effect: EffectClass;
  frozen_nouns: Record<string, string>;   // §6.3 — NOUNS, NOT VALUES
  selection_domain: string[] | null; selection_min: number; selection_max: number;
  input_schema_hash: string | null;
  requires: ConfirmationRequirement | null;
  utterance_template: string;             // '{{selection}}' is the only interpolation slot
  requested_scope_hash: string;
  run_ref: { run_id: string; revision_id: string | null } | null;
  issued_at: string; expires_at: string; single_use: boolean; consumed_at: string | null;
}
```

Frozen nouns never travel to the client. A submission carries only `{ widget_id, intent_token, inputs, client_nonce, profile_id }`. **Therefore a button cannot name a provider, an endpoint, a table, a record id, a price, a staff id, a client id or a tenant.**

### 6.3 I2 (a) — handles are nouns, not values *(graft: Glass Pane)*

`frozen_nouns` name **what**, never **how much** or **when, as displayed**: `{ staff: 'h_…', service_set: 'h_…', start: 'h_…' }`. At Gate 9 the canonical owner performs a **fresh read** and supplies the current value. A price or a slot shown 90 seconds ago is never the price or slot used. A divergence produces `SUPERSEDED` with a rendered diff, never a silent clamp and never a wrong booking. This deletes an entire class of stale-value defect that argument-freezing cannot reach.

### 6.4 I2 (b) — the booking two-phase, enforced by non-existence

A `COMMIT` token for a booking effect can be minted **only onto a `BOOKING_CONFIRMATION` body**, which can be produced **only** by a `DRAFT` effect executed by the canonical booking owner (where B31 `normalizeClientBookingIntent`, B32 Client principal and B33 confirmation identity run). At the moment a `TIME_SLOT_SELECTOR` is rendered, **no COMMIT token for that booking exists anywhere in the system.** "Only a final canonical confirmation may cause a booking effect" is enforced by absence, not by a guard anyone can forget.

### 6.5 I3 — the escape verb

Every envelope with `lifecycle.input_lock !== 'none'` must contain exactly one `role: 'escape'` intent at `priority: 0`. It is never dropped by degradation, its `speech_aliases` always include the universal cancel verbs, and in Telegram it is additionally reachable as `/cancel` — the proven pattern, inherited.

### 6.6 I4 — help cannot drift

Per-channel help and command lists are **generated from the intent registry and the kind registry**. No hand-written command list is permitted anywhere. Inherited directly from the Telegram channel, where help generated from the intent router is why help there cannot drift from capability.

### 6.7 I5 — one capability, three front doors, one function

`utterance` and `speech_aliases` must resolve **deterministically** (regex/corpus, pre-LLM) to the same `capability` and the same `intent_token` as the tap. Accessibility, voice and audit are then not three implementations: a screen-reader user who types the sentence, a voice user who says it, and a thumb that taps travel the identical code path and produce the identical audit line.

### 6.8 NEVER_CHAT_ACTUATED *(graft: WidgetProjection@1, layered on the ladder)*

```ts
const NEVER_CHAT_ACTUATED = [
  'consent.pd.grant', 'consent.pd.withdraw',
  'consent.marketing.grant', 'consent.marketing.revoke',
  'identity.staff.telegram.unbind', 'identity.client.channel.unbind',
  'consent.register.export', 'conversation.history.erase',
] as const;
```

Explanation copy, current state and consequence for any of these MAY be a `CHOICE` or `LIMITATION` body. The accept/decline **control** may not. Their only legal intent is `HANDOFF`, and every one of them additionally declares `required_verification: 'SESSION_VERIFIED' | 'STEP_UP_VERIFIED'`, so the VerificationLevel floor (Gate 4) refuses them on channel identity even if the list is stale. Six of the eight map to entries in §4.4 and therefore, by P2, must not carry an intent at all until their canonical owner exists — the HANDOFF target must resolve to a live surface or the envelope fails the gate.

### 6.9 Token wire encoding — one token, five carriers

| Channel | Carrier | Encoding | Budget |
|---|---|---|---|
| PWA / native shell / Mini App | JSON body | `intent_token` verbatim | — |
| Telegram bot | `callback_data` | `w1.<widget10>.<intent6>.<sig8>` base62 ≈ 28–30 B | **64 B hard limit** |
| Web push | notification `action` id | `intent_token` verbatim | ≤2 actions Android, 0 on some desktops |
| Voice | transcript | deterministic match on `speech_aliases` ∪ `ordinal` **before any LLM**, resolved server-side | — |
| SMS / email | body text | numbered enumeration + one `HANDOFF` deep link carrying the token in a signed path segment | 1 action |

The 64-byte ceiling is the reason the token is an opaque handle rather than a self-describing blob; this is the constraint that a ≤1024-character sealed token cannot satisfy, and it is why the `IntentRecord` store exists.

---

## 7. Presentation — text is canonical

```ts
interface Presentation {
  locale: string;                    // BCP-47
  title: string; subtitle?: string;
  density: 'INLINE' | 'CARD' | 'SHEET';
  theme_scope: 'in_tree';            // literal, single value  [graft: WidgetProjection@1]
  fullscreen_detail: { route_key: string; label: string;
    reason: 'exceeds_chat_density' | 'exact_configuration' | 'audit'
          | 'accessibility' | 'correction' } | null;
  text_equivalent: TextEquivalent;   // MINTED, never author-supplied  [graft: Glass Pane]
  speech: {
    lead: string;
    enumeration: Array<{ ordinal: number; say: string; intent_token: string }>;  // ≤5
    overflow_say: string | null;
    readback_template: string | null;   // REQUIRED when any COMMIT intent is present
  };
  a11y: {
    role_hint: 'group' | 'radiogroup' | 'listbox' | 'table' | 'status' | 'form' | 'img';
    label: string; description: string;
    reading_order: string[];            // option_ids / field keys, covering every interactive element
    live_region: 'off' | 'polite' | 'assertive';   // never 'alert' for a non-KNOWN Cell
  };
  resolved_summary_text: string | null;  // what history keeps after resolution
}

interface TextEquivalent {
  headline: string;                  // ≤140
  body: string;                      // ≤4000; prose rendering of EVERY Cell, KNOWN and not
  itemized: string[];                // one line per body item, same order, same formatted values
  unknowns_sentence: string | null;  // REQUIRED iff any Cell.state !== 'KNOWN'
  as_of_sentence: string;
  completeness_sentence: string;
  options_list: Array<{ intent_token: string; utterance: string }>;  // byte-equal to intent.utterance
}
```

**R0 — minted, not written.** `text_equivalent = renderTextEquivalent(kind, body, intents, locale)`, a **pure server function**. The composer cannot supply it, the LLM cannot author it, and `integrity.body_hash` covers it. Consequence: the screen-reader string, the SMS body, the transcript line, the archived summary and the utterance the gateway re-parses are **the same bytes by construction**, not by convention.

**R1 — the portability test (CI-enforced, the single most important gate in this contract).** For every emitted envelope, rendering it with the `TEXT_ONLY` profile must (a) state every fact a rich renderer shows, (b) make every retained intent reachable by a typed reply, (c) state every non-`KNOWN` Cell with its `label`. **If `text_equivalent` cannot express the widget, the widget may not be emitted.** This one test is simultaneously the accessibility conformance test, the SMS render test, the voice render test and the screen-reader description test. Accessibility stops being a retrofit because the textual form is the *canonical* form, not the *alternative* form.

**R2 — numbers.** Prose in `text_equivalent`, `speech.lead` and `REPORT.narrative` may be model-composed; **every numeral is interpolated by the server formatter from a `Measure`**, never typed by a model. A CI check asserts that every numeral in rendered text corresponds to a formatted `Measure` present in the body. Together with `generated_by: 'canonical'`, `CHART.dataset_ref` and `rows_digest`, this is how *"the LLM never generates numbers for a chart"* becomes checkable rather than aspirational.

**R3 — `theme_scope: 'in_tree'`** *(graft)*. A single-value literal. There is no `'overlay'` member. An envelope cannot declare a DOM host outside the application tree, cannot declare a z-index, and cannot declare a query-parameter mount. It renders inside the chat tree, inside the back-stack, inside the theme. The seven self-mounting overlays at `zIndex 2147483000` are **not expressible as widgets**; they must be re-expressed as `fullscreen_detail` route keys. See §17 for what this does and does not accomplish.

**R4 — unknown kind degrades to text, never to a screen** *(graft)*. An unregistered `kind` renders `text_equivalent.body`. Never a silent fallback to a different screen. This is the explicit counter-pattern to `const cur = S[screen] || S.login`, where an unknown screen key silently lands a user on the login page.

**R5 — no styling in the contract.** There is no colour, font, spacing or z-index field anywhere. Renderers may add motion, layout and theme. They may **not** add an affordance, re-rank a COMMIT into primary position, hide a `Limitation`, or hide a non-`KNOWN` Cell.

---

## 8. Lifecycle

```ts
interface Lifecycle {
  freshness_class: 'live' | 'scenario' | 'proactive_once' | 'static';
  issued_at: string; expires_at: string;       // strictly greater than issued_at
  flow_ttl_s: number | null;                   // default 1800 — inherited 30-minute flow TTL
  input_lock: 'none' | 'soft' | 'hard';        // suppress routing while composing
  on_expiry: 're_resolve' | 'collapse_to_summary' | 'mark_stale';
  supersedes_widget_id: string | null;
  superseded_by_widget_id: string | null;
  resolution: { state: 'open' | 'resolved' | 'superseded' | 'expired' | 'cancelled';
                resolved_by?: 'user' | 'system' | 'other_channel'; at?: string };
  historised_form: 'summary_bubble';           // literal, single value
  dedupe_key: string;                          // crosses channels
  retention_sec: number;                       // per kind; short for PII-bearing kinds
}
```

**Mint.** Exactly three minters hold the seal key: (1) the C9 orchestrator's compose step, (2) a registered capability read endpoint (direct request: nav injection, "покажи мои записи"), (3) the proactive scheduler for the 12 canonical moments. Nothing else can produce a valid envelope. The LLM's role is bounded to `AgentResult@1.presentation_hint`: it may **propose** a kind; a server table `allowedKinds(capability) → WidgetKind[]` validates the proposal; the composer then builds every Cell from `facts_used` and canonical reads. If a required Cell is absent the composer **downgrades to plain text rather than inventing a value**. A widget is optional decoration, never a requirement for answering.

**Project.** The body is built by the registered `projector_id`, calling only `provenance.source_capability`, **behind the same preview/PII fence as every other read path**. A client-preview principal, an unlinked channel or a missing CRM binding produces a masked body with `data_scope.masked_fields` populated. The widget layer adds **no new place** where that fence must be re-implemented; it inherits the existing one, and A4 adds a sixth *display* check on top without relieving any of the five.

**Negotiate and deliver.** The adapter presents `X-Maya-Render-Profile`; the server runs the degradation ladder (§9.1), writes the `RenderReceipt`, and delivers an **already-degraded** envelope. A renderer never runs the ladder itself.

**Render.** Each renderer is a pure function `(envelope) → surface`. It verifies `seal_key_version`, `envelope_seal` over a recomputed `body_hash`, and `expires_at`. Seal mismatch or expiry ⇒ render `text_equivalent` as frozen prose with one `REFINE` intent.

**Update in place.** `IntentReceipt.next_envelope` carries `supersedes_widget_id`; the client replaces in place. Telegram uses `edit_message_text` on the same message. This is the inherited anti-chat-spam discipline: one card that updates, not a scroll of dead cards.

**Cross-channel resolution.** `dedupe_key` is identical for the push, the app-chat card and the Telegram staff mirror of one moment. Resolving in any channel resolves all; the staff-mirror dedupe key that already exists is the seam. A reminder answered in Telegram shows `resolved`, `resolved_by: 'other_channel'` in the app.

**Freshness regimes.**
- `live` (availability, balance, upcoming visits, schedule, source status) — re-invoking the capability **always emits a new envelope**; the renderer must never scroll the user to a stale card. `on_expiry: 're_resolve'`.
- `scenario` (booking, purchase, settings draft) — `flow_ttl_s: 1800`, `on_expiry: 'collapse_to_summary'`, universal escape verb present.
- `proactive_once` (reminder, review invite, birthday) — exactly one live instance per `dedupe_key`; once acted on, `resolved` ("Приду ✓").
- `static` (a limitation, a finished report snapshot) — `mark_stale`, still readable, `as_of` shown.

**Expiry is never an error.** Interacting with an expired envelope returns `outcome: 'EXPIRED'` with a `next_envelope` that is a freshly composed equivalent, or a `LIMITATION` body with a remedy. Renderers dim it; nobody reds it.

**Historise.** When `resolution.state` leaves `open`, the envelope collapses to `historised_form: 'summary_bubble'` — `text_equivalent.headline` plus the resolution state. After `retention_sec` the body is dropped and the conversation retains only `{ widget_id, kind, resolved_summary_text, action_receipt_ref[] }`. Reopening a three-day-old conversation shows sentences, not sixty dead time-slot buttons. **This is why the text equivalent is mandatory rather than an accessibility nicety: it is also the archival form**, so a weak summary degrades into an unreadable history — a visible, self-correcting failure.

**Delete.** Deleting conversation history deletes envelopes, bodies and rendered text. It never touches `IntentRecord`s, Action Engine receipts, `ActionExecution`, appointments, consent records, loyalty balances or `Client` bindings — guaranteed by INV-15. This is what makes `GAP-HISTORY-ERASE` buildable without touching business truth.

**Replay.** Because the envelope, the `RenderReceipt` and the receipts are all stored, any past interaction can be re-rendered in any profile for audit — including replaying an owner's Telegram interaction as its text equivalent for an inspector.

---

## 9. Channel negotiation

```ts
interface ChannelProfile {                     // "maya.channel.profile/1"
  contract: 'maya.channel.profile/1';
  profile_id: string;                          // 'pwa.rich', 'telegram.bot', 'webpush.action', ...
  profile_version: number;
  interaction_model: 'RICH' | 'KEYBOARD' | 'NOTIFICATION' | 'SPEECH' | 'TEXT_ONLY' | 'NON_INTERACTIVE';
  max_actions: number;                         // telegram 8, push 2, sms 1
  max_action_token_bytes: number;              // telegram 64
  max_body_chars: number;                      // telegram 4096, push ~120, sms 140
  max_options_inline: number;
  supports_multi_select: boolean; supports_free_text: boolean;
  supports_images: boolean; supports_charts: boolean; supports_tables: boolean;
  supports_edit_in_place: boolean; supports_deep_link: boolean;
  supports_streaming: boolean; supports_file_delivery: boolean;
  a11y_mode: 'native' | 'text_only';
  max_verification_level: VerificationLevel;   // CEILING this channel can ever establish
}
```

Profiles are registered **server-side** and referenced per turn: `X-Maya-Render-Profile: telegram.bot@3`, with an optional `X-Maya-Render-Caps` that may only **narrow** the registered profile. `verification_level` is absent from the negotiated profile by construction (A2); `max_verification_level` is a server-side ceiling, not a client claim.

### 9.1 Deterministic degradation ladder (server-side, ordered, logged)

1. Compute `text_equivalent` **first**. Everything below is subtraction from a rich render, never addition to text.
2. Sort intents by `priority`; drop from the highest number downward until `intents.length ≤ max_actions`. `priority: 0` is undroppable.
3. If a COMMIT would be dropped, **or** the token exceeds `max_action_token_bytes`, **or** `requires.required_verification > authority.verification_level`, **or** the capability is in `NEVER_CHAT_ACTUATED` → replace the entire interactive part with a single `HANDOFF` deep link carrying `widget_id`, so the verified surface opens on exactly this widget. **Never partially render a commit.**
4. `multi` select on a profile without `supports_multi_select` → convert to a sequential single-select chain linked by `parent_widget_id` / `step_index` (the proven Telegram pattern); if the chain would exceed 4 steps → `FORM` with `MULTI_FIELD_ATOMIC`; failing that → `HANDOFF`.
5. Options exceeding `max_options_inline` → keep the top N by server ranking, append a `role: 'more'` REFINE intent, and state `shown_count` / `total_count` in text. **Truncation is always disclosed, never silent.**
6. `CHART` on `supports_charts: false` → render `table_equivalent`; if that exceeds `max_body_chars` → render `top_summary` (≤3 measures) + NAVIGATE to the fullscreen detail. *(This is exactly the corrected disposition for first-touch acquisition attribution: a two-level hierarchy over 10 categories is a fullscreen detail with a top-3 summary card, not a bubble.)*
7. `SPEECH` → use `presentation.speech`; cap enumeration at 5, offer `overflow_say`; any COMMIT requires `readback_template` spoken and an affirmative match before submission. Free text is always available. Voice is transcribed and re-enters the same resolver — **not a second authority path**.
8. `NOTIFICATION` → ≤`max_actions` actions; a COMMIT action is permitted **only** when `risk_tier === 'low_write' && reversible === true`; otherwise NAVIGATE only. Body is `text_equivalent` truncated at the first sentence boundary; `dedupe_key` guarantees push and chat are one signal.
9. `NON_INTERACTIVE` (scheduler, email, SMS, social publishing, edge relay) → `text_equivalent` + one signed HANDOFF link.

### 9.2 RenderReceipt

```ts
interface RenderReceipt {
  profile_id: string; profile_version: number;
  applied_rules: number[];             // which ladder steps fired
  dropped_intent_roles: string[];
  degraded_to: 'native' | 'chain' | 'table' | 'summary' | 'speech'
             | 'notification' | 'handoff' | 'text';
  truncation_disclosed: boolean;
}
```

Stored with the emission. This is the instrument that answers *"did this widget actually work in this channel, or did it silently collapse to a link?"* — the honest failure mode of channel portability, and the number that decides whether the ladder is earning its weight.

---

## 10. Submission and receipt

```ts
interface WidgetIntentSubmission {          // "maya.widget.intent.submission/1"
  contract: 'maya.widget.intent.submission/1';
  widget_id: string;
  intent_token: string;
  inputs: Record<string, string | number | boolean | string[]> | null;  // vs input_schema
  client_nonce: string;                     // client-side dedupe of double taps
  profile_id: string;
  spoken_transcript?: string;               // voice only, for audit; authority NONE
  client_emitted_at?: string;               // advisory; never business time
}

interface IntentReceipt {                   // "maya.widget.intent.receipt/1"
  contract: 'maya.widget.intent.receipt/1';
  outcome: 'ACCEPTED' | 'NEEDS_APPROVAL' | 'NEEDS_SECOND_CHANNEL' | 'HANDOFF_REQUIRED'
         | 'REFUSED' | 'EXPIRED' | 'SUPERSEDED' | 'UNKNOWN';
  reason_code: string | null;
  reason_text: string;                      // rendered as-is in every channel
  utterance_echo: string;                   // exactly what was appended to the transcript
  action_receipt_ref: string | null;        // Action Engine receipt, if a canonical action ran
  next_envelope: WidgetEnvelope | null;     // the ONLY way the UI changes
  resolved_widget: { widget_id: string; resolved_summary_text: string } | null;
}
```

What a submission **cannot contain**: a capability name, a URL, an endpoint, a record id, a price, a date, a staff id, a client id, a tenant id, a role, a token other than the opaque handle, or a `body`.

**S1.** A renderer never mutates a widget locally on click. It sends, receives `next_envelope` / `resolved_widget`, and re-renders. There is no optimistic business state (an optimistic *spinner* is `ephemeral_ui` and is fine). `resolved_state` is derived from the receipt, **never from the fact that a button was pressed**.

**S2.** `UNKNOWN` is an outcome, not an error. It renders as a `PROGRESS` envelope with reconciliation language, per the Action Engine's `STILL_UNKNOWN`. It holds its step and blocks only dependents.

---

## 11. Command path — eleven gates

**Canonical:** `UI EVENT → TYPED USER INTENT → AUTHORITY VALIDATION → CANONICAL OWNER`, inside `USER → MAYA CHAT → ORCHESTRATOR → CAPABILITY/AGENT → ANSWER + WIDGET → APPROVAL IF REQUIRED → CANONICAL ACTION`.

**Step 0 — UI event; all channels converge here.** PWA/native/Mini App: read `intent_token` from the rendered model. Telegram: `callback_query.data` **is** the token; a slash command or a natural-language utterance hits the deterministic router first and resolves to the **same** token — one capability, three front doors, one function. Push: `event.action` **is** the token. Voice: audio → transcription → deterministic match on `speech_aliases` ∪ `ordinal` **before any LLM** → the same token, transcript stored for audit with authority NONE. SMS/email: a signed link path segment carries the token and opens a verified surface.

| # | Gate | Owner | Refusal |
|---|---|---|---|
| 1 | **Token integrity** — HMAC valid, `widget_id` matches, not expired, not consumed (if `single_use`), not superseded | IntentGateway | `EXPIRED` / `SUPERSEDED` + fresh `next_envelope` |
| 2 | **Transport auth** — session resolved exactly as for a typed message (JWT + Membership, or a verified `ClientChannelLink`). **No credential comes from the widget.** | HTTP middleware | `REFUSED / unauthenticated` |
| 3 | **Principal binding** — `IntentRecord.principal_proof_hash` must equal the live principal's proof hash. A token minted for A and replayed by B fails; a forwarded Telegram message or a shared push is inert; an unlink/relink invalidates every outstanding envelope retroactively | IntentGateway | `REFUSED / widget_principal_mismatch` |
| 4 | **Channel verification floor** — server-derived `verification_level ≥ requires.required_verification`, capped by `profile.max_verification_level`. Consent controls, identity unbinding, settings apply and every `restricted` tier declare `SESSION_VERIFIED`+, so **a channel-identity tap can never actuate them** | ChannelProfileRegistry + AuthorityResolver | `NEEDS_SECOND_CHANNEL` / `HANDOFF_REQUIRED` + deep link |
| 5 | **Tenant scope** | TenantResolver | `REFUSED / tenant_mismatch` |
| 6 | **Authority, computed from scratch** — Membership / Staff / verified Client binding / EntitlementsService (effective features) / AiToolPolicyService (allowedRoles, allowedSurfaces, requiredFeatures, riskTier). `authority_hint` is **not read**. A widget that should never have been rendered still cannot act | AuthorityResolver | `REFUSED / insufficient_authority` |
| 7 | **Lowering** — `utterance = render(utterance_template, selected labels)` is appended to the conversation as a **USER turn with authority NONE**, exactly as C9Context marks conversation text. From here the path is byte-identical to a typed message | chat ingress | — |
| 8 | **Divergence audit (shadow first)** — run the deterministic text router over the lowered utterance; if its resolved capability ≠ `IntentRecord.capability`, write an audit record. Hard refusal behind a flag; promotion criterion is an open question (§17) | intent router | `REFUSED / intent_divergence` (when gated) |
| 9 | **Input validation + noun resolution** — `inputs` validated against `input_schema` (closed enum membership for every `enum`/`ref`, length and byte caps, sensitivity check; `SECURE_SURFACE_ONLY` rejected outright). Selection cardinality within `[selection_min, selection_max]` and `⊆ selection_domain`. Then **each frozen noun is resolved by a FRESH READ from its canonical owner**; a value divergence returns `SUPERSEDED` with a rendered diff | IntentGateway + capability owner | `REFUSED / selection_out_of_domain`, `REFUSED / use_secure_surface`, `SUPERSEDED / handle_stale` |
| 10 | **Data fence** — for `REFINE` / `NAVIGATE`, the new body is produced by the same projector under the same five client-preview/PII enforcement points. No widget-specific PII path exists, so none of the five can be bypassed by a widget | Projector | masked body, never a leak |
| 11 | **Effect routing** — `NAVIGATE`/`REFINE` → projector → `next_envelope`, **terminates here, no business effect is reachable from a selector**. `DRAFT` → canonical draft owner (booking owner runs B31/B32/B33 *before any draft exists*); result is a `BOOKING_CONFIRMATION`/`SETTINGS_DRAFT` on which — and only on which — a COMMIT token is minted. `REQUEST_APPROVAL` → approval object → PENDING. `HANDOFF` → signed deep link, no capability invoked. `COMMIT` → Gate 12 | router | per class |
| 12 | **Canonical action** — `ActionEngine` receives capability id, resolved arguments, the **server-minted** `idempotency_key`, risk tier, reversibility, audience size and the approval state machine (`PENDING → APPROVED → REJECTED → COMPLETED`). Four-eyes and readback are enforced here, not in the UI. The Action Engine — never the widget, chat or renderer — calls the **provider owner**; the provider owner alone touches YClients. Reschedule uses the non-destructive `PUT record/{company}/{id}`. `CrmUnsupportedCapabilityError` surfaces as `SOURCE_STATUS`, never as a fabricated success | ActionEngine → provider owner | policy decision |

**Approval.** `PENDING_APPROVAL` mints a fresh `APPROVAL` envelope carrying the pointer, `approval_binding_echo`, an effect preview, the expiry, and the consent-aware audience maths shown **before** the irreversible tap (inherited Telegram pattern). The C9 `review` path is **explicitly not** a source approval and can never satisfy `PENDING_APPROVAL`.

**Routing map — zero new business endpoints** *(graft: WidgetProjection@1 §12)*:

| operation | endpoint |
|---|---|
| mint `principal_ref` | `POST /api/orchestration/request-identity` |
| issue a widget from a run | inside the chat/run response, `POST /api/orchestration/runs` |
| re-resolve / restore from history | `GET /api/orchestration/runs/:id` |
| REFINE / select / expand / submit an intent within a run | `POST /api/orchestration/runs/:id/continue` |
| STRATEGY_OPTIONS refine | `POST /api/orchestration/runs/:id/revisions` |
| STRATEGY_OPTIONS review (**not** a source approval) | `POST /api/orchestration/runs/:id/review` |
| PROGRESS | `GET /api/orchestration/runs/:id/execution` |
| cancel | `POST /api/orchestration/runs/:id/cancel` |
| SETTINGS_DRAFT | `POST /api/orchestration/tenant-context/draft`, `GET /api/orchestration/tenant-context` |
| APPROVAL decision | the **Action Engine's own** approval path on that `ActionExecution` |
| **every token-carried emission** | `POST /api/chat/widget-intents` — **the one new endpoint** |

The gateway is the only addition and is justified narrowly: a Telegram `callback_data`, a push `action` and an SMS link cannot carry a run id, a revision id and a body into `/runs/:id/continue` inside 64 bytes. The gateway resolves the token and then **delegates to the endpoints above**; it owns no business logic, no table beyond `IntentRecord`, and no capability of its own.

**The three forbidden edges, and why they are unreachable:**

| forbidden | why it cannot be expressed |
|---|---|
| `BUTTON → PROVIDER DIRECTLY` | the submission names no endpoint, no capability and no arguments; its only destination is the gateway; no renderer holds provider credentials or a base URL |
| `BUTTON → DATABASE BUSINESS MUTATION` | `EffectClass` has no `MUTATE`/`EXECUTE` member; the only mutation road is Gate 12 |
| `WIDGET STATE == BUSINESS STATE` | `body` is a read model the server ignores on ingress (B1); local UI state is `ephemeral_ui` and never transmitted (S1); `resolved_state` derives from receipts; no canonical row references a `widget_id` (INV-15) |

---

## 12. Invariants (CI-enforced against recorded emissions)

| # | Invariant | Enforced by |
|---|---|---|
| INV-1 | No forbidden identity/argument key at any depth of envelope or submission | structural validator |
| INV-2 | Every emitted envelope passes the `TEXT_ONLY` portability test (R1) | CI over emission fixtures |
| INV-3 | No body field outside its `source_capability` projection (P1) | projector contract test |
| INV-4 | Every non-`KNOWN` Cell has a `reason_code`, a human `label`, and passes the anti-error lint (M1); every `KNOWN` Cell has non-empty `evidence_refs` | envelope validator |
| INV-5 | Any non-`KNOWN` Cell ⇒ `limitations.length > 0` **and** `text_equivalent.unknowns_sentence !== null` | validator (mirrors C9 `missingness_required`) |
| INV-6 | `effect ∈ {NONE, NAVIGATE, HANDOFF}` ⟺ `capability === null` | closed-shape cross-check |
| INV-7 | No COMMIT token exists outside `BOOKING_CONFIRMATION`, `APPROVAL`, `SETTINGS_DRAFT`, `FORM`; ≤1 COMMIT per booking-class envelope; a booking COMMIT exists only after a canonical draft (I2) | Action Engine ingress refuses non-confirmation sources for `appointments.own.create` |
| INV-8 | No COMMIT delivered to a channel whose server-derived `verification_level` is below `requires.required_verification`; no `NEVER_CHAT_ACTUATED` capability carried by a non-HANDOFF intent | ladder step 3 + gateway Gate 4 |
| INV-9 | Every communication-class intent carries `audience_size`; every `media` has non-empty `alt`; `a11y.reading_order` covers every interactive element | validator |
| INV-10 | Every intent capability exists in the C9 registry, is not in the agent's denied set, is within `maxSideEffectClass`; a `BUSINESS_INTELLIGENCE`-sourced envelope carries **zero** intents above `NAVIGATE`/`REFINE` (BI is READ-only) | registry lookup (mirrors `bi_read_only`) |
| INV-11 | `trigger: 'proactive'` ⇒ no `STRATEGY_OPTIONS` body, no effect above `DRAFT`, `authority_basis: 'pre_authorized_presentation'`, `notify_pref_key` present, quiet hours applied | validator |
| INV-12 | Every envelope with `input_lock !== 'none'` has exactly one `priority: 0` escape intent | validator |
| INV-13 | `STRATEGY_OPTIONS` carries ≤3 alternatives **and** a selectable NO_ACTION | validator |
| INV-14 | Every numeral in rendered text maps to a `Measure` (R2); `completeness_envelope_hash` equals a re-hash of the source envelope (P3) | CI numeral check + hash check |
| INV-15 | **No canonical table holds a foreign key to `widget_id`.** Deleting conversation history deletes envelopes only | schema test asserting the absence of the FK |
| INV-16 | **Capability parity.** Every KEEP-disposition capability in the 669-disposition inventory has ≥1 of: a widget kind, a fullscreen route, a text intent. | CI parity test — **the only gate that may authorise a deletion, and it authorises nothing until green** |
| INV-17 | `theme_scope === 'in_tree'`, `generated_by === 'canonical'`, `declared_only === true`, `historised_form === 'summary_bubble'`, `authority_basis === 'pre_authorized_presentation'` — literal constants with no alternatives | the types themselves |
| INV-18 | `pii_class: 'client_identified'` is refused when `presentation_mode: 'client'` unless `subject_is_principal` — **without relieving any of the five existing preview enforcement points** | validator + a test asserting all five call sites still exist |

**Per-kind `expires_at` ceilings:** `TIME_SLOT_SELECTOR` 90 s · `BOOKING_CONFIRMATION` 120 s · `APPROVAL` = approval TTL · `PROGRESS` = run window · `METRIC`/`CHART`/`REPORT` = `as_of` + capability freshness window · `STRATEGY_OPTIONS` = revision validity · `CHOICE`/`SOURCE_STATUS`/`LIMITATION` 30 min. Global bound: `expires_at ≤ min(facts.as_of + capability_ttl, principal session expiry, run expiry, flow_ttl_s)`.

---

## 13. What this contract explicitly forbids

- A renderer sending anything other than `{ widget_id, intent_token, inputs, client_nonce, profile_id }`.
- A renderer composing provider arguments, endpoints, record ids, prices or filters.
- A body carrying a writable field, or a client echoing a body.
- Authority derived from `presentation_mode`, a channel profile, a window global, a localStorage cache, a screen name, or which widget was rendered.
- A COMMIT reachable in one tap from a selector, a push, or a spoken utterance without readback.
- A button for a capability with no canonical owner (P2).
- An `UNKNOWN` rendered as an error, a `0`, a `—`, red styling, an error ARIA role, or an auto-retry.
- A widget declaring a z-index, a DOM host outside the app tree, or a query-parameter mount.
- An unknown `kind` falling back to a *screen* rather than to *text*.
- A second backend business contract per widget kind.
- Removing any tab, route or command on the strength of this document. Capability removal requires INV-16 green, and this cycle removes nothing.

---

## 14. Honest register — what this contract does not do

1. **Telegram cannot mint above `CHANNEL_IDENTITY` today.** The canonical `_principal` ContextVar is written only inside the aiohttp HTTP middleware; the bot runs `start_polling`. Until a principal-establishment path exists for polled updates, every Telegram COMMIT degrades to HANDOFF by ladder step 3. This is correct behaviour, not a workaround — but it means Telegram is read-and-handoff-only for now. Repairing the principal would still not restore the six body-level-fenced capabilities (`mute_master`, `run_loyalty_job`, `run_backfill_job`, `scan_and_alert`, `can_redeem_codes`, `set_cashier_role`), which are fenced independently by the P4/P5 cutover.
2. **A contract cannot retire an overlay.** `theme_scope: 'in_tree'` guarantees only that *new* widgets do not join the seven self-mounting overlays at `zIndex 2147483000`. Those overlays create their own DOM hosts on a query-parameter match and ask no contract for permission. Likewise, R4 governs widget kinds, not `S[screen] || S.login`, which still silently routes an unknown screen key to the login page. Both are separate, named work.
3. **Renderer sandboxing is a convention, not a proof, until there is a build.** The intent is that renderer modules receive no token-bearing props and import no `fetch`/`XHR`/`WebSocket`/`localStorage`/`sessionStorage`/`IndexedDB`/`sendBeacon`/`document.cookie`/provider SDK. That is enforceable by lint plus a bundle import-graph allowlist **where a build pipeline exists**. The shipping frontend is a hand-edited single file with no Aurora sources and no `build.js` in the repository. A real capability boundary needs a Worker or a separate realm. Until then: discouraged, not proven.
4. **The seal stops forgery, not misselection.** One token per intent with a `selection_domain` (rather than one token per option, which is unshippable envelope weight) means a compromised renderer can still choose *which legal option* to submit. The blast radius is bounded to "something the server was willing to offer this principal right now" plus a fresh-read divergence check at Gate 9 — genuinely narrow, but not "provably incapable".
5. **This contract restores none of the eight missing capabilities.** It gives them a dignified, fail-closed way to say "no owner" (P2 + §4.4), which is a real improvement over `/unsubscribe` promising a revocation that does not exist. It is not one line of the capability. Shipping this envelope while those stay dark would be mistaking the envelope for progress — and §4.4 exists so that mistake is visible in the contract itself rather than discovered later.
6. **The generality is provisional.** Four of the seventeen "channels" are one web bundle with different capability flags; several more are text-plus-a-link emitters. The genuine renderer count today is three: the web bundle, the Telegram bot, and a notification/text materialiser. The `ChannelProfileRegistry` and the ladder are sized for that reality plus the two ceilings that actually bite (Telegram's 64 bytes, push's two actions). `RenderReceipt` is the instrument that will tell us within a quarter whether the ladder earned its weight or whether its most common output is a URL.