# Chapter 9 and Chapter 10 Compatibility

| Assessment | Verdict | Condition |
|---|---|---|
| **C9 compatibility** | **PASS** | Conditional on 7 corrections, all in the UX/projection layer. Required C9 contract changes: **0**. |
| **C10 readiness** | **PASS** | The seam already exists in the released schema and is fenced shut in code. The design attaches to it without opening it. |
| **STRATEGY_OPTIONS** | **FAIL as written** | Two defects, both repairable in the widget contract without touching C9. Amended spec in section 6.1. |
| **APPROVAL** | **PASS with 2 corrections** | Wrong hash echoed; one field (`four_eyes`) has no canonical source and must be deleted. |
| **PROGRESS + UNKNOWN-is-not-failure** | **PASS with 1 correction** | The step-state enum must lose `'failed'`. |

All citations are under `/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/`; paths below are relative to that root.

---

## 1. The target path as it actually runs today

`USER -> MAYA CHAT -> ORCHESTRATOR -> CAPABILITY/AGENT -> ANSWER + WIDGET -> APPROVAL -> CANONICAL ACTION` is **not one path in the running system. It is three.** The chat-first design is only coherent if the widget layer projects all three.

| Path | Entry | Backend | Ends at |
|---|---|---|---|
| **A — C9 run** | `POST /api/orchestration/request-identity` then `POST /api/orchestration/runs` | `c9.orchestrator.ts:coordinate` -> `route()` over `C9_ROUTES` -> `C9ContextService.build` -> `C9Agents.answer` | `maya.c9-response/1` carrying 0–2 `AgentResult@1` |
| **B — capability call** | `POST /api/ai/chat`, or `POST /api/ai/tools/:toolName/execute` | `ai-core.service.ts` -> `ai-tool-runtime.service.ts` -> 47-tool catalog | a tool result, **or** an `AiApprovalRequest` in `PENDING` |
| **C — strategy and execution** | `POST /api/orchestration/runs/:id/revisions`, `/review`, `/continue` | `c9.store.ts`, `c9.execution.ts` | plan steps bound to receipts their **source owners** produced |

Two facts from the code decide the whole architecture:

1. **Path A reads only C7 and C8 today.** `c9.orchestrator.ts` filters `subjectRefs` through `READERS = { MeasurementRevision: 'c7.measurement.read', C8ResultRevision: 'c8.result.read' }`. Nothing else is admitted into a run. A run cannot fetch today's schedule, the service catalogue or a dormant-client list.
2. **Only five objectives route at all.** `C9_ROUTES` has exactly five keys; an unmapped objective delegates to nothing, returns no answers, and emits reason code `no_delegated_domain_required` with completeness `UNAVAILABLE`.

Therefore `Correlation.run_id: string | null` is not a concession to convenience — it is **required for the design to be buildable**. Routing a calendar render through a run would put a 12-model-call / 120-second budget in front of drawing a grid, and would then fail anyway because the orchestrator's reader map refuses the source. The correct reading: `run_id` present = projection of a coordination run (Path A/C); `run_id` absent = projection of a registered capability read (Path B). The safety properties hold identically because both draw their vocabulary from the same registry.

**The projector is not a new idea in this codebase.** `ai-tools/chat-report-card.ts` already emits `{ widget, widget_data }` beside the chat answer, built server-side from `toolResults`, under the comment *"no invented numbers: only what the server already computed"*, gated in `ai-core.service.ts:1640` by `grounding.status === 'verified'` and suppressed entirely for a client audience. That is `maya.widget.envelope/1` at version zero: three kinds, no intents, no authority envelope, no text equivalent. The design extends a production seam rather than inventing one.

---

## 2. Artefact-by-artefact map

| C9 artefact (code) | Renders / invokes | Notes and required care |
|---|---|---|
| `findings[].statement` + `evidence_refs` (`c9.contract.ts`, built in `c9.agents.ts`) | `REPORT.sections[].narrative`, `LIMITATION.detail`, `text_equivalent.itemized` | The released agent composes findings **mechanically**: `` `${rule}: ${status} as of ${asOf}` ``. They are Cells in prose clothing. A renderer must not dress them as insight. |
| `facts_used[]` | `Provenance.facts_used`, per-`Cell` `as_of` / `Measure.basis` / `currency`, and the `SOURCE_STATUS` body | Copy the element **whole**: `capability`, `status`, `as_of`, `evidence_refs`, `completeness` (the full envelope object), optional `basis`, `currency`. The widget contract's version drops `evidence_refs` and flattens `completeness` to a number — that breaks P3. |
| `confidence` | one sentence in `text_equivalent`, one neutral chip | Grounding, not probability. In the released agent it is mechanically `high` only when completeness is `COMPLETE`, else `low`. Never render as a bar or a percentage. |
| `limitations[]` | `Limitation[]`, `LIMITATION` kind | C9 limitations are **plain strings** (reason codes, <=400 chars). There is no canonical `severity`, `affects` or `code`. Derive `severity` from a closed server-side lookup keyed by reason code (default `limitation`); leave `affects: []` unless the projector itself knows the path. Never model-authored. |
| `proposed_action_intents[]` | `WidgetIntent` with `effect` DRAFT or REQUEST_APPROVAL | `argumentHandles` **are** `frozen_nouns`: opaque `h_<hash>` values resolvable only inside one trusted invocation (`C9Handles` in `c9.context.ts`). Rule I2(a) is not an invention; it is C9's existing invariant. Copy `risk`, `approval`, `reversibility`, `audience_size` verbatim. |
| completeness envelope | `Provenance.completeness`; `hasMore`/`cursorRef` drive `more_intent` | **The widget contract omits `status`.** `c9Completeness` carries `status: COMPLETE | PARTIAL | UNAVAILABLE` and the agent contract refuses a false `COMPLETE` (`c9Deny('false_completeness')`). Add it. |
| evidence handles | `Cell.evidence_refs`, `Provenance.evidence_refs` | Handles live in an in-memory `Map` for one invocation. **A widget persisted in chat history holds handles that no longer resolve.** In a stored envelope they are audit labels, not links: any "show the evidence" affordance must be a `REFINE` intent that re-reads. |
| `C9Context@1` | nothing renders it | The user's text travels as `untrusted.question` with `authority: 'NONE'`. Two obligations: `ephemeral_ui` must never leak into it, and `c9SafeText` refusals (`c9_use_secure_surface`, triggered by an email, phone or token in the text) must render as a **HANDOFF to a secure surface**, never as an error. |
| capability registry (`c9.registry.ts`) | the entire intent vocabulary; `WidgetSource.capability` | **The registry holds 56 entries, not 57** (47 catalog tools + 9 orchestration entries). BI read-only is enforced three times: registry, `c9AgentResult` (`bi_read_only`), and a database CHECK. `c9Capability()` also refuses on a registry-hash mismatch — the envelope must carry that version in `capability_version`. |
| bounded budget (`c9.budget.ts`, `c9.allowance.ts`) | `PROGRESS.budget_note` | Defaults: 2 domains, 6 tool calls per domain, 12 total, 12 model calls, 120 s. `aiCost` is `null` unless both `C9_AI_PRICE_MANIFEST` and `C9_AI_COST_CAP_MICROS` are configured, so every run today reports `reasoning: { paid: false, reason: 'paid_capability_not_activated' }` and adds reason code `deterministic_reasoning_only`. **State it; do not hide it.** |
| strategy revisions | `STRATEGY_OPTIONS` | **The stated invariant is wrong — see 6.1.** |
| review-is-not-approval | option selection -> `POST /runs/:id/review` | A different owner from APPROVAL. Enforced in the database: `c9_effect_binding_requires_reviewed_handoff`, `c9_tool_approval_mismatch`, and a check that an EXECUTION binding names a real non-dry-run `ActionExecution`. The two must never be the same widget. |
| step bindings (`c9.execution.ts`) | `PROGRESS.steps[].receipt_ref` | A binding attaches to a receipt an owner already produced (`bindingKind`, `slotKey`, `ownerKey`, `sourceType`); C9 never creates one. Bindings are immutable (`c9_binding_immutable`). |
| UNKNOWN semantics | `PROGRESS` state `blocked_unknown`; `Cell.state` for data | `resolve(UNKNOWN)` requires state `BOUND`, holds the step exactly where it is, blocks only its dependents, and fabricates no rollback or resend. `execution.status` reports `unknownStepKeys` separately from completeness. The widget mirrors this correctly. |
| coordination endpoints | `request-identity` + `runs` = send; `runs/:id` = re-render; `revisions` = `SETTINGS_DRAFT`/amend; `review` = STRATEGY_OPTIONS select; `execution` = PROGRESS poll; `continue` = PROGRESS resume; `cancel` = the escape intent; `tenant-context` + `tenant-context/draft` = `SETTINGS_DRAFT` | Ten routes, all present in `c9.controller.ts`. Every route re-resolves the principal inside its own transaction. |

---

## 3. What the chat-first UX needs that C9 does not provide

| Need | Layer | Decision |
|---|---|---|
| A widget projector and an `IntentRecord` store | **UX layer, new server component** | Build it **outside** `src/orchestration/`. It reads AgentResults, execution status and tool results and mints tokens; it introduces no business endpoint. Note that `c9.consumers.architecture.spec.ts` scans only `orchestration/`, so the no-silent-truncation ratchet must be **explicitly extended** to the projector or "verbatim completeness" is unenforced there. |
| Text-equivalent minting | UX layer | Pure server function over `(kind, body, intents, locale)`. Nothing in C9 resists it. |
| Streaming a run in progress | UX layer | C9 exposes no stream. Use `PROGRESS.poll_after_ms` against `GET /runs/:id/execution`; `stream_ref` stays `null` until an SSE surface exists on the run path (the existing SSE surface is on the chat path). |
| Completeness for **Path B** reads | UX layer, and the design's biggest honesty gap | Catalog tools produce no C9 completeness envelope and no evidence handles. The projector must synthesise one from the tool's own pagination and **must not** write `hasMore: false` when the tool reports no count. Where the count is unknown: `totalCount: null`, and the affected Cell is `PARTIAL` with `NOT_COLLECTED`. Say it in the text equivalent. |
| `audience_size` for communication intents | UX layer; canonical source exists | `b35.preview` (`marketing/canonical-bulk.service.ts`) yields `candidateCount`, `eligibleCount`, `recipientCount` and an audience `snapshotHash`. Use `eligibleCount` as the Measure and `candidateCount` as the comparison baseline — that is the consent-aware arithmetic, shown before the irreversible tap. |
| `four_eyes` | **Delete from the contract** | No canonical source. `ai-tool-policy.service.ts:canDecide` is: `actor` -> the requester **is** the decider; `owner` -> any OWNER_ROLE, the initiator included; otherwise false. A widget asserting `four_eyes: true` would promise what no owner enforces — exactly the defect P2 forbids. |
| `presentation_hint` | UX layer | Optional in the contract and **never emitted** by the released agent. No renderer may depend on it. |
| Telegram 64-byte packing, ordinal speech matching, density escalation | UX layer | Pure presentation. |
| `Origin.moment` (the 12 proactive moments) | UX layer | These are scheduler/outbound artefacts, not C9 artefacts. The envelope may carry them; the prose must not imply C9 owns them. |

**Test applied:** the only fields the widget contract asserts that C9 cannot source are `four_eyes`, `STRATEGY_OPTIONS.expected_effect`, `Limitation.severity`/`affects`, and the omitted `completeness.status`. Three are deletions or projector derivations; one is an addition to the **widget** contract. **Zero C9 edits.**

---

## 4. C9 verdict: PASS, with seven required corrections

1. Add `status` to `Provenance.completeness`; copy `c9Completeness` field-for-field.
2. Copy `facts_used[]` whole, including `evidence_refs` and the nested completeness object.
3. Delete `ConfirmationRequirement.four_eyes`.
4. Type `risk_tier` as the real `AiToolRiskTier` union (`read | low_write | medium_write | high_write | restricted`) and note that a value copied from an `AgentResult` can never be `read`.
5. Declare `evidence_refs` in a persisted envelope non-dereferenceable; evidence is re-read through a `REFINE` intent.
6. Derive `Limitation.severity` from a closed server-side reason-code table; never model-authored.
7. Classify `snapshotHash`, `revisionId` and `payloadHash` as **pinned witnesses**, not handles. Rule I2(a) says a handle is re-read fresh at Gate 9 — applying that to these three would destroy the anti-drift guarantee they exist for. They are compared; divergence yields `SUPERSEDED` with a rendered diff.

---

## 5. C10 readiness

### 5.1 The seam is already in the released schema

- `c9Request.entryRef: { opportunityRef, agentTaskRef }` (`c9.contract.ts`), validated at admission in `c9.store.ts` (`selected_opportunity`, `assignment_mismatch`).
- `C9Run.entryKind` is written as `'SELECTED_OPPORTUNITY'` when an entry reference is present and `'EXPLICIT_REQUEST'` otherwise. **The run already records whether a human or an opportunity started it.**
- `AgentTask` (`prisma/schema.prisma:360`) carries `objectiveKey`, `allowedReadCapabilities`, `allowedActionClasses` and `autonomyLevel`, defaulting to `L2_5_SHADOW`, with the schema comment: *deliberately not an execution job.*

C10 therefore attaches at exactly one place: raising the autonomy fence in `opportunities/opportunity.engine.ts:786` — `if (task.autonomy !== 'L2_5_SHADOW' || !task.constraints.noSideEffects) throw new Error('Chapter 5 tasks must remain L2.5 Shadow.')` — and populating `entryRef` on admission. **Not at the widget layer.** In widget terms the loop is: a proactive envelope projects an existing `Opportunity` row, one `REFINE` intent opens a run with `entryRef` set, and the run then travels the same revision / review / binding machinery already in production.

### 5.2 Four independent guards against early leakage

1. `Origin.authority_basis` has exactly one legal value, `pre_authorized_presentation`. Autonomous initiation is not expressible.
2. **CI lint:** `trigger === 'proactive'` implies every intent's effect is in `{NONE, NAVIGATE, REFINE, HANDOFF}`. No `DRAFT` or `COMMIT` token may be minted onto a proactive envelope.
3. **A notification cannot start a run.** `POST /runs` requires an `eventToken` from `request-identity`, issued only inside a live authenticated transaction and documented as *"a purpose-bound age receipt, never bearer authorization"* (`c9.identity.ts`), principal-hash-bound and re-verified on every use.
4. Production already refuses non-shadow autonomy at the engine boundary (5.1).

### 5.3 Leak tests (name them now, run them later)

A proactive envelope that produced a `C9Run` with no human-actuated intent; an `AgentTask` persisted with `autonomyLevel != 'L2_5_SHADOW'`; any `IntentRecord` with effect `DRAFT` or `COMMIT` whose emitting envelope had `trigger: 'proactive'`. Each is a single query.

**Verdict: PASS.** Declaring `dedupe_key`, `once_per` and `moment` is not implementing them; this cycle must wire no scheduler and deliver no opportunity into chat.

---

## 6. The STRATEGY_OPTIONS + APPROVAL + PROGRESS trio

### 6.1 STRATEGY_OPTIONS — FAIL as written

**Defect 1: "three alternatives plus NO_ACTION" is not the production invariant.** `c9.store.ts` validates alternatives with `c9Array(c9Alternative, 3, 1)` — **at most three in total**. `C9Strategy.propose` pushes NO_ACTION last and then executes `if (alternatives.length > 3) alternatives.length = 3;`. With three feasible action plans, **NO_ACTION is truncated away**. A widget that declares `no_action_option` REQUIRED cannot be built from such a run without synthesising an option the run does not contain — a P1/P3 violation.

*Decision:* keep NO_ACTION mandatory **in the UX**, but source it correctly. When `c9.no_action` is among the alternatives, its intent is `review(optionKey: 'c9.no_action', accept: true)`. When it is not, the decline path is `review(accept: false)` — `c9.store.ts` sets `state: 'STOPPED'`, `reviewDecision: 'DECLINED'`, `terminalReason: 'DECLINED'`, and does not require the optionKey to be one of the alternatives. Doing nothing stays a real, recorded coordination decision in both cases, with no C9 change.

**Defect 2: `expected_effect: Measure` has no canonical source.** `c9Alternative` has no expected effect, no risk tier, no reversibility and no audience size. It has `knownBenefit { factRefs, proposalText }` — and the released builder sets `proposalText: ''` with `factRefs` being evidence references, not numbers. Requiring a Measure here forces a model to invent a number, violating R2 and the released comment *"a benefit is a reference to a qualified fact, never a generated number."*

*Decision:* replace with `expected_effect: Cell<string>`, `KNOWN` only when `knownBenefit.proposalText` is non-empty with `factRefs` as evidence, otherwise `NOT_MEASURED` with reason `NOT_COLLECTED`. Project `risk_tier`, `reversible` and `audience_size` from the alternative's `approvalAdapterRefs` and its steps' `proposed_action_intents`; where absent, render a non-KNOWN Cell. Two further renderer rules: `why` is literally `option.title` in the released builder, so do not pad it into false reasoning; and `recommended` is a **label, never a pre-selection** — pre-selecting converts a review into a default action.

### 6.2 APPROVAL — PASS with two corrections

The exact-scope matrix is real and already enforced:

| Element | Canonical source |
|---|---|
| `approval_ref`, `subject`, `effect_preview` | `AiApprovalRequest.id`, `.summary`, `.payloadPreviewJson` (never `encryptedArguments`) |
| `risk_tier` | `AiApprovalRequest.riskTier` |
| who may decide | `approvalPolicy = 'actor'` -> requester only; `'owner'` -> `OWNER_ROLES`; `'none'` -> nobody decides (`ai-tool-policy.service.ts`) |
| `state` | `PENDING / APPROVED / REJECTED / COMPLETED / EXPIRED` — `expireDueApprovals` writes `EXPIRED` with `ai_approval_expired` |
| exact-scope binding | `assertPayloadHash(approval, dto.payloadHash)` on `POST /api/ai/approvals/:id/approve` |
| `audience_size` | `b35.preview` `eligibleCount` vs `candidateCount` |

*Correction A:* `integrity.approval_binding_echo` must echo the hash **its own owner checks** — `AiApprovalRequest.payloadHash` for AI-tool approvals — not `ActionExecution.approvalBindingHash`. Both exist; echoing the wrong one produces a widget that looks bound and is not.
*Correction B:* delete `four_eyes` (section 3).
Also: `EXPIRED` is a neutral terminal state and must render neutral-dim with a re-request intent. Rendering it red would breach M1.

### 6.3 PROGRESS and UNKNOWN — PASS with one correction

`PROGRESS` maps one-to-one onto `GET /runs/:id/execution`: `steps[]` with `stepKey`, `ordinal`, `domain`, `kind`, `state`, `stopReason`; `bindings[]` as `receipt_ref`; `unknownStepKeys` as `blocked_unknown`; three-valued `completeness`.

*Correction:* the widget's step-state enum includes `'failed'`. C9 has no such state — the plan-step states are `WAITING / ELIGIBLE / CLAIMED / BOUND / RESOLVED / STOPPED`, plus separately reported unknowns. Rename to `'stopped'` carrying `stopReason` (e.g. `DEPENDENCY_STOPPED`). A contract with no `ERROR` kind must not smuggle error framing back through a state name.

**UNKNOWN-is-not-failure is expressed correctly**, and C9 enforces it harder than the widget contract does. One addition, and it is where the principle is most likely to break in implementation: **`c9Deny(...)` responses are HTTP 400s, and most of them are policy fences, not failures** — `paid_capability_not_activated`, `capability_not_registered`, `review_stale`, `run_expired_or_terminal`, `use_secure_surface`, `no_delegated_domain_required`. A naive client renders all of them as a red box, which is precisely what M1 forbids. The projector must map the `c9_*` code space to `Cell` states and `Limitation` severities **before** anything reaches a renderer, and only genuine transport faults may look like faults.

---

## 7. Residual risks

The three that would actually bite are listed in the risks field: the Path B completeness gap, the non-resolvable evidence handles in persisted history, and the `c9_*` denial-to-UNKNOWN mapping. None is a C9 incompatibility; all three are places where an honest contract can be implemented dishonestly.